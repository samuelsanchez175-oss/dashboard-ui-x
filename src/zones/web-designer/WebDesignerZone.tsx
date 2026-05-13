import { useCallback, useMemo, useState } from 'react'
import {
  BarChart3,
  ExternalLink,
  Info,
  LayoutTemplate,
  PanelRightClose,
  Star,
  X,
} from 'lucide-react'
import { useWebDesignerBookmarks } from '../../context/WebDesignerBookmarksContext'
import { defaultTitleForUrl, normalizeUrl } from '../../lib/web-designer-bookmarks'

const DEMO_ACTIVITY = [
  {
    id:    'demo-sync',
    kind:  'warning' as const,
    message: 'Sample: Sync to design tokens paused (offline)',
    at: Date.now() - 3_600_000,
  },
  {
    id:    'demo-library',
    kind:  'info' as const,
    message: 'Sample: Library update — 12 new components',
    at: Date.now() - 86_400_000,
  },
]

interface WebDesignerZoneProps {
  onNavigate:         (routeId: string) => void
  initialBookmarkId?: string | null
}

export default function WebDesignerZone({ onNavigate, initialBookmarkId }: WebDesignerZoneProps) {
  const { bookmarks, getBookmark, isUrlStarred, toggleStar, activity, pushActivity } =
    useWebDesignerBookmarks()

  const resolvedBookmark = initialBookmarkId ? getBookmark(initialBookmarkId) : undefined

  const [urlInput, setUrlInput]       = useState(resolvedBookmark?.url ?? '')
  const [loadedUrl, setLoadedUrl]    = useState<string | null>(resolvedBookmark?.url ?? null)
  const [iframeHint, setIframeHint]  = useState<string | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)

  const go = useCallback(() => {
    const next = normalizeUrl(urlInput)
    if (!next) {
      pushActivity('warning', 'Enter a valid URL (https://… or example.com)')
      return
    }
    setIframeHint(
      'Some sites refuse embedding (X-Frame-Options / CSP). If the frame stays blank, use Open in new tab.',
    )
    setLoadedUrl(next)
    setUrlInput(next)
  }, [pushActivity, urlInput])

  const openExternal = useCallback(() => {
    const target = loadedUrl ?? normalizeUrl(urlInput)
    if (!target) {
      pushActivity('warning', 'Nothing to open — enter a URL first')
      return
    }
    window.open(target, '_blank', 'noopener,noreferrer')
    pushActivity('info', `Opened in new tab · ${defaultTitleForUrl(target)}`)
  }, [loadedUrl, pushActivity, urlInput])

  const onStar = useCallback(() => {
    const target = loadedUrl ?? normalizeUrl(urlInput)
    if (!target) {
      pushActivity('warning', 'Load a page first, then star it')
      return
    }
    toggleStar(target)
  }, [loadedUrl, pushActivity, toggleStar, urlInput])

  const feed = useMemo(
    () =>
      [...activity, ...DEMO_ACTIVITY]
        .sort((a, b) => b.at - a.at)
        .slice(0, 18),
    [activity],
  )

  const pageTitle = loadedUrl ? defaultTitleForUrl(loadedUrl) : 'Designer browser'

  const starredHere = loadedUrl ? isUrlStarred(loadedUrl) : false

  if (initialBookmarkId && !resolvedBookmark) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-[var(--grid-gap)] p-[var(--pad-card)] text-center"
        style={{ background: 'var(--bg-canvas)' }}
      >
        <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>
          This saved link is no longer in your stars.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('web-designer')}
          className="rounded-lg px-4 py-2 text-[13px] font-semibold"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          Open designer browser
        </button>
      </div>
    )
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{ background: 'var(--bg-canvas)' }}
    >
      {/* Top chrome */}
      <div
        className="shrink-0 border-b py-4 px-[var(--pad-card)]"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-sidebar)' }}
      >
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>
          <span>Workspace</span>
          <span style={{ color: 'var(--text-4)' }}>/</span>
          <span style={{ color: 'var(--text-2)' }}>Web design</span>
          <span style={{ color: 'var(--text-4)' }}>/</span>
          <span style={{ color: 'var(--accent)' }}>{pageTitle}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>
              Web designer
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: 'var(--text-3)' }}>
              Embedded preview for inspiration and references. Many production sites block iframes — keep
              Open in new tab handy.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setInspectorOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors"
              style={{
                border:     '1px solid var(--border)',
                background: 'var(--bg-card)',
                color:      'var(--text-2)',
              }}
            >
              <BarChart3 className="size-3.5" strokeWidth={2} />
              Inspect demo
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-0 lg:flex-row">
        {/* Activity column */}
        <aside
          className="flex max-h-[40vh] shrink-0 flex-col border-b lg:max-h-none lg:w-[260px] lg:border-b-0 lg:border-r"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-app)' }}
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--border-soft)' }}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>
              Activity
            </span>
            <span className="text-[10px]" style={{ color: 'var(--text-4)' }}>
              {bookmarks.length} saved
            </span>
          </div>
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2">
            {feed.map(row => (
              <li
                key={row.id}
                className="rounded-lg px-2.5 py-2 text-[12px] leading-snug"
                style={{
                  background: 'var(--bg-card)',
                  border:     '1px solid var(--border)',
                  color:      'var(--text-2)',
                }}
              >
                <span className="block text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-4)' }}>
                  {row.kind === 'saved' ? 'Saved' : row.kind === 'warning' ? 'Notice' : 'Info'}
                </span>
                {row.message}
              </li>
            ))}
          </ul>
        </aside>

        {/* Browser column */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-3"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
          >
            <LayoutTemplate className="size-4 shrink-0" style={{ color: 'var(--text-4)' }} aria-hidden />
            <input
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') go()
              }}
              placeholder="https://example.com or domain.com"
              className="min-w-[120px] flex-1 rounded-lg px-3 py-2 text-[13px] outline-none"
              style={{
                background:   'var(--bg-app)',
                border:       '1px solid var(--border)',
                color:        'var(--text-1)',
              }}
              aria-label="Page URL"
            />
            <button
              type="button"
              onClick={go}
              className="shrink-0 rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors"
              style={{
                background: 'var(--accent)',
                color:      '#fff',
              }}
            >
              Go
            </button>
            <button
              type="button"
              onClick={openExternal}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors"
              style={{
                borderColor: 'var(--border)',
                background:  'var(--bg-hover)',
                color:       'var(--text-2)',
              }}
              title="Open current URL in a new browser tab"
            >
              <ExternalLink className="size-3.5" strokeWidth={2} />
              New tab
            </button>
            <button
              type="button"
              onClick={onStar}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors"
              style={{
                borderColor: 'var(--border)',
                background:  starredHere ? 'var(--accent-soft)' : 'var(--bg-hover)',
                color:       starredHere ? 'var(--accent-fg)' : 'var(--text-2)',
              }}
              title={starredHere ? 'Remove from sidebar' : 'Save to sidebar'}
            >
              <Star className="size-3.5" strokeWidth={2} fill={starredHere ? 'currentColor' : 'none'} />
              {starredHere ? 'Starred' : 'Star'}
            </button>
          </div>

          {iframeHint && (
            <div
              className="flex shrink-0 items-start gap-2 px-4 py-2 text-[12px]"
              style={{ background: 'var(--good-soft)', color: 'var(--text-2)', borderBottom: '1px solid var(--border)' }}
            >
              <Info className="mt-0.5 size-3.5 shrink-0" style={{ color: 'var(--accent)' }} aria-hidden />
              <p className="min-w-0 flex-1 leading-snug">{iframeHint}</p>
              <button
                type="button"
                onClick={() => setIframeHint(null)}
                className="shrink-0 rounded p-1"
                style={{ color: 'var(--text-3)' }}
                aria-label="Dismiss hint"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          <div className="relative min-h-0 flex-1" style={{ background: 'var(--bg-canvas)' }}>
            {loadedUrl ? (
              <iframe
                key={loadedUrl}
                title="Designer preview"
                src={loadedUrl}
                className="h-full w-full border-0"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>
                  No page loaded
                </p>
                <p className="max-w-md text-xs leading-relaxed" style={{ color: 'var(--text-4)' }}>
                  Paste a URL and press Go. Try MDN, public docs, or internal tools that allow framing. For
                  sites that block embedding, use New tab — your starred URL still opens from the left
                  sidebar.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Inspector drawer */}
      {inspectorOpen && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Inspect demo">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            style={{ background: 'rgba(0,0,0,0.45)' }}
            aria-label="Close overlay"
            onClick={() => setInspectorOpen(false)}
          />
          <div
            className="relative flex h-full w-full max-w-md flex-col shadow-2xl"
            style={{
              background: 'var(--bg-sidebar)',
              borderLeft: '1px solid var(--border)',
            }}
          >
            <div
              className="flex items-center justify-between border-b px-4 py-3"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex items-center gap-2">
                <BarChart3 className="size-4" style={{ color: 'var(--accent)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                  Page signals (demo)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setInspectorOpen(false)}
                className="rounded-lg p-2 transition-colors"
                style={{ color: 'var(--text-3)', background: 'var(--bg-hover)' }}
                aria-label="Close drawer"
              >
                <PanelRightClose className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
                Placeholder analytics for the loaded host. Wire to real metrics or Lighthouse data when a
                backend exists.
              </p>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-4)' }}>
                  Engagement (mock)
                </p>
                <div className="mt-3 flex h-32 items-end gap-2">
                  {[40, 72, 55, 88, 64, 95, 48].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t-md transition-all"
                      style={{
                        height:     `${h}%`,
                        background: i === 5 ? 'var(--accent)' : 'var(--border-strong)',
                        opacity:    i === 5 ? 1 : 0.55,
                      }}
                    />
                  ))}
                </div>
              </div>
              <div
                className="rounded-xl p-4 text-xs leading-relaxed"
                style={{
                  background: 'var(--bg-card)',
                  border:     '1px solid var(--border)',
                  color:      'var(--text-3)',
                }}
              >
                <strong style={{ color: 'var(--text-1)' }}>Current target</strong>
                <div className="mt-2 break-all font-mono text-[11px]">{loadedUrl ?? '—'}</div>
              </div>
            </div>
            <div className="border-t p-3" style={{ borderColor: 'var(--border)' }}>
              <button
                type="button"
                onClick={() => setInspectorOpen(false)}
                className="w-full rounded-lg py-2 text-[12px] font-semibold"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}