import { SlidersHorizontal } from 'lucide-react'
import MixingBoardPanel from './MixingBoardPanel'
import ZoneHeader from '../../components/ZoneHeader'
import { CONTAINERS } from '../../lib/design-tokens'

export default function MixingZone() {
  return (
    <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}>
      <div className={`${CONTAINERS.narrow} py-[var(--pad-card)] space-y-6`}>
        <ZoneHeader
          title="Mix board"
          icon={SlidersHorizontal}
          description="Placeholder zone for mix recalls, stems, and DAW-adjacent tools."
        />
        <MixingBoardPanel />
      </div>
    </div>
  )
}
