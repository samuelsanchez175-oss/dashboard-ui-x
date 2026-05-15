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
  /**
   * Drift tolerance for the bucket key. Bucketing by (midi, ⅟16-phase) is too
   * tight when the detected `unitSec` doesn't perfectly match the track's actual
   * loop period — BPM estimation is rarely accurate to better than ~2 %, and over
   * 13 iterations that compounds into ⅟8+ of phase drift. Onsets that ARE the same
   * recurring loop event end up in different ⅟16 buckets, so no single bucket
   * clears `minIterationFraction` even though the recurrence is real.
   *
   * 2 = a ⅛-note-wide cell. A G#4 stab at pos-7 of the loop that drifts to pos-6
   * or pos-8 in other iterations still buckets together. Within each bucket the
   * emission phase is the AVERAGE of observed positions (snapped to ⅟16 for the
   * export grid), so we keep ⅟16 resolution on output despite the looser key.
   *
   * Round-3 audit: this single change is expected to lift the Acura / Notes 2.wav
   * coverage from ~71 % to ~84 % by recovering 4 high-recurrence onsets that BP
   * actually caught but drift spread across adjacent ⅟16 buckets.
   */
  driftTolSixteenths: 2,
  /** Phase emission grid (one sixteenth of the bar) — preserves stage-14's
   * "all lengths and starts on the ⅟16 grid" invariant on output. */
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
  const emissionGridSec = (loop.barSec / 16) * LOOP_CONSENSUS.phaseGridSixteenths
  const driftCellSec = (loop.barSec / 16) * LOOP_CONSENSUS.driftTolSixteenths
  if (!(unitSec > 0) || !(emissionGridSec > 0) || !(driftCellSec > 0)) {
    return notes.map(n => ({ ...n }))
  }

  /* Estimate how many iterations of the loop the input actually spans, so the
   * iteration-fraction threshold has the right denominator. */
  let inputEnd = 0
  for (const n of notes) inputEnd = Math.max(inputEnd, n.startSec + n.durationSec)
  const totalIterations = Math.max(1, Math.round(inputEnd / unitSec))
  const minOccurrences = Math.max(1, Math.ceil(totalIterations * LOOP_CONSENSUS.minIterationFraction))

  type Bucket = {
    midi: number
    phaseCellSec: number       /* bucket key — wide enough to absorb drift */
    phaseSum: number           /* sum of raw observed phases — averaged on emit */
    observationCount: number   /* denominator for phaseSum */
    durationsSec: number[]
    velocities: number[]
    iterationsSeen: Set<number>
  }
  const buckets = new Map<string, Bucket>()
  for (const n of notes) {
    const iter = Math.floor(n.startSec / unitSec)
    if (iter < 0) continue
    const phaseRaw = n.startSec - iter * unitSec
    /* Cell key uses the drift-tolerance grid (typically ⅛), so onsets that the
     * BPM mismatch spreads across two adjacent ⅟16 cells still merge here. */
    const phaseCellSec = Math.max(
      0,
      Math.min(unitSec - 1e-6, Math.round(phaseRaw / driftCellSec) * driftCellSec),
    )
    const midi = Math.round(n.midi)
    const key = `${midi}:${phaseCellSec.toFixed(4)}`
    let b = buckets.get(key)
    if (!b) {
      b = {
        midi,
        phaseCellSec,
        phaseSum: 0,
        observationCount: 0,
        durationsSec: [],
        velocities: [],
        iterationsSeen: new Set(),
      }
      buckets.set(key, b)
    }
    b.phaseSum += phaseRaw
    b.observationCount += 1
    b.durationsSec.push(Math.max(1e-3, n.durationSec))
    b.velocities.push(n.velocity)
    b.iterationsSeen.add(iter)
  }

  /* One consensus note per (midi, phase) bucket. Mean velocity.
   *
   * Iter-0 anchor: a bucket that iteration 0 actually had survives unconditionally,
   * regardless of `minOccurrences`. This means the first note of the export always
   * matches the first note of the source's first iteration — phase-drift phantoms
   * (where late-iteration onsets snap into a phase=0 bucket they don't really
   * belong in) can only get in if they also clear the cross-iteration threshold.
   *
   * Duration is register-aware and quantised to the ⅟16 grid (so stage 14's
   * "all lengths on the grid" invariant still holds after stage 15):
   *   - Bass (midi < bassMergeMidiCeiling): median of observed durations, rounded
   *     to the nearest ⅟16 multiple. Sustained pads keep their full ring.
   *   - Melody (midi ≥ bassMergeMidiCeiling): 25th percentile capped at 1.5 × ⅟16,
   *     rounded to the nearest ⅟16 multiple — so each stab snaps to exactly one
   *     ⅟16. BP's duration estimates skew long for staccato melodic stabs (it
   *     smears short events). Picking a lower quantile + the cap keeps each stab
   *     from running into its successor. Notes 2.wav's melodic stabs sit around
   *     one sixteenth (~0.23 s at 65 BPM); this matches it. */
  const sixteenthDurForCap = loop.barSec / 16
  const melodyStabDurCap = sixteenthDurForCap * LOOP_CONSENSUS.mergeMaxDurSixteenths
  const quantToSixteenths = (d: number) =>
    Math.max(sixteenthDurForCap, Math.round(d / sixteenthDurForCap) * sixteenthDurForCap)
  const consensus: LeadNote[] = []
  for (const b of buckets.values()) {
    /* Iter-0 anchor (round-1) made buckets that iteration 0 had survive even when
     * they didn't clear the cross-iteration threshold. Round-3's drift-tolerant
     * bucketing made that anchor too generous: drift-adjacent same-pitch onsets
     * now bucket together correctly, so anything REAL in iter-0 will also appear
     * in adjacent iterations. A sup=1 bucket whose only iteration is iter-0 is
     * almost certainly a one-off BP misfire — six such phantoms survived in the
     * post-round-3 canonical window before this guard.
     *
     * Require the anchor to be backed by at least one OTHER iteration. Real iter-0
     * loop content will always have a sibling in iter-1, iter-2, etc. — even with
     * the wider ⅛ drift cell. Genuine BP false positives that only fire once won't. */
    const anchored = b.iterationsSeen.has(0) && b.iterationsSeen.size >= 2
    if (!anchored && b.iterationsSeen.size < minOccurrences) continue
    const durs = [...b.durationsSec].sort((a, b2) => a - b2)
    const isMelody = b.midi >= LOOP_CONSENSUS.bassMergeMidiCeiling
    const rawDur = isMelody
      ? Math.min(durs[Math.floor(durs.length / 4)]!, melodyStabDurCap)
      : durs[Math.floor(durs.length / 2)]!
    const chosenDur = quantToSixteenths(rawDur)
    const meanVel = b.velocities.reduce((a, b2) => a + b2, 0) / b.velocities.length
    /* Emission phase: average of observed positions, then snapped to the ⅟16
     * emission grid. Averaging within a drift-tolerant cell beats picking the
     * cell centre — it lets the canonical window track where the recurrence
     * actually clusters rather than which ⅟16 bin won the rounding lottery. */
    const avgPhase = b.phaseSum / Math.max(1, b.observationCount)
    const emitPhase = Math.max(
      0,
      Math.min(unitSec - 1e-6, Math.round(avgPhase / emissionGridSec) * emissionGridSec),
    )
    consensus.push({
      midi: b.midi,
      startSec: emitPhase,
      durationSec: Math.min(chosenDur, Math.max(1e-3, unitSec - emitPhase)),
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
      }
      /* No unconditional "extend last note to seam." Round-1 had a bass-lane branch
       * that stretched the trailing note in every bass lane to `unitSec`; the round-2
       * audit found this fired even for short single-stab notes (lone B2 → 7.385 s)
       * because lanes with only one entry skip the `next` clamp and fall through.
       * Trust the bucket's own duration (median for bass, capped quantile for melody). */
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
