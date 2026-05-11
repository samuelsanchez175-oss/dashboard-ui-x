import { ArrowLeft } from 'lucide-react'
import MixingAudioGrabber from '../mixing/MixingAudioGrabber'
import StudioToolsHeader from './StudioToolsHeader'

interface ToolsYoutubePageProps {
  onNavigate: (routeId: string) => void
}

export default function ToolsYoutubePage({ onNavigate }: ToolsYoutubePageProps) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{ background: 'var(--bg-canvas)' }}
    >
      <StudioToolsHeader
        crumbs={[
          { label: 'Workspace' },
          { label: 'Tools' },
          { label: 'YouTube downloader', emphasis: true },
        ]}
        leftExtra={
          <button
            type="button"
            onClick={() => onNavigate('tools-hub')}
            className="mr-2 rounded-lg p-2 transition"
            style={{
              background: 'var(--bg-card)',
              border:     '1px solid var(--border)',
              color:      'var(--text-2)',
              boxShadow:  'var(--shadow-sm)',
            }}
            aria-label="Back to Tools Hub"
          >
            <ArrowLeft className="size-4" strokeWidth={2} />
          </button>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col" style={{ background: 'var(--bg-canvas)' }}>
        <div
          className="shrink-0 px-8 pb-4 pt-8"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>
            YouTube downloader
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-3)' }}>
            Paste a link — clips decode locally and stack in the dock with optional key / BPM readouts.
          </p>
        </div>
        <MixingAudioGrabber />
      </div>
    </div>
  )
}
