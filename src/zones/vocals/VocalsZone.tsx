import { Mic2 } from 'lucide-react'
import PianoStudio from '../../components/piano/PianoStudio'
import ZoneHeader from '../../components/ZoneHeader'

/** Vocals zone: MIDI-first piano workspace (export, scales, chords). */
export default function VocalsZone() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}
    >
      <div
        className="shrink-0 border-b px-8 pb-4 pt-8"
        style={{ borderColor: 'var(--border)' }}
      >
        <ZoneHeader
          title="Vocals"
          icon={Mic2}
          description="MIDI-first piano workspace — export, scales, chords."
        />
      </div>
      <div className="min-h-0 flex-1">
        <PianoStudio />
      </div>
    </div>
  )
}
