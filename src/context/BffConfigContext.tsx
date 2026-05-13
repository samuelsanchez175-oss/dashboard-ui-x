import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fetchConfigStatus, type ConfigStatus } from '../lib/agent-farm-api'
import { subscribeApiKeys } from '../lib/api-keys'

type BffConfigContextValue = {
  config: ConfigStatus | null
  loading: boolean
  /** Refetch `/api/config/status`. Pass `{ silent: true }` to avoid toggling `loading` (e.g. after scratch key edits). */
  refresh: (opts?: { silent?: boolean }) => Promise<void>
}

const BffConfigContext = createContext<BffConfigContextValue | null>(null)

export function BffConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ConfigStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent)
    if (!silent) setLoading(true)
    const s = await fetchConfigStatus()
    setConfig(s)
    if (!silent) setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /** Scratch keys from Settings / quick modal change which headers are sent — re-probe flags after edits (debounced). */
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | undefined
    let skipInitial = true
    const unsub = subscribeApiKeys(() => {
      if (skipInitial) {
        skipInitial = false
        return
      }
      clearTimeout(debounce)
      debounce = setTimeout(() => {
        void refresh({ silent: true })
      }, 450)
    })
    return () => {
      unsub()
      clearTimeout(debounce)
    }
  }, [refresh])

  const value = useMemo(() => ({ config, loading, refresh }), [config, loading, refresh])

  return <BffConfigContext.Provider value={value}>{children}</BffConfigContext.Provider>
}

export function useBffConfig(): BffConfigContextValue {
  const ctx = useContext(BffConfigContext)
  if (!ctx) throw new Error('useBffConfig must be used within BffConfigProvider')
  return ctx
}
