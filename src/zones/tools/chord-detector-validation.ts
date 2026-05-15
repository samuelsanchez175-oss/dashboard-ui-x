/**
 * Output validation for the chord detector — the "Output check" panel.
 *
 * Pure module: takes a finished `ChordAnalysisResult` and returns a pass/warn report. All
 * checks are heuristic self-consistency tests (no external reference / score needed), so
 * they run on any clip. The page renders the report after every analysis.
 *
 * See docs/superpowers/specs/2026-05-14-chord-detector-loops-validation-design.md (Feature 3).
 */

import type { ChordAnalysisResult } from './chord-detector-engine'

export type ValidationCheck = {
  id: 'timing' | 'duplicates' | 'loopSeam' | 'coverage' | 'confidence'
  /** Plain, scannable label. */
  label: string
  status: 'pass' | 'warn'
  /** Plain-English one-liner explaining the result. */
  detail: string
}

export type ValidationReport = {
  checks: ValidationCheck[]
  passCount: number
  warnCount: number
}

export const VALIDATION_THRESHOLDS = {
  /** Min share of notes whose start AND length sit on the musical grid. */
  onGridPct: 95,
  /** Tolerance for "on the grid", milliseconds. */
  onGridTolMs: 10,
  /** Same-pitch pairs closer than this (seconds, overlaps counted) are duplicates. */
  dupGapSec: 0.045,
  /** Plausible note-density band (notes per second). */
  minNotesPerSec: 0.5,
  maxNotesPerSec: 20,
  /** A silent stretch longer than this many bars is flagged as possible missing notes. */
  maxSilentGapBars: 2,
  /** Key-estimate confidence below this means the analysis itself is shaky. */
  minKeyConfidence: 0.6,
} as const

/** Distance from `t` to the nearer of the 1/16 and 1/16-triplet grids (0-anchored). */
function gridDistance(t: number, g16: number, g16t: number): number {
  const a = Math.abs(t - Math.round(t / g16) * g16)
  const b = Math.abs(t - Math.round(t / g16t) * g16t)
  return Math.min(a, b)
}

/** Run the five output checks against a finished analysis result. */
export function validateChordOutput(result: ChordAnalysisResult): ValidationReport {
  const notes = result.leadNotes
  const T = VALIDATION_THRESHOLDS

  if (notes.length === 0) {
    const checks: ValidationCheck[] = [
      {
        id: 'coverage',
        label: 'Note coverage',
        status: 'warn',
        detail: 'No notes were transcribed from this clip.',
      },
    ]
    return { checks, passCount: 0, warnCount: 1 }
  }

  const bpm = Number.isFinite(result.bpm) && result.bpm >= 1 ? result.bpm : 120
  const secondsPerQn = 60 / bpm
  const g16 = secondsPerQn / 4
  const g16t = secondsPerQn / 6
  const barSec = 4 * secondsPerQn
  const tol = T.onGridTolMs / 1000

  const checks: ValidationCheck[] = []

  /* 1. Timing & note lengths — starts and durations both on the musical grid. */
  let gridOk = 0
  for (const n of notes) {
    if (gridDistance(n.startSec, g16, g16t) <= tol && gridDistance(n.durationSec, g16, g16t) <= tol) {
      gridOk++
    }
  }
  const gridPct = (gridOk / notes.length) * 100
  checks.push({
    id: 'timing',
    label: 'Timing & note lengths',
    status: gridPct >= T.onGridPct ? 'pass' : 'warn',
    detail: `${gridPct.toFixed(0)}% of notes have both their start and length on the 1/16 grid.`,
  })

  /* 2. No split or duplicate notes — same-pitch pairs that overlap or sit back-to-back. */
  const lanes = new Map<number, { startSec: number; durationSec: number }[]>()
  for (const n of notes) {
    const m = Math.round(n.midi)
    let lane = lanes.get(m)
    if (!lane) {
      lane = []
      lanes.set(m, lane)
    }
    lane.push({ startSec: n.startSec, durationSec: n.durationSec })
  }
  let dupCount = 0
  for (const lane of lanes.values()) {
    lane.sort((a, b) => a.startSec - b.startSec)
    for (let i = 0; i < lane.length - 1; i++) {
      const gap = lane[i + 1]!.startSec - (lane[i]!.startSec + lane[i]!.durationSec)
      if (gap <= T.dupGapSec) dupCount++
    }
  }
  checks.push({
    id: 'duplicates',
    label: 'No split or duplicate notes',
    status: dupCount === 0 ? 'pass' : 'warn',
    detail:
      dupCount === 0
        ? 'No overlapping or back-to-back same-pitch notes.'
        : `${dupCount} same-pitch note${dupCount === 1 ? '' : 's'} overlap or sit back-to-back — likely split fragments.`,
  })

  /* 3. Loop seam — when a loop is found, no note should ring across a loop-unit boundary. */
  const loop = result.loop
  if (!loop || !loop.found) {
    checks.push({
      id: 'loopSeam',
      label: 'Loop seam',
      status: 'pass',
      detail: 'Through-composed — no repeating loop to seam-check.',
    })
  } else {
    const unitSec = loop.barCount * loop.barSec
    let straddlers = 0
    for (const n of notes) {
      const boundary = (Math.floor(n.startSec / unitSec) + 1) * unitSec
      if (n.startSec + n.durationSec > boundary + g16) straddlers++
    }
    checks.push({
      id: 'loopSeam',
      label: 'Loop seam',
      status: straddlers === 0 ? 'pass' : 'warn',
      detail:
        straddlers === 0
          ? `${loop.barCount}-bar loop — every repetition is self-contained.`
          : `${straddlers} note${straddlers === 1 ? '' : 's'} ring across a loop boundary.`,
    })
  }

  /* 4. Note coverage — density in a sane band, no long silent gap mid-piece. */
  const density = notes.length / Math.max(1e-6, result.durationSec)
  const sorted = [...notes].sort((a, b) => a.startSec - b.startSec)
  let maxGap = sorted[0]!.startSec
  let coverEnd = sorted[0]!.startSec + sorted[0]!.durationSec
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i]!.startSec - coverEnd
    if (gap > maxGap) maxGap = gap
    coverEnd = Math.max(coverEnd, sorted[i]!.startSec + sorted[i]!.durationSec)
  }
  const densityOk = density >= T.minNotesPerSec && density <= T.maxNotesPerSec
  const gapOk = maxGap <= T.maxSilentGapBars * barSec
  checks.push({
    id: 'coverage',
    label: 'Note coverage',
    status: densityOk && gapOk ? 'pass' : 'warn',
    detail: !densityOk
      ? `${density.toFixed(1)} notes/sec — ${density < T.minNotesPerSec ? 'suspiciously sparse, notes may be missing' : 'unusually dense'}.`
      : !gapOk
        ? `${maxGap.toFixed(1)}s silent stretch — notes may be missing there.`
        : `${density.toFixed(1)} notes/sec, no large silent gaps.`,
  })

  /* 5. Analysis confidence — a shaky key/tempo estimate means the output needs a closer look. */
  const keyConf = result.estimatedKey?.confidence ?? 0
  checks.push({
    id: 'confidence',
    label: 'Analysis confidence',
    status: keyConf >= T.minKeyConfidence ? 'pass' : 'warn',
    detail:
      keyConf >= T.minKeyConfidence
        ? `Key estimate is confident (${result.estimatedKey?.label ?? '—'}).`
        : 'Key / tempo estimate is uncertain — give the output a closer listen.',
  })

  const passCount = checks.filter(c => c.status === 'pass').length
  return { checks, passCount, warnCount: checks.length - passCount }
}
