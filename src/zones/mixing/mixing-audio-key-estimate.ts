/**
 * Offline key estimation via chromagram + Krumhansl–Schmuckler–style correlation.
 * Not as accurate as dedicated ML (or Tunebat) on complex material, but gives a usable local guess.
 */

const FFT_SIZE = 4096
const HOP = 2048

/** Krumhansl–Kessler probe-tone profiles (strength per pitch class, tonic = index 0). */
const MAJOR_PROFILE = new Float32Array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
const MINOR_PROFILE = new Float32Array([6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

const TONIC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

/** Camelot codes by pitch-class index (sharp spelling). */
const CAMELOT_MAJOR = ['8B', '3B', '10B', '5B', '12B', '7B', '2B', '9B', '4B', '11B', '6B', '1B'] as const
const CAMELOT_MINOR = ['5A', '12A', '7A', '2A', '9A', '4A', '11A', '6A', '1A', '8A', '3A', '10A'] as const

/** In-place radix-2 Cooley–Tukey FFT; length must be power of 2. */
function fftInPlace(re: Float32Array, im: Float32Array): void {
  const n = re.length
  if ((n & (n - 1)) !== 0) throw new Error('FFT length must be power of 2')

  let j = 0
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      ;[re[i], re[j]] = [re[j]!, re[i]!]
      ;[im[i], im[j]] = [im[j]!, im[i]!]
    }
    let k = n >> 1
    while (k <= j) {
      j -= k
      k >>= 1
    }
    j += k
  }

  for (let len = 2; len <= n; len <<= 1) {
    const half = len >>> 1
    const ang = (-2 * Math.PI) / len
    const cosStep = Math.cos(ang)
    const sinStep = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let wr = 1
      let wi = 0
      for (let k = 0; k < half; k++) {
        const u = i + k
        const v = u + half
        const tr = wr * re[v]! - wi * im[v]!
        const ti = wr * im[v]! + wi * re[v]!
        re[v] = re[u]! - tr
        im[v] = im[u]! - ti
        re[u] = re[u]! + tr
        im[u] = im[u]! + ti
        const nr = wr * cosStep - wi * sinStep
        wi = wr * sinStep + wi * cosStep
        wr = nr
      }
    }
  }
}

function l2Normalize(v: Float32Array): Float32Array {
  let s = 0
  for (let i = 0; i < 12; i++) s += v[i]! * v[i]!
  const norm = Math.sqrt(s) || 1
  const o = new Float32Array(12)
  for (let i = 0; i < 12; i++) o[i] = v[i]! / norm
  return o
}

/** Cosine similarity between normalized chroma and rotated normalized profile. */
function profileCosine(chromaNorm: Float32Array, profile: Float32Array, tonicPc: number): number {
  let s = 0
  for (let i = 0; i < 12; i++) {
    const pi = profile[(i - tonicPc + 12) % 12]!
    s += pi * pi
  }
  const pn = Math.sqrt(s) || 1
  let dot = 0
  for (let i = 0; i < 12; i++) {
    const pi = profile[(i - tonicPc + 12) % 12]! / pn
    dot += chromaNorm[i]! * pi
  }
  return dot
}

/** Single FFT-frame chromagram into `out` (cleared first). */
function fillChromagramFrame(
  out: Float32Array,
  mono: Float32Array,
  start: number,
  window: Float32Array,
  re: Float32Array,
  im: Float32Array,
  sampleRate: number,
  minHz: number,
  maxHz: number,
): void {
  out.fill(0)
  for (let i = 0; i < FFT_SIZE; i++) re[i] = mono[start + i]! * window[i]!
  im.fill(0)
  fftInPlace(re, im)

  for (let k = 1; k < FFT_SIZE / 2; k++) {
    const freq = (k * sampleRate) / FFT_SIZE
    if (freq < minHz || freq > maxHz) continue
    const mag2 = re[k]! * re[k]! + im[k]! * im[k]!
    const midi = 69 + 12 * Math.log2(freq / 440)
    if (!Number.isFinite(midi)) continue
    const pc = (((Math.round(midi) % 12) + 12) % 12) as number
    out[pc] += Math.sqrt(mag2)
  }
}

/**
 * Per-hop chroma vectors (12-bin pitch-class strength) for temporal chord / harmony analysis.
 * Frame center times are approximately `(frameIndex * HOP + FFT_SIZE / 2) / sampleRate` seconds.
 */
export function computeChromaFrameSeries(mono: Float32Array, sampleRate: number): Float32Array[] | null {
  const window = new Float32Array(FFT_SIZE)
  for (let i = 0; i < FFT_SIZE; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)))
  }

  const minMidi = 36
  const maxMidi = 96
  const minHz = 440 * 2 ** ((minMidi - 69) / 12)
  const maxHz = 440 * 2 ** ((maxMidi - 69) / 12)

  const re = new Float32Array(FFT_SIZE)
  const im = new Float32Array(FFT_SIZE)
  const scratch = new Float32Array(12)
  const out: Float32Array[] = []

  for (let start = 0; start + FFT_SIZE <= mono.length; start += HOP) {
    fillChromagramFrame(scratch, mono, start, window, re, im, sampleRate, minHz, maxHz)
    out.push(Float32Array.from(scratch))
  }

  return out.length < 6 ? null : out
}

function accumulateChroma(mono: Float32Array, sampleRate: number): Float32Array | null {
  const chroma = new Float32Array(12)
  const window = new Float32Array(FFT_SIZE)
  for (let i = 0; i < FFT_SIZE; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)))
  }

  const minMidi = 36
  const maxMidi = 96
  const minHz = 440 * 2 ** ((minMidi - 69) / 12)
  const maxHz = 440 * 2 ** ((maxMidi - 69) / 12)

  const re = new Float32Array(FFT_SIZE)
  const im = new Float32Array(FFT_SIZE)
  const scratch = new Float32Array(12)
  let frames = 0

  for (let start = 0; start + FFT_SIZE <= mono.length; start += HOP) {
    fillChromagramFrame(scratch, mono, start, window, re, im, sampleRate, minHz, maxHz)
    for (let i = 0; i < 12; i++) chroma[i] += scratch[i]!
    frames++
  }

  if (frames < 6) return null
  return chroma
}

export type EstimatedKeyResult = {
  /** e.g. "G Major", "E minor" */
  label: string
  camelot: string
  /** Cosine similarity of best template (0–1-ish); low values mean “guess”. */
  confidence: number
}

/**
 * Estimate global key from mono PCM (e.g. first minute of a track).
 * Returns null if audio is too short or ambiguous.
 */
export function estimateMusicalKeyFromMono(mono: Float32Array, sampleRate: number): EstimatedKeyResult | null {
  const raw = accumulateChroma(mono, sampleRate)
  if (!raw) return null

  const chromaNorm = l2Normalize(raw)

  let bestScore = -1
  let secondScore = -1
  let bestMode: 'major' | 'minor' = 'major'
  let bestTonic = 0

  for (let tonic = 0; tonic < 12; tonic++) {
    const pairs: [number, 'major' | 'minor'][] = [
      [profileCosine(chromaNorm, MAJOR_PROFILE, tonic), 'major'],
      [profileCosine(chromaNorm, MINOR_PROFILE, tonic), 'minor'],
    ]
    for (const [score, mode] of pairs) {
      if (score > bestScore) {
        secondScore = bestScore
        bestScore = score
        bestMode = mode
        bestTonic = tonic
      } else if (score > secondScore) {
        secondScore = score
      }
    }
  }

  // Reject very weak or nearly tied guesses (common on atonal / percussive clips).
  if (bestScore < 0.65 || bestScore - secondScore < 0.012) return null

  const name = TONIC_NAMES[bestTonic]!
  const label = bestMode === 'major' ? `${name} Major` : `${name} minor`
  const camelot = bestMode === 'major' ? CAMELOT_MAJOR[bestTonic]! : CAMELOT_MINOR[bestTonic]!

  return {
    label: `${label} · Camelot ${camelot}`,
    camelot,
    confidence: bestScore,
  }
}
