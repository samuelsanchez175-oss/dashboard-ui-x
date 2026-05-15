/**
 * Loop-consensus consolidation (pipeline stage 15).
 *
 * When `detectBarLoop` finds the piece is a P-bar repeating loop, this pass takes the
 * full-length lead-note stream and collapses every loop iteration into a single
 * canonical P-bar window — taking the UNION of notes across iterations so notes BP
 * picked up in some iterations but missed in others are filled in from their siblings.
 *
 * The result is what the user actually wants out of the chord detector: a clean,
 * loopable MIDI window with the most complete picture of what plays in one cycle.
 *
 * Pure module: takes data, returns data — `(notes, loop, bpm) → consolidated notes`.
 * Triggered from the engine after stage 14 (`structureLeadNotes`) only when
 * `loop.found`; the full output passes through unchanged otherwise.
 */

import type { LeadNote } from './chord-detector-melody'
import type { LoopInfo } from './chord-detector-loops'

export const LOOP_CONSENSUS = {
  /**
   * Cross-iteration support threshold. A (midi, ⅟16-phase) bucket is admitted to the
   * canonical window when EITHER iteration 0 had it (always — see "iter-0 anchor"
   * below) OR the bucket appears in this fraction of loop iterations.
   *
   * Why not 0: at 0 every single-iteration sighting gets in. On the Acura test, 49 %
   * of buckets came from only one of 13 iterations — that's BP-transcription noise
   * plus phase-drift artefacts (the detected `unitSec` rarely matches the track's
   * true period to better than ⅟16, so late iterations' onsets snap into the wrong
   * phase bucket and inject phantom notes that never belonged in any single iteration).
   *
   * 0.25 → bucket must appear in ⌈0.25 × N⌉ iterations (≥ 4 of 13 on Acura). Combined
   * with the iter-0 anchor below it preserves what iteration 0 actually had AND lets
   * persistent later-iteration notes (≥ 4 iterations of support) fill in genuinely
   * missing content from iteration 0.
   */
  minIterationFraction: 0.25,
  /** Phase quantisation grid (one sixteenth of the bar). */
  phaseGridSixteenths: 1,
  /**
   * Below this MIDI value the per-pitch lane treats consecutive same-pitch hits as
   * fragments of one sustained note and merges them (BP commonly transcribes a held
   * bass pad as a chain of ⅟16 hits). At or above this value every same-pitch onset
   * is its own musical event — a melodic riff playing the same pitch multiple times
   * in one bar must NOT be glued into a single held pad. C4 = 60.
   */
  bassMergeMidiCeiling: 60,
  /**
   * For the bass register: a merge fires only when both adjacent notes look like
   * single ⅟16 stabs (`durationSec ≤ mergeMaxDurSixteenths × sixteenthSec`) AND the
   * gap between them is small and non-negative-ish. A negative gap means the
   * predecessor's note ALREADY ran into the successor — that's a long held note,
   * not a chain of hits, so we should NOT fuse.
   */
  mergeMaxDurSixteenths: 1.5,
  mergeMaxGapSixteenths: 0.5,
  mergeMinGapSixteenths: -0.25,
} as const

/**
 * Consolidate `notes` into a single canonical P-bar loop. Returns a new array; does
 * not mutate the input. When `loop.found` is false this is a pass-through.
 */
export function consolidateToLoop(
  notes: readonly LeadNote[],
  loop: LoopInfo,
  bpm: number,
): LeadNote[] {
  if (!loop.found || loop.barCount <= 0 || loop.barSec <= 0 || notes.length === 0) {
    return notes.map(n => ({ ...n }))
  }
  if (!Number.isFinite(bpm) || bpm < 1) return notes.map(n => ({ ...n }))

  const unitSec = loop.barCount * loop.barSec
  const sixteenthSec = (loop.barSec / 16) * LOOP_CONSENSUS.phaseGridSixteenths
  if (!(unitSec > 0) || !(sixteenthSec > 0)) return notes.map(n => ({ ...n }))

  /* Estimate how many iterations of the loop the input actually spans, so the
   * iteration-fraction threshold has the right denominator. */
  let inputEnd = 0
  for (const n of notes) inputEnd = Math.max(inputEnd, n.startSec + n.durationSec)
  const totalIterations = Math.max(1, Math.round(inputEnd / unitSec))
  const minOccurrences = Math.max(1, Math.ceil(totalIterations * LOOP_CONSENSUS.minIterationFraction))

  type Bucket = {
    midi: number
    phaseSec: number
    durationsSec: number[]
    velocities: number[]
    iterationsSeen: Set<number>
  }
  const buckets = new Map<string, Bucket>()
  for (const n of notes) {
    const iter = Math.floor(n.startSec / unitSec)
    if (iter < 0) continue
    const phaseRaw = n.startSec - iter * unitSec
    const phaseSec = Math.max(0, Math.min(unitSec - 1e-6, Math.round(phaseRaw / sixteenthSec) * sixteenthSec))
    const midi = Math.round(n.midi)
    const key = `${midi}:${phaseSec.toFixed(4)}`
    let b = buckets.get(key)
    if (!b) {
      b = { midi, phaseSec, durationsSec: [], velocities: [], iterationsSeen: new Set() }
      buckets.set(key, b)
    }
    b.durationsSec.push(Math.max(1e-3, n.durationSec))
    b.velocities.push(n.velocity)
    b.iterationsSeen.add(iter)
  }

  /* One consensus note per (midi, phase) bucket. Median duration so a single long-
   * lingering ghost doesn't stretch the canonical note. Mean velocity.
   *
   * Iter-0 anchor: a bucket that iteration 0 actually had survives unconditionally,
   * regardless of `minOccurrences`. This means the first note of the export always
   * matches the first note of the source's first iteration — phase-drift phantoms
   * (where late-iteration onsets snap into a phase=0 bucket they don't really
   * belong in) can only get in if they also clear the cross-iteration threshold. */
  const consensus: LeadNote[] = []
  for (const b of buckets.values()) {
    const anchored = b.iterationsSeen.has(0)
    if (!anchored && b.iterationsSeen.size < minOccurrences) continue
    const durs = [...b.durationsSec].sort((a, b2) => a - b2)
    const medianDur = durs[Math.floor(durs.length / 2)]!
    const meanVel = b.velocities.reduce((a, b2) => a + b2, 0) / b.velocities.length
    consensus.push({
      midi: b.midi,
      startSec: b.phaseSec,
      durationSec: Math.min(medianDur, Math.max(1e-3, unitSec - b.phaseSec)),
      velocity: Math.max(0.1, Math.min(1, meanVel)),
    })
  }

  /* Per-pitch lane: handle two situations.
   *
   * BASS REGISTER (midi < bassMergeMidiCeiling): BP transcribes a sustained pad as
   * a chain of ⅟16 hits. The union pulls every iteration's hits into one window so
   * each ⅟16 phase ends up with its own bucket. We want to fuse those back into
   * a held note — but ONLY when the predecessor's note looks like a single ⅟16
   * stab (short duration) AND the gap to the next hit is near-zero-and-non-negative
   * (real continuation, not "the predecessor already ran past the next phase").
   *
   * MELODIC REGISTER (midi ≥ bassMergeMidiCeiling): every same-pitch hit is its
   * own musical event. NO merge — a riff that plays G#4 multiple times in one bar
   * keeps those as separate notes. Just clamp overlaps so durations don't run into
   * the next bucket and bleed past the loop seam.
   *
   * The previous loose `gap ≤ mergeGapSec` rule fused notes whose `gap` was
   * deeply negative (predecessor's median duration ran into the next phase), which
   * is exactly the failure mode that collapsed 28 F#4 phase buckets to one 7-second
   * pad. The strict criteria below reject that. */
  const sixteenthDur = loop.barSec / 16
  const mergeMaxDurSec = sixteenthDur * LOOP_CONSENSUS.mergeMaxDurSixteenths
  const mergeMaxGapSec = sixteenthDur * LOOP_CONSENSUS.mergeMaxGapSixteenths
  const mergeMinGapSec = sixteenthDur * LOOP_CONSENSUS.mergeMinGapSixteenths
  const byMidi = new Map<number, LeadNote[]>()
  for (const n of consensus) {
    let lane = byMidi.get(n.midi)
    if (!lane) {
      lane = []
      byMidi.set(n.midi, lane)
    }
    lane.push(n)
  }
  const out: LeadNote[] = []
  for (const lane of byMidi.values()) {
    lane.sort((a, b) => a.startSec - b.startSec)
    const isBassLane = (lane[0]?.midi ?? 127) < LOOP_CONSENSUS.bassMergeMidiCeiling

    const merged: LeadNote[] = []
    for (const n of lane) {
      const last = merged[merged.length - 1]
      if (last && isBassLane) {
        const gap = n.startSec - (last.startSec + last.durationSec)
        const looksLikeShortStabs =
          last.durationSec <= mergeMaxDurSec && n.durationSec <= mergeMaxDurSec
        const gapInBand = gap >= mergeMinGapSec && gap <= mergeMaxGapSec
        if (looksLikeShortStabs && gapInBand) {
          const end = Math.max(last.startSec + last.durationSec, n.startSec + n.durationSec)
          last.durationSec = end - last.startSec
          last.velocity = (last.velocity + n.velocity) / 2
          continue
        }
      }
      merged.push({ ...n })
    }
    for (let i = 0; i < merged.length; i++) {
      const n = merged[i]!
      const next = merged[i + 1]
      let end = n.startSec + n.durationSec
      if (next) {
        /* Clamp so two same-pitch notes don't overlap inside the canonical window. */
        end = Math.min(end, next.startSec - 1e-4)
      } else if (isBassLane) {
        /* Bass: extend the last note to the seam so a sustained pad reads as held
         * across the loop boundary. Melody lanes keep their natural duration. */
        end = unitSec
      }
      end = Math.min(end, unitSec)
      out.push({
        midi: n.midi,
        startSec: n.startSec,
        durationSec: Math.max(1e-3, end - n.startSec),
        velocity: n.velocity,
      })
    }
  }
  out.sort((a, b) => a.startSec - b.startSec || a.midi - b.midi)
  return out
}
