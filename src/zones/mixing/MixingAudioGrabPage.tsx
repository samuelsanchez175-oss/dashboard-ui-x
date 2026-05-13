import { Headphones } from 'lucide-react'
import MixingAudioGrabber from './MixingAudioGrabber'
import ZoneHeader from '../../components/ZoneHeader'

/** Sidebar route — YouTube → MP3 workspace + dock. */
export default function MixingAudioGrabPage() {
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
          title="Audio grab"
          icon={Headphones}
          description="Pull MP3 audio locally via the dev server — clips stack in the dock below."
        />
      </div>
      <MixingAudioGrabber />
    </div>
  )
}
