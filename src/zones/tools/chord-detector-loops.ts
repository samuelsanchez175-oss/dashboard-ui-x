/**
 * Bar-level loop detection for the chord detector.
 *
 * Pure module: takes the analysis result's lead notes + tempo, slices the timeline into
 * bars, fingerprints each bar, and finds the smallest repeating bar-period. Used to report
 * the loop as a stat and to drive the 2nd-pass seam trim in `chord-detector-structure.ts`.
 *
 * See docs/superpowers/specs/2026-05-14-chord-detector-loops-validation-design.md (Feature 1).
 */

import type { LeadNote } from './chord-detector-melody'

export type LoopInfo = {
  /** True when a repeating bar-period was found. */
  found: boolean
  /** Bars in the repeating unit (0 when `!found`). */
  barCount: number
  /** How many times the unit repeats across the analyzed span. */
  repeats: number
  /** 0..1 — mean bar self-similarity for the chosen period. */
  confidence: number
  /** Bar duration in seconds (4/4 at the detected tempo). */
  barSec: number
  /** Whole bars analyzed. */
  totalBars: number
}

/** Common musical loop lengths to test, smallest first (the fundamental period wins). */
const LOOP_CANDIDATE_PERIODS = [1, 2, 4, 8, 16] as const
/**
 * Mean bar self-similarity for the strict-loop path: if the best period clears this,
 * the piece is clearly a loop regardless of how the other periods score.
 */
const LOOP_SIM_STRICT = 0.7
/**
 * Stand-out path — accept the best period even at a lower absolute score when it
 * dominates the rest. Real piano transcriptions of looping material rarely clear
 * 0.7 because BP varies per iteration; what they DO show is one period scoring
 * much higher than the others. `LOOP_SIM_FLOOR` is the absolute minimum the best
 * period must hit; `LOOP_SIM_RATIO` is how much higher than the second-best it must
 * sit. Both must hold AND at least two candidate periods must have been compared.
 */
const LOOP_SIM_FLOOR = 0.15
const LOOP_SIM_RATIO = 1.5

function emptyLoop(barSec: number, totalBars: number): LoopInfo {
  return { found: false, barCount: 0, repeats: 0, confidence: 0, barSec, totalBars }
}

/** Jaccard similarity of two bar fingerprints. Two empty bars are identical (1.0). */
function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

/**
 * Detect a repeating bar-loop in `notes`. Returns the smallest bar-period whose mean
 * bar-to-bar self-similarity clears `LOOP_SIM_THRESHOLD`, or `found: false`.
 */
export function detectBarLoop(notes: readonly LeadNote[], bpm: number, durationSec: number): LoopInfo {
  if (!Number.isFinite(bpm) || bpm < 1 || !(durationSec > 0)) return emptyLoop(0, 0)
  const barSec = 4 * (60 / bpm)
  const totalBars = Math.floor(durationSec / barSec)
  if (totalBars < 2 || notes.length === 0) return emptyLoop(barSec, totalBars)

  const sixteenthSec = barSec / 16
  const fingerprints: Set<string>[] = []
  for (let b = 0; b < totalBars; b++) fingerprints.push(new Set<string>())
  for (const n of notes) {
    const bar = Math.floor(n.startSec / barSec)
    if (bar < 0 || bar >= totalBars) continue
    const pos16 = Math.round((n.startSec - bar * barSec) / sixteenthSec)
    fingerprints[bar]!.add(`${Math.round(n.midi)}:${pos16}`)
  }

  /* Score every candidate period; decision happens after we can see the full curve. */
  const scores: { period: number; mean: number }[] = []
  for (const period of LOOP_CANDIDATE_PERIODS) {
    if (2 * period > totalBars) continue
    let sum = 0
    let count = 0
    for (let i = 0; i + period < totalBars; i++) {
      sum += jaccard(fingerprints[i]!, fingerprints[i + period]!)
      count++
    }
    scores.push({ period, mean: count > 0 ? sum / count : 0 })
  }
  if (scores.length === 0) return emptyLoop(barSec, totalBars)

  /* Strict path — smallest period that clears LOOP_SIM_STRICT wins (preserves the
   * fundamental-period preference for clean loops). */
  for (const s of scores) {
    if (s.mean >= LOOP_SIM_STRICT) {
      return {
        found: true,
        barCount: s.period,
        repeats: Math.floor(totalBars / s.period),
        confidence: s.mean,
        barSec,
        totalBars,
      }
    }
  }

  /* Stand-out path — accept the dominant period at a lower absolute score, but only
   * when there's a second candidate to compare against (we need a baseline to call
   * it "dominant"). Real piano transcriptions of looping material live here. */
  if (scores.length >= 2) {
    const ranked = [...scores].sort((a, b) => b.mean - a.mean)
    const best = ranked[0]!
    const second = ranked[1]!
    if (best.mean >= LOOP_SIM_FLOOR && best.mean >= LOOP_SIM_RATIO * Math.max(1e-6, second.mean)) {
      return {
        found: true,
        barCount: best.period,
        repeats: Math.floor(totalBars / best.period),
        confidence: best.mean,
        barSec,
        totalBars,
      }
    }
  }
  return emptyLoop(barSec, totalBars)
}
