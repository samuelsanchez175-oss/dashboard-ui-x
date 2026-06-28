/**
 * In-place analysis for a grabbed YouTube clip: musical KEY + BPM + auto-tune
 * scale, and a 4-way STEM split. Both run fully client-side on the decoded
 * audio — no upload, no extra services.
 *
 * Honesty note: true per-instrument AI isolation (Demucs/Spleeter) needs heavy
 * ML and isn't available in-browser here. Stems use **HPSS** (harmonic vs
 * percussive source separation, Fitzgerald 2010) plus frequency banding — a
 * fast DSP approximation, not perfect isolation. Labels say so in the UI.
 */

import { isolateHarmonicMono } from './chord-detector-source-separation'
import { estimateBpmFromMono, monoDownmix } from '../mixing/mixing-audio-analysis'
import { estimateMusicalKeyFromMono } from '../mixing/mixing-audio-key-estimate'

/* ── decode ─────────────────────────────────────────────────────────────── */

async function decodeToBuffer(blob: Blob): Promise<AudioBuffer> {
  const ab = await blob.arrayBuffer()
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) throw new Error('Web Audio API unavailable')
  const ctx = new Ctor()
  try {
    return await ctx.decodeAudioData(ab.slice(0))
  } finally {
    void ctx.close()
  }
}

/* ── WAV (PCM16 mono) ───────────────────────────────────────────────────── */

function encodeWavPcm16(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)            // PCM
  view.setUint16(22, 1, true)            // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  let off = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0))
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    off += 2
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

/* ── offline biquad band render (mono in → mono out) ────────────────────── */

type Band = { type: BiquadFilterType; freq: number; Q?: number }

async function renderBandMono(mono: Float32Array, sampleRate: number, bands: Band[]): Promise<Float32Array> {
  const offline = new OfflineAudioContext(1, mono.length, sampleRate)
  const buf = offline.createBuffer(1, mono.length, sampleRate)
  buf.getChannelData(0).set(mono)
  const src = offline.createBufferSource()
  src.buffer = buf
  let node: AudioNode = src
  for (const b of bands) {
    const filt = offline.createBiquadFilter()
    filt.type = b.type
    filt.frequency.value = b.freq
    if (b.Q != null) filt.Q.value = b.Q
    node.connect(filt)
    node = filt
  }
  node.connect(offline.destination)
  src.start()
  const rendered = await offline.startRendering()
  return rendered.getChannelData(0).slice()
}

/* ── stems ──────────────────────────────────────────────────────────────── */

export type Stem = { id: string; label: string; hint: string; blob: Blob; fileName: string }

function safeBase(name: string): string {
  return (name || 'clip').replace(/[/\\?%*:|"<>]/g, '_').trim().slice(0, 60) || 'clip'
}

export type StemOptions = {
  /** Add a separate Drums stem (kick/snare body) — gives 5 stems instead of 4. */
  drums?: boolean
}

/**
 * Split into downloadable WAV stems using HPSS + frequency bands.
 * Approximate (drums are pulled out of the tonal stems, hats/sub isolated by
 * band) — not surgical per-instrument isolation.
 */
export async function splitStems(blob: Blob, baseName: string, opts?: StemOptions): Promise<Stem[]> {
  const buffer = await decodeToBuffer(blob)
  return splitStemsFromBuffer(buffer, baseName, opts)
}

/** Same as {@link splitStems} but for an already-decoded AudioBuffer (no re-decode). */
export async function splitStemsFromBuffer(
  buffer: AudioBuffer,
  baseName: string,
  opts?: StemOptions,
): Promise<Stem[]> {
  const sr = buffer.sampleRate
  const mono = monoDownmix(buffer)

  // Harmonic (sustained tones: vocals, keys, bass) vs percussive (transients).
  const harmonic = isolateHarmonicMono(mono, sr)
  const percussive = new Float32Array(mono.length)
  for (let i = 0; i < mono.length; i++) percussive[i] = (mono[i] ?? 0) - (harmonic[i] ?? 0)

  const base = safeBase(baseName)
  const make = async (
    id: string,
    label: string,
    hint: string,
    source: Float32Array,
    bands: Band[],
  ): Promise<Stem> => {
    const band = await renderBandMono(source, sr, bands)
    return { id, label, hint, blob: encodeWavPcm16(band, sr), fileName: `${base} - ${label}.wav` }
  }

  const tasks: Promise<Stem>[] = [
    make('vocals', 'Vocals', 'Tonal mid/high band with drums pulled out (HPSS).', harmonic, [
      { type: 'highpass', freq: 240, Q: 0.7 },
      { type: 'lowpass', freq: 5200, Q: 0.7 },
    ]),
    make('hihats', 'Hi-hats', 'High-frequency transients from the percussive layer.', percussive, [
      { type: 'highpass', freq: 6500, Q: 0.7 },
    ]),
    make('the808s', '808s', 'Sub-bass / 808 low end of the mix.', mono, [
      { type: 'lowpass', freq: 120, Q: 0.7 },
    ]),
    make('pianos', 'Pianos', 'Tonal low-mid band — piano / keys / synth (HPSS).', harmonic, [
      { type: 'highpass', freq: 120, Q: 0.7 },
      { type: 'lowpass', freq: 2600, Q: 0.7 },
    ]),
  ]

  if (opts?.drums) {
    tasks.push(
      make('drums', 'Drums', 'Drum body — kick / snare from the percussive layer.', percussive, [
        { type: 'highpass', freq: 90, Q: 0.7 },
        { type: 'lowpass', freq: 6000, Q: 0.7 },
      ]),
    )
  }

  return Promise.all(tasks)
}

/* ── key / BPM / auto-tune scale ────────────────────────────────────────── */

const NOTE_TO_SEMI: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
}
const SEMI_TO_NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11]
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10]

export type KeyInfo = {
  key: string | null          // "G Major"
  camelot: string | null
  confidence: number | null   // 0–1
  bpm: number | null
  mode: 'Major' | 'Minor' | null
  scale: string[]             // 7 scale-note names
  autotune: string | null     // auto-tune target, e.g. "G Major"
}

export async function analyzeClipKey(blob: Blob): Promise<KeyInfo> {
  const buffer = await decodeToBuffer(blob)
  const sr = buffer.sampleRate
  const mono = monoDownmix(buffer)
  const keyRes = estimateMusicalKeyFromMono(mono, sr)
  const bpmRaw = estimateBpmFromMono(mono, sr)
  const bpm = bpmRaw != null && Number.isFinite(bpmRaw) ? Math.round(bpmRaw) : null

  if (!keyRes) {
    return { key: null, camelot: null, confidence: null, bpm, mode: null, scale: [], autotune: null }
  }

  const keyName = (keyRes.label.split('·')[0] ?? '').trim() // "G Major"
  const parts = keyName.split(/\s+/)
  const tonic = parts[0] ?? 'C'
  const mode: 'Major' | 'Minor' = /minor/i.test(parts[1] ?? '') ? 'Minor' : 'Major'
  const root = NOTE_TO_SEMI[tonic] ?? 0
  const steps = mode === 'Minor' ? MINOR_STEPS : MAJOR_STEPS
  const scale = steps.map(s => SEMI_TO_NOTE[(root + s) % 12]!)

  return {
    key: keyName,
    camelot: keyRes.camelot,
    confidence: keyRes.confidence,
    bpm,
    mode,
    scale,
    autotune: `${tonic} ${mode}`,
  }
}

/* ── zip (store method) for "download all" ──────────────────────────────── */

function crc32(bytes: Uint8Array): number {
  let c = ~0
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i]!
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return (~c) >>> 0
}

/** Minimal uncompressed (store) ZIP so all stems download as one file. */
export async function zipStore(files: { name: string; blob: Blob }[]): Promise<Blob> {
  const enc = new TextEncoder()
  const parts: BlobPart[] = []
  const central: BlobPart[] = []
  let offset = 0
  let centralSize = 0

  for (const f of files) {
    const data = new Uint8Array(await f.blob.arrayBuffer())
    const name = enc.encode(f.name)
    const crc = crc32(data)

    const lh = new DataView(new ArrayBuffer(30))
    lh.setUint32(0, 0x04034b50, true)
    lh.setUint16(4, 20, true)
    lh.setUint32(14, crc, true)
    lh.setUint32(18, data.length, true)
    lh.setUint32(22, data.length, true)
    lh.setUint16(26, name.length, true)
    parts.push(lh.buffer, name, data)

    const cd = new DataView(new ArrayBuffer(46))
    cd.setUint32(0, 0x02014b50, true)
    cd.setUint16(4, 20, true)
    cd.setUint16(6, 20, true)
    cd.setUint32(16, crc, true)
    cd.setUint32(20, data.length, true)
    cd.setUint32(24, data.length, true)
    cd.setUint16(28, name.length, true)
    cd.setUint32(42, offset, true)
    central.push(cd.buffer, name)

    offset += 30 + name.length + data.length
    centralSize += 46 + name.length
  }

  const eocd = new DataView(new ArrayBuffer(22))
  eocd.setUint32(0, 0x06054b50, true)
  eocd.setUint16(8, files.length, true)
  eocd.setUint16(10, files.length, true)
  eocd.setUint32(12, centralSize, true)
  eocd.setUint32(16, offset, true)

  return new Blob([...parts, ...central, eocd.buffer], { type: 'application/zip' })
}
