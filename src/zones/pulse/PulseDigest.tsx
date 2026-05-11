import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, RefreshCw, Rss } from 'lucide-react'

type DigestItem = { title: string; link: string; publishedAt: string | null }

type DigestJson =
  | { ok: true; source: string; items: DigestItem[] }
  | { ok: false; error: string; message: string }

const STORAGE_KEY = 'pulse-digest-custom-feed'

export default function PulseDigest() {
  const [data, setData] = useState<DigestJson | null>(null)
  const [loading, setLoading] = useState(true)
  const [draftFeed, setDraftFeed] = useState(() =>
    typeof window !== 'undefined' ? (localStorage.getItem(STORAGE_KEY) ?? '') : '',
  )
  const [savedFeed, setSavedFeed] = useState(() =>
    typeof window !== 'undefined' ? (localStorage.getItem(STORAGE_KEY) ?? '') : '',
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const custom = (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : '')?.trim() ?? ''
      const qs = custom ? `?feed=${encodeURIComponent(custom)}` : ''
      const res = await fetch(`/api/digest/reddit${qs}`)
      const json = (await res.json()) as DigestJson
      setData(json)
    } catch {
      setData({ ok: false, error: 'CLIENT', message: 'Failed to parse response.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(t)
  }, [load])

  const saveAndReload = () => {
    const trimmed = draftFeed.trim()
    if (trimmed) {
      localStorage.setItem(STORAGE_KEY, trimmed)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
    setSavedFeed(trimmed)
    void load()
  }

  const resetToDefault = () => {
    localStorage.removeItem(STORAGE_KEY)
    setDraftFeed('')
    setSavedFeed('')
    void load()
  }

  const savedHint =
    savedFeed.trim().length > 0 ? (
      <span className="block mt-1 text-xs text-gray-600">
        Using saved feed:{' '}
        <code className="bg-gray-100 px-1 rounded">{savedFeed.trim()}</code>{' '}
        <button
          type="button"
          onClick={resetToDefault}
          className="text-orange-700 underline underline-offset-2 font-medium"
        >
          Reset default
        </button>
      </span>
    ) : null

  return (
    <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}>
      <div className="max-w-3xl mx-auto p-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <Rss className="size-5 text-orange-600" aria-hidden />
              AI digest
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">r/claudeskills</code> via{' '}
              <a
                className="text-orange-700 underline underline-offset-2"
                href="https://www.reddit.com/r/claudeskills/.rss"
                target="_blank"
                rel="noreferrer"
              >
                Reddit RSS
              </a>{' '}
              (proxied in dev to avoid CORS).
            </p>
            {savedHint}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            Refresh
          </button>
        </div>

        {loading && !data ? (
          <p className="text-sm text-gray-500">Loading feed…</p>
        ) : null}

        {data && !data.ok ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-3">
            <div>
              <p className="font-medium">Could not load digest</p>
              <p className="mt-1 text-amber-800/90">{data.message}</p>
              <p className="mt-2 text-xs text-amber-800/80">
                Reddit may rate-limit or block some requests; the dev server uses a minimal RSS proxy at{' '}
                <code className="bg-amber-100/80 px-1 rounded">/api/digest/reddit</code>.
              </p>
            </div>
            <div className="pt-1 border-t border-amber-200/80">
              <label htmlFor="pulse-digest-feed" className="block text-xs font-semibold text-amber-950">
                Topic or RSS URL
              </label>
              <p className="text-[11px] text-amber-800/85 mt-0.5 mb-2">
                Save a subreddit name (e.g. <code className="bg-amber-100/90 px-0.5 rounded">programming</code>),{' '}
                <code className="bg-amber-100/90 px-0.5 rounded">r/name</code>, or a full{' '}
                <span className="whitespace-nowrap">https://…</span> RSS feed.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-stretch">
                <input
                  id="pulse-digest-feed"
                  type="text"
                  value={draftFeed}
                  onChange={e => setDraftFeed(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveAndReload()
                  }}
                  placeholder="claudeskills or https://example.com/feed.xml"
                  className="flex-1 min-w-0 rounded-lg border border-amber-300/90 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={saveAndReload}
                  disabled={loading}
                  className="shrink-0 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50 shadow-sm"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {data && data.ok ? (
          <ul className="space-y-2">
            {data.items.map(item => (
              <li key={item.link}>
                <a
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex gap-3 rounded-lg border border-gray-200 bg-gray-50/80 px-4 py-3 hover:border-gray-300 hover:bg-white transition-colors"
                >
                  <ExternalLink
                    className="size-4 shrink-0 text-gray-400 group-hover:text-orange-600 mt-0.5"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 leading-snug">{item.title}</p>
                    {item.publishedAt ? (
                      <p className="text-xs text-gray-500 mt-1 tabular-nums">{item.publishedAt}</p>
                    ) : null}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
