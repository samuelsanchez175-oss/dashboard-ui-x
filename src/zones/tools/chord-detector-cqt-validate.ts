/**
 * CQT-based note validation.
 *
 * Basic Pitch (TF.js) sometimes hallucinates notes that have no actual audio
 * energy at their reported frequency. The Constant-Q Transform has one bin
 * per semitone which makes it ideal for verifying pitched content. This module
 * builds a CQT-style magnitude spectrogram (approximated from STFT magnitudes
 * mapped to semitone bins) and drops `LeadNote`s whose bin has no energy
 * within their time window.
 *
 * v1: drop-only (no false-negative recovery).
 *
 * Pure module — no DOM, no Web Audio Context.
 */
import type { LeadNote } from './chord-detector-melody'

export interface ValidateCQTOptions {
  /** Lowest CQT center frequency in Hz. Default 32.7 Hz (C1, MIDI 24). */
  cqtFmin?: number
  /** Bins per octave. Default 12 (one bin per semitone). */
  binsPerOctave?: number
  /** Number of octaves covered. Default 7 (84 bins by default). */
  octaves?: number
  /** Hop size in samples. Default 512. */
  hopSize?: number
  /**
   * Drop threshold as a fraction of the global max CQT magnitude. Default 0.05.
   * A note is kept iff `max(bin, t in [start,end]) >= energyThreshold * globalMax`.
   */
  energyThreshold?: number
}

export interface ValidateCQTResult {
  kept: LeadNote[]
  /** Notes removed because their bin had no energy in their window. */
  dropped: LeadNote[]
}

/* ============================================================ *\
 *  Internal: iterative radix-2 FFT (in-place, no allocations). *
\* ============================================================ */

function nextPow2(n: number): number {
  let p = 1
  while (p < n) p <<= 1
  return p
}

/**
 * Radix-2 Cooley–Tukey FFT, in-place. `re`/`im` length must be a power of two.
 * `sign = -1` for forward FFT, `+1` for inverse. Inverse does NOT scale by N.
 */
function fftInPlace(re: Float32Array, im: Float32Array, sign: number): void {
  const n = re.length
  // Bit reversal
  let j = 0
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr
      const ti = im[i]; im[i] = im[j]; im[j] = ti
    }
    let k = n >> 1
    while (k <= j) { j -= k; k >>= 1 }
    j += k
  }
  // Butterflies
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1
    const theta = (sign * 2 * Math.PI) / size
    const wpr = Math.cos(theta)
    const wpi = Math.sin(theta)
    for (let i = 0; i < n; i += size) {
      let wr = 1
      let wi = 0
      for (let k = 0; k < half; k++) {
        const a = i + k
        const b = a + half
        const xr = wr * re[b] - wi * im[b]
        const xi = wr * im[b] + wi * re[b]
        re[b] = re[a] - xr
        im[b] = im[a] - xi
        re[a] += xr
        im[a] += xi
        const tmp = wr
        wr = tmp * wpr - wi * wpi
        wi = tmp * wpi + wi * wpr
      }
    }
  }
}

/* ============================================================ *\
 *  CQT bin mapping (one bin per semitone).                     *
\* ============================================================ */

/** MIDI for the first CQT bin (`fmin`). 27.5 Hz = A0 (MIDI 21). */
function midiOfFmin(fmin: number): number {
  return 69 + 12 * Math.log2(fmin / 440)
}

/** Center frequency of CQT bin `b` (0-indexed) given fmin and bins/octave. */
function centerHz(b: number, fmin: number, binsPerOctave: number): number {
  return fmin * Math.pow(2, b / binsPerOctave)
}

/* ============================================================ *\
 *  Public API.                                                 *
\* ============================================================ */

/**
 * Validate Basic Pitch notes against a CQT-style spectrogram of the same
 * audio. Notes with no spectral energy in their pitch bin during their time
 * window are dropped (likely false positives).
 *
 * Algorithm:
 *   1. Build a Hann-windowed STFT of `mono`.
 *   2. For each CQT bin (one per semitone), map to the nearest FFT bin per
 *      frame and read its magnitude. This is a fast O(1)-per-bin proxy for
 *      a true CQT; sufficient for "does pitch X have energy at time T?".
 *   3. For each LeadNote, find the bin matching its MIDI and the frame range
 *      covering [startSec, startSec + durationSec]. If `max` magnitude in
 *      that window < `energyThreshold * globalMax`, drop it.
 */
export function validateNotesAgainstCQT(
  notes: readonly LeadNote[],
  mono: Float32Array,
  sampleRate: number,
  options: ValidateCQTOptions = {},
): ValidateCQTResult {
  const cqtFmin = options.cqtFmin ?? 32.70319566257483 // C1
  const binsPerOctave = options.binsPerOctave ?? 12
  const octaves = options.octaves ?? 7
  const hopSize = Math.max(1, options.hopSize ?? 512)
  const energyThreshold = options.energyThreshold ?? 0.05

  const numBins = binsPerOctave * octaves
  const baseMidi = midiOfFmin(cqtFmin) // MIDI of bin 0

  // Trivial outs.
  if (notes.length === 0 || mono.length === 0 || sampleRate <= 0) {
    return { kept: notes.slice(), dropped: [] }
  }

  // Pick a window long enough to resolve the lowest CQT bin.
  // For a fmin ~32.7 Hz, a 4096-sample window at 22.05 kHz ≈ 5.4 Hz/bin,
  // which gives a few FFT bins per semitone at the bottom and plenty up top.
  const minResolveHz = cqtFmin * (Math.pow(2, 1 / binsPerOctave) - 1) // bin spacing at fmin
  const desiredWin = Math.ceil((sampleRate / Math.max(minResolveHz, 1)) * 1.2)
  const winSize = Math.min(16384, Math.max(1024, nextPow2(desiredWin)))
  const fftSize = winSize
  const nFftBins = fftSize >> 1

  // Hann window.
  const win = new Float32Array(winSize)
  for (let i = 0; i < winSize; i++) {
    win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (winSize - 1))
  }

  // Number of frames. Pad/truncate as needed.
  const numFrames = Math.max(1, 1 + Math.floor((mono.length - winSize) / hopSize))

  // CQT magnitude matrix: [bin][frame].
  const cqt: Float32Array[] = new Array(numBins)
  for (let b = 0; b < numBins; b++) cqt[b] = new Float32Array(numFrames)

  // Precompute, for each CQT bin, the nearest FFT bin index.
  const fftBinForCqt = new Int32Array(numBins)
  for (let b = 0; b < numBins; b++) {
    const hz = centerHz(b, cqtFmin, binsPerOctave)
    let k = Math.round((hz * fftSize) / sampleRate)
    if (k < 1) k = 1
    if (k >= nFftBins) k = nFftBins - 1
    fftBinForCqt[b] = k
  }

  // Scratch buffers reused across frames.
  const re = new Float32Array(fftSize)
  const im = new Float32Array(fftSize)

  let globalMax = 0

  for (let f = 0; f < numFrames; f++) {
    const start = f * hopSize
    // Copy windowed frame into re; zero im.
    const end = Math.min(start + winSize, mono.length)
    let i = 0
    for (; i < end - start; i++) re[i] = mono[start + i] * win[i]
    for (; i < winSize; i++) re[i] = 0
    im.fill(0)

    fftInPlace(re, im, -1)

    // Read magnitudes at our precomputed FFT bin indices.
    for (let b = 0; b < numBins; b++) {
      const k = fftBinForCqt[b]
      const mag = Math.hypot(re[k], im[k])
      cqt[b][f] = mag
      if (mag > globalMax) globalMax = mag
    }
  }

  const kept: LeadNote[] = []
  const dropped: LeadNote[] = []

  if (globalMax <= 0) {
    // Audio is silent everywhere. Drop everything — nothing can be supported.
    return { kept: [], dropped: notes.slice() }
  }

  const cutoff = energyThreshold * globalMax
  const secPerFrame = hopSize / sampleRate

  for (const n of notes) {
    const binF = (n.midi - baseMidi) // semitones above fmin
    const b = Math.round(binF)
    if (b < 0 || b >= numBins) {
      // Outside CQT range — keep (we can't validate, so don't drop).
      kept.push(n)
      continue
    }
    let fStart = Math.floor(n.startSec / secPerFrame)
    let fEnd = Math.ceil((n.startSec + Math.max(n.durationSec, 0)) / secPerFrame)
    if (fStart < 0) fStart = 0
    if (fEnd >= numFrames) fEnd = numFrames - 1
    if (fEnd < fStart) fEnd = fStart

    const row = cqt[b]
    let mx = 0
    for (let f = fStart; f <= fEnd; f++) {
      const v = row[f]
      if (v > mx) mx = v
    }

    if (mx >= cutoff) kept.push(n)
    else dropped.push(n)
  }

  return { kept, dropped }
}
