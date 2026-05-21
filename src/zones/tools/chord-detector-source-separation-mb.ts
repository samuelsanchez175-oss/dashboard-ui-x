/**
 * Phase 2 — multi-band HPSS source separation.
 *
 * The existing single-band HPSS in `chord-detector-source-separation.ts`
 * applies one median-filter kernel size across the entire spectrum. That's
 * a compromise: a kernel large enough to track sustained low-frequency
 * fundamentals (~100 Hz, periods ~10 frames) over-smooths high-frequency
 * transients (~5 kHz, where ~3 frames is plenty). This module splits the
 * spectrum into three bands and runs HPSS with band-specific kernels.
 *
 * Bands:
 *   - LOW (≤ 300 Hz):   harmonic filter 25 frames (sustained bass notes;
 *                       the lower the fundamental, the longer it needs to
 *                       be "stationary" to register as harmonic)
 *   - MID (300-2 kHz):  harmonic filter 17 frames (default — matches the
 *                       existing single-band HPSS)
 *   - HIGH (> 2 kHz):   harmonic filter 11 frames (transients in this
 *                       band are usually percussive — we want a tighter
 *                       filter so cymbal hits don't leak into the
 *                       harmonic stem)
 *
 * Phase 2 was originally planned around a neural model (Open-Unmix /
 * SCNet); since model files can't be reliably acquired in this
 * environment, we implement the next-best thing: smarter classical DSP.
 * If this gives a meaningful F1 lift, the model-based path may not be
 * needed at all. If it doesn't, the registry pattern in
 * `chord-detector-source-separation.ts` still leaves the ONNX route open.
 *
 * Status: separated module so the original single-band HPSS stays
 * unchanged for back-compat. Registered in the registry as
 * `hpss-multiband`; users opt in via
 * `localStorage.setItem('chord-detector-separator', 'hpss-multiband')` or
 * the engine `bassSource`/separator path.
 */

const DEFAULT_FFT_SIZE = 2048
const DEFAULT_HOP_SIZE = 512
const EPS = 1e-10

/** Per-band median-filter config. */
export const MULTIBAND_HPSS = {
  /** Cutoff (Hz) between LOW and MID bands. */
  cutoffLowMid: 300,
  /** Cutoff (Hz) between MID and HIGH bands. */
  cutoffMidHigh: 2000,
  /** Harmonic-filter kernel (time axis, frames) for the LOW band. */
  harmonicLow: 25,
  /** Harmonic-filter kernel for the MID band (matches single-band default). */
  harmonicMid: 17,
  /** Harmonic-filter kernel for the HIGH band. */
  harmonicHigh: 11,
  /** Percussive filter (frequency axis) stays constant across bands. */
  percussive: 17,
} as const

/**
 * Multi-band HPSS — apply a different harmonic-filter kernel per frequency
 * band. The percussive filter stays single-band because it operates along
 * the frequency axis (within a single time frame) and doesn't have the
 * same "longer note = wider kernel needed" trade-off.
 */
export function isolateHarmonicMultiband(
  mono: Float32Array,
  sampleRate: number,
  options?: { fftSize?: number; hopSize?: number },
): Float32Array {
  const fftSize = nextPow2(options?.fftSize ?? DEFAULT_FFT_SIZE)
  const hopSize = options?.hopSize ?? DEFAULT_HOP_SIZE

  const rawInputLength = mono.length
  if (rawInputLength === 0) return new Float32Array(0)

  /* Warmup silence so the median filter sees real pre-music context at
   * frame 0 — same idea as the original HPSS. We pad by the LARGEST
   * harmonic kernel (LOW band) so all three filter sizes have enough
   * lookback. */
  const harmonicLow = oddPositive(MULTIBAND_HPSS.harmonicLow)
  const warmupFrames = harmonicLow >> 1
  const warmupSamples = warmupFrames * hopSize
  const inputMono = warmupSamples > 0
    ? (() => {
        const w = new Float32Array(warmupSamples + rawInputLength)
        w.set(mono, warmupSamples)
        return w
      })()
    : mono
  const inputLength = inputMono.length

  const window = hannWindow(fftSize)
  const pad = fftSize >> 1
  const padded = new Float32Array(inputLength + fftSize)
  padded.set(inputMono, pad)

  const numFrames = 1 + Math.floor((padded.length - fftSize) / hopSize)
  const numBins = (fftSize >> 1) + 1

  const real = new Float32Array(numBins * numFrames)
  const imag = new Float32Array(numBins * numFrames)
  const mag = new Float32Array(numBins * numFrames)

  /* STFT. */
  const twiddleCos = new Float32Array(fftSize >> 1)
  const twiddleSin = new Float32Array(fftSize >> 1)
  for (let k = 0; k < fftSize >> 1; k++) {
    const ang = (-2 * Math.PI * k) / fftSize
    twiddleCos[k] = Math.cos(ang)
    twiddleSin[k] = Math.sin(ang)
  }
  const frameRe = new Float32Array(fftSize)
  const frameIm = new Float32Array(fftSize)
  for (let f = 0; f < numFrames; f++) {
    const offset = f * hopSize
    for (let n = 0; n < fftSize; n++) {
      frameRe[n] = (padded[offset + n] ?? 0) * window[n]!
      frameIm[n] = 0
    }
    fftRadix2InPlace(frameRe, frameIm, twiddleCos, twiddleSin)
    for (let k = 0; k < numBins; k++) {
      const re = frameRe[k]!
      const im = frameIm[k]!
      const idx = k * numFrames + f
      real[idx] = re
      imag[idx] = im
      mag[idx] = Math.sqrt(re * re + im * im)
    }
  }

  /* Band partitioning by frequency bin. */
  const binHz = sampleRate / fftSize
  const cutoffLowMidBin = Math.min(numBins - 1, Math.round(MULTIBAND_HPSS.cutoffLowMid / binHz))
  const cutoffMidHighBin = Math.min(numBins - 1, Math.round(MULTIBAND_HPSS.cutoffMidHigh / binHz))

  /* Harmonic estimate: median along TIME, per band. */
  const harmonic = new Float32Array(mag.length)
  medianFilterAlongTimeRange(
    mag,
    harmonic,
    /* binStart */ 0,
    /* binEnd */ cutoffLowMidBin,
    numFrames,
    oddPositive(MULTIBAND_HPSS.harmonicLow),
  )
  medianFilterAlongTimeRange(
    mag,
    harmonic,
    cutoffLowMidBin,
    cutoffMidHighBin,
    numFrames,
    oddPositive(MULTIBAND_HPSS.harmonicMid),
  )
  medianFilterAlongTimeRange(
    mag,
    harmonic,
    cutoffMidHighBin,
    numBins,
    numFrames,
    oddPositive(MULTIBAND_HPSS.harmonicHigh),
  )

  /* Percussive estimate: median along FREQUENCY. Single band — percussive
   * spectral profile is similar across the spectrum. */
  const percussive = medianFilterAlongFreq(mag, numBins, numFrames, oddPositive(MULTIBAND_HPSS.percussive))

  /* Wiener-style soft mask, applied to the original complex STFT. */
  for (let i = 0; i < real.length; i++) {
    const h2 = harmonic[i]! * harmonic[i]!
    const p2 = percussive[i]! * percussive[i]!
    const mask = h2 / (h2 + p2 + EPS)
    real[i]! *= mask
    imag[i]! *= mask
  }

  /* ISTFT. */
  const output = new Float32Array(padded.length)
  const windowSum = new Float32Array(padded.length)
  const ifftRe = new Float32Array(fftSize)
  const ifftIm = new Float32Array(fftSize)
  for (let f = 0; f < numFrames; f++) {
    for (let k = 0; k < numBins; k++) {
      const idx = k * numFrames + f
      ifftRe[k] = real[idx]!
      ifftIm[k] = imag[idx]!
    }
    for (let k = 1; k < numBins - 1; k++) {
      const mirror = fftSize - k
      ifftRe[mirror] = ifftRe[k]!
      ifftIm[mirror] = -ifftIm[k]!
    }
    if (fftSize > 1) {
      ifftIm[0] = 0
      ifftIm[numBins - 1] = 0
    }
    ifftRadix2InPlace(ifftRe, ifftIm, twiddleCos, twiddleSin)
    const offset = f * hopSize
    for (let n = 0; n < fftSize; n++) {
      const w = window[n]!
      output[offset + n]! += ifftRe[n]! * w
      windowSum[offset + n]! += w * w
    }
  }
  for (let i = 0; i < output.length; i++) {
    if (windowSum[i]! > EPS) output[i]! /= windowSum[i]!
  }

  /* Strip the FFT-centring pad AND the warmup silence. */
  const trimOffset = pad + warmupSamples
  const result = new Float32Array(rawInputLength)
  for (let i = 0; i < rawInputLength; i++) result[i] = output[i + trimOffset] ?? 0
  return result
}

/* ──────────────────────────────────────────────────────────────────────────── */
/* DSP helpers. */

function hannWindow(n: number): Float32Array {
  const w = new Float32Array(n)
  if (n === 1) {
    w[0] = 1
    return w
  }
  const denom = n - 1
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / denom)
  }
  return w
}

function nextPow2(n: number): number {
  let p = 1
  while (p < n) p <<= 1
  return p
}

function oddPositive(n: number): number {
  const v = Math.max(1, Math.floor(n))
  return v % 2 === 1 ? v : v + 1
}

/**
 * Median filter each row (frequency bin) along the TIME axis, RANGE
 * variant — only rows in [binStart, binEnd). Writes into `out` at the
 * same indices, so multiple non-overlapping calls combine to cover the
 * full spectrum with band-specific kernel sizes.
 */
function medianFilterAlongTimeRange(
  mag: Float32Array,
  out: Float32Array,
  binStart: number,
  binEnd: number,
  numFrames: number,
  size: number,
): void {
  const half = size >> 1
  const buf = new Float32Array(size)
  for (let b = binStart; b < binEnd; b++) {
    const rowOffset = b * numFrames
    /* Interior — no boundary checks. */
    for (let t = half; t < numFrames - half; t++) {
      const base = rowOffset + t - half
      for (let k = 0; k < size; k++) buf[k] = mag[base + k]!
      out[rowOffset + t] = medianInPlace(buf)
    }
    /* Edges with reflect padding. */
    for (let t = 0; t < Math.min(half, numFrames); t++) {
      for (let k = 0; k < size; k++) {
        const tt = clampReflect(t + k - half, numFrames)
        buf[k] = mag[rowOffset + tt]!
      }
      out[rowOffset + t] = medianInPlace(buf)
    }
    for (let t = Math.max(half, numFrames - half); t < numFrames; t++) {
      for (let k = 0; k < size; k++) {
        const tt = clampReflect(t + k - half, numFrames)
        buf[k] = mag[rowOffset + tt]!
      }
      out[rowOffset + t] = medianInPlace(buf)
    }
  }
}

function medianFilterAlongFreq(
  mag: Float32Array,
  numBins: number,
  numFrames: number,
  size: number,
): Float32Array {
  const out = new Float32Array(mag.length)
  const half = size >> 1
  const buf = new Float32Array(size)
  for (let t = 0; t < numFrames; t++) {
    for (let b = 0; b < numBins; b++) {
      for (let k = 0; k < size; k++) {
        const bb = clampReflect(b + k - half, numBins)
        buf[k] = mag[bb * numFrames + t]!
      }
      out[b * numFrames + t] = medianInPlace(buf)
    }
  }
  return out
}

function clampReflect(i: number, n: number): number {
  if (n <= 1) return 0
  let v = i
  while (v < 0 || v >= n) {
    if (v < 0) v = -v
    if (v >= n) v = 2 * (n - 1) - v
  }
  return v
}

function medianInPlace(buf: Float32Array): number {
  const a = Array.from(buf)
  a.sort((x, y) => x - y)
  return a[a.length >> 1]!
}

function fftRadix2InPlace(
  re: Float32Array,
  im: Float32Array,
  twiddleCos: Float32Array,
  twiddleSin: Float32Array,
): void {
  const n = re.length
  let j = 0
  for (let i = 1; i < n; i++) {
    let bit = n >> 1
    for (; (j & bit) !== 0; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j]!, re[i]!]
      ;[im[i], im[j]] = [im[j]!, im[i]!]
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1
    const step = n / size
    for (let i = 0; i < n; i += size) {
      let twIdx = 0
      for (let k = i; k < i + half; k++) {
        const tcos = twiddleCos[twIdx]!
        const tsin = twiddleSin[twIdx]!
        const xr = re[k + half]! * tcos - im[k + half]! * tsin
        const xi = re[k + half]! * tsin + im[k + half]! * tcos
        re[k + half] = re[k]! - xr
        im[k + half] = im[k]! - xi
        re[k] = re[k]! + xr
        im[k] = im[k]! + xi
        twIdx += step
      }
    }
  }
}

function ifftRadix2InPlace(
  re: Float32Array,
  im: Float32Array,
  twiddleCos: Float32Array,
  twiddleSin: Float32Array,
): void {
  for (let i = 0; i < im.length; i++) im[i] = -im[i]!
  fftRadix2InPlace(re, im, twiddleCos, twiddleSin)
  const inv = 1 / re.length
  for (let i = 0; i < re.length; i++) {
    re[i]! *= inv
    im[i] = -im[i]! * inv
  }
}
