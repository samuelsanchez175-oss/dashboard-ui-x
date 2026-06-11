import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { AgentFarmTabId } from '../components/agent-farm/types'

type UiChromeContextValue = {
  agentFarmTab: AgentFarmTabId | null
  setAgentFarmTab: (tab: AgentFarmTabId | null) => void
}

const UiChromeContext = createContext<UiChromeContextValue | null>(null)

export function UiChromeProvider({ children }: { children: ReactNode }) {
  const [agentFarmTab, setAgentFarmTab] = useState<AgentFarmTabId | null>(null)
  const value = useMemo(() => ({ agentFarmTab, setAgentFarmTab }), [agentFarmTab])
  return <UiChromeContext.Provider value={value}>{children}</UiChromeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- provider + hook colocated (context pattern); fast-refresh granularity only, no runtime impact
export function useUiChrome(): UiChromeContextValue {
  const ctx = useContext(UiChromeContext)
  if (!ctx) throw new Error('useUiChrome must be used within UiChromeProvider')
  return ctx
}
