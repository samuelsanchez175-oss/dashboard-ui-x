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

    const leadNotes: LeadNote[] = timed.map(n => ({
      midi: n.pitchMidi,
      startSec: n.startTimeSeconds,
      durationSec: Math.max(1 / 128, n.durationSeconds),
      velocity: Math.max(0.08, Math.min(1, n.amplitude)),
    }))

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
