import { parseBlob } from 'music-metadata'

import type { MixClipAnalysisSource, MixClipMeta } from './mixing-audio-idb'
import { estimateMusicalKeyFromMono } from './mixing-audio-key-estimate'
import { deriveScaleFromKey, suggestRapKeyTip } from './mixing-audio-meta-shared'

export function monoDownmix(audioBuffer: AudioBuffer): Float32Array {
  const n = audioBuffer.length
  const out = new Float32Array(n)
  const ch = audioBuffer.numberOfChannels
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let c = 0; c < ch; c++) s += audioBuffer.getChannelData(c)[i]!
    out[i] = s / ch
  }
  return out
}

function energyEnvelope(mono: Float32Array, hop: number): Float32Array {
  const frames = Math.floor((mono.length - hop) / hop)
  const env = new Float32Array(frames)
  for (let i = 0; i < frames; i++) {
    let sum = 0
    const start = i * hop
    for (let j = 0; j < hop; j++) {
      const v = mono[start + j]!
      sum += v * v
    }
    env[i] = Math.sqrt(sum / hop)
  }
  return env
}

/** Rough BPM from beat-wise autocorrelation (fallback when tags lack TBPM). */
export function estimateBpmFromMono(mono: Float32Array, sampleRate: number): number | null {
  const hop = 512
  const maxSec = 42
  const maxSamples = Math.min(mono.length, Math.floor(maxSec * sampleRate))
  const monoSlice = mono.subarray(0, maxSamples)
  const env = energyEnvelope(monoSlice, hop)
  if (env.length < 64) return null

  const minBpm = 72
  const maxBpm = 176
  const minLag = Math.max(2, Math.floor((60 / maxBpm) * (sampleRate / hop)))
  const maxLag = Math.min(Math.floor(env.length / 2) - 1, Math.ceil((60 / minBpm) * (sampleRate / hop)))

  let bestLag = 0
  let bestScore = -Infinity
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0
    const denom = env.length - lag
    for (let i = 0; i < denom; i++) sum += env[i]! * env[i + lag]!
    const score = sum / denom
    if (score > bestScore) {
      bestScore = score
      bestLag = lag
    }
  }
  if (bestLag <= 0) return null

  let bpm = (60 * sampleRate) / (hop * bestLag)
  while (bpm < minBpm) bpm *= 2
  while (bpm > maxBpm) bpm /= 2
  const rounded = Math.round(bpm)
  if (rounded < minBpm || rounded > maxBpm) return null
  return rounded
}

/** Decode blob and run tempo heuristic (single decode). Kept for callers that only need BPM. */
export function estimateBpmFromBlob(blob: Blob): Promise<number | null> {
  return blob.arrayBuffer().then(async ab => {
    const ctx = new AudioContext()
    try {
      const audioBuffer = await ctx.decodeAudioData(ab.slice(0))
      const mono = monoDownmix(audioBuffer)
      return estimateBpmFromMono(mono, audioBuffer.sampleRate)
    } catch {
      return null
    } finally {
      await ctx.close().catch(() => {})
    }
  })
}

function resolveAnalysisSource(tagKey: string | null, tagBpm: number | null, chromagramKey: boolean): MixClipAnalysisSource {
  const hasTagKey = tagKey != null
  const hasTagBpm = tagBpm != null

  if (hasTagKey && hasTagBpm) return 'tags'
  if (!hasTagKey && chromagramKey && hasTagBpm) return 'hybrid'
  if (!hasTagKey && chromagramKey) return 'chromagram'
  if (hasTagKey || hasTagBpm) return 'hybrid'
  return 'estimated'
}

export async function analyzeMixClipBlob(blob: Blob): Promise<MixClipMeta> {
  let tagBpm: number | null = null
  let tagKey: string | null = null

  try {
    const md = await parseBlob(blob, { duration: false })
    if (typeof md.common.bpm === 'number' && Number.isFinite(md.common.bpm)) {
      tagBpm = Math.round(md.common.bpm)
      if (tagBpm < 40 || tagBpm > 240) tagBpm = null
    }
    if (typeof md.common.key === 'string' && md.common.key.trim()) {
      tagKey = md.common.key.trim().slice(0, 64)
    }
  } catch {
    /* tags unavailable */
  }

  let estBpm: number | null = null
  let estKeyLabel: string | null = null

  const ctx = new AudioContext()
  try {
    const ab = await blob.arrayBuffer()
    const audioBuffer = await ctx.decodeAudioData(ab.slice(0))
    const sr = audioBuffer.sampleRate
    const monoFull = monoDownmix(audioBuffer)

    if (tagBpm == null) {
      estBpm = estimateBpmFromMono(monoFull, sr)
    }

    if (tagKey == null) {
      const keySliceLen = Math.min(monoFull.length, Math.floor(72 * sr))
      const monoKey = monoFull.subarray(0, keySliceLen)
      const ek = estimateMusicalKeyFromMono(monoKey, sr)
      estKeyLabel = ek?.label ?? null
    }
  } catch {
    /* decode failed — fall through with tags / null estimates */
  } finally {
    await ctx.close().catch(() => {})
  }

  const bpm = tagBpm ?? estBpm
  const key = tagKey ?? estKeyLabel
  const scale = deriveScaleFromKey(key)
  const chromagramKey = tagKey == null && estKeyLabel != null
  const source = resolveAnalysisSource(tagKey, tagBpm, chromagramKey)

  const tipExtra =
    chromagramKey && tagKey == null
      ? ' Key estimated locally (chromagram); verify against your ears or external analyzers on tricky loops.'
      : ''

  return {
    bpm,
    key,
    scale,
    rapKeyTip: suggestRapKeyTip(key, scale, bpm) + tipExtra,
    source,
    analyzedAt: Date.now(),
  }
}
