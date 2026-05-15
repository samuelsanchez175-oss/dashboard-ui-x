/**
 * Post-pipeline audit for the chord detector — reads the analysis result + the source's
 * aggregate chromagram and reports three things the user explicitly asked about:
 *
 *   1. Missing-note candidates — pitch classes where the source's chroma energy is
 *      strong but the lead-note coverage is sparse (under-detection signal).
 *   2. Loop audit — per-period (1, 2, 4, 8, 16 bars) self-similarity scores so the user
 *      can see WHICH bar-windows loop cleanly, not just the winner.
 *   3. Key / BPM / scale cross-check — confirms what the analysis already found and
 *      cross-checks the histogram-based key against the chord-progression-implied key
 *      (when they disagree, the analysis is less trustworthy).
 *
 * Pure module: data in, data out. Runs in the engine after stage 14 — see
 * `docs/superpowers/specs/2026-05-14-chord-detector-loops-validation-design.md`.
 */

import type { LeadNote } from './chord-detector-melody'
import type { ChordSegment, EstimatedKey } from './chord-detector-engine'
import type { LoopInfo } from './chord-detector-loops'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

export type AuditMissingNote = {
  /** e.g. "F#" — the under-represented pitch class. */
  pc: string
  /** Share of total chroma energy at this pitch class. */
  chromaShare: number
  /** Share of total lead-note duration·velocity at this pitch class. */
  noteShare: number
  /** Positive when chroma >> notes (the "missing" signal). */
  deficit: number
  /** Approximate time (seconds) of the bar where the deficit is largest. */
  atSec: number | null
}

export type AuditLoopPeriod = {
  /** Period in bars (1, 2, 4, 8, or 16). */
  period: number
  /** Mean bar self-similarity at this period (0..1). */
  meanSimilarity: number
  /** Best single bar-pair similarity at this period (0..1). */
  cleanest: number
  rating: 'clean' | 'partial' | 'no'
}

export type AuditKeyBpmScale = {
  keyLabel: string
  keyConfidence: number
  scale: 'major' | 'minor' | 'unknown'
  bpm: number
  bpmSource: string
  /** Top 3 keys ranked by how many segments are diatonic in them. */
  chordImpliedKeys: { keyLabel: string; diatonicCount: number; total: number }[]
  /** True if the top chord-implied key matches `keyLabel`. */
  chordAgreesWithKey: boolean
}

export type AuditReport = {
  missingNoteCandidates: AuditMissingNote[]
  loopAudit: {
    chosen: LoopInfo
    perPeriod: AuditLoopPeriod[]
    /** "clean" if the chosen period is solid AND consistent; "partial" if borderline; "no" if no loop. */
    overall: 'clean' | 'partial' | 'no'
  }
  keyBpmScale: AuditKeyBpmScale
}

const LOOP_CANDIDATE_PERIODS = [1, 2, 4, 8, 16] as const
/** A pitch class with chroma share this far above its note share is flagged as possibly missing. */
const MISSING_DEFICIT_THRESHOLD = 0.05
/** Cap on how many missing candidates to surface. */
const MISSING_TOP_K = 4

/* ── 1. Missing-note candidates ───────────────────────────────────────────── */

function noteShareByPc(notes: readonly LeadNote[]): number[] {
  const acc = new Float64Array(12)
  for (const n of notes) {
    const pc = ((Math.round(n.midi) % 12) + 12) % 12
    acc[pc] += Math.max(0, n.durationSec) * Math.max(1e-6, n.velocity)
  }
  const total = acc.reduce((a, b) => a + b, 0)
  return total > 0 ? Array.from(acc, x => x / total) : Array.from(acc)
}

function findMissingNoteCandidates(
  notes: readonly LeadNote[],
  chromaPcDist: readonly number[] | null,
  barSec: number,
): AuditMissingNote[] {
  if (!chromaPcDist || chromaPcDist.length !== 12) return []
  const noteDist = noteShareByPc(notes)
  const deficits: AuditMissingNote[] = []
  for (let pc = 0; pc < 12; pc++) {
    const cs = chromaPcDist[pc] ?? 0
    const ns = noteDist[pc] ?? 0
    const deficit = cs - ns
    if (deficit < MISSING_DEFICIT_THRESHOLD) continue
    /* Pick a representative time: the bar with the most notes at this pc — that's where
     * the deficit is most visible against existing note context. Falls back to mid-clip. */
    let atSec: number | null = null
    if (barSec > 0 && notes.length > 0) {
      const lastEnd = notes.reduce((m, n) => Math.max(m, n.startSec + n.durationSec), 0)
      const bars = Math.max(1, Math.floor(lastEnd / barSec))
      const perBar = new Array<number>(bars).fill(0)
      for (const n of notes) {
        if (((Math.round(n.midi) % 12) + 12) % 12 !== pc) continue
        const b = Math.min(bars - 1, Math.max(0, Math.floor(n.startSec / barSec)))
        perBar[b] = (perBar[b] ?? 0) + n.durationSec
      }
      let bestBar = 0
      for (let b = 1; b < bars; b++) if ((perBar[b] ?? 0) > (perBar[bestBar] ?? 0)) bestBar = b
      atSec = bestBar * barSec + barSec / 2
    }
    deficits.push({
      pc: NOTE_NAMES[pc]!,
      chromaShare: cs,
      noteShare: ns,
      deficit,
      atSec,
    })
  }
  deficits.sort((a, b) => b.deficit - a.deficit)
  return deficits.slice(0, MISSING_TOP_K)
}

/* ── 2. Per-period loop audit ─────────────────────────────────────────────── */

function periodRating(meanSim: number, cleanest: number): AuditLoopPeriod['rating'] {
  if (meanSim >= 0.7 || (cleanest >= 0.85 && meanSim >= 0.55)) return 'clean'
  if (meanSim >= 0.45 || cleanest >= 0.7) return 'partial'
  return 'no'
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

function perPeriodLoopAudit(notes: readonly LeadNote[], bpm: number, durationSec: number): AuditLoopPeriod[] {
  if (!Number.isFinite(bpm) || bpm < 1 || !(durationSec > 0) || notes.length === 0) return []
  const barSec = 4 * (60 / bpm)
  const totalBars = Math.floor(durationSec / barSec)
  if (totalBars < 2) return []
  const sixteenthSec = barSec / 16
  const fp: Set<string>[] = []
  for (let b = 0; b < totalBars; b++) fp.push(new Set<string>())
  for (const n of notes) {
    const b = Math.floor(n.startSec / barSec)
    if (b < 0 || b >= totalBars) continue
    fp[b]!.add(`${Math.round(n.midi)}:${Math.round((n.startSec - b * barSec) / sixteenthSec)}`)
  }
  const out: AuditLoopPeriod[] = []
  for (const period of LOOP_CANDIDATE_PERIODS) {
    if (2 * period > totalBars) continue
    let sum = 0
    let cleanest = 0
    let count = 0
    for (let i = 0; i + period < totalBars; i++) {
      const s = jaccard(fp[i]!, fp[i + period]!)
      sum += s
      if (s > cleanest) cleanest = s
      count++
    }
    const meanSim = count > 0 ? sum / count : 0
    out.push({ period, meanSimilarity: meanSim, cleanest, rating: periodRating(meanSim, cleanest) })
  }
  return out
}

function loopOverallRating(chosen: LoopInfo, perPeriod: AuditLoopPeriod[]): 'clean' | 'partial' | 'no' {
  if (!chosen.found) return 'no'
  const row = perPeriod.find(p => p.period === chosen.barCount)
  if (!row) return chosen.confidence >= 0.7 ? 'clean' : 'partial'
  return row.rating
}

/* ── 3. Key / BPM / scale cross-check ─────────────────────────────────────── */

/**
 * Returns whether `(rootPc, quality)` is a diatonic triad in major key `tonicPc`.
 * Major key diatonic triads (Roman numerals): I, ii, iii, IV, V, vi, vii°.
 */
function isDiatonicMajor(rootPc: number, quality: ChordSegment['quality'], tonicPc: number): boolean {
  const degree = ((rootPc - tonicPc) % 12 + 12) % 12
  // [I major, ii minor, iii minor, IV major, V major, vi minor, vii° dim]
  if (degree === 0 && quality === 'major') return true
  if (degree === 2 && quality === 'minor') return true
  if (degree === 4 && quality === 'minor') return true
  if (degree === 5 && quality === 'major') return true
  if (degree === 7 && quality === 'major') return true
  if (degree === 9 && quality === 'minor') return true
  if (degree === 11 && quality === 'dim') return true
  return false
}

/**
 * Natural-minor diatonic triads in minor key `tonicPc`: i, ii°, III, iv, v, VI, VII.
 * (Harmonic-minor V major is intentionally not counted here — pop/rock loops usually
 * sit on natural-minor and modal shapes.)
 */
function isDiatonicMinor(rootPc: number, quality: ChordSegment['quality'], tonicPc: number): boolean {
  const degree = ((rootPc - tonicPc) % 12 + 12) % 12
  if (degree === 0 && quality === 'minor') return true
  if (degree === 2 && quality === 'dim') return true
  if (degree === 3 && quality === 'major') return true
  if (degree === 5 && quality === 'minor') return true
  if (degree === 7 && quality === 'minor') return true
  if (degree === 8 && quality === 'major') return true
  if (degree === 10 && quality === 'major') return true
  return false
}

type RankedKey = { keyLabel: string; rootPc: number; mode: 'major' | 'minor'; diatonicCount: number; total: number }

function chordImpliedKeyRanking(segments: readonly ChordSegment[]): RankedKey[] {
  const total = segments.length
  if (total === 0) return []
  const rows: RankedKey[] = []
  for (let R = 0; R < 12; R++) {
    let majorCount = 0
    let minorCount = 0
    for (const seg of segments) {
      if (isDiatonicMajor(seg.rootPc, seg.quality, R)) majorCount++
      if (isDiatonicMinor(seg.rootPc, seg.quality, R)) minorCount++
    }
    rows.push({ keyLabel: `${NOTE_NAMES[R]!} major`, rootPc: R, mode: 'major', diatonicCount: majorCount, total })
    rows.push({ keyLabel: `${NOTE_NAMES[R]!} minor`, rootPc: R, mode: 'minor', diatonicCount: minorCount, total })
  }
  rows.sort((a, b) => b.diatonicCount - a.diatonicCount)
  return rows.slice(0, 3)
}

/**
 * A major key and its relative minor share every diatonic triad — the chord-implied
 * ranking will often pick whichever of the two scored marginally higher, so flagging
 * that as "disagreement" with the histogram-based key would be musically wrong.
 */
function keysAgreeWithRelativeTolerance(estimated: EstimatedKey, topImplied: RankedKey | undefined): boolean {
  if (!topImplied) return false
  if (topImplied.keyLabel === estimated.label) return true
  if (estimated.rootPc < 0 || estimated.mode === 'unknown') return false
  // Relative minor of a major key sits at (R + 9) mod 12; relative major of a minor key at (R + 3) mod 12.
  if (estimated.mode === 'major' && topImplied.mode === 'minor') {
    return (estimated.rootPc + 9) % 12 === topImplied.rootPc
  }
  if (estimated.mode === 'minor' && topImplied.mode === 'major') {
    return (estimated.rootPc + 3) % 12 === topImplied.rootPc
  }
  return false
}

/* ── Main ─────────────────────────────────────────────────────────────────── */

export type AuditInput = {
  leadNotes: readonly LeadNote[]
  segments: readonly ChordSegment[]
  bpm: number
  bpmSource: string
  durationSec: number
  estimatedKey: EstimatedKey
  loop: LoopInfo
  /** Aggregate 12-bin chroma distribution (sums to 1). Null for the MIDI-input path. */
  chromaPcDist: readonly number[] | null
}

export function auditChordAnalysis(input: AuditInput): AuditReport {
  const { leadNotes, segments, bpm, bpmSource, durationSec, estimatedKey, loop, chromaPcDist } = input
  const barSec = Number.isFinite(bpm) && bpm >= 1 ? 4 * (60 / bpm) : 0

  const missingNoteCandidates = findMissingNoteCandidates(leadNotes, chromaPcDist, barSec)

  const perPeriod = perPeriodLoopAudit(leadNotes, bpm, durationSec)
  const loopAudit = { chosen: loop, perPeriod, overall: loopOverallRating(loop, perPeriod) }

  const chordImpliedKeys = chordImpliedKeyRanking(segments)
  const chordAgreesWithKey = keysAgreeWithRelativeTolerance(estimatedKey, chordImpliedKeys[0])
  const keyBpmScale: AuditKeyBpmScale = {
    keyLabel: estimatedKey.label,
    keyConfidence: estimatedKey.confidence,
    scale: estimatedKey.mode,
    bpm,
    bpmSource,
    chordImpliedKeys: chordImpliedKeys.map(r => ({ keyLabel: r.keyLabel, diatonicCount: r.diatonicCount, total: r.total })),
    chordAgreesWithKey,
  }

  return { missingNoteCandidates, loopAudit, keyBpmScale }
}
