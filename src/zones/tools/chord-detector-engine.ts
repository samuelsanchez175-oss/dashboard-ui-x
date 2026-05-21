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
import { inferChordImpliedNotes } from './chord-detector-chord-imply'
/* v2 pipeline modules (parallel-built by subagents). All are pure functions —
 * Float32Array / note list in, transformed data out. Each one targets a
 * specific accuracy lever; see their module docs for the algorithm + rationale. */
import { transcribeWithRegisterPasses } from './chord-detector-register-pass'
import { getActiveSeparator } from './chord-detector-source-separation'
import { validateNotesAgainstCQT } from './chord-detector-cqt-validate'
import { detectLoopFromAudio } from './chord-detector-loop-audio'

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
export { inferChordImpliedNotes, CHORD_IMPLY } from './chord-detector-chord-imply'
export type { ChordImplyInput } from './chord-detector-chord-imply'

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
  /**
   * Stage 14.5 — chord-implied note inference. Default is OFF on BOTH the audio
   * and MIDI paths (changed 2026-05 — previously defaulted ON for audio). Adding
   * synthesised chord-tones to the transcription was hallucinating notes that
   * weren't in the source; pass `true` explicitly to opt back in. See
   * `chord-detector-chord-imply.ts` for the algorithm + guardrails.
   */
  inferChordTones?: boolean
  /**
   * Pipeline mode for benchmarking + back-compat.
   *  - `'full'` (default): the LEAN pipeline — single-pass Basic Pitch +
   *    export cleanup + structure pass. HPSS, register-stratified passes
   *    and CQT validation are OFF (they were net-negative in the phase
   *    test; see `docs/chord-detector-phase-test-findings.md`).
   *  - `'raw'`: bypass every stage. BP's native output with only the
   *    final same-pitch merge. The benchmark baseline.
   *  - `'full-legacy'`: the PRE-FLIP behavior with HPSS + register passes
   *    + CQT all enabled. Kept so the bench can A/B the layers we turned
   *    off; not a recommended user-facing mode.
   *
   * Individual `skip*` options still override the mode-derived defaults.
   */
  analysisMode?: 'raw' | 'full' | 'full-legacy'
  /** Skip HPSS — feed BP the original mono instead of the harmonic stem. */
  skipHpss?: boolean
  /** Skip register-stratified multi-pass; run BP once with default thresholds. */
  skipRegisterPasses?: boolean
  /** Skip CQT validation — keep every BP note regardless of audio-energy match. */
  skipCqt?: boolean
  /** Skip structure pass — keep BP's native timing, no 1/16 / 1/64 snapping. */
  skipStructure?: boolean
  /**
   * Bypass the export-cleanup stages (merge / outlier-drop / poly thin /
   * bass-blip debounce / short-note drop / RMS refine / NeuralNote post /
   * onset align / two-hand cap). When true the engine routes leadNotesRaw
   * directly into the result, with only the minimal final merge.
   */
  skipExportCleanup?: boolean
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
/* Polyphony thinning + outlier filters.
 *
 * `thinMaxVoices` was 4 in both strict and relaxed modes — too aggressive for
 * dense full-mix arrangements where the bass, harmony, and lead can easily
 * stack 6-8 simultaneous voices (see reference Logic Pro export of "frank
 * ocean acura girl" bars 3-4 — visible 6+ voice density during dense passages).
 * Strict mode now caps at 6; relaxed at 8. The PIANO_TWO_HAND_EXPORT cap
 * downstream still keeps things playable on a real piano (8 keys max with
 * middle-C split) — this just stops the export pipeline from culling
 * legitimate harmony voices before that point. */
const EXPORT_LEAD_PHANTOM = {
  strict: {
    thinWinSec: 0.024,
    thinMaxVoices: 6,
    outlier1: { clusterSec: 0.046, minCluster: 3, minSemi: 12, maxVelRatio: 0.44 },
    outlier2: { clusterSec: 0.053, minCluster: 3, minSemi: 14, maxVelRatio: 0.35 },
  },
  relaxed: {
    thinWinSec: 0.026,
    thinMaxVoices: 8,
    outlier1: { clusterSec: 0.048, minCluster: 3, minSemi: 13, maxVelRatio: 0.48 },
    outlier2: { clusterSec: 0.055, minCluster: 3, minSemi: 15, maxVelRatio: 0.38 },
  },
} as const

/**
 * Resolve the effective bypass flags from `analysisMode` + individual skip
 * options. Defaults updated 2026-05-21 after a full bench sweep against the
 * user-curated MIDI ground truth (see
 * `docs/chord-detector-phase-test-findings.md`).
 *
 * Bench summary on the MP3 (F1 vs GT, ±50 ms onset):
 *   no-register → 33.3 %  (single-pass BP wins — and 2.7× faster)
 *   no-hpss     → 31.4 %  (only when register multi-pass is still running)
 *   full-legacy → 26.1 %  (every layer on — the pre-flip baseline)
 *   raw         → 14.9 %  (everything off)
 *
 * A prior over-aggressive cut (remove HPSS + register + CQT + bass-killers
 * all at once) dropped the MP3 to 12.3 % F1 — the cleanup chain depends on
 * HPSS-cleaned audio for its RMS-based timing refinement, and the layers
 * compensate for each other. The ONLY change that won in isolation AND
 * stayed a net positive when stacked was `skipRegisterPasses`.
 *
 * Bypass semantics:
 *   `analysisMode: 'raw'`            → every stage OFF (BP-only baseline)
 *   `analysisMode: 'full'` or unset  → register-multi-pass OFF, everything
 *                                      else as before (HPSS / CQT / cleanup /
 *                                      structure all run). The new default.
 *   `analysisMode: 'full-legacy'`    → register-multi-pass also ON. Used by
 *                                      the bench to A/B the multi-pass.
 *
 * Individual `skip*` options still win over the mode-derived defaults.
 */
function resolveBypassFlags(options?: ChordDetectorAnalyzeOptions): {
  hpss: boolean
  registerPasses: boolean
  exportCleanup: boolean
  cqt: boolean
  structure: boolean
  chordImply: boolean
} {
  const mode = options?.analysisMode
  const raw = mode === 'raw'
  const legacy = mode === 'full-legacy'
  const pick = (skip: boolean | undefined, defaultSkip: boolean): boolean =>
    typeof skip === 'boolean' ? skip : defaultSkip
  return {
    hpss:           pick(options?.skipHpss,           raw),
    /* register multi-pass: the only confirmed-positive single-layer cut.
     * Default OFF in `full` mode; ON in `full-legacy` so the bench can
     * still measure the multi-pass cost. */
    registerPasses: pick(options?.skipRegisterPasses, raw || !legacy),
    exportCleanup:  pick(options?.skipExportCleanup,  raw),
    cqt:            pick(options?.skipCqt,            raw),
    structure:      pick(options?.skipStructure,      raw),
    /* Chord-implied notes: hardcoded OFF by default (Phase 4 of the test
     * findings — adding synthesised chord-tones was hallucinating notes).
     * The user can opt in via `inferChordTones: true`. Raw mode forces OFF
     * regardless. */
    chordImply:     raw ? true : options?.inferChordTones !== true,
  }
}

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
   *
   * This is the MERGED stream — combination of all register passes when the
   * multi-pass BP path is active. For the three-track export, use the
   * `leadTrack` / `harmonyTrack` / `bassTrack` fields below, each carrying
   * the notes from one register-stratified pass.
   */
  leadNotes: LeadNote[]
  /**
   * Three-track split — one note stream per register pass. Populated when the
   * register-stratified multi-pass BP path runs (the default for audio input
   * after the v2 pipeline upgrade). Empty arrays when only the legacy single-
   * pass path was used. The UI surfaces these as three separate "Export MIDI"
   * buttons (Lead / Harmony / Bass).
   *
   *   leadTrack    — high register (midi ≥ 60), melody-tuned BP pass
   *   harmonyTrack — mid register (midi 48-72), inner-voice chords
   *   bassTrack    — low register (midi < 48), sustained-bass-tuned pass
   *
   * Notes appear in only one track (deduplicated at the engine level), so
   * exporting all three reconstructs the merged leadNotes stream exactly.
   */
  leadTrack: LeadNote[]
  harmonyTrack: LeadNote[]
  bassTrack: LeadNote[]
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
      leadTrack: [],
      harmonyTrack: [],
      bassTrack: [],
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
  /* Stage 14.5 — chord-implied note inference. MIDI input represents the user's
   * intent verbatim; we don't want to silently add chord-tones they didn't write,
   * so this stage is OFF by default on the MIDI path. Opt in with
   * `options.inferChordTones === true` if you want chord-fill on MIDI input too. */
  if (options?.inferChordTones === true) {
    leadNotes = inferChordImpliedNotes({ leadNotes, segments, estimatedKey, bpm })
  }
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

  /* Stage 15 (loop-consensus consolidation) is no longer auto-applied. The result
   * always carries the full-length stream. The UI exposes an EXTRACT LOOP button
   * that, when a loop is detected, derives the canonical P-bar window on demand
   * via `consolidateToLoop(result.leadNotes, result.loop, result.bpm)`. This keeps
   * "what came out of the pipeline" === "what the user sees by default" instead
   * of silently truncating the export to one canonical iteration. */
  /* MIDI input path doesn't run the register-stratified multi-pass — the user's
   * own MIDI represents their intent verbatim. Track fields stay empty so the
   * UI shows ONE export button (full track) for MIDI input. */
  return {
    bpm,
    bpmSource,
    durationSec,
    beats: smoothed,
    segments,
    inputType: 'midi',
    pitchClassHistogram: pcHist,
    estimatedKey,
    uniqueChordCount,
    beatTimesSec,
    downbeatTimesSec,
    leadNotes,
    leadTrack: [],
    harmonyTrack: [],
    bassTrack: [],
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
 * Key-aware Viterbi transition prior. Adds a log-probability adjustment for the
 * transition prev → next based on the diatonic role of each chord in the detected
 * key. Returns 0 (no adjustment) when the key prior is missing, low-confidence,
 * or unknown, so the decoder gracefully falls back to the key-blind transitionBonus.
 *
 * Music theory rationale (treating C as the F#-major-style "tonic" placeholder —
 * the boost depends on scale degree, not absolute pitch):
 *
 *  - I → IV, IV → V, V → I, ii → V are the "engine" of tonal harmony. The
 *    descending-fifths backbone (ii → V → I) resolves rooted tritone tension
 *    inside the V chord and underpins essentially all functional progressions
 *    from common-practice through jazz. I → IV opens a plagal motion and ii → V
 *    sets up the dominant. We score these strongest.
 *  - I → V (subdominant-to-dominant launch) and vi → IV (the pop-music
 *    "axis" turn) are also extremely common — same strong tier.
 *  - I → vi (deceptive-adjacent), vi → ii (descending-fifth into the predominant),
 *    IV → I (plagal cadence) are routine but a little less load-bearing → medium.
 *  - Any diatonic-to-diatonic motion not already named gets a mild positive
 *    bias just for staying inside the scale.
 *  - Non-diatonic motion (e.g. bII, bIII as a chord root in a major key, or any
 *    secondary dominant) gets a small negative bias. bII in major is the
 *    Neapolitan — real but rare; everything else here is borrowed / chromatic
 *    and should require strong emission evidence to win.
 *
 * Minor-key handling uses the natural-minor scale degrees with the standard
 * substitution that V is the *major* dominant (harmonic minor), since that's
 * what nearly all real minor-key progressions use for cadences.
 *
 * Same-chord transitions return 0 here — the existing self-transition score
 * (CHORD_PIPELINE.viterbiStay) already handles persistence, and biasing it
 * further would let popular diatonic chords sit forever.
 *
 * State convention note: states are packed as `root*Q + qualityIndex` with
 * Q = QUALITY_CONFIG.length (currently 5: major, minor, dim, aug, sus4).
 * Only major and minor triads receive a key-aware boost — exotic qualities
 * (dim/aug/sus4) already pay an emission penalty and shouldn't be promoted
 * by progression priors. They simply receive 0.
 */
const KEY_PRIOR_TRANSITION_MIN_CONFIDENCE = 0.22
const KEY_TRANSITION_STRONG = 0.04
const KEY_TRANSITION_MEDIUM = 0.02
const KEY_TRANSITION_MILD = 0.008
const KEY_TRANSITION_NON_DIATONIC = -0.02

/** Pitch-class offsets (relative to tonic) of the major scale, used for diatonic membership. */
const MAJOR_SCALE_OFFSETS = [0, 2, 4, 5, 7, 9, 11] as const
/** Natural-minor scale offsets relative to tonic. (Raised-7 is handled via the V boost below.) */
const MINOR_SCALE_OFFSETS = [0, 2, 3, 5, 7, 8, 10] as const

/**
 * Scale-degree role of a chord (root pitch class + quality) in a key.
 * Returns null when the root is not in the diatonic scale.
 *
 * Encoded role values:
 *   major key: 1M, 4M, 5M, 6m, 2m, 3m, 7d (diatonic qualities)
 *   minor key: 1m, 4m, 5M (raised-7 leading-tone V), 6M, 3M, 7M, 2d
 *
 * We accept "close enough" qualities (e.g. a major V over a 5d in pure natural minor)
 * because real harmonic-minor V is what most songs play.
 */
function diatonicRole(
  rootPc: number,
  quality: ChordQuality,
  keyRootPc: number,
  keyMode: 'major' | 'minor',
): string | null {
  if (quality !== 'major' && quality !== 'minor') return null
  const degreePc = (rootPc - keyRootPc + 12) % 12
  if (keyMode === 'major') {
    // Major-key diatonic triad qualities by scale degree:
    // I major (0), ii minor (2), iii minor (4), IV major (5), V major (7), vi minor (9), vii° (11, dim — skipped above).
    if (degreePc === 0 && quality === 'major') return 'I'
    if (degreePc === 2 && quality === 'minor') return 'ii'
    if (degreePc === 4 && quality === 'minor') return 'iii'
    if (degreePc === 5 && quality === 'major') return 'IV'
    if (degreePc === 7 && quality === 'major') return 'V'
    if (degreePc === 9 && quality === 'minor') return 'vi'
    // Diatonic root but wrong quality (e.g. ii as major, IV as minor) is borrowed — not pure diatonic.
    if (MAJOR_SCALE_OFFSETS.includes(degreePc as typeof MAJOR_SCALE_OFFSETS[number])) return 'diatonic'
    return null
  }
  // Minor key
  // i minor (0), ii° (2), III major (3), iv minor (5), v minor / V major (7), VI major (8), VII major (10).
  if (degreePc === 0 && quality === 'minor') return 'i'
  if (degreePc === 3 && quality === 'major') return 'III'
  if (degreePc === 5 && quality === 'minor') return 'iv'
  if (degreePc === 7 && quality === 'major') return 'V' // harmonic-minor V
  if (degreePc === 7 && quality === 'minor') return 'v'
  if (degreePc === 8 && quality === 'major') return 'VI'
  if (degreePc === 10 && quality === 'major') return 'VII'
  if (MINOR_SCALE_OFFSETS.includes(degreePc as typeof MINOR_SCALE_OFFSETS[number])) return 'diatonic'
  return null
}

function keyRelativeTransitionLogProb(
  prevState: number,
  nextState: number,
  keyPrior: EstimatedKey | undefined,
): number {
  if (prevState < 0 || prevState === nextState) return 0
  if (!keyPrior || keyPrior.mode === 'unknown' || keyPrior.rootPc < 0) return 0
  if (keyPrior.confidence < KEY_PRIOR_TRANSITION_MIN_CONFIDENCE) return 0
  const a = unpackChordState(prevState)
  const b = unpackChordState(nextState)
  // Only major/minor triads carry progression-theory weight here.
  if ((a.quality !== 'major' && a.quality !== 'minor') ||
      (b.quality !== 'major' && b.quality !== 'minor')) return 0
  const roleA = diatonicRole(a.rootPc, a.quality, keyPrior.rootPc, keyPrior.mode)
  const roleB = diatonicRole(b.rootPc, b.quality, keyPrior.rootPc, keyPrior.mode)
  if (roleA === null || roleB === null) return KEY_TRANSITION_NON_DIATONIC

  if (keyPrior.mode === 'major') {
    // Strong functional motions.
    if (roleA === 'I' && roleB === 'IV') return KEY_TRANSITION_STRONG
    if (roleA === 'IV' && roleB === 'V') return KEY_TRANSITION_STRONG
    if (roleA === 'V' && roleB === 'I') return KEY_TRANSITION_STRONG
    if (roleA === 'I' && roleB === 'V') return KEY_TRANSITION_STRONG
    if (roleA === 'ii' && roleB === 'V') return KEY_TRANSITION_STRONG
    if (roleA === 'vi' && roleB === 'IV') return KEY_TRANSITION_STRONG
    // Medium-strength routine moves.
    if (roleA === 'I' && roleB === 'vi') return KEY_TRANSITION_MEDIUM
    if (roleA === 'vi' && roleB === 'ii') return KEY_TRANSITION_MEDIUM
    if (roleA === 'IV' && roleB === 'I') return KEY_TRANSITION_MEDIUM
  } else {
    // Minor-key analogs: i-iv-V-i is the workhorse.
    if (roleA === 'i' && roleB === 'iv') return KEY_TRANSITION_STRONG
    if (roleA === 'iv' && roleB === 'V') return KEY_TRANSITION_STRONG
    if (roleA === 'V' && roleB === 'i') return KEY_TRANSITION_STRONG
    if (roleA === 'i' && roleB === 'V') return KEY_TRANSITION_STRONG
    if (roleA === 'VI' && roleB === 'iv') return KEY_TRANSITION_STRONG // minor-key "axis" turn
    if (roleA === 'i' && roleB === 'VI') return KEY_TRANSITION_MEDIUM
    if (roleA === 'VI' && roleB === 'III') return KEY_TRANSITION_MEDIUM
    if (roleA === 'iv' && roleB === 'i') return KEY_TRANSITION_MEDIUM
    if (roleA === 'III' && roleB === 'VII') return KEY_TRANSITION_MEDIUM
  }

  // Both chords diatonic but no named functional move — mild positive bias.
  return KEY_TRANSITION_MILD
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
        const sc = dp[p]! + transitionBonus(p, s) + keyRelativeTransitionLogProb(p, s, keyPrior)
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

/* ──────────────────────────────────────────────────────────────────────────── */
/* Chord label parsing — used by AI POLISH to apply LLM-suggested corrections.
 *
 * The engine's quality vocabulary is intentionally small ({major, minor, dim,
 * aug, sus4}) because Viterbi decodes over those five buckets. The LLM may
 * suggest 7ths, 9ths, sus2, etc; we map those down to the closest triad so
 * the segment's (rootPc, quality) stays decodable by the rest of the
 * pipeline. The original (richer) label is kept verbatim in `displayLabel`
 * for the progression-text and panel rendering. */

/** Pitch-class lookup for `parseChordLabel`. Supports # / b accidentals and
 *  the Unicode ♯ / ♭ glyphs the LLM occasionally emits. */
const ROOT_PC_LOOKUP: Record<string, number> = {
  C: 0, 'C#': 1, 'C♯': 1, Db: 1, 'D♭': 1,
  D: 2, 'D#': 3, 'D♯': 3, Eb: 3, 'E♭': 3,
  E: 4, Fb: 4, 'F♭': 4,
  F: 5, 'F#': 6, 'F♯': 6, Gb: 6, 'G♭': 6,
  G: 7, 'G#': 8, 'G♯': 8, Ab: 8, 'A♭': 8,
  A: 9, 'A#': 10, 'A♯': 10, Bb: 10, 'B♭': 10,
  B: 11, Cb: 11, 'C♭': 11,
}

/**
 * Parse a chord label like "F#m", "Cmaj7", "G7", "Dsus4", "F#m7♭5" into
 * `{ rootPc, quality, displayLabel }`. Returns `null` if the label can't be
 * tokenised (unknown root, garbled suffix). The `displayLabel` is the original
 * input — callers can store it on the segment so the panel renders the
 * suggested label as-typed (e.g. "Cmaj7") even when `quality` collapses to
 * `'major'` for the engine.
 */
export function parseChordLabel(
  label: string,
): { rootPc: number; quality: ChordQuality; displayLabel: string } | null {
  const trimmed = label.trim()
  if (!trimmed) return null

  /* Root parse: try the two-char form first (handles C#, Db, F♯, G♭), fall
   * back to the single-letter form. */
  let rootEnd = 0
  let rootPc = -1
  if (trimmed.length >= 2) {
    const two = trimmed.slice(0, 2)
    if (two in ROOT_PC_LOOKUP) {
      rootPc = ROOT_PC_LOOKUP[two]!
      rootEnd = 2
    }
  }
  if (rootPc < 0) {
    const one = trimmed.slice(0, 1)
    if (one in ROOT_PC_LOOKUP) {
      rootPc = ROOT_PC_LOOKUP[one]!
      rootEnd = 1
    }
  }
  if (rootPc < 0) return null

  /* Quality parse: walk a few prefix patterns. Order matters — check the
   * longest matches first so "min7" doesn't get caught by "m". */
  const suffix = trimmed.slice(rootEnd).toLowerCase().replace(/\s+/g, '')
  let quality: ChordQuality
  if (
    suffix.startsWith('m7b5') ||
    suffix.startsWith('m7♭5') ||
    suffix.startsWith('dim7') ||
    suffix.startsWith('°7') ||
    suffix.startsWith('dim') ||
    suffix.startsWith('°')
  ) {
    quality = 'dim'
  } else if (suffix.startsWith('aug') || suffix.startsWith('+')) {
    quality = 'aug'
  } else if (suffix.startsWith('sus4') || suffix.startsWith('sus2') || suffix === 'sus') {
    /* Engine has no sus2; collapse to sus4 (closest available triad). */
    quality = 'sus4'
  } else if (
    /* Minor families: m, min, m7, m9, m11, m13, mmaj7 (rare), m6 — all map to
     * the minor triad for engine purposes. The leading "m" must NOT be followed
     * by "aj" (that would be major). */
    /^m(?!aj)/.test(suffix) ||
    suffix.startsWith('min') ||
    suffix.startsWith('-') /* jazz shorthand: C- = Cm */
  ) {
    quality = 'minor'
  } else {
    /* Default: major. Catches "", "maj7", "M7", "7", "9", "add9", "6", etc.
     * The chord MIDI export will use a major triad; the rich label is kept on
     * the segment so the user still sees "Cmaj7" in the progression text. */
    quality = 'major'
  }

  return { rootPc, quality, displayLabel: trimmed }
}

/**
 * Apply a batch of LLM-suggested label changes to a segments array. Returns a
 * new array; the input is never mutated. Corrections that reference an
 * out-of-range `segmentIndex` or carry an unparseable `suggestedLabel` are
 * silently dropped so a single bad row can't kill the rest of the batch.
 *
 * Used by AI POLISH's APPLY button — see `ToolsChordDetectorPage.tsx`.
 */
export function applyChordCorrections(
  segments: readonly ChordSegment[],
  corrections: ReadonlyArray<{ segmentIndex: number; suggestedLabel: string }>,
): ChordSegment[] {
  const next = segments.map(s => ({ ...s }))
  for (const c of corrections) {
    if (c.segmentIndex < 0 || c.segmentIndex >= next.length) continue
    const parsed = parseChordLabel(c.suggestedLabel)
    if (!parsed) continue
    const seg = next[c.segmentIndex]!
    seg.label = parsed.displayLabel
    seg.rootPc = parsed.rootPc
    seg.quality = parsed.quality
  }
  return next
}

/**
 * Parse a key label like "F# major", "C minor", "Bb minor" into an
 * `EstimatedKey` suitable for `result.estimatedKey`. Returns `null` if the
 * label can't be tokenised. Confidence is set to 1 (LLM is asserting, not
 * estimating) — callers that want a softer signal can override after.
 */
export function parseKeyLabel(label: string): EstimatedKey | null {
  const trimmed = label.trim()
  if (!trimmed) return null
  const lower = trimmed.toLowerCase()
  const mode: 'major' | 'minor' = /\bminor\b|\bmin\b|\bm\b/.test(lower) ? 'minor' : 'major'
  /* Strip the mode word(s) and any trailing punctuation, then parse what's
   * left as a root note. */
  const rootPart = trimmed
    .replace(/(major|minor|maj|min|m)\b/gi, '')
    .trim()
    .split(/\s+/)[0]
  if (!rootPart) return null
  const rootPc = ROOT_PC_LOOKUP[rootPart] ?? ROOT_PC_LOOKUP[rootPart.slice(0, 2)] ?? ROOT_PC_LOOKUP[rootPart.slice(0, 1)] ?? -1
  if (rootPc < 0) return null
  return {
    rootPc,
    mode,
    confidence: 1,
    label: `${TONIC_SHARP[rootPc]} ${mode}`,
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

    /* Per the v2 pipeline brief — cap analysis at the first 60 seconds. This
     * bounds runtime + memory for the multi-pass (register-stratified) BP
     * + source-separation + CQT-validation stack added in this revision, and
     * matches the export contract: the three-track MIDI also covers the
     * first 60 s of the source. */
    const maxSec = 60
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

    /* Phase-test bypass flags — see `resolveBypassFlags` above. Used by the
     * benchmark harness to A/B individual stages; the UI exposes a single
     * "RAW MODE" toggle that sets `analysisMode: 'raw'` to bypass everything. */
    const bypass = resolveBypassFlags(options)

    // ── v2 Stage 0 — source separation. The active separator is resolved
    // through the registry (`getActiveSeparator`) so the user can swap
    // between HPSS, Open-Unmix UMX-L, or SCNet small via a localStorage
    // key (`chord-detector-separator`) without an engine change. When the
    // bypass flag is set (raw mode or `skipHpss: true`) we feed the mono
    // through untouched.
    let harmonicMono: Float32Array
    if (bypass.hpss) {
      harmonicMono = mono
    } else {
      const separator = getActiveSeparator()
      const out = await separator.isolateHarmonic(mono, sr)
      harmonicMono = out
    }

    // ── Basic Pitch lead notes (TensorFlow.js) → chord evidence + key histogram ─
    // Now uses the register-stratified multi-pass: BP is invoked three times
    // with thresholds tuned per register (high/mid/bass), then deduped. Replaces
    // the single-pass call. See `chord-detector-register-pass.ts`.
    const mono22050 = await resampleMonoTo22050(harmonicMono, sr)
    const maxBpSamples = Math.floor(maxSec * 22050)
    const monoBp = mono22050.length > maxBpSamples ? mono22050.slice(0, maxBpSamples) : mono22050
    const basicPitchInput: Partial<NeuralNoteBasicPitchDecode> | undefined =
      !isPianoLeadFocusMode(options)
        ? { ...PIANO_LEAD_RELAXED_BASIC_PITCH, ...options?.basicPitchDecode }
        : options?.basicPitchDecode
    /* Either run the register-stratified multi-pass (default) OR a single
     * BP pass with the user's chosen (or default) thresholds. The single-pass
     * fallback adapts to the same `{merged, lead, harmony, bass}` shape the
     * downstream code expects — `lead`/`harmony`/`bass` start empty; the
     * post-cleanup register split (around line 1820 below) populates them
     * from the final note list anyway. */
    const registerOutputs = bypass.registerPasses
      ? await (async () => {
          const single = await transcribeMono22050ToLeadNotes(monoBp, basicPitchInput)
          if (!single.ok) {
            throw new Error(`Basic Pitch single-pass failed: ${single.message}`)
          }
          return { merged: single.leadNotes, lead: [], harmony: [], bass: [] }
        })()
      : await transcribeWithRegisterPasses(monoBp, 22050, {
          noteSensitivity: basicPitchInput?.noteSensitivity,
          splitSensitivity: basicPitchInput?.splitSensitivity,
          minNoteDurationMs: basicPitchInput?.minNoteDurationMs,
        })
    if (registerOutputs.merged.length === 0) {
      throw new Error(
        bypass.registerPasses
          ? 'Transcription returned no notes. Single-pass Basic Pitch came back empty. Try a longer clip or check WebGL/WASM is allowed.'
          : 'Transcription returned no notes. All three register passes (high/mid/bass) of Basic Pitch came back empty. Try a longer clip, check WebGL/WASM is allowed, or another browser.',
      )
    }
    /* Legacy code below still expects `bpOut.leadNotes` + a per-pass histogram.
     * Build a back-compat wrapper from the merged multi-pass output so the
     * 14-stage cleanup pipeline downstream works unchanged. The histogram is
     * computed here directly from the merged notes (duration × velocity sum
     * per pitch class, then L2-normalised). */
    const histAccum = new Float64Array(12)
    let histSum = 0
    for (const n of registerOutputs.merged) {
      const pc = ((Math.round(n.midi) % 12) + 12) % 12
      const w = Math.max(0.001, n.durationSec) * Math.max(0.01, n.velocity)
      histAccum[pc] += w
      histSum += w
    }
    const pitchClassHistogramFromBasicPitch =
      histSum > 0 ? Array.from(histAccum, x => x / histSum) : new Array<number>(12).fill(0)
    const leadNotesRaw = registerOutputs.merged
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

    /* Export cleanup chain — 9 stages of merging / outlier rejection / poly
     * thinning / bass-blip debouncing / short-note dropping / RMS refining.
     * Each was added to fix a specific symptom in the past; the bypass flag
     * (set by RAW MODE or the benchmark harness) skips them all so the user
     * sees BP's native output. Skipping the chain also implies skipping the
     * NeuralNote post + onset align + 2nd outlier pass + two-hand cap below
     * — they're part of the same export-shaping bundle. */
    let leadNotes: LeadNote[]
    if (bypass.exportCleanup) {
      /* Minimal-tidy mode: only the final same-pitch merge runs so a held
       * note doesn't export as two fragments. Everything else passes through
       * as BP produced it. */
      leadNotes = mergeAdjacentSamePitchNotes(leadNotesRaw, MIDI_EXPORT_NOTE_MERGE.samePitchMaxGapSec)
      dbgStage('1-merge', leadNotes)
    } else {
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
      /* Bass blip debounce + low-register short-note drop. Earlier attempt
       * to remove these (per first-pass phase test findings) was REVERTED
       * after a full bench run: removing them did not improve bass F1
       * (still 0 % in the cleanup-enabled lean config) and dropping HPSS +
       * CQT in the same change tanked overall MP3 F1 from 26 % to 12 %.
       * Bass-killing on this clip seems to come from a different stage
       * deeper in the chain (`enforceTwoHandPianoPolyphony` is a likely
       * suspect — it caps both hands). Investigation deferred until a test
       * track with more bass activity makes the signal clearer. */
      leadForMidi = debounceIsolatedBassBlips(leadForMidi, 40, 41, 72, 0.10, 0.08)
      dbgStage('5-debounceBass', leadForMidi)
      leadForMidi = dropLowRegisterNotesShorterThan(leadForMidi, 48, 0.08)
      dbgStage('6-dropLowShort', leadForMidi)
      leadForMidi = dropLeadNotesShorterThan(leadForMidi, MIDI_EXPORT_NOTE_MERGE.minNoteSecAfterMerge)
      dbgStage('7-dropShort', leadForMidi)
      leadNotes = rmsFluxCurve
        ? refineLeadNotesForMidiExport(rmsFluxCurve, leadForMidi, durationSec)
        : leadForMidi
      dbgStage('8-rmsRefine', leadNotes)
    }

    /* Register-stratified split — populated lazily AFTER the full cleanup
     * pipeline finishes. Each final note is bucketed by its midi range:
     *   midi ≥ 60   → leadTrack    (C4 and above — melody)
     *   midi 48..59 → harmonyTrack (mid voicings)
     *   midi < 48   → bassTrack    (sustained low end)
     * This way the 3 separate MIDI exports use the post-cleanup data (matches
     * the unified leadNotes export exactly when you concat them). */
    let registerSplit: { lead: LeadNote[]; harmony: LeadNote[]; bass: LeadNote[] } | null = null

    if (!bypass.exportCleanup) {
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
    }
    /* v2 Stage CQT — drop notes that don't have actual energy in the audio at
     * their reported (pitch, time) coordinates. Catches BP's false positives
     * that the heuristic cleanup stages cannot tell apart from real notes.
     * Runs on the harmonic-stem audio at the source rate (not 22050) — the
     * higher rate gives the CQT better pitch resolution for low notes. */
    if (!bypass.cqt) {
      const cqtResult = validateNotesAgainstCQT(leadNotes, harmonicMono, sr)
      leadNotes = cqtResult.kept
      dbgStage('13.5-cqtValidate', leadNotes)
    }

    /* Part 3 — stage 14: bar-loop detection + 2nd-pass structuring (re-snap starts,
     * quantize note lengths, trim loop-seam straddlers). The loop info is found
     * via TWO methods now: the new audio-onset cross-correlation (subagent E)
     * and the legacy bar-fingerprint Jaccard. We pick whichever has the higher
     * confidence — they're often complementary (audio catches grooves where BP
     * notes are too noisy; notes catch melodic loops where the audio onset
     * envelope is too uniform).
     *
     * Loop detection still runs even when structure is skipped — the result
     * is used by the AUDIT panel + the EXTRACT LOOP button independent of
     * structuring. Only the `structureLeadNotes` rewrite is gated. */
    const audioLoop = detectLoopFromAudio(harmonicMono, sr, bpm)
    const noteLoop = detectBarLoop(leadNotes, bpm, durationSec)
    const loop = audioLoop.found && audioLoop.confidence > noteLoop.confidence ? audioLoop : noteLoop
    if (!bypass.structure) {
      leadNotes = structureLeadNotes(leadNotes, loop, bpm)
      dbgStage('14-structure', leadNotes)
    }
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

    /* Stage 14.5 — chord-implied note inference. CHANGED 2026-05: default
     * flipped from ON to OFF on the audio path. The synthesised chord-tones
     * were adding notes that didn't exist in the source — hallucinations
     * that polluted the MIDI export. Opt in explicitly with
     * `options.inferChordTones === true` if you want chord-fill from
     * detected chord labels. Bypass flag from RAW MODE / benchmark harness
     * also forces OFF. */
    if (!bypass.chordImply) {
      leadNotes = inferChordImpliedNotes({ leadNotes, segments, estimatedKey, bpm })
      dbgStage('14.5-chordImply', leadNotes)
    }

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

    /* Stage 15 (loop-consensus consolidation) is no longer auto-applied. The result
     * carries the full-length stream — what you see is what the pipeline produced.
     * The UI exposes an EXTRACT LOOP button that derives the canonical P-bar window
     * on demand via `consolidateToLoop(...)`. The audit and loop info are still
     * computed and carried in the result for the panels. */
    if (loop.found) dbgStage('15-loopConsensus', consolidateToLoop(leadNotes, loop, bpm))

    /* Three-track split — bucket each final note by midi range. The thresholds
     * intentionally match the register-pass BP boundaries so a note that came
     * from the BASS pass (midi < 48) lands in the bass track, etc. Each note
     * appears in exactly one track; concatenating the three reconstructs the
     * full leadNotes exactly. */
    registerSplit = { lead: [], harmony: [], bass: [] }
    for (const n of leadNotes) {
      const m = Math.round(n.midi)
      if (m < 48) registerSplit.bass.push(n)
      else if (m < 60) registerSplit.harmony.push(n)
      else registerSplit.lead.push(n)
    }
    const leadTrack = registerSplit.lead
    const harmonyTrack = registerSplit.harmony
    const bassTrack = registerSplit.bass

    return {
      bpm,
      bpmSource,
      durationSec,
      beats: smoothed,
      segments,
      inputType: 'audio',
      pitchClassHistogram,
      estimatedKey,
      uniqueChordCount,
      beatTimesSec,
      downbeatTimesSec,
      leadNotes,
      leadTrack,
      harmonyTrack,
      bassTrack,
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
