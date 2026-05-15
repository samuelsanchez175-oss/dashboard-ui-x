import { Midi } from '@tonejs/midi'
import { parseBlob } from 'music-metadata'

import { monoDownmix, estimateBpmFromMono } from '../mixing/mixing-audio-analysis'
import { computeChromaFrameSeries } from '../mixing/mixing-audio-key-estimate'
import {
  alignChordOnsetsInLeadNotes,
  buildRmsFluxCurve,
  CHORD_ONSET_ALIGN,
  enforceTwoHandPianoPolyphony,
  dropLeadNotesShorterThan,
  fluxPeakTimeInRange,
  type LeadNote,
  mergeAdjacentSamePitchNotes,
  collapseOctaveDuplicatesNearOnsets,
  debounceIsolatedBassBlips,
  dropLowRegisterNotesShorterThan,
  dropSimultaneousPitchOutliers,
  MIDI_EXPORT_NOTE_MERGE,
  MIDI_EXPORT_TIMING,
  PIANO_TWO_HAND_EXPORT,
  PIANO_TWO_HAND_RELAXED,
  refineLeadNotesForMidiExport,
  thinPolyphonicLeadNotesByTimeWindow,
  type RmsFluxCurve,
} from './chord-detector-melody'
import { resampleMonoTo22050, transcribeMono22050ToLeadNotes } from './chord-detector-basic-pitch'
import {
  applyNeuralNoteStyleLeadNotes,
  PIANO_LEAD_RELAXED_BASIC_PITCH,
} from './chord-detector-neuralnote-style'
import type { NeuralNoteBasicPitchDecode, NeuralNoteStyleMelodyPostInput } from './chord-detector-neuralnote-style'
import { detectBarLoop } from './chord-detector-loops'
import type { LoopInfo } from './chord-detector-loops'
import { structureLeadNotes } from './chord-detector-structure'
import { auditChordAnalysis } from './chord-detector-audit'
import type { AuditReport } from './chord-detector-audit'
import { consolidateToLoop } from './chord-detector-loop-consensus'

/** Re-export: RMS/flux snap + post-BP merge + chord onset align tunables (see `chord-detector-melody.ts`). */
export { CHORD_ONSET_ALIGN, MIDI_EXPORT_NOTE_MERGE, MIDI_EXPORT_TIMING, PIANO_TWO_HAND_EXPORT, PIANO_TWO_HAND_RELAXED }

/** Re-export: bar-loop detection, 2nd-pass structuring, output validation (Part 3). */
export { detectBarLoop } from './chord-detector-loops'
export type { LoopInfo } from './chord-detector-loops'
export { structureLeadNotes, STRUCTURE_PASS } from './chord-detector-structure'
export { validateChordOutput, VALIDATION_THRESHOLDS } from './chord-detector-validation'
export type { ValidationCheck, ValidationReport } from './chord-detector-validation'
export { auditChordAnalysis } from './chord-detector-audit'
export type { AuditReport, AuditMissingNote, AuditLoopPeriod, AuditKeyBpmScale } from './chord-detector-audit'
export { consolidateToLoop, LOOP_CONSENSUS } from './chord-detector-loop-consensus'

/** NeuralNote-inspired defaults (Basic Pitch decode + optional melody post). */
export {
  NEURALNOTE_STYLE,
  NEURALNOTE_STYLE_EXPORT,
  NEURALNOTE_TIME_DIVISION_FRACS,
  NEURALNOTE_TIME_DIVISION_LABELS,
  PIANO_LEAD_RELAXED_BASIC_PITCH,
  getBasicPitchOutputToNotesPolyParams,
  mergeNeuralNoteBasicPitchDecode,
  mergeNeuralNoteStyleMelodyPost,
} from './chord-detector-neuralnote-style'

export type {
  NeuralNoteBasicPitchDecode,
  NeuralNoteStyleMelodyPost,
  NeuralNoteStyleMelodyPostInput,
} from './chord-detector-neuralnote-style'

export type ChordDetectorAnalyzeOptions = {
  /** Optional melody post after Basic Pitch (quant grid, min length, velocity). */
  melodyPost?: NeuralNoteStyleMelodyPostInput
  /** Partial overrides of `NEURALNOTE_STYLE.basicPitch` (TensorFlow.js decode). */
  basicPitchDecode?: Partial<NeuralNoteBasicPitchDecode>
  /**
   * When `true` or omitted, use piano / lead–first decode + export phantom drops (default).
   * Set `false` for looser polyphony (e.g. busy non-piano beds).
   */
  pianoLeadFocus?: boolean
  /**
   * Optional BPM from sheet / DAW when file tags and autocorrelation are unreliable
   * (e.g. sparse arpeggios). Used only when `TBPM` (or equivalent) is absent — does
   * not override embedded metadata. Tag `analyzeChordProgressionFromBlob(blob, { bpmPrior: 70 })`.
   */
  bpmPrior?: number
}

/** Must stay aligned with `mixing-audio-key-estimate` FFT hop / size. */
const CHROMA_HOP = 2048
const CHROMA_FFT = 4096

/**
 * Tunable solo-piano chord pipeline. Viterbi + VAD reduce chroma flicker and
 * spurious dim/sus4; min chord length (in beats) clips one-beat misreads.
 * None of these transpose export — MIDI times stay wall-clock seconds.
 * Segment / note timing snaps for export use `MIDI_EXPORT_TIMING` (melody module).
 */
export const CHORD_PIPELINE = {
  /** Frames below this RMS (fraction of loudest chroma frame) are ignored in beat-local sums. */
  chromaFrameVadRelative: 0.024,
  /** Blend: chromagram vs lead pitch-class evidence per beat. */
  chromaWeight: 0.76,
  /** Scaled against max lead bin inside each beat (see loop). */
  leadWeightScale: 0.24,
  /** Half-width of beat aggregation window as a fraction of one beat. */
  beatHalfWinFactor: 0.42,
  /** When beat-mean RMS is below this × clip peak RMS, reuse last non-silent chroma (rests). */
  beatSilenceRelative: 0.038,
  /** Viterbi: bonus when staying on the exact same (root, quality) state. */
  viterbiStay: 0.078,
  /** Viterbi: same root, different quality (e.g. maj ↔ min). */
  viterbiSameRoot: 0.026,
  /** Viterbi: root motion by fourth/fifth (common in tonal progressions). */
  viterbiCircleStep: 0.018,
  /**
   * Subtract from emission for dim / aug / sus4 so they win only on clear evidence.
   * Tuned up from 0.036 (iter 1, chord-detector-tuning-log): at 0.036 arpeggiated
   * sources with weak 3rds decoded ~96% sus4 — the penalty must exceed the
   * cosine gap between the stacked-fourth sus4 fit and the real triad fit.
   */
  exoticQualityPenalty: 0.14,
  /**
   * Post-decode majority filter window (beats); odd ≥1.
   * Held at 3: iter 6 (chord-detector-tuning-log) tried 5 — it cut residual sus4
   * (5.8% → 2.7%) but over-smoothed harmonic rhythm to ~5 s/chord, well under the
   * source's per-bar (~3.4 s) rate. Reverted: per-bar fidelity beats a 1.5-pt proxy gain.
   */
  medianFilterWindow: 3,
  /** Drop merged segments shorter than this many beats (ties to BPM). */
  minChordBeats: 0.48,
} as const

/**
 * Causal rolling pitch-class evidence across beats so 16th-note arpeggios
 * (one pitch at a time) still accumulate triad votes like block chords.
 * Applied to the **instant** per-beat chroma+lead vector before L2 norm and Viterbi.
 */
export const ARPEGGIO_CHORD_WINDOW = {
  enabled: true,
  /** Past beats to include with the current beat (e.g. 2 = current + one previous). */
  beatsMemory: 2,
  /**
   * Weight for beat `k` steps in the past: `decay ** k` (current beat k=0).
   * Lowered 0.72 → 0.45 (iter 4, chord-detector-tuning-log): at 0.72 a beat inherited
   * ~72% of the previous chord's pitch classes, and the mixed two-chord blob matched
   * stacked-fourth sus4 templates — the structural driver behind the residual sus4.
   */
  decay: 0.45,
} as const

/**
 * When Basic Pitch supplies polyphonic `leadNotes`, weight beat-level chord
 * emissions toward that note evidence a bit more than the default chroma-heavy blend.
 */
const BASIC_PITCH_CHORD_BLEND = { chromaWeight: 0.34, leadWeightScale: 0.44 } as const

/** Stricter vs looser phantom / poly thinning for export preview (`pianoLeadFocus`). */
const EXPORT_LEAD_PHANTOM = {
  strict: {
    thinWinSec: 0.024,
    thinMaxVoices: 4,
    outlier1: { clusterSec: 0.046, minCluster: 3, minSemi: 12, maxVelRatio: 0.44 },
    outlier2: { clusterSec: 0.053, minCluster: 3, minSemi: 14, maxVelRatio: 0.35 },
  },
  relaxed: {
    thinWinSec: 0.026,
    thinMaxVoices: 4,
    outlier1: { clusterSec: 0.048, minCluster: 3, minSemi: 13, maxVelRatio: 0.48 },
    outlier2: { clusterSec: 0.055, minCluster: 3, minSemi: 15, maxVelRatio: 0.38 },
  },
} as const

function isPianoLeadFocusMode(options?: ChordDetectorAnalyzeOptions): boolean {
  return options?.pianoLeadFocus !== false
}

function clampOptionalBpmPrior(v: number | undefined): number | undefined {
  if (v == null || !Number.isFinite(v)) return undefined
  const r = Math.round(v)
  if (r < 40 || r > 240) return undefined
  return r
}

const TONIC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

export type ChordQuality = 'major' | 'minor' | 'dim' | 'aug' | 'sus4'

export type ChordBeat = {
  beatIndex: number
  rootPc: number
  quality: ChordQuality
  label: string
  confidence: number
}

export type ChordSegment = {
  label: string
  rootPc: number
  quality: ChordQuality
  startSec: number
  durationSec: number
}

export type EstimatedKey = {
  /** e.g. "C major", "F♯ minor", "—" when below confidence. */
  label: string
  /** Tonic pitch class 0–11, -1 = unknown. */
  rootPc: number
  mode: 'major' | 'minor' | 'unknown'
  /** Pearson correlation of the best-fit Krumhansl-Kessler profile, 0–1. */
  confidence: number
}

export type ChordAnalysisResult = {
  bpm: number
  bpmSource: 'tags' | 'estimated' | 'midi-tempo' | 'bpm-prior'
  durationSec: number
  beats: ChordBeat[]
  segments: ChordSegment[]
  /** Whether the source was an audio file or a MIDI file (different code paths). */
  inputType: 'audio' | 'midi'
  /**
   * 12-bucket pitch-class histogram weighted by note duration × velocity (when
   * MIDI) or by chromagram aggregate (when audio). Sums to 1.
   * Mirrors pretty-midi's `get_pitch_class_histogram(use_duration, use_velocity)`.
   */
  pitchClassHistogram: number[]
  /** Best-fit major/minor key via Krumhansl-Kessler probe-tone profile correlation. */
  estimatedKey: EstimatedKey
  /** Count of unique chord labels across the whole progression. */
  uniqueChordCount: number
  /** Beat / downbeat times (in seconds). Empty for audio path when not derived. */
  beatTimesSec?: number[]
  downbeatTimesSec?: number[]
  /**
   * Per-frame dominant-pitch notes extracted from the audio (or the original
   * MIDI notes when the source is a `.mid` file). Adds melodic / lead content
   * on top of the harmonic backbone — what the source actually plays, not
   * just the chord skeleton — so the exported MIDI sounds closer to the source.
   */
  leadNotes: LeadNote[]
  /**
   * Bar-level loop detection — whether the piece is a repeating loop, the repeating
   * unit's length in bars, and how many times it repeats. See `chord-detector-loops.ts`.
   */
  loop: LoopInfo
  /**
   * Post-pipeline audit — missing-note candidates against the source chroma, per-period
   * loop-quality scores, and a key/BPM/scale cross-check with the chord progression.
   * See `chord-detector-audit.ts`.
   */
  audit: AuditReport
}

/* ── pretty-midi-style key estimation (Krumhansl-Kessler probe-tone profiles) ──
 *
 * The standard reference profiles for major and minor keys (Krumhansl &
 * Kessler 1982). Each profile is rotated against the 12 pitch classes and
 * Pearson-correlated with the observed pitch-class histogram; the highest
 * correlation across the 24 (12 major + 12 minor) candidates wins.
 *
 * Pretty-midi exposes the building blocks (`get_pitch_class_histogram`) but
 * not the key-correlation step — most pretty-midi users wire this themselves
 * with the constants below, which we now make first-class.
 */
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88] as const
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17] as const

function pearson12(a: readonly number[], b: readonly number[]): number {
  let sumA = 0
  let sumB = 0
  for (let i = 0; i < 12; i++) {
    sumA += a[i]!
    sumB += b[i]!
  }
  const meanA = sumA / 12
  const meanB = sumB / 12
  let num = 0
  let dA = 0
  let dB = 0
  for (let i = 0; i < 12; i++) {
    const xa = a[i]! - meanA
    const xb = b[i]! - meanB
    num += xa * xb
    dA += xa * xa
    dB += xb * xb
  }
  const denom = Math.sqrt(dA * dB)
  return denom > 0 ? num / denom : 0
}

export function estimateKeyFromPitchClassHistogram(pc: readonly number[]): EstimatedKey {
  let best: EstimatedKey = { label: '—', rootPc: -1, mode: 'unknown', confidence: 0 }
  for (let root = 0; root < 12; root++) {
    const rotMajor: number[] = []
    const rotMinor: number[] = []
    for (let i = 0; i < 12; i++) {
      rotMajor.push(KK_MAJOR[(i - root + 12) % 12]!)
      rotMinor.push(KK_MINOR[(i - root + 12) % 12]!)
    }
    const corrMaj = pearson12(pc, rotMajor)
    const corrMin = pearson12(pc, rotMinor)
    if (corrMaj > best.confidence) {
      best = { rootPc: root, mode: 'major', confidence: corrMaj, label: `${TONIC_SHARP[root]} major` }
    }
    if (corrMin > best.confidence) {
      best = { rootPc: root, mode: 'minor', confidence: corrMin, label: `${TONIC_SHARP[root]} minor` }
    }
  }
  return best
}

/* ── MIDI-native analysis path (pretty-midi inspired) ──────────────────────── */

/** True if the blob is a MIDI file (by mime type or by reading the "MThd" magic header). */
async function isMidiBlob(blob: Blob): Promise<boolean> {
  const t = (blob.type ?? '').toLowerCase()
  if (t.includes('midi') || t === 'audio/mid' || t === 'audio/x-midi') return true
  // Sniff first 4 bytes for "MThd"
  try {
    const head = await blob.slice(0, 4).arrayBuffer()
    const v = new Uint8Array(head)
    return v[0] === 0x4d && v[1] === 0x54 && v[2] === 0x68 && v[3] === 0x64
  } catch {
    return false
  }
}

/**
 * Mirror of pretty-midi `PrettyMIDI.get_pitch_class_histogram(use_duration=True, use_velocity=True)`.
 * Sums duration × velocity per pitch class, then normalizes to a probability distribution.
 */
function midiPitchClassHistogram(
  notes: readonly { midi: number; duration: number; velocity: number }[],
): number[] {
  const hist = new Array<number>(12).fill(0)
  for (const n of notes) {
    const pc = ((n.midi % 12) + 12) % 12
    hist[pc] += Math.max(0.05, n.duration) * Math.max(0.05, n.velocity)
  }
  const total = hist.reduce((a, b) => a + b, 0)
  if (total > 0) for (let i = 0; i < 12; i++) hist[i] = hist[i]! / total
  return hist
}

/** Round-up a value to the next power of 2, used for FFT-free uniform binning. */
function clampPc(pc: number): number {
  return ((pc % 12) + 12) % 12
}

/**
 * Read all instrument notes out of a parsed `@tonejs/midi` document.
 * Skips channel-10 drum tracks (matching pretty-midi's `is_drum` behavior).
 */
function flattenMidiNotes(midi: Midi): { midi: number; start: number; duration: number; velocity: number; pc: number }[] {
  const out: { midi: number; start: number; duration: number; velocity: number; pc: number }[] = []
  for (const track of midi.tracks) {
    // tone.js stores channel as a number on each note; channel 9 (0-indexed) = MIDI ch10 = drums
    const isDrum = track.channel === 9
    if (isDrum) continue
    for (const n of track.notes) {
      out.push({
        midi: n.midi,
        start: n.time,
        duration: Math.max(0.02, n.duration),
        velocity: n.velocity, // already 0..1 in tone.js
        pc: clampPc(n.midi),
      })
    }
  }
  out.sort((a, b) => a.start - b.start)
  return out
}

/**
 * Bin notes into chord candidates using a beat grid derived from the MIDI's
 * tempo. For each beat window, sum the pitch-class weights from notes that
 * overlap the window, then run the same triad-template matcher as the audio
 * path. The advantage over the chromagram is that we get actual onset times
 * and durations — far less noisy than FFT-derived chroma.
 */
function detectChordsFromMidiNotes(
  notes: readonly { midi: number; start: number; duration: number; velocity: number; pc: number }[],
  bpm: number,
  durationSec: number,
): ChordBeat[] {
  if (notes.length === 0) return []
  const keyPrior = estimateKeyFromPitchClassHistogram(midiPitchClassHistogram(notes))
  const beatSec = 60 / bpm
  const halfWin = beatSec * 0.5
  const beatCount = Math.max(1, Math.floor(durationSec / beatSec))
  const rawInstants: Float32Array[] = []

  for (let bi = 0; bi < beatCount; bi++) {
    const centerSec = bi * beatSec + halfWin
    const winStart = centerSec - halfWin
    const winEnd = centerSec + halfWin

    const agg = new Float32Array(12)
    for (const n of notes) {
      const noteEnd = n.start + n.duration
      if (n.start > winEnd) break
      if (noteEnd < winStart) continue
      const overlap = Math.max(0, Math.min(noteEnd, winEnd) - Math.max(n.start, winStart))
      if (overlap <= 0) continue
      agg[n.pc] += overlap * n.velocity
    }

    rawInstants.push(agg)
  }

  const beatChromas = applyArpeggioChordWindowToBeatInstants(rawInstants, ARPEGGIO_CHORD_WINDOW)
  const templates = getStateChordTemplates()
  const decoded = viterbiChordPath(beatChromas, templates, keyPrior)
  return decoded.map((d, bi) => ({
    beatIndex: bi,
    rootPc: d.rootPc,
    quality: d.quality,
    label: formatChordLabel(d.rootPc, d.quality),
    confidence: d.confidence,
  }))
}

/** Pretty-midi-style `get_beats(start_time=0)` — returns evenly-spaced beat times under the dominant tempo. */
function getBeatTimes(bpm: number, durationSec: number): number[] {
  const beatSec = 60 / bpm
  const count = Math.max(0, Math.floor(durationSec / beatSec))
  const out: number[] = []
  for (let i = 0; i < count; i++) out.push(i * beatSec)
  return out
}

/** Pretty-midi-style `get_downbeats` — every 4th beat starting at the first. */
function getDownbeatTimes(beatTimes: readonly number[], beatsPerBar = 4): number[] {
  const out: number[] = []
  for (let i = 0; i < beatTimes.length; i += beatsPerBar) out.push(beatTimes[i]!)
  return out
}

/**
 * Analyze a MIDI blob and return the same ChordAnalysisResult shape that the
 * audio path produces, plus the new pretty-midi-derived fields.
 */
export async function analyzeChordProgressionFromMidiBlob(
  blob: Blob,
  options?: ChordDetectorAnalyzeOptions,
): Promise<ChordAnalysisResult> {
  const ab = await blob.arrayBuffer()
  const midi = new Midi(ab)

  // Tempo: tonejs/midi exposes header.tempos as an array of { ticks, bpm }.
  // If a MIDI has tempo changes (rubato, accel, ritard), use a time-weighted
  // average rather than just the first tempo — that's what feels "dominant"
  // when listening, and what `pretty_midi.estimate_tempo()` returns.
  let bpm = 120
  let bpmSource: ChordAnalysisResult['bpmSource'] = 'estimated'
  const tempos = midi.header.tempos
  if (tempos && tempos.length > 0) {
    if (tempos.length === 1) {
      bpm = Math.round(tempos[0]!.bpm)
    } else {
      // Time-weighted average: each tempo holds until the next event (or EOF).
      // tonejs/midi gives `ticks` and `bpm` per event; we convert ticks to time.
      const ppq = midi.header.ppq || 480
      let weighted = 0
      let totalSec = 0
      for (let i = 0; i < tempos.length; i++) {
        const cur = tempos[i]!
        const nextTicks = i + 1 < tempos.length ? tempos[i + 1]!.ticks : tempos[i]!.ticks + ppq * 4
        const tickSpan = Math.max(1, nextTicks - cur.ticks)
        // seconds = ticks / ppq * (60 / bpm)
        const span = (tickSpan / ppq) * (60 / cur.bpm)
        weighted += cur.bpm * span
        totalSec += span
      }
      bpm = Math.round(totalSec > 0 ? weighted / totalSec : tempos[0]!.bpm)
    }
    bpmSource = 'midi-tempo'
  }

  const notes = flattenMidiNotes(midi)
  // Duration = end-of-last-note OR header reported length; use whichever is larger
  let durationSec = 0
  for (const n of notes) durationSec = Math.max(durationSec, n.start + n.duration)
  if (midi.duration > durationSec) durationSec = midi.duration

  if (notes.length === 0 || durationSec <= 0) {
    return {
      bpm,
      bpmSource,
      durationSec: Math.max(0, durationSec),
      beats: [],
      segments: [],
      inputType: 'midi',
      pitchClassHistogram: new Array<number>(12).fill(0),
      estimatedKey: { label: '—', rootPc: -1, mode: 'unknown', confidence: 0 },
      uniqueChordCount: 0,
      beatTimesSec: [],
      downbeatTimesSec: [],
      leadNotes: [],
      loop: detectBarLoop([], bpm, Math.max(0, durationSec)),
      audit: auditChordAnalysis({
        leadNotes: [],
        segments: [],
        bpm,
        bpmSource,
        durationSec: Math.max(0, durationSec),
        estimatedKey: { label: '—', rootPc: -1, mode: 'unknown', confidence: 0 },
        loop: detectBarLoop([], bpm, Math.max(0, durationSec)),
        chromaPcDist: null,
      }),
    }
  }

  const rawBeats = detectChordsFromMidiNotes(notes, bpm, durationSec)
  const smoothed = medianFilterBeats(rawBeats, CHORD_PIPELINE.medianFilterWindow)
  let segments = mergeAdjacentBeats(smoothed, 60 / bpm)
  segments = pruneShortChordSegments(segments, (60 / bpm) * CHORD_PIPELINE.minChordBeats)

  const pcHist = midiPitchClassHistogram(notes)
  const estimatedKey = estimateKeyFromPitchClassHistogram(pcHist)
  const uniqueChordCount = new Set(segments.map(s => s.label)).size
  const beatTimesSec = getBeatTimes(bpm, durationSec)
  const downbeatTimesSec = getDownbeatTimes(beatTimesSec, 4)

  // For MIDI input we already have the actual notes — use them directly as the
  // lead-note track (no extraction needed). Velocity already 0..1 from tone.js.
  let leadNotes: LeadNote[] = notes.map(n => ({
    midi: n.midi,
    startSec: n.start,
    durationSec: n.duration,
    velocity: n.velocity,
  }))
  leadNotes = applyNeuralNoteStyleLeadNotes(leadNotes, bpm, durationSec, options?.melodyPost)
  leadNotes = alignChordOnsetsInLeadNotes(leadNotes, { ...CHORD_ONSET_ALIGN, bpm })
  leadNotes = enforceTwoHandPianoPolyphony(leadNotes, {
    ...PIANO_TWO_HAND_EXPORT,
    ...(!isPianoLeadFocusMode(options) ? PIANO_TWO_HAND_RELAXED : {}),
  })
  /* Part 3 — bar-loop detection + 2nd-pass structuring (also runs on the MIDI-input path). */
  const loop = detectBarLoop(leadNotes, bpm, durationSec)
  leadNotes = structureLeadNotes(leadNotes, loop, bpm)
  /* Post-pipeline audit. MIDI input has no source chroma, so missing-note detection is
   * inactive on this path — loop + key/scale cross-check still run. */
  const audit = auditChordAnalysis({
    leadNotes,
    segments,
    bpm,
    bpmSource,
    durationSec,
    estimatedKey,
    loop,
    chromaPcDist: null,
  })

  /* Part 3 — stage 15: collapse to a single P-bar loop window when one is found
   * (same logic as the audio path — see that branch for the rationale). */
  let finalLeadNotes = leadNotes
  let finalDurationSec = durationSec
  let finalSegments: ChordSegment[] = segments
  let finalUniqueChordCount = uniqueChordCount
  let finalBeats: ChordBeat[] = smoothed
  let finalBeatTimesSec: number[] = beatTimesSec
  let finalDownbeatTimesSec: number[] = downbeatTimesSec
  if (loop.found) {
    finalLeadNotes = consolidateToLoop(leadNotes, loop, bpm)
    const unitSec = loop.barCount * loop.barSec
    finalDurationSec = unitSec
    finalSegments = segments
      .filter(s => s.startSec < unitSec)
      .map(s => ({ ...s, durationSec: Math.min(s.durationSec, unitSec - s.startSec) }))
    finalUniqueChordCount = new Set(finalSegments.map(s => s.label)).size
    finalBeats = smoothed.filter(b => b.beatIndex * (60 / bpm) < unitSec)
    finalBeatTimesSec = beatTimesSec.filter(t => t < unitSec)
    finalDownbeatTimesSec = downbeatTimesSec.filter(t => t < unitSec)
  }

  return {
    bpm,
    bpmSource,
    durationSec: finalDurationSec,
    beats: finalBeats,
    segments: finalSegments,
    inputType: 'midi',
    pitchClassHistogram: pcHist,
    estimatedKey,
    uniqueChordCount: finalUniqueChordCount,
    beatTimesSec: finalBeatTimesSec,
    downbeatTimesSec: finalDownbeatTimesSec,
    leadNotes: finalLeadNotes,
    loop,
    audit,
  }
}

function l2Normalize12(v: Float32Array): Float32Array {
  let s = 0
  for (let i = 0; i < 12; i++) s += v[i]! * v[i]!
  const norm = Math.sqrt(s) || 1
  const o = new Float32Array(12)
  for (let i = 0; i < 12; i++) o[i] = v[i]! / norm
  return o
}

/** Causal decay-weighted sum of per-beat raw PC vectors, then L2 — see `ARPEGGIO_CHORD_WINDOW`. */
function applyArpeggioChordWindowToBeatInstants(
  instants: readonly Float32Array[],
  cfg: typeof ARPEGGIO_CHORD_WINDOW,
): Float32Array[] {
  if (!cfg.enabled || cfg.beatsMemory <= 1) {
    return instants.map(v => l2Normalize12(v))
  }
  const B = instants.length
  const out: Float32Array[] = []
  for (let bi = 0; bi < B; bi++) {
    const acc = new Float32Array(12)
    for (let k = 0; k < cfg.beatsMemory; k++) {
      const j = bi - k
      if (j < 0) break
      const w = cfg.decay ** k
      const src = instants[j]!
      for (let c = 0; c < 12; c++) acc[c] += src[c]! * w
    }
    out.push(l2Normalize12(acc))
  }
  return out
}

function buildTemplate(rootPc: number, intervals: readonly number[], weights: readonly number[]): Float32Array {
  const v = new Float32Array(12)
  for (let i = 0; i < intervals.length; i++) {
    const pc = (rootPc + intervals[i]! + 12) % 12
    v[pc] += weights[i]!
  }
  return l2Normalize12(v)
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < 12; i++) s += a[i]! * b[i]!
  return s
}

const QUALITY_CONFIG: readonly { quality: ChordQuality; iv: readonly number[]; w: readonly number[] }[] = [
  { quality: 'major', iv: [0, 4, 7], w: [1, 0.92, 0.92] },
  { quality: 'minor', iv: [0, 3, 7], w: [1, 0.92, 0.92] },
  { quality: 'dim', iv: [0, 3, 6], w: [1, 0.88, 0.88] },
  { quality: 'aug', iv: [0, 4, 8], w: [1, 0.88, 0.88] },
  { quality: 'sus4', iv: [0, 5, 7], w: [1, 0.88, 0.92] },
]

const N_CHORD_STATES = 12 * QUALITY_CONFIG.length

let cachedStateTemplates: Float32Array[] | null = null

function getStateChordTemplates(): Float32Array[] {
  if (cachedStateTemplates) return cachedStateTemplates
  const out: Float32Array[] = []
  for (let root = 0; root < 12; root++) {
    for (const { iv, w } of QUALITY_CONFIG) {
      out.push(buildTemplate(root, iv, w))
    }
  }
  cachedStateTemplates = out
  return out
}

function unpackChordState(s: number): { rootPc: number; quality: ChordQuality } {
  const qn = QUALITY_CONFIG.length
  return {
    rootPc: Math.floor(s / qn),
    quality: QUALITY_CONFIG[s % qn]!.quality,
  }
}

function isExoticQuality(q: ChordQuality): boolean {
  return q === 'dim' || q === 'aug' || q === 'sus4'
}

/**
 * When KK key is a confident major, nudge triad emissions toward tonic / dominant /
 * relative minor (same cosine scale as templates). Example: B major → B, F#maj, G#m.
 * Minor-key analog (i / III / VI) left for a later pass — melodic minor / mode mixture.
 */
const KEY_PRIOR_MIN_CONFIDENCE = 0.22
const KEY_PRIOR_TRIAD_BOOST = 0.012

function keyRelativeTriadBoost(state: number, keyPrior: EstimatedKey | undefined): number {
  if (!keyPrior || keyPrior.mode === 'unknown' || keyPrior.rootPc < 0) return 0
  if (keyPrior.confidence < KEY_PRIOR_MIN_CONFIDENCE) return 0
  if (keyPrior.mode !== 'major') return 0
  const st = unpackChordState(state)
  const R = keyPrior.rootPc
  const dom = (R + 7) % 12
  const relMin = (R + 9) % 12
  if (st.rootPc === R && st.quality === 'major') return KEY_PRIOR_TRIAD_BOOST
  if (st.rootPc === dom && st.quality === 'major') return KEY_PRIOR_TRIAD_BOOST
  if (st.rootPc === relMin && st.quality === 'minor') return KEY_PRIOR_TRIAD_BOOST
  return 0
}

function emissionScore(
  chromaNorm: Float32Array,
  state: number,
  templates: readonly Float32Array[],
  keyPrior?: EstimatedKey,
): number {
  const { quality } = unpackChordState(state)
  let c = cosineSimilarity(chromaNorm, templates[state]!)
  if (isExoticQuality(quality)) c -= CHORD_PIPELINE.exoticQualityPenalty
  c += keyRelativeTriadBoost(state, keyPrior)
  return c
}

function transitionBonus(prev: number, cur: number): number {
  if (prev < 0) return 0
  if (prev === cur) return CHORD_PIPELINE.viterbiStay
  const a = unpackChordState(prev)
  const b = unpackChordState(cur)
  if (a.rootPc === b.rootPc) return CHORD_PIPELINE.viterbiSameRoot
  const diff = (b.rootPc - a.rootPc + 12) % 12
  if (diff === 5 || diff === 7) return CHORD_PIPELINE.viterbiCircleStep
  return 0
}

/**
 * Viterbi decode over (root, quality) states — reduces one-beat outliers vs greedy argmax.
 */
function viterbiChordPath(
  beatChromas: readonly Float32Array[],
  templates: readonly Float32Array[],
  keyPrior?: EstimatedKey,
): { rootPc: number; quality: ChordQuality; confidence: number }[] {
  const B = beatChromas.length
  const S = N_CHORD_STATES
  if (B === 0) return []

  const dp = new Float32Array(S)
  const dpNext = new Float32Array(S)
  const back = new Int16Array(B * S)

  for (let s = 0; s < S; s++) {
    dp[s] = emissionScore(beatChromas[0]!, s, templates, keyPrior)
  }

  for (let bi = 1; bi < B; bi++) {
    const chroma = beatChromas[bi]!
    for (let s = 0; s < S; s++) {
      const em = emissionScore(chroma, s, templates, keyPrior)
      let best = -Infinity
      let bestP = 0
      for (let p = 0; p < S; p++) {
        const sc = dp[p]! + transitionBonus(p, s)
        if (sc > best) {
          best = sc
          bestP = p
        }
      }
      dpNext[s] = best + em
      back[bi * S + s] = bestP
    }
    for (let s = 0; s < S; s++) dp[s] = dpNext[s]!
  }

  let bestEnd = 0
  let bestScore = -Infinity
  for (let s = 0; s < S; s++) {
    if (dp[s]! > bestScore) {
      bestScore = dp[s]!
      bestEnd = s
    }
  }

  const path = new Int16Array(B)
  path[B - 1] = bestEnd
  for (let bi = B - 2; bi >= 0; bi--) {
    path[bi] = back[(bi + 1) * S + path[bi + 1]!]!
  }

  return Array.from(path, (si, bi) => {
    const st = unpackChordState(si)
    return {
      rootPc: st.rootPc,
      quality: st.quality,
      confidence: cosineSimilarity(beatChromas[bi]!, templates[si]!),
    }
  })
}

/** Per-chroma-frame RMS over the same window geometry as `computeChromaFrameSeries`. */
function buildChromaFrameRms(mono: Float32Array, frameCount: number): Float32Array {
  const rms = new Float32Array(frameCount)
  for (let fi = 0; fi < frameCount; fi++) {
    const start = fi * CHROMA_HOP
    if (start + CHROMA_FFT > mono.length) break
    let sum = 0
    for (let i = 0; i < CHROMA_FFT; i++) {
      const v = mono[start + i]!
      sum += v * v
    }
    rms[fi] = Math.sqrt(sum / CHROMA_FFT)
  }
  return rms
}

function meanFrameRmsInWindow(
  centerSec: number,
  halfWinSec: number,
  frameRms: Float32Array,
  frameCount: number,
  sampleRate: number,
): number {
  let sum = 0
  let n = 0
  for (let fi = 0; fi < frameCount; fi++) {
    const ft = frameCenterSec(fi, sampleRate)
    if (Math.abs(ft - centerSec) > halfWinSec) continue
    sum += frameRms[fi]!
    n++
  }
  return n > 0 ? sum / n : 0
}

/** Merges segments shorter than `minDurSec` into a neighbor so export / UI stay stable. */
function pruneShortChordSegments(segments: readonly ChordSegment[], minDurSec: number): ChordSegment[] {
  if (segments.length === 0 || minDurSec <= 0) return [...segments]
  const arr = segments.map(s => ({ ...s }))
  let i = 0
  while (i < arr.length) {
    if (arr[i]!.durationSec >= minDurSec || arr.length < 2) {
      i++
      continue
    }
    if (i > 0) {
      arr[i - 1]!.durationSec += arr[i]!.durationSec
      arr.splice(i, 1)
    } else {
      arr[1]!.startSec = arr[0]!.startSec
      arr[1]!.durationSec += arr[0]!.durationSec
      arr.splice(0, 1)
    }
  }
  return arr
}

export function formatChordLabel(rootPc: number, quality: ChordQuality): string {
  const name = TONIC_SHARP[rootPc]!
  switch (quality) {
    case 'major':
      return name
    case 'minor':
      return `${name}m`
    case 'dim':
      return `${name}dim`
    case 'aug':
      return `${name}aug`
    case 'sus4':
      return `${name}sus4`
    default:
      return name
  }
}

function frameCenterSec(frameIndex: number, sampleRate: number): number {
  return (frameIndex * CHROMA_HOP + CHROMA_FFT / 2) / sampleRate
}

function medianFilterBeats(beats: ChordBeat[], win: number): ChordBeat[] {
  const half = Math.floor(win / 2)
  return beats.map((b, i) => {
    const lo = Math.max(0, i - half)
    const hi = Math.min(beats.length, i + half + 1)
    const slice = beats.slice(lo, hi)
    let bestLabel = b.label
    let bestCount = -1
    for (const x of slice) {
      const c = slice.filter(y => y.label === x.label).length
      if (c > bestCount) {
        bestCount = c
        bestLabel = x.label
      }
    }
    const ref = slice.find(x => x.label === bestLabel)!
    return {
      ...b,
      rootPc: ref.rootPc,
      quality: ref.quality,
      label: ref.label,
      confidence: ref.confidence,
    }
  })
}

function mergeAdjacentBeats(beats: ChordBeat[], beatSec: number): ChordSegment[] {
  if (beats.length === 0) return []
  const out: ChordSegment[] = []
  let runStart = 0
  for (let i = 1; i <= beats.length; i++) {
    const boundary = i === beats.length || beats[i]!.label !== beats[i - 1]!.label
    if (boundary) {
      const first = beats[runStart]!
      const len = i - runStart
      out.push({
        label: first.label,
        rootPc: first.rootPc,
        quality: first.quality,
        startSec: runStart * beatSec,
        durationSec: len * beatSec,
      })
      runStart = i
    }
  }
  return out
}

/**
 * Nudge each internal chord-segment cut toward the strongest RMS-onset flux in
 * a ±`MIDI_EXPORT_TIMING.maxBoundarySnapSec` window so block boundaries follow
 * real harmonic onsets instead of only the beat grid.
 */
function refineChordSegmentBoundariesFromCurve(
  curve: RmsFluxCurve,
  segments: ChordSegment[],
  beatSec: number,
): ChordSegment[] {
  if (segments.length === 0) return []
  const snap = MIDI_EXPORT_TIMING.maxBoundarySnapSec
  const minSeg = Math.max(
    MIDI_EXPORT_TIMING.segmentBoundaryMinSec,
    beatSec * MIDI_EXPORT_TIMING.segmentBoundaryMinBeatFraction,
  )

  const nominal: number[] = [segments[0]!.startSec]
  for (let i = 1; i < segments.length; i++) nominal.push(segments[i]!.startSec)
  const last = segments[segments.length - 1]!
  nominal.push(last.startSec + last.durationSec)

  const B = nominal.slice()
  for (let k = 1; k < B.length - 1; k++) {
    const lo = Math.max(nominal[k - 1]! + minSeg, nominal[k]! - snap)
    const hi = Math.min(nominal[k + 1]! - minSeg, nominal[k]! + snap)
    if (hi > lo + 1e-6) B[k] = fluxPeakTimeInRange(curve, lo, hi)
  }
  for (let k = 1; k < B.length - 1; k++) {
    if (B[k]! <= B[k - 1]! + minSeg * 0.5) B[k] = nominal[k]!
    if (B[k]! >= B[k + 1]! - minSeg * 0.5) B[k] = nominal[k]!
  }

  return segments.map((seg, i) => ({
    ...seg,
    startSec: B[i]!,
    durationSec: B[i + 1]! - B[i]!,
  }))
}

function chordToMidiTriad(rootPc: number, quality: ChordQuality): [number, number, number] {
  const base = 48 + rootPc
  switch (quality) {
    case 'major':
      return [base, base + 4, base + 7]
    case 'minor':
      return [base, base + 3, base + 7]
    case 'dim':
      return [base, base + 3, base + 6]
    case 'aug':
      return [base, base + 4, base + 8]
    case 'sus4':
      return [base, base + 5, base + 7]
    default:
      return [base, base + 4, base + 7]
  }
}

export function clipChordSegmentsForExport(
  segments: readonly ChordSegment[],
  trimStartSec: number,
  trimEndSec: number,
  fullDurationSec: number,
): ChordSegment[] {
  const dur = Math.max(1e-9, fullDurationSec)
  let a = Math.min(trimStartSec, trimEndSec)
  let b = Math.max(trimStartSec, trimEndSec)
  a = Math.max(0, Math.min(a, dur))
  b = Math.max(0, Math.min(b, dur))
  if (b <= a + 1e-4) return []

  const out: ChordSegment[] = []
  for (const seg of segments) {
    const segEnd = seg.startSec + seg.durationSec
    const clipStart = Math.max(a, seg.startSec)
    const clipEnd = Math.min(b, segEnd)
    if (clipEnd <= clipStart + 1e-6) continue
    out.push({
      ...seg,
      startSec: clipStart - a,
      durationSec: clipEnd - clipStart,
    })
  }
  return out
}

/**
 * Notes-only single-track MIDI exporter.
 *
 * The chord-track approach (block triads quantized to a beat grid) was sounding
 * heavy-handed and clashing with the actual melody on real audio — chord
 * template matches at the beat level rarely match what's actually being
 * played in songs that aren't strict pop progressions. We dropped the chord
 * track from the export entirely and now emit a single "Notes" track from the
 * Basic Pitch–derived notes. The chord detection still runs for the in-app
 * timeline analytics + key estimation, but it does not pollute the MIDI export.
 *
 * Legacy callers still pass `segments` (kept in the signature for back-compat
 * with round-trip tests). When `leadNotes` is also provided we use ONLY the
 * lead notes for the export — `segments` is intentionally ignored.
 *
 * **Timing:** `time` / `duration` on each note are **wall-clock seconds** from
 * the analyzed source (same basis as `durationSec` / BPM analysis). The MIDI
 * header tempo is set to the detected `bpm` so DAWs can align a bar grid to the
 * same pulse; we do **not** re-quantize note onsets to MIDI ticks or transpose
 * by estimated key — export pitch is exactly what detection extracted. Audio
 * path applies `refineLeadNotesForMidiExport` / segment flux snaps before this
 * (still seconds, no transposition).
 */
export function buildChordMidiBlob(
  segments: readonly ChordSegment[],
  bpm: number,
  leadNotes?: readonly LeadNote[],
): Blob {
  const midi = new Midi()
  midi.header.setTempo(bpm)
  midi.name = 'Chord Detector — Notes'

  // Branch A: full notes-track export (preferred path).
  if (leadNotes && leadNotes.length > 0) {
    const notesTrack = midi.addTrack()
    notesTrack.name = 'Notes'
    // Do NOT set `notesTrack.instrument.number` — that causes @tonejs/midi
    // to split program changes into a separate empty MTrk chunk, leaving a
    // 3-track file when we wanted 1. DAWs use program 0 (Acoustic Grand Piano)
    // by default, which is exactly what we want anyway.
    for (const n of leadNotes) {
      const midiN = Math.min(127, Math.max(0, Math.round(n.midi)))
      notesTrack.addNote({
        midi: midiN,
        time: Math.max(0, n.startSec),
        duration: Math.max(1 / 32, n.durationSec),
        velocity: Math.max(0.2, Math.min(1, n.velocity)),
      })
    }
  } else {
    // Branch B: round-trip / legacy path — write the segment triads as the
    // single track so existing analyzer round-trip tests still recover chords.
    const chordTrack = midi.addTrack()
    chordTrack.name = 'Chords'
    chordTrack.instrument.number = 0
    for (const seg of segments) {
      const notes = chordToMidiTriad(seg.rootPc, seg.quality)
      const dur = Math.max(1 / 32, seg.durationSec)
      for (const n of notes) {
        const midiN = Math.min(127, Math.max(0, Math.round(n)))
        chordTrack.addNote({
          midi: midiN,
          time: seg.startSec,
          duration: dur,
          velocity: 0.74,
        })
      }
    }
  }

  const raw = midi.toArray()
  return new Blob([new Uint8Array(raw)], { type: 'audio/midi' })
}

export async function analyzeChordProgressionFromBlob(
  blob: Blob,
  options?: ChordDetectorAnalyzeOptions,
): Promise<ChordAnalysisResult> {
  // Route MIDI inputs to the dedicated MIDI path (pretty-midi-style note analysis).
  if (await isMidiBlob(blob)) {
    return analyzeChordProgressionFromMidiBlob(blob, options)
  }

  let tagBpm: number | null = null
  try {
    const md = await parseBlob(blob, { duration: false })
    if (typeof md.common.bpm === 'number' && Number.isFinite(md.common.bpm)) {
      tagBpm = Math.round(md.common.bpm)
      if (tagBpm < 40 || tagBpm > 240) tagBpm = null
    }
  } catch {
    /* no tags */
  }

  const ctx = new AudioContext()
  try {
    const ab = await blob.arrayBuffer()
    const audioBuffer = await ctx.decodeAudioData(ab.slice(0))
    const sr = audioBuffer.sampleRate
    let mono = monoDownmix(audioBuffer)

    const maxSec = 96
    const maxSamples = Math.floor(maxSec * sr)
    if (mono.length > maxSamples) mono = mono.subarray(0, maxSamples)

    const est = estimateBpmFromMono(mono, sr)
    const bpmPrior = clampOptionalBpmPrior(options?.bpmPrior)
    const bpm = tagBpm ?? bpmPrior ?? est ?? 120
    const bpmSource: ChordAnalysisResult['bpmSource'] =
      tagBpm != null ? 'tags' : bpmPrior != null ? 'bpm-prior' : 'estimated'

    const frames = computeChromaFrameSeries(mono, sr)
    if (!frames) throw new Error('Need more audio — try a longer clip.')

    const beatSec = 60 / bpm
    const durationSec = mono.length / sr

    const frameRms = buildChromaFrameRms(mono, frames.length)
    let clipPeakRms = 1e-12
    for (let fi = 0; fi < frames.length; fi++) clipPeakRms = Math.max(clipPeakRms, frameRms[fi]!)
    const minFrameRms = clipPeakRms * CHORD_PIPELINE.chromaFrameVadRelative

    const aggregateNearTime = (centerSec: number, halfWinSec: number): Float32Array => {
      const agg = new Float32Array(12)
      let n = 0
      for (let fi = 0; fi < frames.length; fi++) {
        const ft = frameCenterSec(fi, sr)
        if (Math.abs(ft - centerSec) > halfWinSec) continue
        if (frameRms[fi]! < minFrameRms) continue
        const fr = frames[fi]!
        for (let k = 0; k < 12; k++) agg[k] += fr[k]!
        n++
      }
      if (n < 1) return l2Normalize12(agg)
      for (let k = 0; k < 12; k++) agg[k] /= n
      return l2Normalize12(agg)
    }

    // ── Basic Pitch lead notes (TensorFlow.js) → chord evidence + key histogram ─
    // Polyphonic note events feed per-beat pitch-class weights blended with chroma;
    // there is no legacy in-browser spectral peak extractor fallback.
    const mono22050 = await resampleMonoTo22050(mono, sr)
    const maxBpSamples = Math.floor(maxSec * 22050)
    const monoBp = mono22050.length > maxBpSamples ? mono22050.slice(0, maxBpSamples) : mono22050
    const basicPitchInput: Partial<NeuralNoteBasicPitchDecode> | undefined =
      !isPianoLeadFocusMode(options)
        ? { ...PIANO_LEAD_RELAXED_BASIC_PITCH, ...options?.basicPitchDecode }
        : options?.basicPitchDecode
    const bpOut = await transcribeMono22050ToLeadNotes(monoBp, basicPitchInput)
    if (!bpOut.ok) {
      throw new Error(
        `Transcription failed (Basic Pitch / TensorFlow.js): ${bpOut.message}. This tool does not fall back to a spectral model — try another browser, check WebGL/WASM is allowed, or use a shorter clip.`,
      )
    }
    const leadNotesRaw = bpOut.leadNotes
    const pitchClassHistogramFromBasicPitch = bpOut.pitchClassHistogram
    const hasBpNotes = leadNotesRaw.length > 0
    const chromaBlendW = hasBpNotes ? BASIC_PITCH_CHORD_BLEND.chromaWeight : CHORD_PIPELINE.chromaWeight
    const leadBlendScale = hasBpNotes ? BASIC_PITCH_CHORD_BLEND.leadWeightScale : CHORD_PIPELINE.leadWeightScale

    const rmsFluxCurve = buildRmsFluxCurve(mono, sr)

    // ── Chord detection: VAD-gated chroma + lead blend, then Viterbi decode ──
    const leadAtTime = (centerSec: number, halfWinSec: number): Float32Array => {
      const acc = new Float32Array(12)
      for (const n of leadNotesRaw) {
        const noteEnd = n.startSec + n.durationSec
        const winStart = centerSec - halfWinSec
        const winEnd = centerSec + halfWinSec
        const overlap = Math.max(0, Math.min(noteEnd, winEnd) - Math.max(n.startSec, winStart))
        if (overlap <= 0) continue
        const pc = ((n.midi % 12) + 12) % 12
        acc[pc] += overlap * n.velocity
      }
      return acc
    }

    const templates = getStateChordTemplates()
    const instantBeatEvidence: Float32Array[] = []
    let lastGoodChroma: Float32Array | null = null

    const beatCount = Math.max(1, Math.floor(durationSec / beatSec))
    for (let bi = 0; bi < beatCount; bi++) {
      const centerSec = bi * beatSec + beatSec * 0.5
      const halfWin = beatSec * CHORD_PIPELINE.beatHalfWinFactor
      const meanBeatRms = meanFrameRmsInWindow(centerSec, halfWin, frameRms, frames.length, sr)

      let chromaPart = aggregateNearTime(centerSec, halfWin)
      if (meanBeatRms < clipPeakRms * CHORD_PIPELINE.beatSilenceRelative && lastGoodChroma) {
        chromaPart = Float32Array.from(lastGoodChroma)
      } else if (meanBeatRms >= clipPeakRms * CHORD_PIPELINE.beatSilenceRelative) {
        lastGoodChroma = Float32Array.from(chromaPart)
      }

      const leadPart = leadAtTime(centerSec, halfWin)
      const combined = new Float32Array(12)
      let leadMax = 0
      for (let k = 0; k < 12; k++) leadMax = Math.max(leadMax, leadPart[k]!)
      const leadScale = leadMax > 0 ? leadBlendScale / leadMax : 0
      for (let k = 0; k < 12; k++) {
        combined[k] = chromaPart[k]! * chromaBlendW + leadPart[k]! * leadScale
      }
      instantBeatEvidence.push(combined)
    }

    let provisionalPcHist: number[]
    if (hasBpNotes) {
      provisionalPcHist = pitchClassHistogramFromBasicPitch.slice()
    } else {
      const pcAccum = new Float32Array(12)
      for (const fr of frames) {
        for (let k = 0; k < 12; k++) pcAccum[k]! += fr[k]!
      }
      const pcSum = pcAccum.reduce((a, b) => a + b, 0)
      provisionalPcHist = Array.from(pcAccum, x => (pcSum > 0 ? x / pcSum : 0))
    }
    const keyPriorForViterbi = estimateKeyFromPitchClassHistogram(provisionalPcHist)
    const beatChromas = applyArpeggioChordWindowToBeatInstants(instantBeatEvidence, ARPEGGIO_CHORD_WINDOW)
    const decoded = viterbiChordPath(beatChromas, templates, keyPriorForViterbi)
    const rawBeats: ChordBeat[] = decoded.map((d, bi) => ({
      beatIndex: bi,
      rootPc: d.rootPc,
      quality: d.quality,
      label: formatChordLabel(d.rootPc, d.quality),
      confidence: d.confidence,
    }))

    const smoothed = medianFilterBeats(rawBeats, CHORD_PIPELINE.medianFilterWindow)
    let segments = mergeAdjacentBeats(smoothed, beatSec)
    segments = pruneShortChordSegments(segments, beatSec * CHORD_PIPELINE.minChordBeats)

    if (rmsFluxCurve) {
      segments = refineChordSegmentBoundariesFromCurve(rmsFluxCurve, segments, beatSec)
    }
    const ph = isPianoLeadFocusMode(options) ? EXPORT_LEAD_PHANTOM.strict : EXPORT_LEAD_PHANTOM.relaxed

    /* DEV-only per-stage capture — `scripts/chord-detector-midi-debug.mjs` reads
     * `window.__chordPipelineStages` to see which export stage drops top notes,
     * splits sustains, or shifts onsets. No-op in production builds. */
    const __leadStages: { stage: string; count: number; notes: LeadNote[] }[] = []
    const dbgStage = (stage: string, ns: readonly LeadNote[]): void => {
      if (import.meta.env.DEV) __leadStages.push({ stage, count: ns.length, notes: ns.map(n => ({ ...n })) })
    }
    dbgStage('0-raw', leadNotesRaw)

    /* Merge/drop for export only — `leadNotesRaw` stays unmerged for beat-level chord blend. */
    let leadForMidi = mergeAdjacentSamePitchNotes(leadNotesRaw, MIDI_EXPORT_NOTE_MERGE.samePitchMaxGapSec)
    dbgStage('1-merge', leadForMidi)
    leadForMidi = collapseOctaveDuplicatesNearOnsets(leadForMidi, 0.042)
    dbgStage('2-octaveCollapse', leadForMidi)
    leadForMidi = dropSimultaneousPitchOutliers(
      leadForMidi,
      ph.outlier1.clusterSec,
      ph.outlier1.minCluster,
      ph.outlier1.minSemi,
      ph.outlier1.maxVelRatio,
    )
    dbgStage('3-outlier1', leadForMidi)
    leadForMidi = thinPolyphonicLeadNotesByTimeWindow(leadForMidi, ph.thinWinSec, ph.thinMaxVoices)
    dbgStage('4-thinPoly', leadForMidi)
    leadForMidi = debounceIsolatedBassBlips(leadForMidi, 40, 41, 72, 0.18, 0.11)
    dbgStage('5-debounceBass', leadForMidi)
    leadForMidi = dropLowRegisterNotesShorterThan(leadForMidi, 48, 0.135)
    dbgStage('6-dropLowShort', leadForMidi)
    leadForMidi = dropLeadNotesShorterThan(leadForMidi, MIDI_EXPORT_NOTE_MERGE.minNoteSecAfterMerge)
    dbgStage('7-dropShort', leadForMidi)
    let leadNotes = rmsFluxCurve
      ? refineLeadNotesForMidiExport(rmsFluxCurve, leadForMidi, durationSec)
      : leadForMidi
    dbgStage('8-rmsRefine', leadNotes)

    // NeuralNote-inspired post (quant / min length / velocity) — optional; does not replace BP polyphony.
    leadNotes = applyNeuralNoteStyleLeadNotes(leadNotes, bpm, durationSec, options?.melodyPost)
    dbgStage('9-neuralNotePost', leadNotes)
    // Co-align straggling chord onsets for export/preview (after merge + per-pitch RMS refine).
    leadNotes = alignChordOnsetsInLeadNotes(leadNotes, { ...CHORD_ONSET_ALIGN, bpm })
    dbgStage('10-onsetAlign', leadNotes)
    // RMS refine can nudge simultaneous windows — light second outlier pass (export only).
    leadNotes = dropSimultaneousPitchOutliers(
      leadNotes,
      ph.outlier2.clusterSec,
      ph.outlier2.minCluster,
      ph.outlier2.minSemi,
      ph.outlier2.maxVelRatio,
    )
    dbgStage('11-outlier2', leadNotes)
    // Solo-piano polyphony cap last on export so onset align + outlier passes cannot re-stack >K voices.
    leadNotes = enforceTwoHandPianoPolyphony(leadNotes, {
      ...PIANO_TWO_HAND_EXPORT,
      ...(!isPianoLeadFocusMode(options) ? PIANO_TWO_HAND_RELAXED : {}),
    })
    dbgStage('12-twoHandCap', leadNotes)
    /* Final same-pitch merge. The stage-1 merge runs on raw BP notes, but RMS refine,
     * quantize, and onset-align all move note timing afterwards — creating fresh sub-
     * perceptual gaps and same-pitch overlaps. One last merge collapses those so a held
     * note exports as ONE note, not two fragments (chord-detector-midi-export-debug, Bug 4). */
    leadNotes = mergeAdjacentSamePitchNotes(leadNotes, MIDI_EXPORT_NOTE_MERGE.samePitchMaxGapSec)
    dbgStage('13-finalMerge', leadNotes)
    /* Part 3 — stage 14: bar-loop detection + 2nd-pass structuring (re-snap starts,
     * quantize note lengths, trim loop-seam straddlers). */
    const loop = detectBarLoop(leadNotes, bpm, durationSec)
    leadNotes = structureLeadNotes(leadNotes, loop, bpm)
    dbgStage('14-structure', leadNotes)
    if (import.meta.env.DEV) {
      ;(globalThis as unknown as { __chordPipelineStages?: unknown }).__chordPipelineStages = __leadStages
    }

    // ── New (pretty-midi-derived) ─────────────────────────────────────────────
    let pitchClassHistogram: number[]
    if (hasBpNotes) {
      pitchClassHistogram = pitchClassHistogramFromBasicPitch
    } else {
      pitchClassHistogram = provisionalPcHist
    }
    const estimatedKey = estimateKeyFromPitchClassHistogram(pitchClassHistogram)
    const uniqueChordCount = new Set(segments.map(s => s.label)).size
    const beatTimesSec = getBeatTimes(bpm, durationSec)
    const downbeatTimesSec = getDownbeatTimes(beatTimesSec, 4)

    /* Source-chroma fingerprint: aggregate per-frame chroma into a normalized 12-bin
     * distribution so the audit can compare chroma energy ↔ lead-note coverage and
     * surface "PC has source energy but no notes" candidates. */
    const chromaPcAccum = new Float64Array(12)
    for (const fr of frames) {
      for (let k = 0; k < 12; k++) chromaPcAccum[k]! += fr[k]!
    }
    const chromaPcSum = chromaPcAccum.reduce((a, b) => a + b, 0)
    const chromaPcDist: number[] = chromaPcSum > 0
      ? Array.from(chromaPcAccum, x => x / chromaPcSum)
      : new Array<number>(12).fill(0)
    const audit = auditChordAnalysis({
      leadNotes,
      segments,
      bpm,
      bpmSource,
      durationSec,
      estimatedKey,
      loop,
      chromaPcDist,
    })

    /* Part 3 — stage 15: when the piece is a recognized loop, collapse all repetitions
     * into ONE canonical P-bar window (union of notes across iterations — notes BP
     * caught in some iterations but missed in others get filled in from their siblings).
     * The audit above ran on the full-output lead-note stream so its per-period scores
     * and missing-note flags still describe the whole clip. */
    let finalLeadNotes = leadNotes
    let finalDurationSec = durationSec
    let finalSegments: ChordSegment[] = segments
    let finalUniqueChordCount = uniqueChordCount
    let finalBeats: ChordBeat[] = smoothed
    let finalBeatTimesSec: number[] = beatTimesSec
    let finalDownbeatTimesSec: number[] = downbeatTimesSec
    if (loop.found) {
      finalLeadNotes = consolidateToLoop(leadNotes, loop, bpm)
      const unitSec = loop.barCount * loop.barSec
      finalDurationSec = unitSec
      finalSegments = segments
        .filter(s => s.startSec < unitSec)
        .map(s => ({ ...s, durationSec: Math.min(s.durationSec, unitSec - s.startSec) }))
      finalUniqueChordCount = new Set(finalSegments.map(s => s.label)).size
      finalBeats = smoothed.filter(b => b.beatIndex * (60 / bpm) < unitSec)
      finalBeatTimesSec = beatTimesSec.filter(t => t < unitSec)
      finalDownbeatTimesSec = downbeatTimesSec.filter(t => t < unitSec)
      dbgStage('15-loopConsensus', finalLeadNotes)
    }

    return {
      bpm,
      bpmSource,
      durationSec: finalDurationSec,
      beats: finalBeats,
      segments: finalSegments,
      inputType: 'audio',
      pitchClassHistogram,
      estimatedKey,
      uniqueChordCount: finalUniqueChordCount,
      beatTimesSec: finalBeatTimesSec,
      downbeatTimesSec: finalDownbeatTimesSec,
      leadNotes: finalLeadNotes,
      loop,
      audit,
    }
  } finally {
    await ctx.close().catch(() => {})
  }
}

/**
 * Clip a lead-note list to a `[trimStart, trimEnd]` window AND re-zero the
 * start times to the trim origin — mirrors `clipChordSegmentsForExport`'s
 * contract so the exported MIDI's chord track and lead track stay aligned.
 */
export function clipLeadNotesForExport(
  notes: readonly LeadNote[],
  trimStartSec: number,
  trimEndSec: number,
  fullDurationSec: number,
): LeadNote[] {
  const dur = Math.max(1e-9, fullDurationSec)
  let a = Math.min(trimStartSec, trimEndSec)
  let b = Math.max(trimStartSec, trimEndSec)
  a = Math.max(0, Math.min(a, dur))
  b = Math.max(0, Math.min(b, dur))
  if (b <= a + 1e-4) return []
  const out: LeadNote[] = []
  for (const n of notes) {
    const noteEnd = n.startSec + n.durationSec
    const clipStart = Math.max(a, n.startSec)
    const clipEnd = Math.min(b, noteEnd)
    if (clipEnd <= clipStart + 1e-6) continue
    out.push({
      midi: n.midi,
      velocity: n.velocity,
      startSec: clipStart - a,
      durationSec: clipEnd - clipStart,
    })
  }
  return out
}
