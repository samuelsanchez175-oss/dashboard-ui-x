import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'ui-dashboard-x-mock-data-enabled'

function readStoredMockPreference(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === '0' || raw === 'false') return false
    if (raw === '1' || raw === 'true') return true
  } catch {
    /* private mode */
  }
  return true
}

type MockDataContextValue = {
  mockDataEnabled: boolean
  setMockDataEnabled: (next: boolean) => void
  toggleMockData: () => void
}

const MockDataContext = createContext<MockDataContextValue | null>(null)

export function MockDataProvider({ children }: { children: ReactNode }) {
  const [mockDataEnabled, setMockDataEnabledState] = useState<boolean>(readStoredMockPreference)

  const setMockDataEnabled = useCallback((next: boolean) => {
    setMockDataEnabledState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      /* quota */
    }
  }, [])

  const toggleMockData = useCallback(() => {
    setMockDataEnabledState(prev => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ mockDataEnabled, setMockDataEnabled, toggleMockData }),
    [mockDataEnabled, setMockDataEnabled, toggleMockData],
  )

  return <MockDataContext.Provider value={value}>{children}</MockDataContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- provider + hook colocated (context pattern); fast-refresh granularity only, no runtime impact
export function useMockData(): MockDataContextValue {
  const ctx = useContext(MockDataContext)
  if (!ctx) throw new Error('useMockData must be used within MockDataProvider')
  return ctx
}
