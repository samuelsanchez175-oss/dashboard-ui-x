/**
 * Spotify Basic Pitch (`@spotify/basic-pitch`) in TensorFlow.js — browser transcription for the chord detector.
 *
 * Decode thresholds and min note length follow **NeuralNote** UI defaults where they map to the Python/JS
 * `outputToNotesPoly` contract (`frameThresh = 1 − noteSensitivity`, etc.) — see `chord-detector-neuralnote-style.ts`
 * (`NEURALNOTE_STYLE`). This is **not** the NeuralNote C++/JUCE desktop plugin (no RTNeural / ORT features stack).
 */

import type { LeadNote } from './chord-detector-melody'
import {
  getBasicPitchOutputToNotesPolyParams,
  mergeNeuralNoteBasicPitchDecode,
  type NeuralNoteBasicPitchDecode,
} from './chord-detector-neuralnote-style'

import modelJsonUrl from '@spotify/basic-pitch/model/model.json?url'

const TARGET_SR = 22050

export type BasicPitchTranscription = {
  ok: true
  leadNotes: LeadNote[]
  /** 12-bin histogram from note duration × velocity (for key estimation). */
  pitchClassHistogram: number[]
}

export type BasicPitchFailure = {
  ok: false
  message: string
}

/** Reuse one loaded graph across analyses (warm TF + model once). */
let pitchInstance: import('@spotify/basic-pitch').BasicPitch | null = null
let tfReady: Promise<void> | null = null

async function ensureTfjs(): Promise<void> {
  if (tfReady) return tfReady
  tfReady = (async () => {
    const tf = await import('@tensorflow/tfjs')
    await import('@tensorflow/tfjs-backend-webgl')
    await import('@tensorflow/tfjs-backend-cpu')
    try {
      await tf.setBackend('webgl')
      await tf.ready()
    } catch {
      await tf.setBackend('cpu')
      await tf.ready()
    }
  })()
  return tfReady
}

async function getBasicPitch(): Promise<import('@spotify/basic-pitch').BasicPitch> {
  await ensureTfjs()
  if (!pitchInstance) {
    const { BasicPitch } = await import('@spotify/basic-pitch')
    pitchInstance = new BasicPitch(modelJsonUrl)
  }
  return pitchInstance
}

/**
 * Resample mono PCM to 22050 Hz (Basic Pitch input) using the browser’s
 * built-in resampler via OfflineAudioContext.
 */
export async function resampleMonoTo22050(
  mono: Float32Array,
  sourceSampleRate: number,
): Promise<Float32Array> {
  if (sourceSampleRate === TARGET_SR) return mono
  const durationSec = mono.length / sourceSampleRate
  const outFrames = Math.max(1, Math.ceil(durationSec * TARGET_SR))
  const offline = new OfflineAudioContext(1, outFrames, TARGET_SR)
  const buf = offline.createBuffer(1, mono.length, sourceSampleRate)
  buf.getChannelData(0).set(mono)
  const src = offline.createBufferSource()
  src.buffer = buf
  src.connect(offline.destination)
  src.start(0)
  const rendered = await offline.startRendering()
  return rendered.getChannelData(0)
}

function histogramFromLeadNotes(notes: readonly LeadNote[]): number[] {
  const acc = new Float32Array(12)
  for (const n of notes) {
    const pc = ((Math.round(n.midi) % 12) + 12) % 12
    acc[pc] += Math.max(0, n.durationSec) * Math.max(1e-6, n.velocity)
  }
  const sum = acc.reduce((a, b) => a + b, 0)
  return sum > 0 ? Array.from(acc, x => x / sum) : Array(12).fill(1 / 12)
}

/**
 * Drop short semitone-flat "onset-shadow" ghosts (iter 5, chord-detector-tuning-log).
 *
 * Basic Pitch occasionally spawns a brief note one semitone *below* a longer note that
 * overlaps it in time — a transient artifact of the higher note's attack, not real
 * content. On the control clip this produced 20 stable F4 ghosts (all short, all under
 * F♯4, the most-common note), inflating out-of-key % and completing a phantom F♯-major
 * scale in the key histogram.
 *
 * Conservative on purpose — only drops a note that is (a) short, (b) time-shadowed by a
 * note exactly +1 semitone, and (c) that neighbor is at least as long — so real semitone
 * voicings and melodic passing tones (sequential, not shadowed) are left intact.
 */
function dropSemitoneFlatOnsetShadows(notes: readonly LeadNote[]): LeadNote[] {
  /** Only short notes can be shadows. */
  const MAX_GHOST_SEC = 0.52
  /**
   * The +1-semitone parent may overlap the ghost OR sit within this gap of it.
   * Raw-BP diagnostic (iter 5, chord-detector-tuning-log): the control clip's 20 F4
   * ghosts do **not** overlap their longer F♯4 parent in raw BP output — they abut it
   * with a 0–81 ms gap (the slight overlap only appears later, after the engine's
   * quantise/align pass). So the test is gap-tolerant, not overlap-required.
   */
  const NEAR_SEC = 0.1
  if (notes.length < 2) return notes.map(n => ({ ...n }))
  const byMidi = new Map<number, LeadNote[]>()
  for (const n of notes) {
    const m = Math.round(n.midi)
    let arr = byMidi.get(m)
    if (!arr) {
      arr = []
      byMidi.set(m, arr)
    }
    arr.push(n)
  }
  return notes
    .filter(n => {
      if (n.durationSec >= MAX_GHOST_SEC) return true
      const upper = byMidi.get(Math.round(n.midi) + 1)
      if (!upper) return true
      const nStart = n.startSec
      const nEnd = n.startSec + n.durationSec
      for (const u of upper) {
        if (u.durationSec < n.durationSec) continue
        // gap > 0 → separated; gap <= 0 → overlapping. Drop when within NEAR_SEC.
        const gap = Math.max(nStart - (u.startSec + u.durationSec), u.startSec - nEnd)
        if (gap <= NEAR_SEC) return false
      }
      return true
    })
    .map(n => ({ ...n }))
}

/**
 * Run Basic Pitch on mono audio already at 22050 Hz. Caller trims duration caps.
 * @param basicPitchDecode — partial overrides of `NEURALNOTE_STYLE.basicPitch`.
 */
export async function transcribeMono22050ToLeadNotes(
  mono22050: Float32Array,
  basicPitchDecode?: Partial<NeuralNoteBasicPitchDecode>,
): Promise<BasicPitchTranscription | BasicPitchFailure> {
  try {
    const bpDecode = mergeNeuralNoteBasicPitchDecode(basicPitchDecode)
    const poly = getBasicPitchOutputToNotesPolyParams(bpDecode)

    const pitchModel = await getBasicPitch()
    const { addPitchBendsToNoteEvents, noteFramesToTime, outputToNotesPoly } = await import('@spotify/basic-pitch')

    const framesAgg: number[][] = []
    const onsetsAgg: number[][] = []
    const contoursAgg: number[][] = []

    await pitchModel.evaluateModel(
      mono22050,
      (frames, onsets, contours) => {
        for (const row of frames) framesAgg.push(row)
        for (const row of onsets) onsetsAgg.push(row)
        for (const row of contours) contoursAgg.push(row)
      },
      () => {},
    )

    if (framesAgg.length === 0) {
      return { ok: false, message: 'Basic Pitch returned no frames (audio too short?).' }
    }

    const rawNotes = outputToNotesPoly(
      framesAgg,
      onsetsAgg,
      poly.onsetThresh,
      poly.frameThresh,
      poly.minNoteLen,
      poly.inferOnsets,
      poly.maxFreq,
      poly.minFreq,
      poly.melodiaTrick,
    )
    /* Post–`outputToNotesPoly` merge/drop lives in `chord-detector-engine` + `chord-detector-melody`
     * so beat-level chord blend still uses raw BP events (`leadNotesRaw`). */
    const withBends = addPitchBendsToNoteEvents(contoursAgg, rawNotes)
    const timed = noteFramesToTime(withBends)

    const leadNotesRaw: LeadNote[] = timed.map(n => ({
      midi: n.pitchMidi,
      startSec: n.startTimeSeconds,
      durationSec: Math.max(1 / 128, n.durationSeconds),
      velocity: Math.max(0.08, Math.min(1, n.amplitude)),
    }))
    /* Clean semitone-flat onset-shadow ghosts before they reach the key histogram and
     * the beat-level chord blend (engine's `leadNotesRaw`). */
    const leadNotes = dropSemitoneFlatOnsetShadows(leadNotesRaw)

    return {
      ok: true,
      leadNotes,
      pitchClassHistogram: histogramFromLeadNotes(leadNotes),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: msg || 'Basic Pitch failed.' }
  }
}
