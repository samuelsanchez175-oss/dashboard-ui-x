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

/**
 * Return a Float32Array that owns a fresh, byte-zero-offset ArrayBuffer.
 *
 * Some browsers (e.g. recent Chrome on certain platforms) return the channel
 * data from `OfflineAudioContext` as a *view* into a larger backing buffer —
 * non-zero `byteOffset`, or `byteLength < buffer.byteLength`. TFJS then runs
 * `new Int32Array(buffer)` on that underlying buffer during inference, and
 * if its total length isn't divisible by 4 it throws
 *   "byte length of Int32Array should be a multiple of 4".
 *
 * Copying into a freshly-allocated Float32Array guarantees byteOffset === 0
 * and byteLength === length * 4 (always a multiple of 4). Cheap insurance.
 */
function ensureAlignedFloat32(arr: Float32Array): Float32Array {
  if (arr.byteOffset === 0 && arr.byteLength === arr.buffer.byteLength) return arr
  const out = new Float32Array(arr.length)
  out.set(arr)
  return out
}

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
  if (sourceSampleRate === TARGET_SR) return ensureAlignedFloat32(mono)
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
  /* Always own the buffer we hand to TFJS — see ensureAlignedFloat32 docstring. */
  return ensureAlignedFloat32(rendered.getChannelData(0))
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
 * Clip note durations so MIDI playback sounds clean.
 *
 * Basic Pitch is good at detecting onsets but its note-OFF detection is weaker —
 * sustained or repeated tones often come out as a single long note instead of a
 * sequence of articulated notes. On playback, consecutive same-pitch notes then
 * blend into one held tone ("bleed"), which is technically inaccurate to the
 * source audio.
 *
 * Two safeguards, in order:
 *   1. Same-pitch release gap — if the next note of the same pitch starts before
 *      this one would naturally release, clip this note to end with a small gap
 *      before that re-attack. Distinct articulations stay distinct on playback.
 *   2. Absolute duration cap — clamp any note longer than `maxDurationSec`. Catches
 *      held-forever tones the model failed to release at all.
 *
 * Defaults favor clean playback over absolute sustain fidelity; raise
 * `maxDurationSec` if you want longer musical sustains preserved.
 */
function clipDurationsForCleanPlayback(
  notes: readonly LeadNote[],
  {
    releaseGapSec = 0.04, // 40 ms — short enough to be musically invisible, long enough to register as a release
    maxDurationSec = 0.4, // ~quarter-note at 150 BPM; aggressive enough to break up bleed
  }: { releaseGapSec?: number; maxDurationSec?: number } = {},
): LeadNote[] {
  if (notes.length === 0) return []

  /* Group by rounded pitch and pre-sort so each note can find its same-pitch
   * successor in O(log n) via the sorted lane (linear scan is plenty fast at
   * typical clip sizes — we keep it simple). */
  const byPitch = new Map<number, LeadNote[]>()
  for (const n of notes) {
    const m = Math.round(n.midi)
    let arr = byPitch.get(m)
    if (!arr) {
      arr = []
      byPitch.set(m, arr)
    }
    arr.push(n)
  }
  for (const arr of byPitch.values()) arr.sort((a, b) => a.startSec - b.startSec)

  return notes.map(n => {
    const lane = byPitch.get(Math.round(n.midi))!
    /* Next note in the same pitch lane that starts strictly after this one. */
    let nextStart: number | null = null
    for (const x of lane) {
      if (x.startSec > n.startSec) {
        nextStart = x.startSec
        break
      }
    }
    let dur = n.durationSec
    if (nextStart != null) {
      const allowedEnd = nextStart - releaseGapSec
      if (n.startSec + dur > allowedEnd) {
        /* Clip; never below 1/128 sec so the note is still audible on playback. */
        dur = Math.max(1 / 128, allowedEnd - n.startSec)
      }
    }
    if (dur > maxDurationSec) dur = maxDurationSec
    return { ...n, durationSec: dur }
  })
}

/**
 * Run Basic Pitch on mono audio already at 22050 Hz. Caller trims duration caps.
 * @param basicPitchDecode — partial overrides of `NEURALNOTE_STYLE.basicPitch`.
 *
 * NOTE (chord-detector-midi-export-debug, Bug 3): high-shelf pre-emphasis on the input
 * was tried here to recover high notes — it did not (max pitch unchanged, total notes
 * slightly down), so it was reverted. BP's high-register ceiling on a given source is
 * input/model-bounded; the export pipeline is verified to preserve every high note BP
 * does detect.
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

    /* Defensive: a misaligned mono22050 (non-zero byteOffset or buffer-trailing bytes)
     * is what causes TFJS to throw "byte length of Int32Array should be a multiple of 4".
     * resampleMonoTo22050() already aligns its output, but callers may construct
     * mono22050 elsewhere — copy if needed, cheap. */
    const audio = ensureAlignedFloat32(mono22050)

    await pitchModel.evaluateModel(
      audio,
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
     * the beat-level chord blend (engine's `leadNotesRaw`). Then clip durations so
     * consecutive same-pitch notes don't bleed into one held tone on playback. */
    const leadNotes = clipDurationsForCleanPlayback(
      dropSemitoneFlatOnsetShadows(leadNotesRaw),
    )

    /* DEV-only: expose the true pre-filter BP output so the MIDI-debug harness can
     * tell whether the ghost filter (vs Basic Pitch itself) thins the high register. */
    if (import.meta.env.DEV) {
      ;(globalThis as unknown as { __bpRawNotes?: unknown }).__bpRawNotes = leadNotesRaw.map(n => ({ ...n }))
    }

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
