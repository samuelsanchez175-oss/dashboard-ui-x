import { useMockData } from '../context/MockDataContext'

type ToggleVariant = 'light' | 'dark'

/** `vehicle`: Tesla Fleet zone — avoid the word “Mock” in toggle chrome (same persisted flag). */
type ToggleCopyVariant = 'default' | 'vehicle'

/**
 * Global mock-data switch — persisted in localStorage. Use wherever sample / scaffold data is shown.
 */
export function MockDataToggle({
  variant = 'light',
  copyVariant = 'default',
  className = '',
  forcedOff = false,
  forcedOffTitle = 'Mock data stays off while live API credentials are active.',
}: {
  variant?: ToggleVariant
  copyVariant?: ToggleCopyVariant
  className?: string
  /** When true, the toggle is disabled and shown as off (e.g. live keys supersede mock fixtures). */
  forcedOff?: boolean
  forcedOffTitle?: string
}) {
  const { mockDataEnabled, toggleMockData } = useMockData()
  const shownOn = forcedOff ? false : mockDataEnabled

  const styles =
    variant === 'light'
      ? shownOn
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/90'
        : 'border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200/80'
      : shownOn
        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15'
        : 'border-white/15 bg-white/[0.06] text-zinc-400 hover:bg-white/10'

  const dotClass = shownOn ? 'bg-emerald-500' : 'bg-zinc-400'
  const forcedStyles = forcedOff ? ' cursor-not-allowed opacity-75' : ''

  const title =
    forcedOff
      ? forcedOffTitle
      : copyVariant === 'vehicle'
        ? mockDataEnabled
          ? 'Turn off sample vehicle charts'
          : 'Turn on sample vehicle charts (demo data shapes)'
        : mockDataEnabled
          ? 'Turn off sample/mock dashboard data'
          : 'Turn on sample/mock dashboard data'

  const label =
    copyVariant === 'vehicle'
      ? shownOn
        ? 'Demo charts on'
        : 'Demo charts off'
      : shownOn
        ? 'Mock data on'
        : 'Mock data off'

  return (
    <button
      type="button"
      onClick={() => {
        if (forcedOff) return
        toggleMockData()
      }}
      disabled={forcedOff}
      aria-pressed={shownOn}
      aria-disabled={forcedOff}
      title={title}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${styles}${forcedStyles} ${className}`}
    >
      <span className={`size-2 shrink-0 rounded-full ${dotClass}`} aria-hidden />
      {label}
    </button>
  )
}

/** Agent Farm — placeholder when a tab’s fixtures are hidden. */
export function AgentFarmMockOffPlaceholder() {
  return (
    <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-6 py-12 text-center">
      <p className="text-sm font-medium text-zinc-300">Mock data is off</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-zinc-500">
        Sample metrics for this section are hidden. Use the <strong className="text-zinc-400">Mock data</strong> toggle at
        the top of Agent Farm (Overview tab) to show fixtures again.
      </p>
    </div>
  )
}
