import { Midi } from '@tonejs/midi'
import { parseBlob } from 'music-metadata'

import { monoDownmix, estimateBpmFromMono } from '../mixing/mixing-audio-analysis'
import { computeChromaFrameSeries } from '../mixing/mixing-audio-key-estimate'

/** Must stay aligned with `mixing-audio-key-estimate` FFT hop / size. */
const CHROMA_HOP = 2048
const CHROMA_FFT = 4096

const TONIC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

export type ChordQuality = 'major' | 'minor' | 'dim' | 'aug' | 'sus4'

export type ChordBeat = {
  beatIndex: number
  rootPc: number
  quality: ChordQuality
  label: string
  confidence: number
}

export type ChordSegment = {
  label: string
  rootPc: number
  quality: ChordQuality
  startSec: number
  durationSec: number
}

export type ChordAnalysisResult = {
  bpm: number
  bpmSource: 'tags' | 'estimated'
  durationSec: number
  beats: ChordBeat[]
  segments: ChordSegment[]
}

function l2Normalize12(v: Float32Array): Float32Array {
  let s = 0
  for (let i = 0; i < 12; i++) s += v[i]! * v[i]!
  const norm = Math.sqrt(s) || 1
  const o = new Float32Array(12)
  for (let i = 0; i < 12; i++) o[i] = v[i]! / norm
  return o
}

function buildTemplate(rootPc: number, intervals: readonly number[], weights: readonly number[]): Float32Array {
  const v = new Float32Array(12)
  for (let i = 0; i < intervals.length; i++) {
    const pc = (rootPc + intervals[i]! + 12) % 12
    v[pc] += weights[i]!
  }
  return l2Normalize12(v)
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < 12; i++) s += a[i]! * b[i]!
  return s
}

const QUALITY_CONFIG: readonly { quality: ChordQuality; iv: readonly number[]; w: readonly number[] }[] = [
  { quality: 'major', iv: [0, 4, 7], w: [1, 0.92, 0.92] },
  { quality: 'minor', iv: [0, 3, 7], w: [1, 0.92, 0.92] },
  { quality: 'dim', iv: [0, 3, 6], w: [1, 0.88, 0.88] },
  { quality: 'aug', iv: [0, 4, 8], w: [1, 0.88, 0.88] },
  { quality: 'sus4', iv: [0, 5, 7], w: [1, 0.88, 0.92] },
]

function bestChordForChromagram(chromaNorm: Float32Array): {
  rootPc: number
  quality: ChordQuality
  score: number
} {
  let best = { rootPc: 0, quality: 'major' as ChordQuality, score: -1 }
  for (let root = 0; root < 12; root++) {
    for (const { quality, iv, w } of QUALITY_CONFIG) {
      const t = buildTemplate(root, iv, w)
      const score = cosineSimilarity(chromaNorm, t)
      if (score > best.score) best = { rootPc: root, quality, score }
    }
  }
  return best
}

export function formatChordLabel(rootPc: number, quality: ChordQuality): string {
  const name = TONIC_SHARP[rootPc]!
  switch (quality) {
    case 'major':
      return name
    case 'minor':
      return `${name}m`
    case 'dim':
      return `${name}dim`
    case 'aug':
      return `${name}aug`
    case 'sus4':
      return `${name}sus4`
    default:
      return name
  }
}

function frameCenterSec(frameIndex: number, sampleRate: number): number {
  return (frameIndex * CHROMA_HOP + CHROMA_FFT / 2) / sampleRate
}

function medianFilterBeats(beats: ChordBeat[], win: number): ChordBeat[] {
  const half = Math.floor(win / 2)
  return beats.map((b, i) => {
    const lo = Math.max(0, i - half)
    const hi = Math.min(beats.length, i + half + 1)
    const slice = beats.slice(lo, hi)
    let bestLabel = b.label
    let bestCount = -1
    for (const x of slice) {
      const c = slice.filter(y => y.label === x.label).length
      if (c > bestCount) {
        bestCount = c
        bestLabel = x.label
      }
    }
    const ref = slice.find(x => x.label === bestLabel)!
    return {
      ...b,
      rootPc: ref.rootPc,
      quality: ref.quality,
      label: ref.label,
      confidence: ref.confidence,
    }
  })
}

function mergeAdjacentBeats(beats: ChordBeat[], beatSec: number): ChordSegment[] {
  if (beats.length === 0) return []
  const out: ChordSegment[] = []
  let runStart = 0
  for (let i = 1; i <= beats.length; i++) {
    const boundary = i === beats.length || beats[i]!.label !== beats[i - 1]!.label
    if (boundary) {
      const first = beats[runStart]!
      const len = i - runStart
      out.push({
        label: first.label,
        rootPc: first.rootPc,
        quality: first.quality,
        startSec: runStart * beatSec,
        durationSec: len * beatSec,
      })
      runStart = i
    }
  }
  return out
}

function chordToMidiTriad(rootPc: number, quality: ChordQuality): [number, number, number] {
  const base = 48 + rootPc
  switch (quality) {
    case 'major':
      return [base, base + 4, base + 7]
    case 'minor':
      return [base, base + 3, base + 7]
    case 'dim':
      return [base, base + 3, base + 6]
    case 'aug':
      return [base, base + 4, base + 8]
    case 'sus4':
      return [base, base + 5, base + 7]
    default:
      return [base, base + 4, base + 7]
  }
}

export function clipChordSegmentsForExport(
  segments: readonly ChordSegment[],
  trimStartSec: number,
  trimEndSec: number,
  fullDurationSec: number,
): ChordSegment[] {
  const dur = Math.max(1e-9, fullDurationSec)
  let a = Math.min(trimStartSec, trimEndSec)
  let b = Math.max(trimStartSec, trimEndSec)
  a = Math.max(0, Math.min(a, dur))
  b = Math.max(0, Math.min(b, dur))
  if (b <= a + 1e-4) return []

  const out: ChordSegment[] = []
  for (const seg of segments) {
    const segEnd = seg.startSec + seg.durationSec
    const clipStart = Math.max(a, seg.startSec)
    const clipEnd = Math.min(b, segEnd)
    if (clipEnd <= clipStart + 1e-6) continue
    out.push({
      ...seg,
      startSec: clipStart - a,
      durationSec: clipEnd - clipStart,
    })
  }
  return out
}

export function buildChordMidiBlob(segments: readonly ChordSegment[], bpm: number): Blob {
  const midi = new Midi()
  midi.header.setTempo(bpm)
  midi.name = 'Chord Detector'
  const track = midi.addTrack()
  track.name = 'Chords'

  for (const seg of segments) {
    const notes = chordToMidiTriad(seg.rootPc, seg.quality)
    const dur = Math.max(1 / 32, seg.durationSec)
    for (const n of notes) {
      const midiN = Math.min(127, Math.max(0, Math.round(n)))
      track.addNote({
        midi: midiN,
        time: seg.startSec,
        duration: dur,
        velocity: 0.74,
      })
    }
  }

  const raw = midi.toArray()
  return new Blob([new Uint8Array(raw)], { type: 'audio/midi' })
}

export async function analyzeChordProgressionFromBlob(blob: Blob): Promise<ChordAnalysisResult> {
  let tagBpm: number | null = null
  try {
    const md = await parseBlob(blob, { duration: false })
    if (typeof md.common.bpm === 'number' && Number.isFinite(md.common.bpm)) {
      tagBpm = Math.round(md.common.bpm)
      if (tagBpm < 40 || tagBpm > 240) tagBpm = null
    }
  } catch {
    /* no tags */
  }

  const ctx = new AudioContext()
  try {
    const ab = await blob.arrayBuffer()
    const audioBuffer = await ctx.decodeAudioData(ab.slice(0))
    const sr = audioBuffer.sampleRate
    let mono = monoDownmix(audioBuffer)

    const maxSec = 96
    const maxSamples = Math.floor(maxSec * sr)
    if (mono.length > maxSamples) mono = mono.subarray(0, maxSamples)

    const est = estimateBpmFromMono(mono, sr)
    const bpm = tagBpm ?? est ?? 120
    const bpmSource: 'tags' | 'estimated' = tagBpm != null ? 'tags' : 'estimated'

    const frames = computeChromaFrameSeries(mono, sr)
    if (!frames) throw new Error('Need more audio — try a longer clip.')

    const beatSec = 60 / bpm
    const durationSec = mono.length / sr

    const aggregateNearTime = (centerSec: number, halfWinSec: number): Float32Array => {
      const agg = new Float32Array(12)
      let n = 0
      for (let fi = 0; fi < frames.length; fi++) {
        const ft = frameCenterSec(fi, sr)
        if (Math.abs(ft - centerSec) <= halfWinSec) {
          const fr = frames[fi]!
          for (let k = 0; k < 12; k++) agg[k] += fr[k]!
          n++
        }
      }
      if (n < 1) return l2Normalize12(agg)
      for (let k = 0; k < 12; k++) agg[k] /= n
      return l2Normalize12(agg)
    }

    const beatCount = Math.max(1, Math.floor(durationSec / beatSec))
    const rawBeats: ChordBeat[] = []
    for (let bi = 0; bi < beatCount; bi++) {
      const centerSec = bi * beatSec + beatSec * 0.5
      const chromaNorm = aggregateNearTime(centerSec, beatSec * 0.4)
      const best = bestChordForChromagram(chromaNorm)
      rawBeats.push({
        beatIndex: bi,
        rootPc: best.rootPc,
        quality: best.quality,
        label: formatChordLabel(best.rootPc, best.quality),
        confidence: best.score,
      })
    }

    const smoothed = medianFilterBeats(rawBeats, 3)
    const segments = mergeAdjacentBeats(smoothed, beatSec)

    return {
      bpm,
      bpmSource,
      durationSec,
      beats: smoothed,
      segments,
    }
  } finally {
    await ctx.close().catch(() => {})
  }
}
