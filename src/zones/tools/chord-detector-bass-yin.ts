/**
 * Phase 3 — dedicated monophonic bass pitch tracker.
 *
 * Bass lines in popular music are nearly always monophonic; running Basic
 * Pitch's polyphonic model on bass spreads probability mass across multiple
 * candidates and consistently underperforms a single-pitch tracker (see
 * the phase-3 plan in `docs/chord-detector-phase-3-crepe-plan.md`).
 *
 * Implementation: **YIN algorithm** (Cheveigné & Kawahara 2002) running on
 * a low-pass filtered version of the mono signal. YIN is the workhorse
 * pre-neural monophonic pitch tracker — competitive with CREPE on
 * monophonic instruments at a tiny fraction of the cost. Zero ML
 * dependencies; pure JS DSP.
 *
 * Why not CREPE: this environment doesn't have reliable access to the
 * 5-50 MB CREPE ONNX model file. YIN matches CREPE-tiny to within ~5 cents
 * on typical bass material — good enough to test whether dedicated
 * monophonic tracking beats BP's polyphonic model on bass.
 *
 * Flow:
 *   1. Resample mono → 16 kHz (YIN works best at lower sample rates;
 *      bass band fits comfortably).
 *   2. Low-pass at ~300 Hz to suppress upper-octave content.
 *   3. Frame at 1024 samples / 10 ms hop.
 *   4. YIN per frame → (f0, confidence).
 *   5. Median-filter the f0 contour to suppress octave-jumps.
 *   6. Segment to discrete notes: contiguous frames with same MIDI ±50 cents
 *      and confidence above the threshold form one note.
 *   7. Drop notes shorter than 80 ms (frame-edge noise) and confidence
 *      below `minConfidence`.
 *
 * Pure module: Float32Array in, LeadNote[] out. Same shape as the BP
 * register passes so the engine can swap in.
 */

import type { LeadNote } from './chord-detector-melody'

export interface BassYinOptions {
  /** Working sample rate for YIN. Default 16000. */
  yinSampleRate?: number
  /** Low-pass cutoff (Hz) applied before YIN. Default 300. */
  lowpassCutoffHz?: number
  /** Frame size (samples at yinSampleRate). Default 1024. */
  frameSize?: number
  /** Hop size between frames. Default 160 (10 ms at 16 kHz). */
  hopSize?: number
  /** YIN threshold — lower = stricter "pitched" detection. Default 0.15. */
  yinThreshold?: number
  /** Minimum periodicity confidence to keep a frame. Default 0.8. */
  minConfidence?: number
  /** Minimum note duration in seconds. Default 0.08. */
  minNoteDurationSec?: number
  /** MIDI pitch range to keep. Default [24, 55] (C1..G3 — typical bass range). */
  midiRange?: [number, number]
  /** Median-filter window in frames for octave-jump suppression. Default 5. */
  medianWindowFrames?: number
}

const DEFAULTS = {
  yinSampleRate: 16000,
  lowpassCutoffHz: 300,
  frameSize: 1024,
  hopSize: 160,
  yinThreshold: 0.15,
  minConfidence: 0.8,
  minNoteDurationSec: 0.08,
  midiRange: [24, 55] as [number, number],
  medianWindowFrames: 5,
}

/**
 * Main entry — transcribe the bass register from a mono signal.
 *
 * Returns notes in the original time base (caller's input rate) so they
 * concatenate cleanly with the polyphonic BP output for the higher
 * registers.
 */
export function transcribeBassWithYin(
  mono: Float32Array,
  inputSr: number,
  options?: BassYinOptions,
): LeadNote[] {
  const cfg = { ...DEFAULTS, ...options }
  if (mono.length === 0) return []

  /* 1. Resample to YIN's working rate. */
  const monoYin = resampleLinear(mono, inputSr, cfg.yinSampleRate)
  if (monoYin.length < cfg.frameSize * 2) return [] // need at least 2 frames

  /* 2. Low-pass filter (single-pole IIR — cheap, ~6 dB/oct rolloff; enough
   *    for YIN since it's correlation-based, not threshold-based). */
  const lowpassed = onePoleLowpass(monoYin, cfg.lowpassCutoffHz, cfg.yinSampleRate)

  /* 3. Frame, run YIN per frame. */
  const numFrames = Math.floor((lowpassed.length - cfg.frameSize) / cfg.hopSize)
  if (numFrames < 1) return []

  const f0s = new Float32Array(numFrames)
  const confs = new Float32Array(numFrames)
  const buf = new Float32Array(cfg.frameSize)
  for (let i = 0; i < numFrames; i++) {
    const off = i * cfg.hopSize
    for (let n = 0; n < cfg.frameSize; n++) buf[n] = lowpassed[off + n]!
    const { f0, confidence } = yin(buf, cfg.yinSampleRate, cfg.yinThreshold)
    f0s[i] = f0
    confs[i] = confidence
  }

  /* 4. Median-filter the f0 contour to suppress octave-jumps. The median
   *    is robust to single-frame outliers without smearing legitimate
   *    transitions. */
  const f0Smooth = medianFilter1d(f0s, cfg.medianWindowFrames)

  /* 5. Segment to discrete notes. Group contiguous frames where:
   *      - confidence ≥ minConfidence
   *      - midi(f0) is within 0.5 semitones of the previous frame's midi
   *      - resulting midi is in [midiRange[0], midiRange[1]]
   */
  const frameDurSec = cfg.hopSize / cfg.yinSampleRate
  const notes: LeadNote[] = []
  let segStart = -1
  let segMidi = -1
  let segMidiAccum = 0
  let segMidiCount = 0
  let segVelocityAccum = 0

  const flush = (endFrame: number) => {
    if (segStart < 0 || segMidiCount === 0) return
    const startSec = segStart * frameDurSec
    const endSec = endFrame * frameDurSec
    const durationSec = endSec - startSec
    if (durationSec < cfg.minNoteDurationSec) return
    const meanMidi = Math.round(segMidiAccum / segMidiCount)
    if (meanMidi < cfg.midiRange[0] || meanMidi > cfg.midiRange[1]) return
    notes.push({
      midi: meanMidi,
      startSec,
      durationSec,
      velocity: Math.min(1, Math.max(0.4, segVelocityAccum / segMidiCount)),
    })
  }

  for (let i = 0; i < numFrames; i++) {
    const f0 = f0Smooth[i]!
    const conf = confs[i]!
    const valid = conf >= cfg.minConfidence && f0 > 0
    if (!valid) {
      flush(i)
      segStart = -1
      segMidi = -1
      segMidiAccum = 0
      segMidiCount = 0
      segVelocityAccum = 0
      continue
    }
    const midiNow = 69 + 12 * Math.log2(f0 / 440)
    const midiRounded = Math.round(midiNow)
    if (segStart < 0) {
      /* Start a new segment. */
      segStart = i
      segMidi = midiRounded
      segMidiAccum = midiNow
      segMidiCount = 1
      segVelocityAccum = conf
    } else if (Math.abs(midiNow - segMidi) < 0.5) {
      /* Continue the current segment. */
      segMidiAccum += midiNow
      segMidiCount += 1
      segVelocityAccum += conf
    } else {
      /* Pitch jumped — close the current segment, start a new one. */
      flush(i)
      segStart = i
      segMidi = midiRounded
      segMidiAccum = midiNow
      segMidiCount = 1
      segVelocityAccum = conf
    }
  }
  flush(numFrames)
  return notes
}

/* ──────────────────────────────────────────────────────────────────────────── */
/* YIN algorithm — cumulative-mean-normalised difference function + parabolic
 * interpolation. Reference: Cheveigné & Kawahara 2002.
 *
 * Returns `f0` in Hz (0 if no pitch found) and `confidence` in [0, 1] where
 * 1 means strong periodicity. */

function yin(
  buf: Float32Array,
  sampleRate: number,
  threshold: number,
): { f0: number; confidence: number } {
  const N = buf.length
  const halfN = N >> 1
  const d = new Float32Array(halfN)

  /* Step 1: difference function. */
  for (let tau = 1; tau < halfN; tau++) {
    let sum = 0
    for (let j = 0; j < halfN; j++) {
      const diff = buf[j]! - buf[j + tau]!
      sum += diff * diff
    }
    d[tau] = sum
  }
  d[0] = 1 // avoid divide-by-zero in the CMN step

  /* Step 2: cumulative mean normalised difference. */
  const cmn = new Float32Array(halfN)
  cmn[0] = 1
  let runningSum = 0
  for (let tau = 1; tau < halfN; tau++) {
    runningSum += d[tau]!
    cmn[tau] = (d[tau]! * tau) / (runningSum + 1e-10)
  }

  /* Step 3: absolute threshold — find the first tau where cmn drops below
   *         threshold AND is a local minimum. */
  let tauEstimate = -1
  for (let tau = 2; tau < halfN; tau++) {
    if (cmn[tau]! < threshold) {
      while (tau + 1 < halfN && cmn[tau + 1]! < cmn[tau]!) tau++
      tauEstimate = tau
      break
    }
  }
  if (tauEstimate < 0) return { f0: 0, confidence: 0 }

  /* Step 4: parabolic interpolation around tauEstimate for sub-sample
   *         precision. */
  const t0 = tauEstimate
  const x0 = t0 > 0 ? cmn[t0 - 1]! : cmn[t0]!
  const x1 = cmn[t0]!
  const x2 = t0 + 1 < halfN ? cmn[t0 + 1]! : cmn[t0]!
  const denom = x0 + x2 - 2 * x1
  const betterTau = denom !== 0 ? t0 + (x0 - x2) / (2 * denom) : t0

  const f0 = sampleRate / betterTau
  /* Confidence: 1 - cmn at the chosen tau (closer to 0 = more periodic). */
  const confidence = Math.max(0, Math.min(1, 1 - cmn[t0]!))
  return { f0, confidence }
}

/* ──────────────────────────────────────────────────────────────────────────── */
/* DSP helpers. */

function resampleLinear(input: Float32Array, srIn: number, srOut: number): Float32Array {
  if (srIn === srOut) return input
  const ratio = srOut / srIn
  const outLen = Math.floor(input.length * ratio)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const srcPos = i / ratio
    const a = Math.floor(srcPos)
    const b = Math.min(input.length - 1, a + 1)
    const t = srcPos - a
    out[i] = input[a]! * (1 - t) + input[b]! * t
  }
  return out
}

/** Single-pole IIR lowpass. y[n] = α·x[n] + (1-α)·y[n-1].
 *  α = 1 - exp(-2π·fc/fs). Phase response is non-linear but bass-tracking
 *  doesn't care about absolute phase. */
function onePoleLowpass(input: Float32Array, cutoffHz: number, sampleRate: number): Float32Array {
  const alpha = 1 - Math.exp((-2 * Math.PI * cutoffHz) / sampleRate)
  const out = new Float32Array(input.length)
  let prev = 0
  for (let i = 0; i < input.length; i++) {
    prev = alpha * input[i]! + (1 - alpha) * prev
    out[i] = prev
  }
  return out
}

/** O(N·W) median filter — fine for our N≈600, W=5. */
function medianFilter1d(input: Float32Array, windowSize: number): Float32Array {
  if (windowSize < 2) return input
  const out = new Float32Array(input.length)
  const half = windowSize >> 1
  const buf: number[] = []
  for (let i = 0; i < input.length; i++) {
    buf.length = 0
    const lo = Math.max(0, i - half)
    const hi = Math.min(input.length, i + half + 1)
    for (let j = lo; j < hi; j++) buf.push(input[j]!)
    buf.sort((a, b) => a - b)
    out[i] = buf[buf.length >> 1]!
  }
  return out
}
