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
   * A note at the same (rounded midi, quantised phase) appearing in this fraction of
   * loop iterations counts as a "real" consensus note. Set to 0 (any occurrence) to
   * be maximally inclusive of notes BP only caught once — the missing-note story is
   * exactly "fill in what some iterations had and others didn't."
   */
  minIterationFraction: 0,
  /** Phase quantisation grid (one sixteenth of the bar). */
  phaseGridSixteenths: 1,
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
   * lingering ghost doesn't stretch the canonical note. Mean velocity. */
  const consensus: LeadNote[] = []
  for (const b of buckets.values()) {
    if (b.iterationsSeen.size < minOccurrences) continue
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

  /* Per-pitch lane: merge adjacent same-pitch consensus notes (gap ≤ ~1/32 note)
   * before clamping. Consolidation creates NEW same-pitch adjacency by pulling
   * notes from different loop iterations into one canonical window — BP often
   * transcribes a sustained bass note as a string of 1/16 hits, and after the
   * union those hits land back-to-back at every sixteenth of the loop. Without
   * this merge, the export looks like staccato when the source is sustained.
   * Then clamp + extend last-in-lane to the loop boundary so the seam is filled. */
  const mergeGapSec = (loop.barSec / 32) /* one 1/32 note */
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
    /* In-place merge: walk the lane, extending the current note when the next one
     * starts within `mergeGapSec` of its end. Velocity is averaged so a softer
     * continuation pulls a louder onset down a touch (matches how BP transcribes
     * sustained notes as a decaying chain of hits). */
    const merged: LeadNote[] = []
    for (const n of lane) {
      const last = merged[merged.length - 1]
      if (last) {
        const gap = n.startSec - (last.startSec + last.durationSec)
        if (gap <= mergeGapSec) {
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
      if (next) end = Math.min(end, next.startSec - 1e-4)
      else end = unitSec /* extend the last note in each lane to the loop boundary */
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
