/**
 * NeuralNote-inspired defaults (see DamRsn/NeuralNote sources — we do **not**
 * run the JUCE plugin). Mirrored where applicable:
 * - `NeuralNote/Source/ParameterHelpers.h` — note / split sensitivity, min note duration (ms), MIDI range
 * - `Lib/Model/BasicPitchConstants.h` — 22050 Hz, FFT hop 256 → frame length for min duration
 * - Chord detector UI defaults: finest time grid (1/64), quant force 1, time quant on, min note 120 ms
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
    /**
     * `NOTE_SENSITIVITY` default 0.7 (range 0.05–0.95 in NeuralNote). → `frameThresh = 1 − this` in Spotify decode.
     * Held at 0.565: iter 2 (chord-detector-tuning-log) raised this to 0.72 to try to recover
     * the missing E, but BP found zero E at either setting — the extra sensitivity only added
     * ghost density and more sus4 ambiguity (composite 34 → 39). Reverted.
     */
    noteSensitivity: 0.565,
    /**
     * `SPLIT_SENSITIVITY` (NeuralNote default 0.5 → `onsetThresh = 1 − this`).
     * **Lower** than 0.5 = higher `onsetThresh` = fewer onset splits (reduces BP over-segmentation in TF.js).
     * Lowered 0.26 → 0.12 (iter 3, chord-detector-tuning-log): raises `onsetThresh` to ~0.88 so
     * spurious onsets — the source of the E♯/F♮ ghost notes — need a stronger transient to register.
     */
    splitSensitivity: 0.12,
    /**
     * `MINIMUM_NOTE_DURATION` (NeuralNote default 125 ms). **Raised** here so `minNoteLen` frames
     * filter tiny hops before our merge/RMS pass; UI can override via `basicPitchDecode`.
     * Held at 205: iter 2 lowered this to 120 alongside the sensitivity bump; reverted with it.
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
    /** On with POST by default so QUANT FORCE / TIME GRID affect output (NN desktop defaults this off). */
    timeQuantizeEnabled: true,
    /**
     * Quantize grid = straight 1/16 (its 1/16-triplet sibling is always also a snap target).
     * Was the finest division (1/64): too fine to land notes on musical positions, so the
     * export read as "off-grid" in a DAW (docs/chord-detector-midi-export-debug.md, Bug 1).
     */
    timeDivisionIndex: NEURALNOTE_TIME_DIVISION_FRACS.indexOf(1 / 16),
    /**
     * 0 = no snap, 1 = full hard snap onto the grid. Was 1 (full force), which
     * killed the organic syncopation real performances have — every onset got
     * dragged onto the 1/16/triplet grid, then `structureLeadNotes` re-snapped
     * them again. Dropped to 0.3: notes shift ~30 % toward the nearest grid
     * line, enough to remove BP decode jitter (~5–15 ms) without flattening
     * intentional off-grid placement. Compare the reference Logic Pro export
     * of "frank ocean acura girl" (bars 3-4) — its notes sit clearly off the
     * grid even with Logic's quantize set to 1/16 + triplet @ strength 100.
     */
    quantizeForce: 0.3,
    /**
     * POST-stage minimum length (ms); UI slider "MIN NOTE (POST)".
     * Was 120 ms — at 65 BPM that's a 1/16 (231 ms) floor for the lower bound,
     * but 1/32 fragments (~115 ms at 65 BPM) get padded up to 120, distorting
     * rapid melody passages. Dropped to 50 ms so 1/32 and even 1/64 articulations
     * survive intact; BP rarely emits durations under ~30 ms so this stays above
     * the noise floor.
     */
    minNoteDurationMs: 50,
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
 * Signed circular-mean phase of note onsets against a grid of step `gridSec`.
 * Returns where the music's own grid sits relative to t=0, in [-gridSec/2, gridSec/2).
 * Circular mean so onsets straddling the wrap boundary still average correctly — this
 * is what lets the quantizer find the real downbeat instead of assuming bar 1 = t=0.
 */
function circularGridPhaseSec(notes: readonly LeadNote[], gridSec: number): number {
  if (notes.length === 0 || !(gridSec > 0)) return 0
  let sx = 0
  let sy = 0
  for (const n of notes) {
    const theta = ((((n.startSec % gridSec) + gridSec) % gridSec) / gridSec) * 2 * Math.PI
    sx += Math.cos(theta)
    sy += Math.sin(theta)
  }
  let phase = (Math.atan2(sy, sx) / (2 * Math.PI)) * gridSec
  if (phase >= gridSec / 2) phase -= gridSec
  if (phase < -gridSec / 2) phase += gridSec
  return phase
}

/**
 * Snap `t` to the nearest line of EITHER phase-anchored grid (`gridA` or `gridB`),
 * blended by `force` (1 = full snap). Mirrors a DAW "1/16 & 1/16-triplet" quantize:
 * straight 16ths and 16th-triplets are both valid targets, nearest wins.
 */
function snapToDualGrid(t: number, phaseSec: number, gridA: number, gridB: number, force: number): number {
  const snapOne = (g: number): number => (g > 0 ? phaseSec + Math.round((t - phaseSec) / g) * g : t)
  const a = snapOne(gridA)
  const b = snapOne(gridB)
  const target = Math.abs(t - a) <= Math.abs(t - b) ? a : b
  return t + (target - t) * Math.max(0, Math.min(1, force))
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

  if (qf > 0 && Number.isFinite(bpm) && bpm >= 1) {
    /*
     * Quantize to a MUSICAL grid (the selected division + its triplet sibling), phase-
     * aligned to the music's own downbeat, then shift so that downbeat lands on t=0 — a
     * DAW-import-ready bar grid.
     *
     * Replaces a t=0-anchored single-division snap: at the finest division (1/64) that
     * snap was too fine to land notes on musical positions, and anchoring at t=0 baked
     * in the music's lead-in offset (see docs/chord-detector-midi-export-debug.md, Bug 1).
     */
    const secondsPerQn = 60 / bpm
    const gridPrimary = divFrac * 4 * secondsPerQn
    const gridTriplet = gridPrimary * (2 / 3)
    const phase = circularGridPhaseSec(working, gridPrimary)
    working = working.map(n => ({
      ...n,
      startSec: Math.max(0, snapToDualGrid(n.startSec, phase, gridPrimary, gridTriplet, qf) - phase),
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
      const start = n.startSec
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
