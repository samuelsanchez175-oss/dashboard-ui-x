import { ClipboardCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  loadTeslaChecklist,
  saveTeslaChecklist,
  TESLA_FLEET_GROUND_TRUTH,
} from './tesla-fleet-ground-truth'

export function TeslaFleetGroundTruthChecklist() {
  const [checked, setChecked] = useState<Record<string, boolean>>(() => loadTeslaChecklist())

  useEffect(() => {
    saveTeslaChecklist(checked)
  }, [checked])

  const allIds = useMemo(() => {
    const ids: string[] = []
    for (const g of TESLA_FLEET_GROUND_TRUTH) {
      for (const it of g.items) ids.push(it.id)
    }
    return ids
  }, [])

  const doneCount = useMemo(() => allIds.filter(id => checked[id]).length, [allIds, checked])

  const toggle = useCallback((id: string) => {
    setChecked(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const clearProgress = useCallback(() => setChecked({}), [])

  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50/50 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 bg-white px-5 py-4">
        <div className="flex gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
            <ClipboardCheck className="size-5 text-gray-700" aria-hidden />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Fleet API ground truth</h2>
            <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-gray-500">
              Checklist of typical <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[11px]">vehicle_data</code>{' '}
              domains and paths. Use while wiring Tesla Fleet / telemetry so nothing is dropped between ingest and UI.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium tabular-nums text-gray-700">
            {doneCount}/{allIds.length} verified
          </span>
          <button
            type="button"
            onClick={clearProgress}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Reset checklist
          </button>
        </div>
      </div>

      <div className="space-y-6 p-5">
        {TESLA_FLEET_GROUND_TRUTH.map(group => (
          <div key={group.id}>
            <div className="mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{group.title}</h3>
              {group.description ? (
                <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500">{group.description}</p>
              ) : null}
            </div>
            <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
              {group.items.map(item => (
                <li key={item.id}>
                  <label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-gray-50/80">
                    <input
                      type="checkbox"
                      checked={Boolean(checked[item.id])}
                      onChange={() => toggle(item.id)}
                      className="mt-0.5 size-4 shrink-0 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900">{item.label}</span>
                      <span className="mt-0.5 block font-mono text-[11px] text-gray-500">{item.pathHint}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
