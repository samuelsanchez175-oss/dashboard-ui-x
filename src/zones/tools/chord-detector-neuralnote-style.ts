/**
 * NeuralNote-inspired defaults (see DamRsn/NeuralNote sources — we do **not**
 * run the JUCE plugin). Mirrored where applicable:
 * - `NeuralNote/Source/ParameterHelpers.h` — note / split sensitivity, min note duration (ms), MIDI range
 * - `Lib/Model/BasicPitchConstants.h` — 22050 Hz, FFT hop 256 → frame length for min duration
 * - `NeuralNote/Source/ParameterHelpers.h` — time division default index 5 = 1/8, quant force 0
 */

import type { LeadNote } from './chord-detector-melody'

/** Same fractional grid as `TimeQuantizeUtils::TimeDivisionsDouble` (whole-note fraction). */
export const NEURALNOTE_TIME_DIVISION_FRACS = [
  1 / 1,
  1 / 2,
  1 / 3,
  1 / 4,
  1 / 6,
  1 / 8,
  1 / 12,
  1 / 16,
  1 / 24,
  1 / 32,
  1 / 48,
  1 / 64,
] as const

export const NEURALNOTE_TIME_DIVISION_LABELS = [
  '1/1',
  '1/2',
  '1/3',
  '1/4',
  '1/6',
  '1/8',
  '1/12',
  '1/16',
  '1/24',
  '1/32',
  '1/48',
  '1/64',
] as const

/** Single export: NeuralNote-aligned tunables for TF.js Basic Pitch decode + optional melody post. */
export type NeuralNoteBasicPitchDecode = {
  noteSensitivity: number
  splitSensitivity: number
  minNoteDurationMs: number
  minMidiNote: number
  maxMidiNote: number
  inferOnsets: boolean
  melodiaTrick: boolean
}

export type NeuralNoteStyleMelodyPost = {
  enabled: boolean
  timeQuantizeEnabled: boolean
  timeDivisionIndex: number
  quantizeForce: number
  minNoteDurationMs: number
  velocityGain: number
  velocityCompression: number
}

/**
 * Looser Basic Pitch merge when analysis runs with `pianoLeadFocus: false` (denser poly /
 * non-piano sources). Applied before `options.basicPitchDecode` so explicit API overrides win.
 */
export const PIANO_LEAD_RELAXED_BASIC_PITCH: Partial<NeuralNoteBasicPitchDecode> = {
  noteSensitivity: 0.62,
  splitSensitivity: 0.34,
  minNoteDurationMs: 175,
}

export const NEURALNOTE_STYLE: {
  basicPitch: NeuralNoteBasicPitchDecode
  melodyPost: NeuralNoteStyleMelodyPost
} = {
  basicPitch: {
    /** `NOTE_SENSITIVITY` default 0.7 (range 0.05–0.95 in NeuralNote). → `frameThresh = 1 − this` in Spotify decode. */
    noteSensitivity: 0.565,
    /**
     * `SPLIT_SENSITIVITY` (NeuralNote default 0.5 → `onsetThresh = 1 − this`).
     * **Lower** than 0.5 = higher `onsetThresh` = fewer onset splits (reduces BP over-segmentation in TF.js).
     */
    splitSensitivity: 0.26,
    /**
     * `MINIMUM_NOTE_DURATION` (NeuralNote default 125 ms). **Raised** here so `minNoteLen` frames
     * filter tiny hops before our merge/RMS pass; UI can override via `basicPitchDecode`.
     */
    minNoteDurationMs: 205,
    /** `MIN_MIDI_NOTE` / `MAX_MIDI_NOTE` from `BasicPitchConstants.h`. */
    minMidiNote: 21,
    maxMidiNote: 108,
    inferOnsets: true,
    melodiaTrick: true,
  },
  melodyPost: {
    /** Master switch — when false, `applyNeuralNoteStyleLeadNotes` is a no-op. */
    enabled: true,
    /** Snap onsets toward the beat grid (`ENABLE_TIME_QUANTIZATION`, default off in NN). */
    timeQuantizeEnabled: false,
    /** Index into `NEURALNOTE_TIME_DIVISION_FRACS` (NeuralNote default `TimeDivisionId` = 5 → 1/8). */
    timeDivisionIndex: 5,
    /** 0 = natural timing, 1 = full snap (`QUANTIZATION_FORCE` default 0). */
    quantizeForce: 0,
    /** Minimum length in ms after other post steps — slightly above NN BP default for cleaner playable lines. */
    minNoteDurationMs: 132,
    velocityGain: 1.05,
    velocityCompression: 0.1,
  },
}

/** @deprecated Prefer `NEURALNOTE_STYLE.melodyPost` — kept for re-exports and `mergeNeuralNoteStyleMelodyPost`. */
export const NEURALNOTE_STYLE_EXPORT: NeuralNoteStyleMelodyPost = NEURALNOTE_STYLE.melodyPost

export type NeuralNoteStyleMelodyPostInput = Partial<NeuralNoteStyleMelodyPost>

export function mergeNeuralNoteBasicPitchDecode(
  input?: Partial<NeuralNoteBasicPitchDecode>,
): NeuralNoteBasicPitchDecode {
  return { ...NEURALNOTE_STYLE.basicPitch, ...input }
}

export function mergeNeuralNoteStyleMelodyPost(
  input?: NeuralNoteStyleMelodyPostInput,
): NeuralNoteStyleMelodyPost {
  return { ...NEURALNOTE_STYLE_EXPORT, ...input }
}

/** Maps `NEURALNOTE_STYLE.basicPitch` → arguments for `@spotify/basic-pitch` `outputToNotesPoly`. */
export function getBasicPitchOutputToNotesPolyParams(bp: NeuralNoteBasicPitchDecode): {
  onsetThresh: number
  frameThresh: number
  minNoteLen: number
  inferOnsets: boolean
  minFreq: number
  maxFreq: number
  melodiaTrick: boolean
} {
  const midiToHz = (m: number): number => 440 * 2 ** ((m - 69) / 12)
  const fftHopSec = 256 / 22050
  return {
    onsetThresh: 1 - bp.splitSensitivity,
    frameThresh: 1 - bp.noteSensitivity,
    minNoteLen: Math.max(1, Math.round(bp.minNoteDurationMs / 1000 / fftHopSec)),
    inferOnsets: bp.inferOnsets,
    minFreq: midiToHz(bp.minMidiNote),
    maxFreq: midiToHz(bp.maxMidiNote + 1),
    melodiaTrick: bp.melodiaTrick,
  }
}

/**
 * NeuralNote `TimeQuantizeOptions::_quantizeTime` for file-origin analysis: playhead refs are zeroed
 * (`fileLoaded`), so `startPosQn` is 0 — grid anchored at t=0.
 */
export function quantizeLeadStartSec(
  eventTimeSec: number,
  bpm: number,
  timeDivisionFrac: number,
  quantizationForce: number,
  startPosQn = 0,
): number {
  if (quantizationForce <= 0 || !(eventTimeSec >= 0) || !Number.isFinite(bpm) || bpm < 1) return eventTimeSec
  const secondsPerQn = 60 / bpm
  const divisionDuration = timeDivisionFrac * 4 * secondsPerQn
  if (!(divisionDuration > 0)) return eventTimeSec

  const newTimeOrigin = startPosQn * secondsPerQn
  const shiftedTime = eventTimeSec + newTimeOrigin
  const mod = ((shiftedTime % divisionDuration) + divisionDuration) % divisionDuration
  const previousDivisionTime = shiftedTime - mod
  const targetTime =
    mod < divisionDuration / 2 ? previousDivisionTime : previousDivisionTime + divisionDuration
  const quantizedShifted = shiftedTime + (targetTime - shiftedTime) * quantizationForce
  return quantizedShifted - newTimeOrigin
}

function clampDivisionIndex(i: number): number {
  if (!Number.isFinite(i)) return NEURALNOTE_STYLE.melodyPost.timeDivisionIndex
  return Math.max(0, Math.min(NEURALNOTE_TIME_DIVISION_FRACS.length - 1, Math.floor(i)))
}

function scaleVelocity(v: number, gain: number, compression: number): number {
  let x = v * gain
  if (compression > 0) {
    const mid = 0.5
    x = mid + (x - mid) * (1 - compression * 0.95)
  }
  return Math.max(0.05, Math.min(1, x))
}

/**
 * Apply optional time quantize, minimum duration, and velocity shaping.
 * Min-duration and overlap repair run **per rounded MIDI pitch** so polyphonic
 * chords are not serialized or clipped against other pitches.
 * Notes should already pass through `refineLeadNotesForMidiExport` when that path is available.
 */
export function applyNeuralNoteStyleLeadNotes(
  notes: readonly LeadNote[],
  bpm: number,
  fullDurationSec: number,
  input?: NeuralNoteStyleMelodyPostInput,
): LeadNote[] {
  const o = mergeNeuralNoteStyleMelodyPost(input)
  if (!o.enabled || notes.length === 0) return notes.map(n => ({ ...n }))

  const divFrac = NEURALNOTE_TIME_DIVISION_FRACS[clampDivisionIndex(o.timeDivisionIndex)]!
  const minSec = Math.max(0, o.minNoteDurationMs / 1000)
  const qf = o.timeQuantizeEnabled ? Math.max(0, Math.min(1, o.quantizeForce)) : 0

  let working: LeadNote[] = notes.map(n => ({
    midi: Math.round(n.midi),
    startSec: n.startSec,
    durationSec: Math.max(1e-4, n.durationSec),
    velocity: scaleVelocity(n.velocity, o.velocityGain, o.velocityCompression),
  }))

  if (qf > 0) {
    working = working.map(n => ({
      ...n,
      startSec: Math.max(0, quantizeLeadStartSec(n.startSec, bpm, divFrac, qf, 0)),
    }))
  }

  const byMidi = new Map<number, LeadNote[]>()
  for (const n of working) {
    let arr = byMidi.get(n.midi)
    if (!arr) {
      arr = []
      byMidi.set(n.midi, arr)
    }
    arr.push(n)
  }

  const adjusted: LeadNote[] = []
  for (const lane of byMidi.values()) {
    lane.sort((a, b) => a.startSec - b.startSec || a.durationSec - b.durationSec)

    /* Minimum duration per pitch lane: room ends at the next onset on this pitch only. */
    const laneAdj: LeadNote[] = []
    for (let i = 0; i < lane.length; i++) {
      const n = lane[i]!
      let start = n.startSec
      let end = start + n.durationSec
      const next = lane[i + 1]
      const roomEnd = (next?.startSec ?? fullDurationSec) - 1e-4
      if (minSec > 0 && end - start < minSec) {
        end = Math.min(roomEnd, start + minSec)
      }
      if (end <= start + 1e-4) continue
      laneAdj.push({ ...n, startSec: start, durationSec: end - start })
    }

    /* Same pitch only: shorten if min-duration extension crossed the next onset on this lane. */
    for (let i = 0; i < laneAdj.length - 1; i++) {
      const cur = laneAdj[i]!
      const nx = laneAdj[i + 1]!
      const curEnd = cur.startSec + cur.durationSec
      if (curEnd > nx.startSec - 1e-4) {
        const newDur = Math.max(1e-3, nx.startSec - 1e-3 - cur.startSec)
        laneAdj[i] = { ...cur, durationSec: newDur }
      }
    }

    adjusted.push(...laneAdj)
  }

  adjusted.sort((a, b) => a.startSec - b.startSec || a.midi - b.midi)
  return adjusted
}
