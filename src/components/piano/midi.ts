import { Midi } from '@tonejs/midi'
import type { RecordedNote } from './engine'

/**
 * Convert recorded notes to a downloadable .mid Blob and trigger a download.
 */
export function exportMidi(notes: RecordedNote[], bpm: number, filename = 'piano.mid') {
  if (!notes.length) return false

  const midi = new Midi()
  midi.header.setTempo(bpm)
  const track = midi.addTrack()
  track.name = 'Piano'

  for (const n of notes) {
    track.addNote({
      midi: n.midi,
      time: n.start,
      duration: Math.max(0.05, n.duration),
      velocity: n.velocity,
    })
  }

  // `.toArray()` returns Uint8Array — copy into a fresh buffer for Blob typing.
  const bytes = new Uint8Array(midi.toArray())
  const blob = new Blob([bytes.buffer], { type: 'audio/midi' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}
