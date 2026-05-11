import { useMockData } from '../context/MockDataContext'

type ToggleVariant = 'light' | 'dark'

/**
 * Global mock-data switch — persisted in localStorage. Use wherever sample / scaffold data is shown.
 */
export function MockDataToggle({
  variant = 'light',
  className = '',
}: {
  variant?: ToggleVariant
  className?: string
}) {
  const { mockDataEnabled, toggleMockData } = useMockData()

  const styles =
    variant === 'light'
      ? mockDataEnabled
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/90'
        : 'border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200/80'
      : mockDataEnabled
        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15'
        : 'border-white/15 bg-white/[0.06] text-zinc-400 hover:bg-white/10'

  const dotClass = mockDataEnabled ? 'bg-emerald-500' : 'bg-zinc-400'

  return (
    <button
      type="button"
      onClick={toggleMockData}
      aria-pressed={mockDataEnabled}
      title={mockDataEnabled ? 'Turn off sample/mock dashboard data' : 'Turn on sample/mock dashboard data'}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${styles} ${className}`}
    >
      <span className={`size-2 shrink-0 rounded-full ${dotClass}`} aria-hidden />
      {mockDataEnabled ? 'Mock data on' : 'Mock data off'}
    </button>
  )
}

/** Agent Farm — placeholder when a tab’s fixtures are hidden. */
export function AgentFarmMockOffPlaceholder() {
  return (
    <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-6 py-12 text-center">
      <p className="text-sm font-medium text-zinc-300">Mock data is off</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-zinc-500">
        Sample metrics for this section are hidden. Use the <strong className="text-zinc-400">Mock data</strong> toggle on
        Production overview or at the top of Agent Farm to show fixtures again.
      </p>
    </div>
  )
}
