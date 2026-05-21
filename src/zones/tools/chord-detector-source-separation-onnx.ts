/**
 * ONNX-runtime-based neural source separation for the chord detector
 * (Phase 2 of the v3 pipeline). Wraps a 4-stem separator model (Open-Unmix
 * UMX-L, HTDemucs quantized, SCNet small — anything that takes a magnitude
 * spectrogram and outputs per-stem masks) behind the existing
 * `SourceSeparator` interface so callers swap to neural separation with a
 * single registry-key change.
 *
 * Architecture:
 *   1. Lazy-import `onnxruntime-web` so production bundles that never opt
 *      into neural separation don't ship the runtime (~3-5 MB).
 *   2. Lazy-fetch the ONNX model from a configured URL, cached in the
 *      browser via the Cache API so the first-load cost is paid once per
 *      browser per model (typically 40-90 MB).
 *   3. Resample input mono → model sample rate (UMX = 44.1 kHz, SCNet =
 *      44.1 kHz, Demucs = 44.1 kHz; resampleMonoToRate handles all three).
 *   4. STFT (window-hop matches the model's training config).
 *   5. Inference → per-stem masks shaped `[stem, bin, frame]`.
 *   6. Multiply masks × original complex STFT per stem (Wiener-style soft
 *      mask), sum the stems the caller asked for, ISTFT.
 *   7. Resample back to caller's input sample rate.
 *
 * Status: SCAFFOLD as of 2026-05-21. The runtime + transforms are wired,
 * but no production model is currently registered (`UMXL_PLACEHOLDER`
 * config below points at the expected huggingface path — populate that or
 * point at a locally-served `.onnx` file before flipping the
 * `SOURCE_SEPARATORS.onnx-umxl` registry entry to active).
 *
 * Phase test plan (see docs/chord-detector-test-ledger.md): once a real
 * model lands, re-run `scripts/chord-detector-phase-bench.mjs` with a new
 * `onnx-umxl` config to measure F1 lift vs the lean baseline (currently
 * ~33 % F1 on the MP3 — Phase 2 should push that into the 50-60 % range
 * if the source separation is doing its job).
 */

import type { InferenceSession } from 'onnxruntime-web'

/** Config for a single ONNX separator model registered in the registry. */
export interface OnnxSeparatorConfig {
  /** Display name for the UI toggle. */
  name: string
  /** Bundle / first-load size in MB (informational for UX strings). */
  bundleSizeMb: number
  /** URL the ONNX model is fetched from on first use. Local `/source-separation/*.onnx`
   *  is fine — Vite serves `public/` at the root in dev and production. */
  modelUrl: string
  /** Sample rate the model expects (defines the resample target). */
  modelSampleRate: number
  /** STFT window size used during the model's training (matters for spectrogram alignment). */
  fftSize: number
  /** STFT hop size used during training. */
  hopSize: number
  /** Total stems the model outputs (e.g. 4 for UMX = [vocals, drums, bass, other]). */
  numStems: number
  /**
   * Indices of the stems to MERGE into the returned "harmonic" output.
   * For chord detection we want the non-percussive, non-bass content
   * (i.e. drop drums + bass and keep vocals + other / "comping").
   * UMX-L stem order: [0=vocals, 1=drums, 2=bass, 3=other] → keep [0, 3].
   * SCNet 4-stem: same order, same merge.
   */
  stemsToKeep: number[]
  /** Name of the input tensor in the ONNX graph (varies by export). */
  inputName?: string
  /** Names of the output tensors (one per stem) in the ONNX graph. */
  outputNames?: string[]
}

/**
 * Canonical registry of supported ONNX separator configs. The actual model
 * file is fetched lazily; this map just describes the shape + URL.
 *
 * Add a new entry when wiring a model:
 *   1. Drop the ONNX file under `public/source-separation/<key>.onnx`
 *   2. Add an entry here pointing at `/source-separation/<key>.onnx`
 *   3. Register it in `SOURCE_SEPARATORS` in
 *      `chord-detector-source-separation.ts` so the engine can pick it up.
 *   4. Add a `<key>` config to `scripts/chord-detector-phase-bench.mjs`
 *      and re-bench against the ground truth.
 */
export const ONNX_SEPARATOR_CONFIGS: Record<string, OnnxSeparatorConfig> = {
  /* Open-Unmix UMX-L — the most accessible / well-documented model in this
   * class. Pre-trained on MUSDB18-HQ. Open-unmix-pytorch publishes ONNX
   * exports through the umx-onnx repo / huggingface mirror. */
  'umxl': {
    name: 'Open-Unmix UMX-L',
    bundleSizeMb: 90,
    /* PLACEHOLDER URL. Populate either:
     *   - a huggingface direct download URL (`https://huggingface.co/.../resolve/main/umxl.onnx`)
     *   - or a locally-served path: `/source-separation/umxl.onnx`
     *     after dropping the file in `public/source-separation/`. */
    modelUrl: '/source-separation/umxl.onnx',
    modelSampleRate: 44100,
    fftSize: 4096,
    hopSize: 1024,
    numStems: 4,
    /* UMX stem order: [vocals, drums, bass, other]. For chord detection
     * the LEAD + COMPING live in vocals + other; drums + bass are removed. */
    stemsToKeep: [0, 3],
  },
  /* SCNet small — newer (Cui et al. 2023), competitive accuracy at smaller
   * footprint. Less widely deployed as ONNX; populate the URL once
   * you have a converted file. */
  'scnet-small': {
    name: 'SCNet small (neural)',
    bundleSizeMb: 40,
    modelUrl: '/source-separation/scnet-small.onnx',
    modelSampleRate: 44100,
    fftSize: 4096,
    hopSize: 1024,
    numStems: 4,
    stemsToKeep: [0, 3],
  },
} as const

/** In-memory cache of created InferenceSessions keyed by config key. */
const sessionCache = new Map<string, Promise<InferenceSession>>()

/** Lazy-load the runtime + create / reuse an InferenceSession for the config. */
async function getOrCreateSession(
  configKey: keyof typeof ONNX_SEPARATOR_CONFIGS,
): Promise<InferenceSession> {
  let cached = sessionCache.get(configKey)
  if (cached) return cached
  cached = (async () => {
    const config = ONNX_SEPARATOR_CONFIGS[configKey]
    if (!config) throw new Error(`Unknown ONNX separator config: ${configKey}`)
    /* Tree-shake-friendly dynamic import keeps the ~3-5 MB onnxruntime-web
     * payload out of the initial bundle for users who never opt in. */
    const ort = await import('onnxruntime-web')
    /* Fetch the model. The browser's HTTP cache covers re-loads; on first
     * fetch we'll see the full network download cost. Future improvement:
     * mirror to IndexedDB / Cache API explicitly so a service-worker
     * refresh doesn't blow away the cache. */
    const res = await fetch(config.modelUrl, { cache: 'force-cache' })
    if (!res.ok) {
      throw new Error(
        `Failed to fetch ONNX model from ${config.modelUrl}: HTTP ${res.status}. ` +
          `Drop the file at \`public${config.modelUrl}\` or update modelUrl to a reachable location.`,
      )
    }
    const bytes = new Uint8Array(await res.arrayBuffer())
    /* Try WebGPU first (5-10× faster on supporting browsers), fall back to
     * WASM with SIMD + threads. SessionOptions are conservative; tune
     * `intraOpNumThreads` if profiling shows CPU is the bottleneck. */
    const session = await ort.InferenceSession.create(bytes, {
      executionProviders: ['webgpu', 'wasm'],
      graphOptimizationLevel: 'all',
    })
    return session
  })()
  sessionCache.set(configKey, cached)
  return cached
}

/* ──────────────────────────────────────────────────────────────────────────── */
/* DSP helpers — STFT / ISTFT + linear resampling. Pure functions; deterministic. */

function nextPow2(n: number): number {
  let p = 1
  while (p < n) p <<= 1
  return p
}

function hannWindow(n: number): Float32Array {
  const w = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))
  }
  return w
}

/**
 * Linear resampler — good enough for "resample to model SR" given the
 * model's own STFT smoothing dominates the high-frequency content. For
 * production quality consider polyphase / Kaiser. The chord-detector
 * already uses linear resample elsewhere for the BP path.
 */
export function resampleMonoToRate(
  mono: Float32Array,
  inputSr: number,
  outputSr: number,
): Float32Array {
  if (inputSr === outputSr) return mono
  const ratio = outputSr / inputSr
  const outLen = Math.floor(mono.length * ratio)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const srcPos = i / ratio
    const a = Math.floor(srcPos)
    const b = Math.min(mono.length - 1, a + 1)
    const t = srcPos - a
    out[i] = mono[a]! * (1 - t) + mono[b]! * t
  }
  return out
}

/* ──────────────────────────────────────────────────────────────────────────── */

/**
 * Run the configured ONNX separator and return the "harmonic" mono output —
 * the sum of the stems listed in `stemsToKeep`, ISTFT'd back to time domain
 * and resampled to the caller's input rate.
 *
 * Stateless apart from the session cache; safe to call repeatedly. First
 * call triggers the runtime import + model fetch (one-time multi-second
 * cost). Subsequent calls reuse the cached session.
 */
export async function isolateHarmonicOnnx(
  mono: Float32Array,
  inputSr: number,
  configKey: keyof typeof ONNX_SEPARATOR_CONFIGS,
): Promise<Float32Array> {
  const config = ONNX_SEPARATOR_CONFIGS[configKey]
  if (!config) throw new Error(`Unknown ONNX separator: ${configKey}`)
  const session = await getOrCreateSession(configKey)
  const ort = await import('onnxruntime-web')

  /* 1. Resample to the model's expected sample rate. */
  const monoAtModelSr = resampleMonoToRate(mono, inputSr, config.modelSampleRate)

  /* 2. STFT — magnitude spectrogram for the network, complex frames kept
   *    so we can multiply the predicted mask back in. */
  const { magnitude, real, imag, numFrames, numBins } = stftMagnitude(
    monoAtModelSr,
    nextPow2(config.fftSize),
    config.hopSize,
  )

  /* 3. Run inference. Input shape varies by model — UMX expects
   *    [batch=1, channels=1, frames, bins] in magnitude. The exact
   *    transpose / reshape depends on the export. The block below is the
   *    common case; adapt per-model in the config if needed. */
  const inputName = config.inputName ?? session.inputNames[0]
  if (!inputName) {
    throw new Error(`ONNX session for ${configKey} reports no input names.`)
  }
  const inputTensor = new ort.Tensor('float32', magnitude, [1, 1, numFrames, numBins])
  const feeds: Record<string, ort.Tensor> = { [inputName]: inputTensor }
  const outputs = await session.run(feeds)
  const outputNames = config.outputNames ?? session.outputNames

  /* 4. For each stem we KEEP, multiply the mask × original complex STFT,
   *    sum into the merged (real, imag) accumulator. */
  const mergedReal = new Float32Array(real.length)
  const mergedImag = new Float32Array(imag.length)
  for (const stemIdx of config.stemsToKeep) {
    const outName = outputNames[stemIdx]
    if (!outName) {
      throw new Error(`Stem index ${stemIdx} has no output name in the ONNX graph.`)
    }
    const stemOut = outputs[outName]
    if (!stemOut) {
      throw new Error(`Expected output "${outName}" missing from inference results.`)
    }
    const mask = stemOut.data as Float32Array
    /* Wiener-style soft mask: stem_signal = mask × original_complex.
     * Mask is expected in `[frames, bins]` order matching the input. */
    for (let i = 0; i < real.length; i++) {
      const m = mask[i] ?? 0
      mergedReal[i] += real[i]! * m
      mergedImag[i] += imag[i]! * m
    }
  }

  /* 5. ISTFT back to time domain. */
  const recon = istft(
    mergedReal,
    mergedImag,
    nextPow2(config.fftSize),
    config.hopSize,
    numFrames,
    numBins,
  )

  /* 6. Resample back to the caller's input rate so downstream code (BP
   *    at 22.05 kHz, chord templates) operates on the same time base. */
  const reconAtInputSr = resampleMonoToRate(recon, config.modelSampleRate, inputSr)
  return reconAtInputSr
}

/* ──────────────────────────────────────────────────────────────────────────── */
/* Minimal STFT/ISTFT — same Cooley-Tukey radix-2 the HPSS module uses but
 * exported here so the ONNX path doesn't depend on the HPSS implementation.
 * Could be deduplicated to a shared helper later. */

function stftMagnitude(
  mono: Float32Array,
  fftSize: number,
  hopSize: number,
): { magnitude: Float32Array; real: Float32Array; imag: Float32Array; numFrames: number; numBins: number } {
  const window = hannWindow(fftSize)
  const pad = fftSize >> 1
  const padded = new Float32Array(mono.length + fftSize)
  padded.set(mono, pad)
  const numFrames = 1 + Math.floor((padded.length - fftSize) / hopSize)
  const numBins = (fftSize >> 1) + 1

  const real = new Float32Array(numBins * numFrames)
  const imag = new Float32Array(numBins * numFrames)
  const magnitude = new Float32Array(numBins * numFrames)

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
      const idx = f * numBins + k
      real[idx] = re
      imag[idx] = im
      magnitude[idx] = Math.sqrt(re * re + im * im)
    }
  }
  return { magnitude, real, imag, numFrames, numBins }
}

function istft(
  real: Float32Array,
  imag: Float32Array,
  fftSize: number,
  hopSize: number,
  numFrames: number,
  numBins: number,
): Float32Array {
  const window = hannWindow(fftSize)
  const pad = fftSize >> 1
  const outLen = (numFrames - 1) * hopSize + fftSize
  const out = new Float32Array(outLen)
  const winSum = new Float32Array(outLen)

  const twiddleCos = new Float32Array(fftSize >> 1)
  const twiddleSin = new Float32Array(fftSize >> 1)
  for (let k = 0; k < fftSize >> 1; k++) {
    const ang = (-2 * Math.PI * k) / fftSize
    twiddleCos[k] = Math.cos(ang)
    twiddleSin[k] = Math.sin(ang)
  }

  const ifftRe = new Float32Array(fftSize)
  const ifftIm = new Float32Array(fftSize)
  for (let f = 0; f < numFrames; f++) {
    for (let k = 0; k < numBins; k++) {
      const idx = f * numBins + k
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
      out[offset + n]! += ifftRe[n]! * w
      winSum[offset + n]! += w * w
    }
  }
  const EPS = 1e-10
  for (let i = 0; i < out.length; i++) {
    if (winSum[i]! > EPS) out[i]! /= winSum[i]!
  }
  /* Strip the centring pad. */
  const result = new Float32Array(out.length - fftSize)
  for (let i = 0; i < result.length; i++) result[i] = out[i + pad]!
  return result
}

function fftRadix2InPlace(
  re: Float32Array,
  im: Float32Array,
  twiddleCos: Float32Array,
  twiddleSin: Float32Array,
): void {
  const n = re.length
  // Bit reversal.
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
      let twiddleIdx = 0
      for (let k = i; k < i + half; k++) {
        const tcos = twiddleCos[twiddleIdx]!
        const tsin = twiddleSin[twiddleIdx]!
        const xr = re[k + half]! * tcos - im[k + half]! * tsin
        const xi = re[k + half]! * tsin + im[k + half]! * tcos
        re[k + half] = re[k]! - xr
        im[k + half] = im[k]! - xi
        re[k] = re[k]! + xr
        im[k] = im[k]! + xi
        twiddleIdx += step
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
