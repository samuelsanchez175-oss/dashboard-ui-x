/**
 * Lead-note typing + RMS/flux refinement for the chord detector’s MIDI export.
 *
 * Audio transcription is Spotify Basic Pitch (TensorFlow.js). This module only
 * builds a coarse RMS/onset-flux curve and nudges Basic Pitch note boundaries for export.
 */

export type LeadNote = {
  midi: number
  startSec: number
  durationSec: number
  velocity: number // 0..1
}

/**
 * Tunables for MIDI export timing refinement (RMS + positive RMS-delta “flux”).
 * Used so exported note on/off times track perceived attacks and decay.
 */
export const MIDI_EXPORT_TIMING = {
  /** Max |Δt| when snapping a note onset or segment boundary to local flux (seconds). */
  maxBoundarySnapSec: 0.08,
  /** RMS analysis hop (samples); finer hop tightens localization vs CPU cost. */
  rmsRefineHopSamples: 256,
  /** RMS window length (samples). */
  rmsRefineWindowSamples: 512,
  /** Nudge note-on slightly before the flux peak (seconds). */
  leadOnsetPrerollSec: 0.004,
  /**
   * While searching past nominal note-off, keep extending if RMS ≥ this × reference peak.
   * Reference peak is taken from energy **during the nominal note** (not only near BP’s offset),
   * so held tones stay extended instead of breaking on every small RMS dip.
   */
  leadSustainTailFraction: 0.245,
  /** Minimum gap between consecutive **same-pitch** notes after refinement (per MIDI lane). */
  minInterNoteGapSec: 0.0028,
  /**
   * Minimum exported note duration (seconds); matches `buildChordMidiBlob` floor (~31 ms).
   * This is a **floor**, not a splitter — it only clamps short notes upward when room allows.
   */
  minExportedNoteDurSec: 1 / 32,
  /** Floor for minimum chord-segment length when sliding internal boundaries (seconds). */
  segmentBoundaryMinSec: 0.04,
  /** Also require segment length ≥ this × one beat (whichever is larger). */
  segmentBoundaryMinBeatFraction: 0.12,
} as const

/**
 * Post–Basic Pitch `outputToNotesPoly` glue (same single pipeline; chord detection still uses raw BP notes).
 *
 * - **Merge gap** (~25–40 ms): same rounded MIDI pitch, end→start gap ≤ this → one note (union end times).
 * - **Min length after merge** (~80–100 ms): drop residual blips; BP decode uses a separate longer floor
 *   in `NEURALNOTE_STYLE.basicPitch.minNoteDurationMs` (see `chord-detector-neuralnote-style.ts`).
 */
export const MIDI_EXPORT_NOTE_MERGE = {
  /** Same pitch: merge if gap ≤ this (seconds). Tunable ~25–40 ms. */
  samePitchMaxGapSec: 0.042,
  /**
   * After merge, drop notes shorter than this (seconds). Applied **before** RMS refine so refine
   * sees fewer spurious boundaries.
   *
   * Was 0.118 (118 ms) — that's longer than a 1/32 note at 65 BPM (~115 ms)
   * and a 1/16 note at 250+ BPM, so rapid 1/32 fragments in slower tunes got
   * killed wholesale. Dropped to 0.05 (50 ms): keeps everything down to roughly
   * a 1/64 at 60 BPM. The lower bound is the BP frame size (~5.8 ms), well
   * under this floor — so noise still gets filtered while real articulations
   * survive. See reference Logic Pro export of "frank ocean acura girl" bars
   * 3-4, which contains many sub-118 ms fragments in the upper register.
   */
  minNoteSecAfterMerge: 0.05,
} as const

/**
 * Post–RMS export pass: snap **simultaneous** chord tones to one attack so DAWs don’t
 * stagger strums (Basic Pitch often spreads poly onsets by tens of ms). Skips single-pitch
 * windows and arpeggio-shaped clusters. Does **not** merge lanes — per-pitch RMS refine stays
 * intact; only co-onset groups are time-shifted toward a shared target (+ optional light BPM snap).
 */
export const CHORD_ONSET_ALIGN = {
  enabled: true,
  /**
   * When any note in the cluster has MIDI below `bassMidiThreshold`, widen the onset
   * inclusion window to this (ms) so bass/fundamental attacks co-anchor with harmony.
   */
  bassChordOnsetClusterMs: 82,
  /** Notes below this MIDI number use `bassChordOnsetClusterMs` for cluster span. */
  bassMidiThreshold: 48,
  /**
   * All note-ons in a cluster must fall within this wall-clock span (ms) of the cluster
   * anchor `t0` (first sorted onset). **60 ms** matches `scripts/audit-chord-midi-timing.mjs`
   * so poly notes grouped in one audit window are eligible for the same `tUnify`.
   */
  chordOnsetClusterMs: 60,
  /**
   * If cluster span exceeds this (ms), apply arpeggio guard: when median gap between
   * consecutive onsets (sorted) exceeds `arpeggioMedianGapMs`, skip alignment.
   * Set near **60 ms** so typical BP-spread block chords bypass the median test; very wide
   * clusters still consult `arpeggioMedianGapMs` to avoid crushing real arpeggios.
   */
  arpeggioSkipSpreadMs: 60,
  /**
   * Rolled block chords often show ~15–22 ms median gaps between consecutive onsets; this
   * threshold (ms) skips alignment only when span already triggered the guard above **and**
   * the median gap says “arpeggio.” **27 ms** was tuned on Frank Ocean reference export sim.
   */
  arpeggioMedianGapMs: 27,
  /**
   * 1 = each note lerps fully to the shared target onset; <1 blends from the
   * note's own start toward that target. Was 1 (full collapse): every note in
   * a 60 ms cluster snapped to the cluster's chosen anchor, destroying
   * intentional micro-timing (rolled chords, "drag-feel" arpeggios, melodic
   * grace notes). Dropped to 0.4: notes still gravitate toward the cluster
   * anchor (helps DAWs not stagger block chords) but each preserves ~60 % of
   * its original timing offset. The reference Logic Pro export of bars 3-4 of
   * "frank ocean acura girl" shows clear micro-timing variance between notes
   * in the same beat — `unifyBlend: 1` would have crushed all of it.
   */
  unifyBlend: 0.4,
  /** 0 = velocity-weighted mean onset only; 1 = full pull toward earliest onset among “loud” notes. */
  earlyLoudPull: 0.34,
  /** Notes with velocity ≥ this × cluster max velocity count as loud for the early-loud anchor. */
  loudVelocityFraction: 0.86,
  /** Exponent on velocity when computing the weighted-mean onset (≥1). Slightly favors the singing line. */
  velocityWeightPower: 1.62,
  /**
   * When `bpm` is passed in options, blend this much (0..1) toward the nearest musical grid
   * (`beatSnapDivisionFrac` as a **whole-note fraction**, same as NeuralNote time divisions).
   * Small values (~0.15–0.25) nudge attacks toward the pocket without full quantize.
   */
  beatGridSnapBlend: 0.17,
  /** Default grid step: 32nd note (whole-note fraction 1/32). */
  beatSnapDivisionFrac: 1 / 32,
} as const

/**
 * Solo two-hand piano export cap: at each dense onset, keep at most `maxSimultaneousKeys`
 * distinct MIDI pitches (default **8** with middle-C split). `splitAtMidi: null` uses velocity-only selection;
 * when set (e.g. middle C), each hand gets its own sub-cap (`maxBelow` / `maxAbove`) before
 * the global `maxSimultaneousKeys` trim.
 */
export const PIANO_TWO_HAND_EXPORT = {
  enabled: true,
  /** Solo piano: keep dense stacks playable without crushing typical two-hand voicings. */
  maxSimultaneousKeys: 8,
  onsetEpsilonSec: 0.017,
  /** Middle C split: per-hand caps below, then global `maxSimultaneousKeys` trim. */
  splitAtMidi: 60,
  maxBelow: 4,
  maxAbove: 4,
} as const

/** Used when `pianoLeadFocus: false` — looser cap for busy polyphonic parts. */
export const PIANO_TWO_HAND_RELAXED: PianoTwoHandExportInput = {
  maxSimultaneousKeys: 10,
  onsetEpsilonSec: 0.018,
  splitAtMidi: null,
  maxBelow: 5,
  maxAbove: 5,
}

export type PianoTwoHandExportOptions = {
  enabled: boolean
  maxSimultaneousKeys: number
  onsetEpsilonSec: number
  /** `null` = velocity-only cap; number = bass/treble sub-caps at this MIDI boundary. */
  splitAtMidi: number | null
  maxBelow: number
  maxAbove: number
}

export type PianoTwoHandExportInput = Partial<PianoTwoHandExportOptions>

function sortNotesByVelDescThenMidi(a: LeadNote, b: LeadNote): number {
  if (b.velocity !== a.velocity) return b.velocity - a.velocity
  return a.midi - b.midi
}

/**
 * Pick up to `n` notes from `group`, ALWAYS keeping the edge voice (`'hi'` = highest MIDI,
 * `'lo'` = lowest), then filling the rest by velocity.
 *
 * The outer voices carry the music — the melody sits on top, the bass on the bottom — but
 * a transcription's velocity (≈ amplitude) often ranks an inner voice louder than the
 * melody. A pure velocity cap then silently drops the top line. Pinning the edge before
 * the velocity fill is what stops "missing top notes" when a polyphony cap fires
 * (chord-detector-midi-export-debug, Bug 3).
 */
function pickKeepingEdge(group: readonly LeadNote[], n: number, keep: 'hi' | 'lo'): LeadNote[] {
  if (n <= 0) return []
  if (group.length <= n) return group.map(g => ({ ...g }))
  const edge = group.reduce((best, c) =>
    keep === 'hi' ? (c.midi > best.midi ? c : best) : (c.midi < best.midi ? c : best),
  )
  const rest = group.filter(c => c !== edge).sort(sortNotesByVelDescThenMidi).slice(0, n - 1)
  return [edge, ...rest].map(g => ({ ...g }))
}

/**
 * Per onset chain (sorted `startSec`, adjacent gap ≤ `onsetEpsilonSec`), cap distinct
 * rounded MIDI pitches. Strongest velocity wins per pitch; then either global top-K by
 * velocity or split-hand caps when `splitAtMidi` is set.
 *
 * **Pipeline order:** run **after** `alignChordOnsetsInLeadNotes` and the post-align
 * `dropSimultaneousPitchOutliers` pass so onset unification cannot re-stack weak notes into
 * an over-full cluster that this pass would have already trimmed (avoids “phantom” re-entry
 * from time-nudge alone).
 */
export function enforceTwoHandPianoPolyphony(
  notes: readonly LeadNote[],
  opts?: PianoTwoHandExportInput,
): LeadNote[] {
  const o: PianoTwoHandExportOptions = { ...PIANO_TWO_HAND_EXPORT, ...opts }
  if (!o.enabled || notes.length === 0) return notes.map(n => ({ ...n }))
  const eps = Math.max(1e-5, o.onsetEpsilonSec)
  const K = Math.max(1, Math.floor(o.maxSimultaneousKeys))
  const maxBelow = Math.max(0, Math.floor(o.maxBelow))
  const maxAbove = Math.max(0, Math.floor(o.maxAbove))

  const arr = notes.map(n => ({ ...n, midi: Math.round(n.midi) }))
  arr.sort((a, b) => a.startSec - b.startSec || a.midi - b.midi)

  const clusters: LeadNote[][] = []
  let cur: LeadNote[] = []
  for (const n of arr) {
    if (cur.length === 0) {
      cur.push(n)
      continue
    }
    if (n.startSec - cur[cur.length - 1]!.startSec <= eps + 1e-9) cur.push(n)
    else {
      clusters.push(cur)
      cur = [n]
    }
  }
  if (cur.length) clusters.push(cur)

  const pickFromCluster = (cluster: LeadNote[]): LeadNote[] => {
    const bestByMidi = new Map<number, LeadNote>()
    for (const n of cluster) {
      const prev = bestByMidi.get(n.midi)
      if (!prev || n.velocity > prev.velocity + 1e-9) bestByMidi.set(n.midi, { ...n })
    }
    const candidates = [...bestByMidi.values()]
    if (candidates.length <= K) return candidates

    if (o.splitAtMidi == null || !Number.isFinite(o.splitAtMidi)) {
      // Velocity-only cap, but the top voice (melody) always survives.
      return pickKeepingEdge(candidates, K, 'hi')
    }

    const split = o.splitAtMidi
    const below = candidates.filter(c => c.midi < split)
    const above = candidates.filter(c => c.midi >= split)
    // Each hand keeps its edge voice: bass below, melody above.
    const belowPick = pickKeepingEdge(below, maxBelow, 'lo')
    const abovePick = pickKeepingEdge(above, maxAbove, 'hi')
    let chosen = belowPick.concat(abovePick)
    if (chosen.length > K) {
      // Global trim still protects the outermost two voices.
      const top = chosen.reduce((a, b) => (b.midi > a.midi ? b : a))
      const bot = chosen.reduce((a, b) => (b.midi < a.midi ? b : a))
      const mid = chosen
        .filter(c => c !== top && c !== bot)
        .sort(sortNotesByVelDescThenMidi)
        .slice(0, Math.max(0, K - 2))
      chosen = [bot, top, ...mid]
    }
    return chosen
  }

  const out: LeadNote[] = []
  for (const cl of clusters) {
    for (const n of pickFromCluster(cl)) {
      out.push({ midi: n.midi, startSec: n.startSec, durationSec: n.durationSec, velocity: n.velocity })
    }
  }
  out.sort((a, b) => a.startSec - b.startSec || a.midi - b.midi)
  return out
}

export type ChordOnsetAlignOptions = {
  enabled: boolean
  bassChordOnsetClusterMs: number
  bassMidiThreshold: number
  chordOnsetClusterMs: number
  arpeggioSkipSpreadMs: number
  arpeggioMedianGapMs: number
  unifyBlend: number
  earlyLoudPull: number
  loudVelocityFraction: number
  velocityWeightPower: number
  beatGridSnapBlend: number
  beatSnapDivisionFrac: number
  /** When set (from analysis), enables partial beat snap via `beatGridSnapBlend`. */
  bpm?: number
}

/**
 * Same contract as `quantizeLeadStartSec` in `chord-detector-neuralnote-style.ts`, inlined to
 * avoid a circular import (melody ↔ neuralnote).
 */
function partialSnapLeadTimeToGrid(
  eventTimeSec: number,
  bpm: number,
  timeDivisionFrac: number,
  quantizationForce: number,
): number {
  if (quantizationForce <= 0 || !(eventTimeSec >= 0) || !Number.isFinite(bpm) || bpm < 1) return eventTimeSec
  const secondsPerQn = 60 / bpm
  const divisionDuration = timeDivisionFrac * 4 * secondsPerQn
  if (!(divisionDuration > 0)) return eventTimeSec
  const shiftedTime = eventTimeSec
  const mod = ((shiftedTime % divisionDuration) + divisionDuration) % divisionDuration
  const previousDivisionTime = shiftedTime - mod
  const targetTime =
    mod < divisionDuration / 2 ? previousDivisionTime : previousDivisionTime + divisionDuration
  return shiftedTime + (targetTime - shiftedTime) * quantizationForce
}

/**
 * Cluster = consecutive notes in **start-time order** whose first note’s start `t0`
 * satisfies `each.start ≤ t0 + chordOnsetClusterMs` (window in seconds). Requires **≥2
 * distinct MIDI** values.
 *
 * **Unified attack:** velocity-power-weighted mean onset, pulled toward the earliest onset among
 * loud notes (`earlyLoudPull`), clamped to the cluster span, then optional partial BPM grid snap
 * when `bpm` is provided. Each note’s start moves toward that target by `unifyBlend` (default 1 =
 * identical attack times).
 *
 * **Two passes:** the cluster pass runs twice with a resort in between so notes pulled together
 * in pass 1 can form new eligible windows in pass 2 (cheap; same arpeggio guards each time).
 */
export function alignChordOnsetsInLeadNotes(
  notes: readonly LeadNote[],
  opts?: Partial<ChordOnsetAlignOptions>,
): LeadNote[] {
  const o: ChordOnsetAlignOptions = { ...CHORD_ONSET_ALIGN, ...opts }
  if (!o.enabled || notes.length < 2) return notes.map(n => ({ ...n }))

  const W = Math.max(1e-6, o.chordOnsetClusterMs / 1000)
  const Wbass = Math.max(W, o.bassChordOnsetClusterMs / 1000)
  const bassTh = o.bassMidiThreshold
  const spreadSkip = o.arpeggioSkipSpreadMs / 1000
  const medianGapSkip = o.arpeggioMedianGapMs / 1000
  const minDur = MIDI_EXPORT_TIMING.minExportedNoteDurSec
  const unifyBlend = Math.max(0, Math.min(1, o.unifyBlend))
  const earlyPull = Math.max(0, Math.min(1, o.earlyLoudPull))
  const velPow = Math.max(1, o.velocityWeightPower)
  const loudFrac = Math.max(0.05, Math.min(1, o.loudVelocityFraction))
  const beatBlend = Math.max(0, Math.min(1, o.beatGridSnapBlend))
  const divFrac =
    o.beatSnapDivisionFrac > 0 && o.beatSnapDivisionFrac <= 1 ? o.beatSnapDivisionFrac : 1 / 32

  const sorted = notes.map(n => ({ ...n, midi: Math.round(n.midi) }))
  sorted.sort((a, b) => a.startSec - b.startSec || a.midi - b.midi)

  const clusterPass = (): void => {
    let i = 0
    while (i < sorted.length) {
      const t0 = sorted[i]!.startSec
      let j = i + 1
      while (j < sorted.length && sorted[j]!.startSec <= t0 + W + 1e-9) j++

      const pitches = new Set<number>()
      let clusterMax = t0
      for (let k = i; k < j; k++) {
        pitches.add(sorted[k]!.midi)
        clusterMax = Math.max(clusterMax, sorted[k]!.startSec)
      }

      let clusterHasBass = false
      for (let k = i; k < j; k++) {
        if (sorted[k]!.midi < bassTh) {
          clusterHasBass = true
          break
        }
      }
      if (clusterHasBass) {
        while (j < sorted.length && sorted[j]!.startSec <= t0 + Wbass + 1e-9) j++
        clusterMax = t0
        for (let k = i; k < j; k++) clusterMax = Math.max(clusterMax, sorted[k]!.startSec)
        for (let k = i; k < j; k++) pitches.add(sorted[k]!.midi)
      }

      if (pitches.size < 2) {
        i = j
        continue
      }

      const span = clusterMax - t0
      if (span > spreadSkip + 1e-9) {
        const byTime = sorted.slice(i, j).sort((a, b) => a.startSec - b.startSec)
        const gaps: number[] = []
        for (let g = 1; g < byTime.length; g++) gaps.push(byTime[g]!.startSec - byTime[g - 1]!.startSec)
        gaps.sort((a, b) => a - b)
        const mid = gaps.length ? gaps[Math.floor((gaps.length - 1) / 2)]! : 0
        if (mid > medianGapSkip + 1e-9) {
          i = j
          continue
        }
      }

      const members = sorted.slice(i, j)
      let vMax = 0
      for (const m of members) vMax = Math.max(vMax, m.velocity)
      vMax = Math.max(vMax, 1e-6)

      const velPowUse =
        members.some(m => m.midi < bassTh) ? Math.max(velPow, 1.82) : velPow

      let sumW = 0
      let sumTW = 0
      for (const m of members) {
        const w = Math.pow(Math.max(1e-6, m.velocity), velPowUse)
        sumW += w
        sumTW += m.startSec * w
      }
      const tWeighted = sumW > 0 ? sumTW / sumW : t0

      const loudTh = vMax * loudFrac
      const loudStarts = members.filter(m => m.velocity >= loudTh - 1e-9).map(m => m.startSec)
      const tLoudEarly = loudStarts.length > 0 ? Math.min(...loudStarts) : t0

      let tUnify = tWeighted + earlyPull * (tLoudEarly - tWeighted)
      tUnify = Math.max(t0, Math.min(clusterMax, tUnify))

      if (beatBlend > 0 && o.bpm != null && Number.isFinite(o.bpm) && o.bpm >= 1) {
        tUnify = partialSnapLeadTimeToGrid(tUnify, o.bpm, divFrac, beatBlend)
        tUnify = Math.max(t0 - 0.004, Math.min(clusterMax + 0.004, tUnify))
      }

      for (let k = i; k < j; k++) {
        const n = sorted[k]!
        const origEnd = n.startSec + n.durationSec
        const newStart = n.startSec + unifyBlend * (tUnify - n.startSec)
        const dur = Math.max(minDur, origEnd - newStart)
        sorted[k] = { ...n, startSec: newStart, durationSec: dur }
      }

      i = j
    }
  }

  clusterPass()
  sorted.sort((a, b) => a.startSec - b.startSec || a.midi - b.midi)
  clusterPass()
  sorted.sort((a, b) => a.startSec - b.startSec || a.midi - b.midi)
  return sorted
}

export type RmsFluxCurve = {
  /** Window-center time in seconds for each bin. */
  tCenter: Float32Array
  rms: Float32Array
  /** max(0, rms[i] − rms[i−1]) — crude onset proxy without a second FFT. */
  flux: Float32Array
}

/**
 * Build a coarse RMS envelope and onset-flux series over `mono` for export-time
 * boundary snapping (one pass; reuse for all notes / segments).
 */
export function buildRmsFluxCurve(mono: Float32Array, sampleRate: number): RmsFluxCurve | null {
  const hop = MIDI_EXPORT_TIMING.rmsRefineHopSamples
  const win = MIDI_EXPORT_TIMING.rmsRefineWindowSamples
  if (mono.length < win + hop) return null
  const n = Math.floor((mono.length - win) / hop) + 1
  const tCenter = new Float32Array(n)
  const rms = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const s = i * hop
    let sum = 0
    for (let k = 0; k < win; k++) sum += mono[s + k]! * mono[s + k]!
    rms[i] = Math.sqrt(sum / win)
    tCenter[i] = (s + win / 2) / sampleRate
  }
  const flux = new Float32Array(n)
  flux[0] = 0
  for (let i = 1; i < n; i++) flux[i] = Math.max(0, rms[i]! - rms[i - 1]!)
  return { tCenter, rms, flux }
}

/** Strongest onset-flux sample in `[tLo, tHi]` (for segment cuts / note-ons). */
export function fluxPeakTimeInRange(curve: RmsFluxCurve, tLo: number, tHi: number): number {
  if (tHi <= tLo) return (tLo + tHi) * 0.5
  let bestT = (tLo + tHi) * 0.5
  let bestF = -1
  for (let i = 0; i < curve.tCenter.length; i++) {
    const t = curve.tCenter[i]!
    if (t < tLo || t > tHi) continue
    const f = curve.flux[i]!
    if (f > bestF) {
      bestF = f
      bestT = t
    }
  }
  return bestT
}

function rmsMaxInRange(curve: RmsFluxCurve, tLo: number, tHi: number): number {
  let m = 0
  for (let i = 0; i < curve.tCenter.length; i++) {
    const t = curve.tCenter[i]!
    if (t < tLo || t > tHi) continue
    m = Math.max(m, curve.rms[i]!)
  }
  return m
}

/**
 * Merge adjacent note events with the same rounded MIDI pitch when the gap from
 * `prev.start + prev.duration` to `next.start` is ≤ `maxGapSec` (overlaps count as gap ≤ 0).
 * Combined duration is the union `[min(start), max(end))`; velocity takes the max of merged parts.
 */
export function mergeAdjacentSamePitchNotes(notes: readonly LeadNote[], maxGapSec: number): LeadNote[] {
  if (notes.length === 0) return []
  const g = Math.max(0, maxGapSec)
  const byMidi = new Map<number, LeadNote[]>()
  for (const n of notes) {
    const m = Math.round(n.midi)
    let arr = byMidi.get(m)
    if (!arr) {
      arr = []
      byMidi.set(m, arr)
    }
    arr.push({ ...n, midi: m })
  }
  const merged: LeadNote[] = []
  for (const [, arr] of byMidi) {
    arr.sort((a, b) => a.startSec - b.startSec || a.durationSec - b.durationSec)
    let cur = { ...arr[0]! }
    for (let i = 1; i < arr.length; i++) {
      const n = arr[i]!
      const curEnd = cur.startSec + cur.durationSec
      const gap = n.startSec - curEnd
      if (gap <= g + 1e-9) {
        const nEnd = n.startSec + n.durationSec
        const newEnd = Math.max(curEnd, nEnd)
        cur.durationSec = newEnd - cur.startSec
        cur.velocity = Math.max(cur.velocity, n.velocity)
      } else {
        merged.push(cur)
        cur = { ...n }
      }
    }
    merged.push(cur)
  }
  merged.sort((a, b) => a.startSec - b.startSec || a.midi - b.midi)
  return merged
}

/** Remove notes shorter than `minSec` (after merge / before RMS refine). */
export function dropLeadNotesShorterThan(notes: readonly LeadNote[], minSec: number): LeadNote[] {
  if (notes.length === 0 || !(minSec > 0)) return notes.map(n => ({ ...n }))
  return notes.filter(n => n.durationSec >= minSec - 1e-9).map(n => ({ ...n }))
}

/**
 * In sliding time windows, cap polyphony by keeping the strongest velocities — reduces
 * stacked hallucinations in dense Basic Pitch windows without touching `leadNotesRaw`.
 */
export function thinPolyphonicLeadNotesByTimeWindow(
  notes: readonly LeadNote[],
  windowSec: number,
  maxVoices: number,
): LeadNote[] {
  if (notes.length === 0 || maxVoices < 1) return []
  const win = Math.max(1e-4, windowSec)
  const cap = Math.max(1, Math.floor(maxVoices))
  const arr = notes.map(n => ({ ...n, midi: Math.round(n.midi) }))
  arr.sort((a, b) => a.startSec - b.startSec || a.midi - b.midi)
  const out: LeadNote[] = []
  let bucketStart = arr[0]!.startSec
  let bucket: LeadNote[] = []
  const flush = () => {
    if (bucket.length === 0) return
    if (bucket.length <= cap) {
      out.push(...bucket.map(n => ({ ...n })))
    } else {
      // Always keep the window's top voice, then fill the rest by velocity — a pure
      // velocity cap drops quiet melody notes (chord-detector-midi-export-debug, Bug 3).
      const top = bucket.reduce((b, c) => (c.midi > b.midi ? c : b))
      const rest = bucket
        .filter(n => n !== top)
        .sort((a, b) => b.velocity - a.velocity || b.durationSec - a.durationSec)
      out.push(...[top, ...rest.slice(0, cap - 1)].map(n => ({ ...n })))
    }
    bucket = []
  }
  for (const n of arr) {
    if (bucket.length && n.startSec > bucketStart + win) {
      flush()
      bucketStart = n.startSec
    }
    if (bucket.length === 0) bucketStart = n.startSec
    bucket.push(n)
  }
  flush()
  out.sort((a, b) => a.startSec - b.startSec || a.midi - b.midi)
  return out
}

/** Drop bass-register blips only (export path); mid/high unchanged. */
export function dropLowRegisterNotesShorterThan(
  notes: readonly LeadNote[],
  midiBelow: number,
  minSec: number,
): LeadNote[] {
  if (notes.length === 0 || !(minSec > 0)) return notes.map(n => ({ ...n }))
  return notes
    .filter(n => {
      const m = Math.round(n.midi)
      if (m >= midiBelow) return true
      return n.durationSec >= minSec - 1e-9
    })
    .map(n => ({ ...n }))
}

/**
 * In each near-simultaneous onset cluster (default **45 ms**), drop notes whose
 * MIDI is far from the cluster median pitch **and** whose velocity is weak vs
 * the cluster — targets isolated wrong-partial / harmonic blips without
 * touching `leadNotesRaw` (export-only).
 */
export function dropSimultaneousPitchOutliers(
  notes: readonly LeadNote[],
  clusterSec = 0.045,
  /** Min cluster size before any drop is considered. */
  minCluster = 3,
  /** Min |midi − medianMidi| to treat as outlier. */
  minSemitonesFromMedian = 14,
  /** Drop only if velocity ≤ this × cluster max velocity. */
  maxVelocityRatio = 0.42,
): LeadNote[] {
  if (notes.length < minCluster) return notes.map(n => ({ ...n }))
  const w = Math.max(1e-4, clusterSec)
  const arr = notes.map(n => ({ ...n, midi: Math.round(n.midi) }))
  arr.sort((a, b) => a.startSec - b.startSec || a.midi - b.midi)
  const kill = new Set<number>()
  for (let i = 0; i < arr.length; i++) {
    const t0 = arr[i]!.startSec
    let j = i
    while (j < arr.length && arr[j]!.startSec <= t0 + w + 1e-9) j++
    const slice = arr.slice(i, j)
    if (slice.length < minCluster) continue
    const midis = slice.map(n => n.midi).sort((a, b) => a - b)
    const med = midis[Math.floor(midis.length / 2)]!
    let vMax = 0
    for (const n of slice) vMax = Math.max(vMax, n.velocity)
    vMax = Math.max(vMax, 1e-6)
    for (let k = i; k < j; k++) {
      const n = arr[k]!
      if (Math.abs(n.midi - med) < minSemitonesFromMedian) continue
      if (n.velocity > vMax * maxVelocityRatio + 1e-9) continue
      kill.add(k)
    }
  }
  return arr
    .filter((_, idx) => !kill.has(idx))
    .map(n => ({ midi: n.midi, startSec: n.startSec, durationSec: n.durationSec, velocity: n.velocity }))
}

/**
 * Very low bass blips with no mid-register support in the same window — common BP ghosts.
 */
export function debounceIsolatedBassBlips(
  notes: readonly LeadNote[],
  bassMidiMax = 40,
  minMidMidi = 41,
  maxMidMidi = 72,
  /** Note must be shorter than this to be eligible. */
  maxDurSec = 0.16,
  /** Look for supporting mid note overlap within this many seconds of onset. */
  supportWindowSec = 0.09,
): LeadNote[] {
  if (notes.length === 0) return []
  const arr = notes.map(n => ({ ...n, midi: Math.round(n.midi) }))
  arr.sort((a, b) => a.startSec - b.startSec || a.midi - b.midi)
  const out: LeadNote[] = []
  for (let ni = 0; ni < arr.length; ni++) {
    const n = arr[ni]!
    const m = n.midi
    if (m > bassMidiMax || n.durationSec >= maxDurSec - 1e-9) {
      out.push({ ...n })
      continue
    }
    const t0 = n.startSec
    const t1 = n.startSec + n.durationSec
    let supported = false
    for (let oi = 0; oi < arr.length; oi++) {
      if (oi === ni) continue
      const o = arr[oi]!
      const om = o.midi
      if (om < minMidMidi || om > maxMidMidi) continue
      if (Math.abs(o.startSec - t0) > supportWindowSec) continue
      const o1 = o.startSec + o.durationSec
      const overlap = Math.min(t1, o1) - Math.max(t0, o.startSec)
      if (overlap > 0.02) {
        supported = true
        break
      }
    }
    if (!supported) continue
    out.push({ ...n })
  }
  out.sort((a, b) => a.startSec - b.startSec || a.midi - b.midi)
  return out
}

/**
 * If two notes share a pitch class and are ≥1 octave apart with onsets within `maxGapSec`,
 * drop the quieter duplicate (export-only; helps duplicate-fundamental BP stacks).
 */
export function collapseOctaveDuplicatesNearOnsets(
  notes: readonly LeadNote[],
  maxGapSec: number,
): LeadNote[] {
  if (notes.length < 2) return notes.map(n => ({ ...n }))
  const g = Math.max(0, maxGapSec)
  const arr = notes.map(n => ({ ...n, midi: Math.round(n.midi) }))
  arr.sort((a, b) => a.startSec - b.startSec || a.midi - b.midi)
  const kill = new Set<number>()
  let left = 0
  for (let right = 0; right < arr.length; right++) {
    const tr = arr[right]!.startSec
    while (left < right && tr - arr[left]!.startSec > g) left++
    for (let k = left; k < right; k++) {
      if (kill.has(k) || kill.has(right)) continue
      const a = arr[k]!
      const b = arr[right]!
      if (a.midi === b.midi) continue
      if ((a.midi % 12) !== (b.midi % 12)) continue
      const od = Math.abs(a.midi - b.midi)
      if (od < 12 || od % 12 !== 0) continue
      if (b.velocity > a.velocity + 1e-6) kill.add(k)
      else kill.add(right)
    }
  }
  return arr
    .filter((_, i) => !kill.has(i))
    .map(n => ({ midi: n.midi, startSec: n.startSec, durationSec: n.durationSec, velocity: n.velocity }))
}

/**
 * Refine **one monophonic voice lane** (fixed rounded MIDI): flux-snapped onsets,
 * decay-based note-offs, and gaps / ceilings relative to the **next note on this pitch only**.
 */
function refineOnePitchLaneForMidiExport(
  curve: RmsFluxCurve,
  lane: readonly LeadNote[],
  fullDurationSec: number,
): LeadNote[] {
  if (lane.length === 0) return []
  const S = MIDI_EXPORT_TIMING.maxBoundarySnapSec
  const gap = MIDI_EXPORT_TIMING.minInterNoteGapSec
  const minDur = MIDI_EXPORT_TIMING.minExportedNoteDurSec
  const preroll = MIDI_EXPORT_TIMING.leadOnsetPrerollSec
  const tailFrac = MIDI_EXPORT_TIMING.leadSustainTailFraction

  const sorted = [...lane].sort((a, b) => a.startSec - b.startSec || a.durationSec - b.durationSec)
  const out: LeadNote[] = []
  let lastEnd = 0

  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i]!
    const next = sorted[i + 1]
    const s0 = n.startSec
    const e0 = s0 + n.durationSec
    const nextStart = next != null ? next.startSec : fullDurationSec

    const winLo = Math.max(0, s0 - S)
    const onsetSearchHi = n.midi < 48 ? 0.038 : 0.02
    const winHi = Math.min(fullDurationSec, s0 + onsetSearchHi)
    const tFlux = fluxPeakTimeInRange(curve, winLo, winHi)
    let newStart = tFlux - preroll
    newStart = Math.max(winLo, Math.min(winHi, newStart))
    newStart = Math.max(0, Math.min(newStart, e0 - minDur))
    newStart = Math.max(newStart, lastEnd + gap)

    const ceilingEnd = next != null ? Math.min(fullDurationSec, nextStart - gap) : fullDurationSec
    const searchHi = Math.min(ceilingEnd, e0 + S, fullDurationSec)
    const bodyHi = Math.max(newStart + 0.02, e0)
    const peakBody = rmsMaxInRange(curve, newStart, Math.min(fullDurationSec, bodyHi))
    const peakNearOff = rmsMaxInRange(curve, Math.max(0, e0 - 0.05), Math.min(fullDurationSec, e0 + S))
    const peakRef = Math.max(peakBody, peakNearOff)
    const thresh = Math.max(1e-12, peakRef * tailFrac)

    let newEnd = e0
    for (let j = 0; j < curve.tCenter.length; j++) {
      const t = curve.tCenter[j]!
      if (t < e0) continue
      if (t > searchHi + 1e-9) break
      if (curve.rms[j]! >= thresh) newEnd = t
      else if (t > e0 + 0.005) break
    }

    newEnd = Math.max(newStart + minDur, Math.min(newEnd, ceilingEnd))
    if (newEnd > ceilingEnd + 1e-9) newEnd = ceilingEnd
    if (newEnd < newStart + minDur) {
      newStart = Math.min(newStart, Math.max(0, ceilingEnd - minDur))
      newEnd = Math.max(newStart + minDur, ceilingEnd)
    }

    lastEnd = newEnd
    out.push({
      midi: n.midi,
      velocity: n.velocity,
      startSec: newStart,
      durationSec: newEnd - newStart,
    })
  }
  return out
}

/**
 * RMS/flux boundary refinement for export + in-app preview. **Polyphony-safe:**
 * each rounded MIDI pitch is refined as its own monophonic lane so chords keep
 * common onsets and independent note-offs (Basic Pitch poly output is preserved).
 */
export function refineLeadNotesForMidiExport(
  curve: RmsFluxCurve,
  notes: readonly LeadNote[],
  fullDurationSec: number,
): LeadNote[] {
  if (notes.length === 0) return []
  const byMidi = new Map<number, LeadNote[]>()
  for (const n of notes) {
    const m = Math.round(n.midi)
    let arr = byMidi.get(m)
    if (!arr) {
      arr = []
      byMidi.set(m, arr)
    }
    arr.push({ ...n, midi: m })
  }
  const out: LeadNote[] = []
  for (const lane of byMidi.values()) {
    out.push(...refineOnePitchLaneForMidiExport(curve, lane, fullDurationSec))
  }
  out.sort((a, b) => a.startSec - b.startSec || a.midi - b.midi)
  return out
}

/** Quick stat helper for the UI — count, density, and average pitch. */
export function summarizeLeadNotes(notes: readonly LeadNote[]): {
  count: number
  uniquePitches: number
  avgDurSec: number
  /** Notes per second of analyzed content (when `clipDurSec > 0`). */
  density: (clipDurSec: number) => number
} {
  const unique = new Set(notes.map(n => n.midi)).size
  const avgDurSec = notes.length === 0 ? 0 : notes.reduce((a, b) => a + b.durationSec, 0) / notes.length
  return {
    count: notes.length,
    uniquePitches: unique,
    avgDurSec,
    density: (clipDurSec: number) => (clipDurSec > 0 ? notes.length / clipDurSec : 0),
  }
}
