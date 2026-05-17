/**
 * Audio-onset-based loop detection for the chord detector.
 *
 * Pure module: takes the raw mono audio + tempo, computes a spectral-flux onset
 * envelope, and finds the loop period by normalized auto-correlation of that
 * envelope at musically meaningful lags (1, 2, 4, 8, 16 bars).
 *
 * Why: BP-transcribed note fingerprints vary per iteration on real audio, so the
 * Jaccard-based loop detector in `chord-detector-loops.ts` underreports loops. The
 * audio-domain detector here keys off perceptual onsets — exact note identities
 * don't matter, only that the same energy pattern recurs — so it stays robust
 * across BP variance.
 *
 * Output shape is identical to `LoopInfo` from `chord-detector-loops.ts` so
 * callers can swap or combine the two detectors uniformly.
 */

import type { LoopInfo } from './chord-detector-loops'

/** FFT size for the onset STFT — 1024 ~ 46 ms at 22050 Hz, plenty for onset detection. */
const FFT_SIZE = 1024
/** Hop size — 256 ~ 11.6 ms at 22050 Hz, fine enough to localize drum hits. */
const HOP_SIZE = 256
/** Default candidate loop lengths in bars, smallest first (the fundamental wins ties). */
const DEFAULT_CANDIDATE_BARS = [1, 2, 4, 8, 16] as const
/** Default minimum normalized cross-correlation to accept a loop. */
const DEFAULT_MIN_CONFIDENCE = 0.4

/**
 * Detect a loop in `mono` by auto-correlating its spectral-flux onset envelope.
 *
 * Returns the `LoopInfo` shape from `chord-detector-loops.ts`. `barCount` is the
 * loop length in bars (4/4 at `bpm`); `confidence` is the normalized
 * cross-correlation at the winning lag (0..1, higher = stronger repeat).
 */
export function detectLoopFromAudio(
  mono: Float32Array,
  sampleRate: number,
  bpm: number,
  options?: {
    candidateBars?: readonly number[]
    minConfidence?: number
  },
): LoopInfo {
  const candidates = options?.candidateBars ?? DEFAULT_CANDIDATE_BARS
  const minConfidence = options?.minConfidence ?? DEFAULT_MIN_CONFIDENCE

  const barSec = 4 * (60 / bpm)
  const audioSec = mono.length / sampleRate
  const totalBars = Math.max(0, Math.floor(audioSec / barSec))

  const empty: LoopInfo = {
    found: false,
    barCount: 0,
    repeats: 0,
    confidence: 0,
    barSec,
    totalBars,
  }

  if (mono.length < FFT_SIZE * 2 || bpm <= 0 || sampleRate <= 0) return empty

  // 1. Spectral-flux onset envelope.
  const env = computeOnsetEnvelope(mono)
  if (env.length < 4) return empty

  // 2. For each candidate period, compute normalized cross-correlation at the
  //    corresponding lag (in onset-envelope samples).
  const framesPerSec = sampleRate / HOP_SIZE
  let bestPeriod = 0
  let bestConf = 0
  for (const periodBars of candidates) {
    const lagSec = periodBars * barSec
    const lagFrames = Math.round(lagSec * framesPerSec)
    if (lagFrames < 1) continue
    // Need at least two full periods of envelope to evaluate this lag.
    if (2 * lagFrames > env.length) continue
    const conf = normalizedXCorr(env, lagFrames)
    if (conf > bestConf) {
      bestConf = conf
      bestPeriod = periodBars
    }
  }

  if (bestPeriod === 0 || bestConf < minConfidence) {
    return { ...empty, confidence: bestConf }
  }

  const repeats = totalBars > 0 ? Math.floor(totalBars / bestPeriod) : 0
  return {
    found: true,
    barCount: bestPeriod,
    repeats,
    confidence: bestConf,
    barSec,
    totalBars,
  }
}

// -----------------------------------------------------------------------------
// Onset envelope: STFT → magnitude → spectral flux → smooth.
// -----------------------------------------------------------------------------

/**
 * Spectral-flux onset envelope for `mono`. Returns one sample per STFT frame.
 *
 * Spectral flux = Σ max(0, |X_t[k]| - |X_{t-1}[k]|) — the half-wave-rectified
 * sum of magnitude increases across frequency bins. Peaks where new energy
 * appears, which lines up with note/drum onsets.
 */
function computeOnsetEnvelope(mono: Float32Array): Float32Array {
  const n = mono.length
  if (n < FFT_SIZE) return new Float32Array(0)
  const frameCount = 1 + Math.floor((n - FFT_SIZE) / HOP_SIZE)
  if (frameCount < 2) return new Float32Array(0)

  const window = hannWindow(FFT_SIZE)
  const half = FFT_SIZE / 2
  const re = new Float32Array(FFT_SIZE)
  const im = new Float32Array(FFT_SIZE)
  const prevMag = new Float32Array(half)
  const curMag = new Float32Array(half)
  const flux = new Float32Array(frameCount)

  for (let f = 0; f < frameCount; f++) {
    const start = f * HOP_SIZE
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = mono[start + i] * window[i]
      im[i] = 0
    }
    fftRadix2(re, im)
    for (let k = 0; k < half; k++) {
      curMag[k] = Math.hypot(re[k], im[k])
    }
    if (f === 0) {
      flux[0] = 0
    } else {
      let sum = 0
      for (let k = 0; k < half; k++) {
        const d = curMag[k] - prevMag[k]
        if (d > 0) sum += d
      }
      flux[f] = sum
    }
    prevMag.set(curMag)
  }

  // Light 3-tap moving-average smoothing.
  return movingAverage3(flux)
}

function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size)
  const denom = size - 1
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / denom))
  }
  return w
}

function movingAverage3(x: Float32Array): Float32Array {
  const n = x.length
  if (n < 3) return x.slice()
  const out = new Float32Array(n)
  out[0] = (x[0] + x[1]) / 2
  out[n - 1] = (x[n - 2] + x[n - 1]) / 2
  for (let i = 1; i < n - 1; i++) {
    out[i] = (x[i - 1] + x[i] + x[i + 1]) / 3
  }
  return out
}

// -----------------------------------------------------------------------------
// FFT: in-place radix-2 Cooley-Tukey, length must be a power of two.
// -----------------------------------------------------------------------------

/**
 * In-place radix-2 Cooley-Tukey FFT. `re` and `im` are the real and imaginary
 * parts respectively; length must be a power of two. After the call they hold
 * the complex spectrum (positive and negative frequencies; the caller takes
 * magnitudes from the first N/2 bins).
 */
function fftRadix2(re: Float32Array, im: Float32Array): void {
  const n = re.length
  if (n <= 1) return
  // Bit-reverse permutation.
  let j = 0
  for (let i = 1; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) {
      j ^= bit
    }
    j ^= bit
    if (i < j) {
      let tr = re[i]
      re[i] = re[j]
      re[j] = tr
      tr = im[i]
      im[i] = im[j]
      im[j] = tr
    }
  }
  // Butterflies.
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1
    const ang = (-2 * Math.PI) / len
    const wReStep = Math.cos(ang)
    const wImStep = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let wRe = 1
      let wIm = 0
      for (let k = 0; k < half; k++) {
        const aRe = re[i + k]
        const aIm = im[i + k]
        const bRe = re[i + k + half] * wRe - im[i + k + half] * wIm
        const bIm = re[i + k + half] * wIm + im[i + k + half] * wRe
        re[i + k] = aRe + bRe
        im[i + k] = aIm + bIm
        re[i + k + half] = aRe - bRe
        im[i + k + half] = aIm - bIm
        const nextRe = wRe * wReStep - wIm * wImStep
        wIm = wRe * wImStep + wIm * wReStep
        wRe = nextRe
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Normalized cross-correlation.
// -----------------------------------------------------------------------------

/**
 * Normalized cross-correlation of `env` against itself shifted by `lag` samples.
 *
 * Σ env[i] * env[i+lag] / sqrt(Σ env[i]^2 · Σ env[i+lag]^2), summed over the
 * valid overlap (i in [0, len - lag)). Returns 0 if either window has zero
 * energy. The numerator is the cross-energy; the denominator is the geometric
 * mean of the two windows' energies, so the result is bounded in [-1, 1] and is
 * 1 only when the two windows are scalar multiples of each other.
 */
function normalizedXCorr(env: Float32Array, lag: number): number {
  const len = env.length
  const overlap = len - lag
  if (overlap <= 0) return 0
  let num = 0
  let energyA = 0
  let energyB = 0
  for (let i = 0; i < overlap; i++) {
    const a = env[i]
    const b = env[i + lag]
    num += a * b
    energyA += a * a
    energyB += b * b
  }
  const denom = Math.sqrt(energyA * energyB)
  if (denom <= 0) return 0
  return num / denom
}
