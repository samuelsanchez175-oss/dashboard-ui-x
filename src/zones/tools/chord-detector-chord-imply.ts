/**
 * Chord-implied note inference (pipeline stage 14.5).
 *
 * Read the chord progression (root + quality per segment) and fill in chord-tones
 * that BP didn't transcribe but the harmony implies. Audit's "missing notes" flag
 * already identifies the targets (source chroma vs lead-note share); this module
 * acts on them by synthesizing the missing chord tones at the segment's first
 * existing onset.
 *
 * Pure module: takes data, returns data — `(notes, segments, key, bpm) → enriched notes`.
 * Wired in `chord-detector-engine.ts` between stage 14 (`structureLeadNotes`) and
 * the audit pass, gated by `options.inferChordTones` (default true for the audio
 * path; MIDI path keeps the user's input as-is).
 *
 * Why this matters: the round-3 audit found that 18 of 21 notes missing from the
 * canonical window vs Notes 2.wav were NEVER in any pipeline stage — BP didn't
 * see them in the source audio. The pipeline can't recover them from BP output
 * alone. This module bridges that gap using chord-progression context.
 */

import type { LeadNote } from './chord-detector-melody'
import type { ChordQuality, ChordSegment, EstimatedKey } from './chord-detector-engine'

export const CHORD_IMPLY = {
  /**
   * Skip a segment unless its anchor onset has at least this many distinct pitch
   * classes already. Prevents inferring chord-tones over silence or single bass
   * notes — only fills when there's a real chord stab to enrich. 2 is permissive
   * (root + one chord-tone is enough); 3 is stricter (full triad context).
   */
  minExistingPcs: 2,
  /**
   * Velocity for inferred notes, as a multiplier of the anchor onset's median
   * velocity. 0.5 keeps inferred notes softer than transcribed ones — useful for
   * downstream samplers that want to distinguish "definitely played" vs
   * "inferred from harmony."
   */
  velocityScale: 0.5,
  /**
   * Duration of an inferred chord-tone, as a fraction of the slot length (the
   * half-bar window the tone fills). 0.9 leaves a small gap before the next slot
   * so consecutive inferred notes don't collide tail-to-head.
   */
  durationFraction: 0.9,
  /**
   * Half-bar slicing: each chord segment is divided into windows of this many
   * sixteenths. 8 = half a bar = 2 beats, matching the typical chord-change rate.
   */
  slotSixteenths: 8,
  /**
   * Match tolerance — existing notes within this many sixteenths of a slot anchor
   * count toward `minExistingPcs`. ½ ⅟16 gives ±~30 ms at 120 BPM, enough to
   * absorb quantize jitter without bridging neighbouring sixteenths.
   */
  anchorToleranceSixteenths: 0.5,
} as const

/** Pitch-class offsets above the root for each supported chord quality. */
const CHORD_PC_OFFSETS: Record<ChordQuality, readonly number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus4: [0, 5, 7],
}

/** Hard register bounds — keeps inferred notes inside a piano-playable range. */
const MIN_INFER_MIDI = 36 /* C2 */
const MAX_INFER_MIDI = 84 /* C6 */

export interface ChordImplyInput {
  leadNotes: readonly LeadNote[]
  segments: readonly ChordSegment[]
  /** Carried for future key-relative chord-tone weighting; not used in v1. */
  estimatedKey: EstimatedKey
  bpm: number
}

/**
 * Walk the chord progression and append synthetic notes for any chord-tones the
 * transcription is missing at the anchor onset of each half-bar slot. Returns a
 * new array; does not mutate the input. Notes are sorted by `startSec`.
 *
 * Guardrails:
 *   - Only inserts at an EXISTING onset (anchor) within the slot — never floats
 *     a synthetic note in silence.
 *   - Requires the anchor to have at least `minExistingPcs` distinct PCs, so we
 *     only enrich real chord stabs, not isolated bass hits.
 *   - Only emits chord tones (R / 3 / 5 / [6 for sus4 / 8 for aug]) — never
 *     extensions or sevenths. v1 is intentionally conservative.
 *   - Octave is chosen so the inferred note lands nearest the anchor's median
 *     midi, so inferred chord-tones stay in the same voicing register as the
 *     existing stab.
 *   - Velocity is `velocityScale × medianVel` so downstream samplers / the user
 *     can tell inferred notes from transcribed ones.
 */
export function inferChordImpliedNotes(input: ChordImplyInput): LeadNote[] {
  const { leadNotes, segments, bpm } = input
  if (!segments.length || !leadNotes.length || !(bpm > 0)) {
    return leadNotes.map(n => ({ ...n }))
  }
  const sixteenthSec = 60 / bpm / 4
  const slotSec = sixteenthSec * CHORD_IMPLY.slotSixteenths
  const tolSec = sixteenthSec * CHORD_IMPLY.anchorToleranceSixteenths
  if (!(slotSec > 0)) return leadNotes.map(n => ({ ...n }))

  const synthetic: LeadNote[] = []

  for (const seg of segments) {
    const offsets = CHORD_PC_OFFSETS[seg.quality]
    if (!offsets) continue
    const expectedPcs = offsets.map(o => ((seg.rootPc + o) % 12 + 12) % 12)

    /* Slice this segment into half-bar windows. A long segment (e.g. a 4-beat
     * pad) gets two windows; a single-beat hit gets one. */
    const slotCount = Math.max(1, Math.round(seg.durationSec / slotSec))
    for (let slot = 0; slot < slotCount; slot++) {
      const slotStart = seg.startSec + slot * slotSec
      const slotEnd = Math.min(seg.startSec + seg.durationSec, slotStart + slotSec)
      if (!(slotEnd > slotStart)) continue

      /* Anchor = the earliest existing onset that falls inside this slot. We
       * snap synthetic notes to this anchor rather than the slot's calendar
       * start, so inferred chord-tones land on top of a real chord stab. */
      const inSlot = leadNotes.filter(n => n.startSec >= slotStart - tolSec && n.startSec < slotEnd)
      if (!inSlot.length) continue
      inSlot.sort((a, b) => a.startSec - b.startSec)
      const anchorTime = inSlot[0]!.startSec

      const atAnchor = inSlot.filter(n => Math.abs(n.startSec - anchorTime) <= tolSec)
      const existingPcs = new Set(atAnchor.map(n => ((Math.round(n.midi) % 12) + 12) % 12))
      if (existingPcs.size < CHORD_IMPLY.minExistingPcs) continue

      const sortedMidis = atAnchor.map(n => Math.round(n.midi)).sort((a, b) => a - b)
      const medianMidi = sortedMidis[Math.floor(sortedMidis.length / 2)]!
      const sortedVels = atAnchor.map(n => n.velocity).sort((a, b) => a - b)
      const medianVel = sortedVels[Math.floor(sortedVels.length / 2)]!

      const slotDurSec = slotEnd - anchorTime
      const inferDur = Math.max(sixteenthSec, slotDurSec * CHORD_IMPLY.durationFraction)

      for (const pc of expectedPcs) {
        if (existingPcs.has(pc)) continue

        /* Octave choice: round to put the new note nearest the median voicing.
         * Then clamp to the supported infer range so we don't synthesize a sub-
         * audible C0 or a stratospheric C9 if the median is way off. */
        const octave = Math.round((medianMidi - pc) / 12)
        let midi = pc + octave * 12
        while (midi < MIN_INFER_MIDI) midi += 12
        while (midi > MAX_INFER_MIDI) midi -= 12
        if (midi < MIN_INFER_MIDI || midi > MAX_INFER_MIDI) continue

        synthetic.push({
          midi,
          startSec: anchorTime,
          durationSec: inferDur,
          velocity: Math.max(0.1, Math.min(1, medianVel * CHORD_IMPLY.velocityScale)),
        })
      }
    }
  }

  const out: LeadNote[] = [...leadNotes.map(n => ({ ...n })), ...synthetic]
  out.sort((a, b) => a.startSec - b.startSec || a.midi - b.midi)
  return out
}
