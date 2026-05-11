import { useBffConfig } from '../context/BffConfigContext'
import { useUiChrome } from '../context/UiChromeContext'
import { getRouteConnectionBadge } from '../lib/route-connection'

interface ConnectionPillProps {
  activeRouteId: string
}

/**
 * Top-right pill when the current route depends on /api and the BFF is down or required keys are missing.
 */
export default function ConnectionPill({ activeRouteId }: ConnectionPillProps) {
  const { config, loading } = useBffConfig()
  const { agentFarmTab } = useUiChrome()
  const state = getRouteConnectionBadge(activeRouteId, config, loading, agentFarmTab)

  if (!state.show) return null

  return (
    <div
      className="pointer-events-none absolute top-4 right-5 z-30 flex max-w-[min(320px,52vw)] justify-end"
      role="status"
      aria-live="polite"
    >
      <span
        title={state.detail}
        className={`pointer-events-auto rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide shadow-lg backdrop-blur-md ${state.className}`}
      >
        {state.label}
      </span>
    </div>
  )
}
