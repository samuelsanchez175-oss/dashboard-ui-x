import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import {
  appendClientError,
  runDashboardDiagnostics,
  summarizeDiagnostics,
  type ClientDiagError,
  type DiagnosticsReport,
} from '../lib/dashboard-diagnostics'

export type DiagnosticsBadgeTone = 'neutral' | 'warn' | 'critical'

type DiagnosticsContextValue = {
  report: DiagnosticsReport | null
  running: boolean
  clientErrors: ClientDiagError[]
  /** Pass `true` to run RSS / YouTube / Gemini / OpenAI probes (manual button). Background refresh stays lightweight. */
  refresh: (extendedApiSmoke?: boolean) => Promise<void>
  clearClientErrors: () => void
  /** Sidebar badge: checks needing attention + JS errors bucket. */
  openBadgeCount: number
  badgeTone: DiagnosticsBadgeTone
}

const DiagnosticsContext = createContext<DiagnosticsContextValue | null>(null)

export function DiagnosticsProvider({ children }: { children: ReactNode }) {
  const [report, setReport] = useState<DiagnosticsReport | null>(null)
  const [running, setRunning] = useState(false)
  const [clientErrors, setClientErrors] = useState<ClientDiagError[]>([])
  const alive = useRef(true)

  const refresh = useCallback(async (extendedApiSmoke = false) => {
    setRunning(true)
    try {
      const r = await runDashboardDiagnostics({ extendedApiSmoke })
      if (alive.current) setReport(r)
    } finally {
      if (alive.current) setRunning(false)
    }
  }, [])

  useEffect(() => {
    alive.current = true
    void refresh()
    let intervalId: ReturnType<typeof setInterval> | undefined
    if (import.meta.env.DEV) {
      intervalId = setInterval(() => void refresh(), 90_000)
    }
    return () => {
      alive.current = false
      if (intervalId !== undefined) clearInterval(intervalId)
    }
  }, [refresh])

  useEffect(() => {
    const onError = (ev: ErrorEvent) => {
      setClientErrors(prev =>
        appendClientError(prev, {
          kind: 'error',
          message: ev.message || 'Script error',
          source: ev.filename ? `${ev.filename}:${ev.lineno}` : undefined,
        }),
      )
    }
    const onRej = (ev: PromiseRejectionEvent) => {
      const msg =
        ev.reason instanceof Error
          ? ev.reason.message
          : typeof ev.reason === 'string'
            ? ev.reason
            : 'Unhandled rejection'
      setClientErrors(prev => appendClientError(prev, { kind: 'rejection', message: msg }))
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRej)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRej)
    }
  }, [])

  const clearClientErrors = useCallback(() => setClientErrors([]), [])

  const { openBadgeCount, badgeTone } = useMemo(() => {
    const fromReport = summarizeDiagnostics(report).openIssueCount
    const fromErrors = clientErrors.length > 0 ? 1 : 0
    const openBadgeCount = fromReport + fromErrors
    const criticalChecks = report?.checks.filter(c => c.severity === 'critical').length ?? 0
    const badgeTone: DiagnosticsBadgeTone =
      clientErrors.length > 0 || criticalChecks > 0 ? 'critical' : fromReport > 0 ? 'warn' : 'neutral'
    return { openBadgeCount, badgeTone }
  }, [report, clientErrors])

  const value = useMemo(
    () => ({
      report,
      running,
      clientErrors,
      refresh,
      clearClientErrors,
      openBadgeCount,
      badgeTone,
    }),
    [report, running, clientErrors, refresh, clearClientErrors, openBadgeCount, badgeTone],
  )

  return <DiagnosticsContext.Provider value={value}>{children}</DiagnosticsContext.Provider>
}

export function useDiagnostics(): DiagnosticsContextValue {
  const ctx = useContext(DiagnosticsContext)
  if (!ctx) throw new Error('useDiagnostics must be used within DiagnosticsProvider')
  return ctx
}
