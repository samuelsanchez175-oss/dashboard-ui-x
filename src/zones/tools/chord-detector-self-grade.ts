/**
 * Self-graded quality assessment for the chord-detector's own output.
 *
 * Two grades — by design they look at different signals so the user can tell
 * "did the engine produce a usable presentation?" apart from "did the notes
 * themselves come out confident?":
 *
 *   PIANO ROLL  — coverage + pitch diversity (does the roll look populated and
 *                  varied, or is it three random dots in one octave?)
 *   NOTES       — note-level health: density (notes/sec in a musical range),
 *                  mean velocity (TFJS confidence proxy), and ghost ratio
 *                  (fraction of notes shorter than 100 ms — typical hallucination
 *                  signature for basic-pitch).
 *
 * This is a self-assessment from internal signals only — there's no ground
 * truth at runtime. Treat it as a smoke test, not a verdict.
 */

import type { LeadNote } from './chord-detector-melody'

export type QualityGrade = 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F'

export interface GradeBreakdown {
  /** Letter grade. */
  grade: QualityGrade
  /** Numeric 0-100. Same monotonic scale across grades. */
  score: number
  /** Short, human-readable signals string for a tooltip. */
  reasoning: string
}

export interface SelfGradeResult {
  piano: GradeBreakdown
  notes: GradeBreakdown
}

/** Color per grade, used as the chip background in the UI. */
export const GRADE_COLOR: Record<QualityGrade, string> = {
  'A+': '#0a6c2f',
  'A': '#3da34d',
  'B+': '#7eb437',
  'B': '#c9a227',
  'C': '#d97706',
  'D': '#dc2626',
  'F': '#b00020',
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))

function letterFromScore(s: number): QualityGrade {
  if (s >= 92) return 'A+'
  if (s >= 85) return 'A'
  if (s >= 78) return 'B+'
  if (s >= 70) return 'B'
  if (s >= 60) return 'C'
  if (s >= 50) return 'D'
  return 'F'
}

/* ── Sub-scores ───────────────────────────────────────────────────────────── */

/** Notes/sec in a musical range gets 100; outside, falls off. */
function densityScore(density: number): number {
  if (density <= 0) return 0
  if (density >= 0.5 && density <= 4) return 100
  if (density < 0.5) return Math.round(100 * (density / 0.5))
  /* density > 4: degrade gradually; >= 12 fully bad (panic-mode over-detection) */
  return Math.round(clamp01(1 - (density - 4) / 8) * 100)
}

/** Mean velocity > ~0.7 = full confidence; below 0.15 = mostly noise. */
function velocityScore(meanV: number): number {
  return Math.round(clamp01((meanV - 0.15) / 0.55) * 100)
}

/** Ghost ratio < 0.1 great; >= 0.4 terrible. Linear in between. */
function ghostScore(ratio: number): number {
  return Math.round(clamp01((0.4 - ratio) / 0.3) * 100)
}

/** How many of {lead, harmony, bass} have at least 2 notes? 3/3 = best. */
function coverageScore(notes: readonly LeadNote[]): {
  score: number
  lead: number
  harm: number
  bass: number
} {
  let lead = 0, harm = 0, bass = 0
  for (const n of notes) {
    const m = Math.round(n.midi)
    if (m >= 60) lead++
    else if (m >= 48) harm++
    else bass++
  }
  const filled = (lead >= 2 ? 1 : 0) + (harm >= 2 ? 1 : 0) + (bass >= 2 ? 1 : 0)
  return { score: Math.round((filled / 3) * 100), lead, harm, bass }
}

/**
 * Pitch diversity — distinct rounded pitches relative to a target
 * (sqrt of count × 1.5). One held note 100 times = low diversity; 30 notes
 * spread over 15 pitches = good.
 */
function diversityScore(notes: readonly LeadNote[]): { score: number; distinct: number } {
  if (notes.length === 0) return { score: 0, distinct: 0 }
  const distinct = new Set(notes.map(n => Math.round(n.midi))).size
  const target = Math.sqrt(notes.length) * 1.5
  return {
    score: Math.round(clamp01(distinct / Math.max(1, target)) * 100),
    distinct,
  }
}

/* ── Public API ──────────────────────────────────────────────────────────── */

/**
 * Grade a transcription using only its own output.
 *
 * Input is intentionally minimal: just the notes the user actually sees on the
 * piano roll and the clip duration. Pass the EFFECTIVE notes/duration (i.e.,
 * what's rendered — full track or extracted loop), not raw analysis output, so
 * the grade matches what the user sees.
 */
export function gradeAnalysis(input: {
  leadNotes: readonly LeadNote[]
  durationSec: number
}): SelfGradeResult {
  const notes = input.leadNotes
  const dur = Math.max(0.001, input.durationSec)
  const count = notes.length

  /* Empty output is an automatic F — nothing to grade. */
  if (count === 0) {
    const empty: GradeBreakdown = { grade: 'F', score: 0, reasoning: 'no notes detected' }
    return { piano: empty, notes: empty }
  }

  // ─── NOTES grade ───────────────────────────────────────────────────────
  const meanV = notes.reduce((s, n) => s + n.velocity, 0) / count
  const density = count / dur
  const ghostCount = notes.filter(n => n.durationSec < 0.1).length
  const ghostRatio = ghostCount / count

  const dScore = densityScore(density)
  const vScore = velocityScore(meanV)
  const gScore = ghostScore(ghostRatio)
  /* Density carries the most weight — extreme values are the loudest "something
   * is wrong" signal in basic-pitch output. Velocity + ghosts split the rest. */
  const notesScore = Math.round(0.45 * dScore + 0.3 * vScore + 0.25 * gScore)

  // ─── PIANO ROLL grade ──────────────────────────────────────────────────
  const cov = coverageScore(notes)
  const div = diversityScore(notes)
  /* Coverage matters more than diversity for the "looks like a real piano roll"
   * gut check — a melody that ignores the bass register reads as incomplete
   * even if the lead is varied. */
  const pianoScore = Math.round(0.55 * cov.score + 0.45 * div.score)

  return {
    notes: {
      grade: letterFromScore(notesScore),
      score: notesScore,
      reasoning:
        `${count} notes · ${density.toFixed(1)}/s · ` +
        `vel ${meanV.toFixed(2)} · ${Math.round(ghostRatio * 100)}% ghosts` +
        ` (density ${dScore}, vel ${vScore}, ghosts ${gScore})`,
    },
    piano: {
      grade: letterFromScore(pianoScore),
      score: pianoScore,
      reasoning:
        `lead ${cov.lead} · harm ${cov.harm} · bass ${cov.bass} · ` +
        `${div.distinct} distinct pitches (coverage ${cov.score}, diversity ${div.score})`,
    },
  }
}
