/** Encode mono Float32 PCM (-1…1) as a little-endian WAV (PCM 16) blob. */

import { dispatchFileDownload } from '../components/files-dock/files-store'

function floatToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i] ?? 0
    const s = Math.max(-1, Math.min(1, x))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

export function encodeMonoPcm16Wav(samples: Float32Array, sampleRate: number): Blob {
  const pcm = floatToInt16(samples)
  const byteRate = sampleRate * 2
  const blockAlign = 2
  const dataSize = pcm.length * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  let offset = 0

  const writeStr = (s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
    offset += s.length
  }

  writeStr('RIFF')
  view.setUint32(offset, 36 + dataSize, true)
  offset += 4
  writeStr('WAVEfmt ')
  view.setUint32(offset, 16, true)
  offset += 4
  view.setUint16(offset, 1, true)
  offset += 2
  view.setUint16(offset, 1, true)
  offset += 2
  view.setUint32(offset, sampleRate, true)
  offset += 4
  view.setUint32(offset, byteRate, true)
  offset += 4
  view.setUint16(offset, blockAlign, true)
  offset += 2
  view.setUint16(offset, 16, true)
  offset += 2
  writeStr('data')
  view.setUint32(offset, dataSize, true)
  offset += 4

  for (let i = 0; i < pcm.length; i++, offset += 2) {
    view.setInt16(offset, pcm[i] ?? 0, true)
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

export function triggerDownload(
  blob: Blob,
  filename: string,
  /** When provided, the file is also saved to the dashboard gallery, tagged. */
  meta?: { sourceTool?: string; outputType?: string; tags?: string[] },
): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)

  if (meta) {
    dispatchFileDownload({
      blob, name: filename,
      sourceTool: meta.sourceTool, outputType: meta.outputType, tags: meta.tags,
    })
  }
}
