/**
 * Harmonic-Percussive Source Separation (HPSS) — Fitzgerald 2010.
 *
 * Pre-processing pass for the chord detector: median-filter the STFT magnitude
 * to isolate sustained harmonic content (horizontal ridges) from transients
 * (vertical columns), then apply a soft Wiener-style mask and ISTFT back to
 * time domain. Output is mono and the same length as the input.
 *
 * Pure module: Float32Array in, Float32Array out. No DOM, no AudioContext, no
 * external deps. Implements a small in-place radix-2 Cooley–Tukey FFT inline
 * so the whole pass is synchronous and works in workers, audio threads, or
 * straight from the main thread.
 */

export type HpssOptions = {
  fftSize?: number
  hopSize?: number
  /** Median filter length along the TIME axis used to extract harmonic ridges. */
  harmonicFilterSize?: number
  /** Median filter length along the FREQUENCY axis used to extract percussive transients. */
  percussiveFilterSize?: number
}

const DEFAULT_FFT_SIZE = 2048
const DEFAULT_HOP_SIZE = 512
const DEFAULT_HARMONIC_FILTER = 17
const DEFAULT_PERCUSSIVE_FILTER = 17
const EPS = 1e-10

/**
 * Isolate the harmonic component of a mono signal via spectrogram HPSS.
 *
 * Algorithm:
 *  1. STFT (Hann window, 50%–75% overlap).
 *  2. Horizontal median filter on |X| → harmonic estimate H.
 *  3. Vertical median filter on |X|   → percussive estimate P.
 *  4. Soft mask M = H^2 / (H^2 + P^2 + eps).
 *  5. Apply M to the original complex STFT.
 *  6. ISTFT with overlap-add and window-sum normalisation.
 */
export function isolateHarmonicMono(
  mono: Float32Array,
  sampleRate: number,
  options?: HpssOptions,
): Float32Array {
  // sampleRate is intentionally unused by the algorithm itself — HPSS works
  // entirely in frame/bin coordinates. We accept it so the surface matches
  // the rest of the chord-detector modules and to leave room for future
  // sample-rate-aware filter sizes.
  void sampleRate

  const fftSize = nextPow2(options?.fftSize ?? DEFAULT_FFT_SIZE)
  const hopSize = options?.hopSize ?? DEFAULT_HOP_SIZE
  const harmonicFilter = oddPositive(options?.harmonicFilterSize ?? DEFAULT_HARMONIC_FILTER)
  const percussiveFilter = oddPositive(options?.percussiveFilterSize ?? DEFAULT_PERCUSSIVE_FILTER)

  const rawInputLength = mono.length
  if (rawInputLength === 0) return new Float32Array(0)

  /* Warmup: prepend (harmonicFilter / 2) frames of silence so the
   * time-axis median filter sees real pre-music context at the very
   * start of the clip. Without this, the median reflect-pads the first
   * ~8 frames with mirrored future content (see `medianFilterAlongTime`
   * edge handling below), which biases the harmonic / percussive
   * classification of the first notes and lets any drum transient at
   * t=0 leak into the harmonic stem. Stripped before return so the
   * output length matches the input exactly. */
  const warmupFrames = harmonicFilter >> 1
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

  // Pad so the first frame is centred at sample 0 (librosa-style centring).
  const pad = fftSize >> 1
  const padded = new Float32Array(inputLength + fftSize)
  padded.set(inputMono, pad)

  const numFrames = 1 + Math.floor((padded.length - fftSize) / hopSize)
  const numBins = (fftSize >> 1) + 1

  // STFT — store real, imag, and magnitude planes as flat Float32Arrays
  // [bin * numFrames + frame] for cache-friendly column access during the
  // horizontal (time-axis) median.
  const real = new Float32Array(numBins * numFrames)
  const imag = new Float32Array(numBins * numFrames)
  const mag = new Float32Array(numBins * numFrames)

  const frameRe = new Float32Array(fftSize)
  const frameIm = new Float32Array(fftSize)

  const twiddleCos = new Float32Array(fftSize >> 1)
  const twiddleSin = new Float32Array(fftSize >> 1)
  for (let k = 0; k < fftSize >> 1; k++) {
    const angle = (-2 * Math.PI * k) / fftSize
    twiddleCos[k] = Math.cos(angle)
    twiddleSin[k] = Math.sin(angle)
  }

  for (let f = 0; f < numFrames; f++) {
    const offset = f * hopSize
    for (let n = 0; n < fftSize; n++) {
      frameRe[n] = padded[offset + n] * window[n]
      frameIm[n] = 0
    }
    fftRadix2InPlace(frameRe, frameIm, twiddleCos, twiddleSin)
    for (let k = 0; k < numBins; k++) {
      const re = frameRe[k]
      const im = frameIm[k]
      const idx = k * numFrames + f
      real[idx] = re
      imag[idx] = im
      mag[idx] = Math.sqrt(re * re + im * im)
    }
  }

  // Horizontal median (along TIME axis, per frequency bin) → harmonic.
  const harmonic = medianFilterAlongTime(mag, numBins, numFrames, harmonicFilter)
  // Vertical median (along FREQUENCY axis, per frame) → percussive.
  const percussive = medianFilterAlongFreq(mag, numBins, numFrames, percussiveFilter)

  // Wiener-style soft mask, applied to the original complex STFT.
  for (let i = 0; i < real.length; i++) {
    const h2 = harmonic[i] * harmonic[i]
    const p2 = percussive[i] * percussive[i]
    const mask = h2 / (h2 + p2 + EPS)
    real[i] *= mask
    imag[i] *= mask
  }

  // ISTFT with overlap-add and window-sum normalisation.
  const output = new Float32Array(padded.length)
  const windowSum = new Float32Array(padded.length)

  const ifftRe = new Float32Array(fftSize)
  const ifftIm = new Float32Array(fftSize)

  for (let f = 0; f < numFrames; f++) {
    // Reconstruct full Hermitian-symmetric spectrum.
    for (let k = 0; k < numBins; k++) {
      const idx = k * numFrames + f
      ifftRe[k] = real[idx]
      ifftIm[k] = imag[idx]
    }
    for (let k = 1; k < numBins - 1; k++) {
      const mirror = fftSize - k
      ifftRe[mirror] = ifftRe[k]
      ifftIm[mirror] = -ifftIm[k]
    }
    if (fftSize > 1) {
      // Nyquist bin stays real; index 0 already real.
      ifftIm[0] = 0
      ifftIm[numBins - 1] = 0
    }

    ifftRadix2InPlace(ifftRe, ifftIm, twiddleCos, twiddleSin)

    const offset = f * hopSize
    for (let n = 0; n < fftSize; n++) {
      const w = window[n]
      output[offset + n] += ifftRe[n] * w
      windowSum[offset + n] += w * w
    }
  }

  for (let i = 0; i < output.length; i++) {
    const ws = windowSum[i]
    if (ws > EPS) output[i] /= ws
  }

  // Strip the centring pad AND the warmup silence, then trim back to the
  // original input length.
  const result = new Float32Array(rawInputLength)
  const trimOffset = pad + warmupSamples
  for (let i = 0; i < rawInputLength; i++) result[i] = output[i + trimOffset]
  return result
}

// ---------------------------------------------------------------------------
// Window + helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Median filters
// ---------------------------------------------------------------------------

/**
 * Median filter each row (frequency bin) along the TIME axis.
 * mag is laid out as [bin * numFrames + frame]. The fast path skips the
 * reflect-padding helper when the kernel lies fully inside the row.
 */
function medianFilterAlongTime(
  mag: Float32Array,
  numBins: number,
  numFrames: number,
  size: number,
): Float32Array {
  const out = new Float32Array(mag.length)
  const half = size >> 1
  const buf = new Float32Array(size)
  for (let b = 0; b < numBins; b++) {
    const rowOffset = b * numFrames
    // Interior — no boundary checks.
    for (let t = half; t < numFrames - half; t++) {
      const base = rowOffset + t - half
      for (let k = 0; k < size; k++) buf[k] = mag[base + k]
      out[rowOffset + t] = medianInPlace(buf)
    }
    // Edges with reflect padding.
    for (let t = 0; t < Math.min(half, numFrames); t++) {
      for (let k = 0; k < size; k++) {
        const tt = clampReflect(t + k - half, numFrames)
        buf[k] = mag[rowOffset + tt]
      }
      out[rowOffset + t] = medianInPlace(buf)
    }
    for (let t = Math.max(half, numFrames - half); t < numFrames; t++) {
      for (let k = 0; k < size; k++) {
        const tt = clampReflect(t + k - half, numFrames)
        buf[k] = mag[rowOffset + tt]
      }
      out[rowOffset + t] = medianInPlace(buf)
    }
  }
  return out
}

/**
 * Median filter each column (frame) along the FREQUENCY axis.
 * Fast path: interior of the column avoids the reflect helper.
 */
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
    // Interior bins.
    for (let b = half; b < numBins - half; b++) {
      for (let k = 0; k < size; k++) {
        buf[k] = mag[(b + k - half) * numFrames + t]
      }
      out[b * numFrames + t] = medianInPlace(buf)
    }
    // Edge bins with reflect padding.
    for (let b = 0; b < Math.min(half, numBins); b++) {
      for (let k = 0; k < size; k++) {
        const bb = clampReflect(b + k - half, numBins)
        buf[k] = mag[bb * numFrames + t]
      }
      out[b * numFrames + t] = medianInPlace(buf)
    }
    for (let b = Math.max(half, numBins - half); b < numBins; b++) {
      for (let k = 0; k < size; k++) {
        const bb = clampReflect(b + k - half, numBins)
        buf[k] = mag[bb * numFrames + t]
      }
      out[b * numFrames + t] = medianInPlace(buf)
    }
  }
  return out
}

/** Reflect at the boundary (librosa-style "reflect" padding). */
function clampReflect(i: number, n: number): number {
  if (n <= 1) return 0
  let x = i
  // Pong off both edges until inside.
  while (x < 0 || x >= n) {
    if (x < 0) x = -x
    if (x >= n) x = 2 * (n - 1) - x
  }
  return x
}

/**
 * In-place quickselect for the median. Mutates buf; caller treats it as
 * scratch. Iterative Hoare-style partition — beats insertion sort and the
 * built-in Array.prototype.sort for kernels of ~10–40 elements.
 */
function medianInPlace(buf: Float32Array): number {
  const n = buf.length
  const k = n >> 1
  let lo = 0
  let hi = n - 1
  while (lo < hi) {
    const pivot = buf[(lo + hi) >> 1]
    let i = lo
    let j = hi
    while (i <= j) {
      while (buf[i] < pivot) i++
      while (buf[j] > pivot) j--
      if (i <= j) {
        const tmp = buf[i]
        buf[i] = buf[j]
        buf[j] = tmp
        i++
        j--
      }
    }
    if (k <= j) hi = j
    else if (k >= i) lo = i
    else return buf[k]
  }
  return buf[k]
}

// ---------------------------------------------------------------------------
// FFT (radix-2 Cooley–Tukey, decimation-in-time, in place)
// ---------------------------------------------------------------------------

/**
 * In-place radix-2 FFT. Length of re/im must be a power of two equal to
 * twiddleCos.length * 2. Decimation-in-time, iterative.
 */
function fftRadix2InPlace(
  re: Float32Array,
  im: Float32Array,
  twiddleCos: Float32Array,
  twiddleSin: Float32Array,
): void {
  const n = re.length

  // Bit-reverse permutation.
  let j = 0
  for (let i = 1; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      let tmp = re[i]
      re[i] = re[j]
      re[j] = tmp
      tmp = im[i]
      im[i] = im[j]
      im[j] = tmp
    }
  }

  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1
    const tableStep = n / size
    for (let i = 0; i < n; i += size) {
      let kTwiddle = 0
      for (let k = i; k < i + half; k++) {
        const cos = twiddleCos[kTwiddle]
        const sin = twiddleSin[kTwiddle]
        const idx2 = k + half
        const tRe = re[idx2] * cos - im[idx2] * sin
        const tIm = re[idx2] * sin + im[idx2] * cos
        re[idx2] = re[k] - tRe
        im[idx2] = im[k] - tIm
        re[k] += tRe
        im[k] += tIm
        kTwiddle += tableStep
      }
    }
  }
}

/** Inverse FFT via conjugate-FFT-conjugate-scale. */
function ifftRadix2InPlace(
  re: Float32Array,
  im: Float32Array,
  twiddleCos: Float32Array,
  twiddleSin: Float32Array,
): void {
  const n = re.length
  for (let i = 0; i < n; i++) im[i] = -im[i]
  fftRadix2InPlace(re, im, twiddleCos, twiddleSin)
  const inv = 1 / n
  for (let i = 0; i < n; i++) {
    re[i] *= inv
    im[i] = -im[i] * inv
  }
}

/* ──────────────────────────────────────────────────────────────────────────── */
/* Separator registry — extension point for the v2 → v3 transition.
 *
 * Phase 3 research (see docs/chord-detector-source-separation-research.md)
 * concluded that HPSS captures 70-80 % of the source-separation win at zero
 * extra bundle cost, and that adding a neural separator (SCNet / Open-Unmix /
 * HTDemucs) is best deferred until the audit panel surfaces it as the
 * remaining bottleneck. When that day comes, swapping in a neural separator
 * is a one-line change in `chord-detector-engine.ts`: replace the direct
 * `isolateHarmonicMono` call with `getActiveSeparator().isolateHarmonic(...)`.
 *
 * New separators register by name. Each must accept (Float32Array, sampleRate)
 * and return either a Float32Array (sync) or Promise<Float32Array> (async, for
 * any future neural separator that lazy-loads its model on first use). */

export interface SourceSeparator {
  /** Display name (shown in any future settings UI). */
  name: string
  /** Bundle cost in MB — informational, for "downloads X MB" UX strings. */
  bundleSizeMb: number
  /** Sync or async harmonic-stem isolator. */
  isolateHarmonic: (mono: Float32Array, sr: number) => Float32Array | Promise<Float32Array>
}

export const SOURCE_SEPARATORS: Record<string, SourceSeparator> = {
  hpss: {
    name: 'HPSS (median filter)',
    bundleSizeMb: 0,
    isolateHarmonic: (mono, sr) => isolateHarmonicMono(mono, sr),
  },
  /* When SCNet / Open-Unmix lands:
   *   scnet: {
   *     name: 'SCNet small (neural)',
   *     bundleSizeMb: 40,
   *     isolateHarmonic: async (mono, sr) => {
   *       const { isolateHarmonicScnet } = await import('./chord-detector-source-separation-scnet')
   *       return isolateHarmonicScnet(mono, sr)
   *     },
   *   }, */
}

/**
 * Returns the active separator. Reads `localStorage['chord-detector-separator']`
 * (any value not in the registry falls back to 'hpss'). Stable function name
 * so the engine's import doesn't need to know about future additions.
 */
export function getActiveSeparator(): SourceSeparator {
  if (typeof window === 'undefined' || !window.localStorage) return SOURCE_SEPARATORS.hpss!
  const key = window.localStorage.getItem('chord-detector-separator') ?? 'hpss'
  return SOURCE_SEPARATORS[key] ?? SOURCE_SEPARATORS.hpss!
}
