/**
 * 2nd-pass output structuring for the chord detector (pipeline stage 14).
 *
 * Runs after the Part-2 export pipeline. Cleans every repetition IN PLACE so the export is
 * "more structured and loops correctly" — without consolidating repetitions or dropping the
 * real variation between them. Pure module: notes in, notes out, same count and pitches.
 *
 * Three steps, in order:
 *   1. Re-snap each start to the nearest 1/16 or 1/16-triplet grid line (0-anchored — the
 *      grid Part-2's quantize established). Removes the few-ms drift `alignChordOnsetsInLeadNotes`
 *      leaves on triplet-positioned notes.
 *   2. Quantize each duration to a 1/64 multiple (see `durationGridSixteenths`), then per
 *      rounded-MIDI lane clamp a note's end so it never overlaps the next same-pitch note.
 *      The 1/64 grid is fine enough (~31 ms @ 120 BPM) that the snap stays imperceptible
 *      while still removing BP's frame-edge jitter on note ends.
 *   3. Seam trim (only when a loop is found): a note that rings more than one 1/16 past its
 *      loop-unit boundary is clamped to the boundary, so each loop unit stays self-contained.
 *
 * See docs/superpowers/specs/2026-05-14-chord-detector-loops-validation-design.md (Feature 2).
 */

import { mergeAdjacentSamePitchNotes, type LeadNote } from './chord-detector-melody'
import type { LoopInfo } from './chord-detector-loops'

export const STRUCTURE_PASS = {
  /**
   * 0 = no re-snap of note starts (recommended), 1 = full hard snap to the
   * nearer of the 1/16 or 1/16-triplet grid. Was effectively 1 (the function
   * always re-snapped). The `applyNeuralNoteStyleLeadNotes` stage upstream
   * already snaps onsets at `quantizeForce` 0.3 — re-snapping here was a
   * second, full-force pass on top of that, double-quantizing the same notes
   * onto the same grid and destroying the organic timing the upstream stage
   * worked to preserve. Defaulted to 0 so this pass only runs (2) duration
   * quantize, (3) same-pitch end-clamp, (4) seam trim. Set to 1 if you want
   * the legacy hard-snap behaviour back.
   */
  startSnapBlend: 0,
  /**
   * Note durations snap to this many 1/16 grid steps. 1.0 = straight sixteenths
   * (~125 ms @ 120 BPM); that's far too coarse — BP measures durations to ~8 ms
   * accuracy and a 125 ms snap distorts every note's length by up to 60 ms.
   * 0.25 means a 1/64 grid step (~31 ms @ 120 BPM), fine enough that the snap
   * is imperceptible while still removing BP's frame-edge jitter on note ends.
   * Drop to 0.125 (1/128 — ~16 ms) if you want even less interference, or 0
   * to disable duration quantization entirely.
   */
  durationGridSixteenths: 0.25,
  /** A note may ring this far (in 1/16s) past a loop-unit boundary before it gets trimmed. */
  seamTrimToleranceSixteenths: 1,
  /**
   * Floor on a structured note's length, in 1/16s. Matches the duration grid
   * above — a 1/64 floor (~31 ms @ 120 BPM) is the shortest a real human-played
   * note typically lasts; anything shorter is BP noise. Keep ≥ durationGridSixteenths
   * so the floor and the grid agree.
   */
  minDurationSixteenths: 0.25,
  /**
   * After re-snap + duration quantize, same-pitch pairs within this gap (seconds) are
   * collapsed into one note. Two articulations a pianist plays distinctly sit much further
   * apart than this; anything closer is a quantization artifact / BP-split fragment.
   */
  postQuantizeMergeGapSec: 0.045,
} as const

/**
 * Apply the 2nd-pass structuring. `loop` drives the optional seam trim; when `!loop.found`
 * only the start re-snap + duration quantize run.
 */
export function structureLeadNotes(
  notes: readonly LeadNote[],
  loop: LoopInfo,
  bpm: number,
): LeadNote[] {
  if (notes.length === 0 || !Number.isFinite(bpm) || bpm < 1) {
    return notes.map(n => ({ ...n }))
  }

  const secondsPerQn = 60 / bpm
  const g16 = secondsPerQn / 4
  const g16t = secondsPerQn / 6
  const durStep = STRUCTURE_PASS.durationGridSixteenths * g16
  const minDur = STRUCTURE_PASS.minDurationSixteenths * g16

  /* 1. Re-snap starts to the nearer of the two 0-anchored grids — but ONLY
   *    when `startSnapBlend > 0`. Default 0 means no re-snap (the upstream
   *    `applyNeuralNoteStyleLeadNotes` already snaps onsets at its own
   *    `quantizeForce`; doing it twice destroys the organic timing the
   *    upstream pass preserves). 0 < blend < 1 = partial pull toward the
   *    nearer grid line, 1 = hard round. */
  const blend = STRUCTURE_PASS.startSnapBlend
  const snapStart = (t: number): number => {
    if (blend <= 0) return t
    const a = Math.round(t / g16) * g16
    const b = Math.round(t / g16t) * g16t
    const target = Math.abs(t - a) <= Math.abs(t - b) ? a : b
    return t + (target - t) * blend
  }

  /* 1b. Re-snapping can land two same-pitch notes on the same grid line — collapse those
   *     exact (pitch, start) duplicates, keeping the longer one, so each pitch lane below
   *     has strictly increasing starts. */
  const collapsed = new Map<string, LeadNote>()
  for (const n of notes) {
    const midi = Math.round(n.midi)
    const startSec = Math.max(0, snapStart(n.startSec))
    const key = `${midi}:${startSec.toFixed(4)}`
    const prev = collapsed.get(key)
    const cand: LeadNote = {
      midi,
      startSec,
      durationSec: Math.max(minDur, n.durationSec),
      velocity: n.velocity,
    }
    if (!prev || cand.durationSec > prev.durationSec) {
      collapsed.set(key, prev ? { ...cand, velocity: Math.max(cand.velocity, prev.velocity) } : cand)
    }
  }

  /* 2. Quantize durations to 1/16 multiples (clamped to the lane next-note in the loop below). */
  const byMidi = new Map<number, LeadNote[]>()
  for (const n of collapsed.values()) {
    const quantDur = Math.max(minDur, Math.round(n.durationSec / durStep) * durStep)
    let lane = byMidi.get(n.midi)
    if (!lane) {
      lane = []
      byMidi.set(n.midi, lane)
    }
    lane.push({ ...n, durationSec: quantDur })
  }

  const unitSec = loop.found && loop.barCount > 0 && loop.barSec > 0 ? loop.barCount * loop.barSec : 0
  const seamTol = STRUCTURE_PASS.seamTrimToleranceSixteenths * g16

  const out: LeadNote[] = []
  for (const lane of byMidi.values()) {
    lane.sort((a, b) => a.startSec - b.startSec)
    for (let i = 0; i < lane.length; i++) {
      const n = lane[i]!
      let end = n.startSec + n.durationSec
      /* Clamp against the next same-pitch note's start. */
      const next = lane[i + 1]
      if (next) end = Math.min(end, next.startSec - 1e-4)
      /* 3. Seam trim — keep each loop unit self-contained. */
      if (unitSec > 0) {
        const boundary = (Math.floor(n.startSec / unitSec) + 1) * unitSec
        if (end > boundary + seamTol) end = boundary
      }
      out.push({
        midi: n.midi,
        startSec: n.startSec,
        durationSec: Math.max(minDur, end - n.startSec),
        velocity: n.velocity,
      })
    }
  }
  out.sort((a, b) => a.startSec - b.startSec || a.midi - b.midi)
  /* Final cleanup: duration-quantize can extend a note to exactly touch the next same-
   * pitch note, leaving a 0-gap pair that reads as a duplicate. Collapse those (and any
   * pair within `postQuantizeMergeGapSec`) — pianist articulations sit much further apart. */
  return mergeAdjacentSamePitchNotes(out, STRUCTURE_PASS.postQuantizeMergeGapSec)
}
