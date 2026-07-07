import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useBffConfig } from '../context/BffConfigContext'
import { useUiChrome } from '../context/UiChromeContext'
import { getRouteConnectionBadge } from '../lib/route-connection'
import { getApiKey, setApiKey } from '../lib/api-keys'

interface ConnectionPillProps {
  activeRouteId: string
  onNavigate: (routeId: string) => void
}

const QUICK_KEYS: readonly { envKey: string; label: string; helper: string; multiline?: boolean }[] = [
  {
    envKey: 'YOUTUBE_API_KEY',
    label: 'YOUTUBE_API_KEY',
    helper: 'Optional if GOOGLE_API_KEY allows YouTube Data API v3.',
  },
  {
    envKey: 'GOOGLE_API_KEY',
    label: 'GOOGLE_API_KEY',
    helper: 'Fallback for YouTube when YOUTUBE_API_KEY is empty.',
  },
  {
    envKey: 'GEMINI_API_KEY',
    label: 'GEMINI_API_KEY',
    helper: 'Gemini / Generative Language API (server + scratch).',
  },
  {
    envKey: 'RSS_FEED_URLS',
    label: 'RSS_FEED_URLS',
    helper: 'Comma-separated feed URLs.',
    multiline: true,
  },
]

function loadDraft(): Record<string, string> {
  const d: Record<string, string> = {}
  for (const row of QUICK_KEYS) {
    d[row.envKey] = getApiKey(row.envKey)
  }
  return d
}

/**
 * Top-right pill when the current route depends on /api and the BFF is down or required keys are missing.
 * Actionable pills open a quick key modal or navigate to Settings.
 */
export default function ConnectionPill({ activeRouteId, onNavigate }: ConnectionPillProps) {
  const { config, loading, refresh } = useBffConfig()
  const { agentFarmTab } = useUiChrome()
  const state = getRouteConnectionBadge(activeRouteId, config, loading, agentFarmTab)

  const [modalOpen, setModalOpen] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saveBusy, setSaveBusy] = useState(false)
  const baseId = useId()
  const titleId = `${baseId}-qk-title`
  const geminiInputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null)

  useEffect(() => {
    if (!modalOpen) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load a fresh draft from storage each time the modal opens (reset-on-open, not a cascading render)
    setDraft(loadDraft())
  }, [modalOpen])

  useEffect(() => {
    if (!modalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saveBusy) setModalOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalOpen, saveBusy])

  useEffect(() => {
    if (!modalOpen || state.quickKeysHighlight !== 'gemini') return
    const t = window.setTimeout(() => {
      const el = geminiInputRef.current
      if (el) {
        el.focus()
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }, 50)
    return () => clearTimeout(t)
  }, [modalOpen, state.quickKeysHighlight])

  const openQuickKeys = useCallback(() => {
    setDraft(loadDraft())
    setModalOpen(true)
  }, [])

  const saveQuickKeys = useCallback(async () => {
    setSaveBusy(true)
    try {
      for (const row of QUICK_KEYS) {
        setApiKey(row.envKey, draft[row.envKey] ?? '')
      }
      await refresh({ silent: true })
      setModalOpen(false)
    } finally {
      setSaveBusy(false)
    }
  }, [draft, refresh])

  const goSettings = useCallback(() => {
    setModalOpen(false)
    onNavigate('dev')
  }, [onNavigate])

  const onPillClick = useCallback(() => {
    if (state.interaction === 'settings-only') {
      goSettings()
      return
    }
    if (state.interaction === 'quick-keys') {
      openQuickKeys()
    }
  }, [goSettings, openQuickKeys, state.interaction])

  if (!state.show) return null

  const pillClass = `rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide shadow-lg backdrop-blur-md ${state.className}`
  const isInteractive = state.interaction === 'quick-keys' || state.interaction === 'settings-only'

  return (
    <>
      <div
        className="pointer-events-none absolute top-4 right-5 z-30 flex max-w-[min(320px,52vw)] justify-end"
        role="presentation"
      >
        {isInteractive ? (
          <button
            type="button"
            title={state.detail}
            aria-label={`${state.label}. ${state.detail}`}
            aria-expanded={state.interaction === 'quick-keys' ? modalOpen : undefined}
            aria-haspopup={state.interaction === 'quick-keys' ? 'dialog' : undefined}
            aria-controls={state.interaction === 'quick-keys' && modalOpen ? `${baseId}-qk-dialog` : undefined}
            onClick={onPillClick}
            className={`pointer-events-auto ${pillClass} cursor-pointer outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-amber-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent`}
          >
            {state.label}
          </button>
        ) : (
          <span
            title={state.detail}
            role="status"
            aria-live="polite"
            className={`pointer-events-auto ${pillClass}`}
          >
            {state.label}
          </span>
        )}
      </div>

      {modalOpen && state.interaction === 'quick-keys' && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          role="presentation"
          onMouseDown={e => {
            if (e.target === e.currentTarget && !saveBusy) setModalOpen(false)
          }}
        >
          <div
            id={`${baseId}-qk-dialog`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="max-h-[min(90vh,640px)] w-full max-w-lg overflow-y-auto rounded-2xl border p-5 shadow-2xl bg-[var(--bg-elevated,var(--bg-canvas))] border-[var(--border-muted,rgba(255,255,255,0.12))] text-t1"
            onMouseDown={e => e.stopPropagation()}
          >
            <h2 id={titleId} className="text-sm font-semibold tracking-tight">
              Quick integration keys
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-t3">
              Values are saved to the same scratch store as{' '}
              <span className="font-medium text-t2">
                Settings &amp; API keys
              </span>{' '}
              and sent on <code className="rounded px-1 text-[10px]">/api/*</code> as{' '}
              <code className="rounded px-1 text-[10px]">x-user-key-*</code>.
            </p>

            <div className="mt-4 space-y-4">
              {QUICK_KEYS.map(row => {
                const highlight = state.quickKeysHighlight === 'gemini' && row.envKey === 'GEMINI_API_KEY'
                const commonLabel = (
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-t2">
                    {row.label}
                  </label>
                )
                const val = draft[row.envKey] ?? ''
                const setVal = (v: string) => setDraft(d => ({ ...d, [row.envKey]: v }))

                if (row.multiline) {
                  return (
                    <div key={row.envKey}>
                      {commonLabel}
                      <textarea
                        value={val}
                        onChange={e => setVal(e.target.value)}
                        rows={3}
                        autoComplete="off"
                        spellCheck={false}
                        className="mt-1 w-full resize-y rounded-lg border bg-black/20 px-2.5 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 border-[var(--border-muted,rgba(255,255,255,0.12))] text-t1"
                      />
                      <p className="mt-0.5 text-[10px] text-t4">
                        {row.helper}
                      </p>
                    </div>
                  )
                }

                const refCb = row.envKey === 'GEMINI_API_KEY'
                  ? (el: HTMLInputElement | null) => {
                      geminiInputRef.current = el
                    }
                  : undefined

                return (
                  <div
                    key={row.envKey}
                    className={highlight ? 'rounded-lg ring-2 ring-amber-400/50 ring-offset-2 ring-offset-transparent' : undefined}
                  >
                    {commonLabel}
                    <input
                      ref={refCb}
                      type="password"
                      value={val}
                      onChange={e => setVal(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                      className="mt-1 w-full rounded-lg border bg-black/20 px-2.5 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 border-[var(--border-muted,rgba(255,255,255,0.12))] text-t1"
                    />
                    <p className="mt-0.5 text-[10px] text-t4">
                      {row.helper}
                    </p>
                  </div>
                )
              })}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={saveBusy}
                onClick={() => void saveQuickKeys()}
                className="rounded-lg px-3 py-2 text-xs font-semibold text-white transition disabled:opacity-50 bg-accent"
              >
                {saveBusy ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                disabled={saveBusy}
                onClick={() => setModalOpen(false)}
                className="rounded-lg border px-3 py-2 text-xs font-medium transition hover:bg-white/5 disabled:opacity-50 border-[var(--border-muted,rgba(255,255,255,0.12))] text-t2"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saveBusy}
                onClick={goSettings}
                className="ml-auto text-xs font-medium underline decoration-dotted underline-offset-2 text-accent"
              >
                Open full settings
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
