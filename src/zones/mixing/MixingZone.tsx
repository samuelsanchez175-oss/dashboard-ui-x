import { SlidersHorizontal } from 'lucide-react'
import MixingBoardPanel from './MixingBoardPanel'

export default function MixingZone() {
  return (
    <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}>
      <div className="max-w-3xl mx-auto p-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
            <SlidersHorizontal className="size-5" style={{ color: 'var(--text-2)' }} aria-hidden />
            Mix board
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
            Placeholder zone for mix recalls, stems, and DAW-adjacent tools.
          </p>
        </div>
        <MixingBoardPanel />
      </div>
    </div>
  )
}
