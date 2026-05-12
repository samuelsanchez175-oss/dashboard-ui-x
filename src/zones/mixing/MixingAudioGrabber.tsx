import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Download, Loader2, Music2, MonitorPlay, RefreshCw, Trash2 } from 'lucide-react'

import { deleteMixClip, loadAllMixClips, patchMixClip, saveMixClip, type MixClipMeta } from './mixing-audio-idb'
import { dispatchFileDownload } from '../../components/files-dock/files-store'

type DockItem = {
  videoId: string
  title: string
  addedAt: number
  playUrl: string
  blob: Blob
  meta?: MixClipMeta
}

function triggerFileDownload(blob: Blob, filename: string) {
  const safeName = filename.endsWith('.mp3') ? filename : `${filename}.mp3`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = safeName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  // Also surface in the global Files Dock.
  dispatchFileDownload({ blob, name: safeName, source: 'YouTube grab' })
}

/**
 * Best-effort YouTube thumbnail fetch. Tries `maxresdefault.jpg` first (1280×720
 * when available) and falls back to `hqdefault.jpg` (480×360, always present).
 * Saves the result through the Files Dock event bridge — never blocks audio.
 */
async function fetchYoutubeThumbnail(videoId: string, title: string): Promise<void> {
  const safeTitle = title.replace(/[/\\?%*:|"<>]/g, '_').trim() || `youtube-${videoId}`
  const candidates = [
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  ]
  for (const url of candidates) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const blob = await res.blob()
      // YouTube returns a tiny 120×90 placeholder when the variant is missing;
      // skip those (typical size < 1500 bytes).
      if (blob.size < 1500) continue
      dispatchFileDownload({
        blob,
        name:   `${safeTitle}.jpg`,
        source: 'YouTube thumbnail',
      })
      return
    } catch {
      /* try next variant */
    }
  }
}

function formatDateAdded(ts: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(ts))
  } catch {
    return new Date(ts).toLocaleString()
  }
}

function safeMp3Basename(title: string): string {
  const base = title.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 96)
  return base || 'youtube-audio'
}

/** YouTube → MP3 via dev BFF. Dock persists clips in IndexedDB; local tags + BPM + chromagram key after each grab. */
export default function MixingAudioGrabber() {
  const formId = useId()
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dock, setDock] = useState<DockItem[]>([])
  const [dockEpoch, setDockEpoch] = useState(0)
  const [analyzingIds, setAnalyzingIds] = useState<string[]>([])
  const laneAnalyzeGuardRef = useRef(new Set<string>())
  const [laneAnalyzeIds, setLaneAnalyzeIds] = useState<string[]>([])
  /** Dock tiles collapsed to a compact header-only strip (per clip). */
  const [collapsedDockIds, setCollapsedDockIds] = useState<Set<string>>(() => new Set())

  const toggleDockCollapsed = (videoId: string) => {
    setCollapsedDockIds(prev => {
      const next = new Set(prev)
      if (next.has(videoId)) next.delete(videoId)
      else next.add(videoId)
      return next
    })
  }

  const startAnalyzing = (id: string) => {
    setAnalyzingIds(prev => (prev.includes(id) ? prev : [...prev, id]))
  }
  const stopAnalyzing = (id: string) => {
    setAnalyzingIds(prev => prev.filter(x => x !== id))
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const clips = await loadAllMixClips()
        if (cancelled) return
        setDock(prev => {
          for (const d of prev) {
            URL.revokeObjectURL(d.playUrl)
          }
          return clips.map(c => ({
            videoId: c.videoId,
            title: c.title,
            addedAt: c.addedAt,
            meta: c.meta,
            blob: c.blob,
            playUrl: URL.createObjectURL(c.blob),
          }))
        })
      } catch {
        /* IDB unavailable */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dockEpoch])

  useEffect(() => {
    return () => {
      setDock(prev => {
        for (const d of prev) {
          URL.revokeObjectURL(d.playUrl)
        }
        return []
      })
    }
  }, [])

  const runClipAnalysis = (videoId: string, blob: Blob) => {
    startAnalyzing(videoId)
    void (async () => {
      try {
        const { analyzeMixClipBlob } = await import('./mixing-audio-analysis')
        const meta = await analyzeMixClipBlob(blob)
        await patchMixClip(videoId, { meta })
      } catch {
        await patchMixClip(videoId, {
          meta: {
            bpm: null,
            key: null,
            scale: null,
            rapKeyTip:
              'Could not decode this clip for analysis. Try Re-scan, or save the MP3 and inspect it in another tool.',
            source: 'estimated',
            analyzedAt: Date.now(),
          },
        })
      } finally {
        stopAnalyzing(videoId)
        setDockEpoch(e => e + 1)
      }
    })()
  }

  const startDownload = async () => {
    const raw = url.trim()
    if (!raw || busy) return
    setBusy(true)
    setError(null)
    try {
      const { fetchWithKeys } = await import('../../lib/api-keys')
      const res = await fetchWithKeys('/api/mixing/youtube-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: raw }),
      })
      const vid = res.headers.get('X-Video-Id')
      let title = vid ? `YouTube ${vid}` : 'youtube-audio'
      const titleHdr = res.headers.get('X-Audio-Title')
      if (titleHdr) {
        try {
          title = decodeURIComponent(titleHdr)
        } catch {
          title = titleHdr
        }
      }

      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null
        setError(j?.message ?? `Request failed (${res.status})`)
        return
      }

      const blob = await res.blob()
      if (!vid) {
        setError('Server did not return a video id.')
        return
      }

      await saveMixClip({ videoId: vid, title, blob })
      triggerFileDownload(blob, `${title}.mp3`)
      void fetchYoutubeThumbnail(vid, title)
      setDockEpoch(e => e + 1)
      runClipAnalysis(vid, blob)
      setUrl('')
    } catch {
      setError('Network error — is `npm run dev` running?')
    } finally {
      setBusy(false)
    }
  }

  const removeClip = async (videoId: string) => {
    stopAnalyzing(videoId)
    laneAnalyzeGuardRef.current.delete(videoId)
    setLaneAnalyzeIds(prev => prev.filter(id => id !== videoId))
    await deleteMixClip(videoId)
    setDockEpoch(e => e + 1)
  }

  const runLaneLocalAnalyze = async (item: DockItem) => {
    const vid = item.videoId
    if (laneAnalyzeGuardRef.current.has(vid)) return
    laneAnalyzeGuardRef.current.add(vid)
    setLaneAnalyzeIds(prev => (prev.includes(vid) ? prev : [...prev, vid]))
    try {
      const { analyzeMixClipBlob } = await import('./mixing-audio-analysis')
      const meta = await analyzeMixClipBlob(item.blob)
      await patchMixClip(vid, { meta })
    } catch {
      await patchMixClip(vid, {
        meta: {
          bpm: null,
          key: null,
          scale: null,
          rapKeyTip: 'Local re-scan failed — file may be corrupt or unsupported in this browser.',
          source: 'estimated',
          analyzedAt: Date.now(), // eslint-disable-line react-hooks/purity -- async handler, not render
        },
      })
    } finally {
      laneAnalyzeGuardRef.current.delete(vid)
      setLaneAnalyzeIds(prev => prev.filter(x => x !== vid))
      setDockEpoch(e => e + 1)
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <div className="flex-1 overflow-y-auto px-8 pt-2 pb-36 max-w-3xl w-full mx-auto space-y-5">
        <div className="rounded-xl border p-4 text-xs leading-relaxed" style={{ borderColor: 'color-mix(in oklab, var(--bad) 25%, transparent)', background: 'var(--bad-soft)', color: 'var(--text-2)' }}>
          <strong className="font-semibold" style={{ color: 'var(--text-1)' }}>Rights &amp; tooling:</strong> Only download audio you own or have permission
          to use. YouTube&apos;s terms restrict unauthorized downloading — this dev tool calls your local / hosted BFF (
          <code className="px-1 rounded" style={{ background: 'var(--bg-hover)', color: 'var(--text-1)' }}>yt-dlp</code> / remote converter +{' '}
          <code className="px-1 rounded" style={{ background: 'var(--bg-hover)', color: 'var(--text-1)' }}>ffmpeg</code> where applicable). Audio stays in your browser (
          IndexedDB). After each grab we run a <strong className="font-semibold" style={{ color: 'var(--text-1)' }}>local</strong> pass: ID3 tags, tempo
          estimate, and chromagram key (Camelot-style when confident).
        </div>

        <form
          id={formId}
          className="rounded-xl p-6 space-y-4"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
          onSubmit={e => {
            e.preventDefault()
            void startDownload()
          }}
        >
          <div className="flex items-center gap-2 font-semibold text-sm" style={{ color: 'var(--text-1)' }}>
            <MonitorPlay className="size-5 text-red-500 shrink-0" aria-hidden />
            YouTube → MP3
          </div>
          <label htmlFor={`${formId}-url`} className="block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
            Video link
          </label>
          <input
            id={`${formId}-url`}
            type="url"
            inputMode="url"
            placeholder="https://www.youtube.com/watch?v=…"
            value={url}
            onChange={e => setUrl(e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none transition"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            autoComplete="off"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy || !url.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:pointer-events-none"
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
              {busy ? 'Working…' : 'Start'}
            </button>
            <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>POST /api/mixing/youtube-audio</span>
          </div>
          {error ? (
            <p className="text-xs rounded-lg px-3 py-2 whitespace-pre-wrap" role="alert" style={{ color: 'var(--bad)', background: 'var(--bad-soft)', border: '1px solid color-mix(in oklab, var(--bad) 25%, transparent)' }}>
              {error}
            </p>
          ) : null}
        </form>
      </div>

      <div
        className="shrink-0 backdrop-blur-md px-4 py-3"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-card)', boxShadow: '0 -8px 30px rgba(0,0,0,0.15)' }}
        aria-label="Recent downloads dock"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: 'var(--text-3)' }}>Recent audio dock</p>
        {dock.length === 0 ? (
          <p className="text-xs px-1 py-6 text-center" style={{ color: 'var(--text-4)' }}>Successful grabs appear here with playback and analysis.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-thin items-stretch pt-1 snap-x snap-mandatory px-0.5">
            {dock.map(item => {
              const scanning = analyzingIds.includes(item.videoId)
              const laneBusy = laneAnalyzeIds.includes(item.videoId)
              const dockCollapsed = collapsedDockIds.has(item.videoId)
              const dockPanelId = `dock-panel-${item.videoId}`

              return (
                <article
                  key={item.videoId}
                  className={
                    dockCollapsed
                      ? 'group/card flex shrink-0 snap-start flex-col gap-2 rounded-2xl p-2.5 transition-all duration-200 hover:-translate-y-px w-[min(300px,calc(100vw-1.25rem))]'
                      : 'group/card flex shrink-0 snap-start flex-col gap-2.5 rounded-2xl p-3 transition-all duration-200 hover:-translate-y-px w-[min(640px,calc(100vw-1.25rem))]'
                  }
                  style={{ background: 'var(--bg-card-soft)', border: '2px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in oklab, var(--accent) 50%, transparent)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
                >
                  <div className="flex gap-2.5 items-start min-w-0">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-inner"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }}
                      aria-hidden
                    >
                      <Music2 className="size-5" strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3
                        className={`text-[13px] font-semibold leading-snug tracking-tight ${dockCollapsed ? 'line-clamp-1' : 'line-clamp-2'}`}
                        style={{ color: 'var(--text-1)' }}
                        title={item.title}
                      >
                        {item.title}
                      </h3>
                      <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ background: 'var(--bg-muted)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
                          Added
                        </span>
                        <time
                          className="text-[11px] font-medium tabular-nums"
                          style={{ color: 'var(--text-2)' }}
                          dateTime={new Date(item.addedAt).toISOString()}
                        >
                          {formatDateAdded(item.addedAt)}
                        </time>
                      </p>
                      {dockCollapsed && item.meta && !scanning ? (
                        <p className="mt-1 truncate text-[10px] font-medium tabular-nums" style={{ color: 'var(--text-3)' }} title={`${item.meta.bpm ?? '—'} BPM · ${item.meta.key ?? '—'}`}>
                          {item.meta.bpm ?? '—'} BPM · {item.meta.key ?? '—'}
                        </p>
                      ) : null}
                      {dockCollapsed && scanning ? (
                        <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color: 'var(--accent-fg)' }}>
                          <Loader2 className="size-3 animate-spin" aria-hidden />
                          Analyzing…
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-start gap-1">
                      <button
                        type="button"
                        onClick={() => toggleDockCollapsed(item.videoId)}
                        className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-full active:scale-95 transition focus-visible:outline-none"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-3)', boxShadow: 'var(--shadow-sm)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)' }}
                        aria-expanded={!dockCollapsed}
                        aria-controls={dockCollapsed ? undefined : dockPanelId}
                        title={dockCollapsed ? 'Expand dock tile' : 'Collapse dock tile'}
                      >
                        {dockCollapsed ? (
                          <ChevronDown className="size-4" aria-hidden />
                        ) : (
                          <ChevronUp className="size-4" aria-hidden />
                        )}
                        <span className="sr-only">{dockCollapsed ? 'Expand' : 'Collapse'} playback and analysis</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeClip(item.videoId)}
                        className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-full active:scale-95 transition focus-visible:outline-none"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-3)', boxShadow: 'var(--shadow-sm)' }}
                        onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--bad-soft)'; el.style.color = 'var(--bad)'; el.style.borderColor = 'color-mix(in oklab, var(--bad) 30%, transparent)' }}
                        onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--bg-card)'; el.style.color = 'var(--text-3)'; el.style.borderColor = 'var(--border)' }}
                        aria-label={`Remove ${item.title}`}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </div>
                  </div>

                  {!dockCollapsed ? (
                    <div id={dockPanelId} className="flex flex-col gap-2.5">
                      <div className="rounded-xl px-2 py-1.5" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                        <span className="sr-only">Audio playback</span>
                        <audio
                          controls
                          preload="none"
                          src={item.playUrl}
                          className="w-full h-9"
                        />
                      </div>

                      <div className="rounded-xl px-3 py-2.5 space-y-2" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-1)' }}>Track analysis</div>
                          {scanning || laneBusy ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold shrink-0" style={{ color: 'var(--accent-fg)' }}>
                              <Loader2 className="size-3.5 animate-spin" aria-hidden />
                              Working…
                            </span>
                          ) : null}
                        </div>

                        {scanning ? (
                          <>
                            <p className="text-[11px] leading-snug" style={{ color: 'var(--text-3)' }}>
                              Reading ID3 tags, estimating BPM, and running chromagram key detection…
                            </p>
                            <dl className="grid grid-cols-[minmax(0,3.5rem)_1fr] gap-x-2 gap-y-1 text-[11px] leading-snug opacity-60" style={{ color: 'var(--text-2)' }}>
                              <dt className="font-semibold uppercase tracking-wide text-[10px]" style={{ color: 'var(--text-4)' }}>BPM</dt>
                              <dd className="tabular-nums font-medium">…</dd>
                              <dt className="font-semibold uppercase tracking-wide text-[10px]" style={{ color: 'var(--text-4)' }}>Key</dt>
                              <dd className="font-medium">…</dd>
                              <dt className="font-semibold uppercase tracking-wide text-[10px]" style={{ color: 'var(--text-4)' }}>Scale</dt>
                              <dd className="capitalize font-medium">…</dd>
                              <dt className="font-semibold uppercase tracking-wide text-[10px]" style={{ color: 'var(--text-4)' }}>Via</dt>
                              <dd className="capitalize font-medium">…</dd>
                            </dl>
                          </>
                        ) : null}

                        {!scanning && item.meta ? (
                          <>
                            <dl className="grid grid-cols-[minmax(0,3.5rem)_1fr] gap-x-2 gap-y-1 text-[11px] leading-snug" style={{ color: 'var(--text-1)' }}>
                              <dt className="font-semibold uppercase tracking-wide text-[10px]" style={{ color: 'var(--text-4)' }}>BPM</dt>
                              <dd className="tabular-nums font-medium">{item.meta.bpm ?? '—'}</dd>
                              <dt className="font-semibold uppercase tracking-wide text-[10px]" style={{ color: 'var(--text-4)' }}>Key</dt>
                              <dd className="truncate font-medium" title={item.meta.key ?? ''}>
                                {item.meta.key ?? '—'}
                              </dd>
                              <dt className="font-semibold uppercase tracking-wide text-[10px]" style={{ color: 'var(--text-4)' }}>Scale</dt>
                              <dd className="capitalize font-medium">{item.meta.scale ?? '—'}</dd>
                              <dt className="font-semibold uppercase tracking-wide text-[10px]" style={{ color: 'var(--text-4)' }}>Via</dt>
                              <dd className="capitalize font-medium" style={{ color: 'var(--accent-fg)' }}>{item.meta.source}</dd>
                            </dl>
                            <p className="text-[11px] leading-snug pt-2" style={{ borderTop: '1px solid var(--border-soft)', color: 'var(--text-2)' }}>
                              <span className="font-bold" style={{ color: 'var(--text-1)' }}>Rap key</span>{' '}
                              {item.meta.rapKeyTip}
                            </p>
                          </>
                        ) : null}

                        {!scanning && !item.meta ? (
                          <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>No analysis stored yet for this clip.</p>
                        ) : null}

                        {!scanning ? (
                          <div className="flex flex-wrap gap-2 pt-1" style={{ borderTop: '1px solid var(--border-soft)' }}>
                            <button
                              type="button"
                              disabled={laneBusy}
                              onClick={() => void runLaneLocalAnalyze(item)}
                              className="inline-flex flex-1 min-w-[8rem] cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-45 disabled:pointer-events-none transition"
                              style={{ background: 'var(--accent)', border: '1px solid color-mix(in oklab, var(--accent) 60%, transparent)' }}
                            >
                              {laneBusy ? (
                                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                              ) : (
                                <RefreshCw className="size-3.5" aria-hidden />
                              )}
                              Re-scan locally
                            </button>
                            <button
                              type="button"
                              onClick={() => triggerFileDownload(item.blob, `${safeMp3Basename(item.title)}.mp3`)}
                              className="inline-flex flex-1 min-w-[8rem] cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold transition"
                              style={{ background: 'var(--bg-card-soft)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-card-soft)')}
                            >
                              <Download className="size-3.5 shrink-0" aria-hidden />
                              Save MP3…
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
