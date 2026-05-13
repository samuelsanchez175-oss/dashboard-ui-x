import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, RefreshCw, Rss } from 'lucide-react'
import { LoadingState } from '../../components/ui/states'
import Button from '../../components/ui/Button'
import ZoneHeader from '../../components/ZoneHeader'
import { CONTAINERS } from '../../lib/design-tokens'

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
      <span className="mt-1 block text-xs" style={{ color: 'var(--text-3)' }}>
        Using saved feed:{' '}
        <code className="rounded px-1" style={{ background: 'var(--bg-muted)', color: 'var(--text-1)' }}>
          {savedFeed.trim()}
        </code>{' '}
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
      <div className={`${CONTAINERS.narrow} py-8 space-y-6`}>
        <ZoneHeader
          title="AI digest"
          icon={Rss}
          description={
            <>
              <code
                className="rounded px-1.5 py-0.5 text-xs"
                style={{ background: 'var(--bg-muted)', color: 'var(--text-1)' }}
              >
                r/claudeskills
              </code>{' '}
              <a
                className="text-orange-700 underline underline-offset-2"
                href="https://www.reddit.com/r/claudeskills/.rss"
                target="_blank"
                rel="noreferrer"
              >
                Reddit RSS
              </a>{' '}
              (proxied in dev to avoid CORS).
              {savedHint}
            </>
          }
          actions={
            <Button
              variant="secondary"
              onClick={() => void load()}
              disabled={loading}
              leading={<RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />}
            >
              Refresh
            </Button>
          }
        />

        {loading && !data ? <LoadingState label="Loading feed…" /> : null}

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
                  className="flex-1 min-w-0 rounded-lg border border-amber-300/90 px-3 py-2 text-sm shadow-sm placeholder:[color:var(--text-4)] focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                  style={{ background: 'var(--bg-card)', color: 'var(--text-1)' }}
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
                  className="group flex gap-3 rounded-lg border px-4 py-3 transition-colors hover:[border-color:var(--border)] hover:[background:var(--bg-card)]"
                  style={{
                    borderColor: 'var(--border-soft)',
                    background: 'color-mix(in oklab, var(--bg-card-soft) 80%, transparent)',
                  }}
                >
                  <ExternalLink
                    className="mt-0.5 size-4 shrink-0 transition-colors group-hover:text-orange-600"
                    style={{ color: 'var(--text-4)' }}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug" style={{ color: 'var(--text-1)' }}>
                      {item.title}
                    </p>
                    {item.publishedAt ? (
                      <p className="mt-1 text-xs tabular-nums" style={{ color: 'var(--text-3)' }}>
                        {item.publishedAt}
                      </p>
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
