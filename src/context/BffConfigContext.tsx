import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fetchConfigStatus, type ConfigStatus } from '../lib/agent-farm-api'

type BffConfigContextValue = {
  config: ConfigStatus | null
  loading: boolean
  refresh: () => Promise<void>
}

const BffConfigContext = createContext<BffConfigContextValue | null>(null)

export function BffConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ConfigStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const s = await fetchConfigStatus()
    setConfig(s)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo(() => ({ config, loading, refresh }), [config, loading, refresh])

  return <BffConfigContext.Provider value={value}>{children}</BffConfigContext.Provider>
}

export function useBffConfig(): BffConfigContextValue {
  const ctx = useContext(BffConfigContext)
  if (!ctx) throw new Error('useBffConfig must be used within BffConfigProvider')
  return ctx
}
