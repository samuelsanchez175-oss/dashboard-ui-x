import { ROOTS, SCALES } from './chords'

interface ScaleSelectorProps {
  rootId: string
  onRootChange: (id: string) => void
  scaleId: string
  onScaleChange: (id: string) => void
}

export default function ScaleSelector({
  rootId, onRootChange, scaleId, onScaleChange,
}: ScaleSelectorProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-gray-800">Scale highlight</h3>
        <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">
          on keyboard
        </span>
      </div>

      <div>
        <label className="text-[10px] font-mono uppercase tracking-wider text-gray-400">Key</label>
        <div className="mt-1 grid grid-cols-12 gap-1">
          {ROOTS.map(r => (
            <button
              key={r.id}
              onClick={() => onRootChange(r.id)}
              className={`
                py-1.5 rounded-md text-[11px] font-medium transition-colors
                ${r.id === rootId
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }
              `}
            >
              {r.label.split('/')[0]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[10px] font-mono uppercase tracking-wider text-gray-400">Scale</label>
        <select
          value={scaleId}
          onChange={e => onScaleChange(e.target.value)}
          className="mt-1 w-full rounded-md border border-gray-200 bg-white py-1.5 px-2 text-[12px] text-gray-700 focus:border-purple-400 focus:outline-none"
        >
          {SCALES.map(s => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>

      <p className="text-[11px] text-gray-400 leading-snug">
        In-scale keys get a soft purple tint. The root is highlighted darker.
      </p>
    </div>
  )
}
