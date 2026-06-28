import { ArrowLeft, ChevronLeft, ChevronRight, ClipboardPaste, KeyRound, Layers, Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { addDownloadedFile, subscribeFiles, type StoredFile } from '../../components/files-dock/files-store'
import { fetchWithKeys } from '../../lib/api-keys'
import StudioToolsHeader from './StudioToolsHeader'
import { analyzeClipKey, splitStems, zipStore, type KeyInfo, type Stem } from './youtube-clip-tools'

interface ToolsYoutubePageProps {
  onNavigate: (routeId: string) => void
}

/** GRAY2020 palette — see ~/.claude/skills/gray2020/SKILL.md for the full design language. */
const PALETTE = {
  bg: '#0A0A0C',
  surface: '#121214',
  line: '#2C2C30',
  textMain: '#EAEAEA',
  textMuted: '#707075',
  amber: '#F5A623',
  amberGlow: 'rgba(245, 166, 35, 0.15)',
} as const

/** Keep the last N grabbed clips reachable in the preview history. */
const HISTORY_LIMIT = 10
const DOWNLOAD_COUNT_KEY = 'yt:download-count'

type Ripple = { id: number; x: number; y: number; size: number }
type Status = 'IDLE' | 'DOWNLOADING' | 'COMPLETE' | 'ERROR'

/**
 * Send a freshly-grabbed clip to a sibling audio-family tool by writing
 * `inbound-clip-<routeId>` to sessionStorage. Same handoff contract used by
 * MixingAudioGrabber so the receiver tools (Chord Detector, Key & BPM Finder,
 * Stem splitter) auto-load the clip when they mount.
 */
function sendClipToRoute(routeId: string, dockId: string): void {
  try {
    sessionStorage.setItem(`inbound-clip-${routeId}`, dockId)
  } catch {
    /* unavailable — receiver simply won't autoload */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dashboard:set-route', { detail: { id: routeId } }))
  }
}

export default function ToolsYoutubePage({ onNavigate }: ToolsYoutubePageProps) {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<Status>('IDLE')
  const [error, setError] = useState<string | null>(null)
  // Persistent download history (newest first), pulled from the dock store.
  const [history, setHistory] = useState<StoredFile[]>([])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [duration, setDuration] = useState<number | null>(null)
  const [downloadCount, setDownloadCount] = useState<number>(() => {
    try {
      return Math.max(0, parseInt(localStorage.getItem(DOWNLOAD_COUNT_KEY) ?? '0', 10) || 0)
    } catch {
      return 0
    }
  })

  // KEY · BPM · scale popup (runs in place on the grabbed clip)
  const [keyOpen, setKeyOpen] = useState(false)
  const [keyLoading, setKeyLoading] = useState(false)
  const [keyInfo, setKeyInfo] = useState<KeyInfo | null>(null)
  const [keyError, setKeyError] = useState<string | null>(null)
  // STEM OUT popup
  const [stemsOpen, setStemsOpen] = useState(false)
  const [stemsLoading, setStemsLoading] = useState(false)
  const [stems, setStems] = useState<Stem[] | null>(null)
  const [stemsError, setStemsError] = useState<string | null>(null)

  /** Object URL for the most recent clip — used by the inline <audio> player. */
  const [clipObjectUrl, setClipObjectUrl] = useState<string | null>(null)
  const [playingPreview, setPlayingPreview] = useState(false)
  const [previewTime, setPreviewTime] = useState(0)
  const audioElRef = useRef<HTMLAudioElement | null>(null)

  const tapButtonRef = useRef<HTMLButtonElement | null>(null)
  const rippleIdRef = useRef(0)
  const [ripples, setRipples] = useState<Ripple[]>([])

  // Keep the download history synced from the dock store (persists across reloads).
  useEffect(
    () =>
      subscribeFiles(list => {
        const grabs = list
          .filter(f => f.source === 'YouTube grab')
          .sort((a, b) => b.addedAt - a.addedAt)
          .slice(0, HISTORY_LIMIT)
        setHistory(grabs)
      }),
    [],
  )

  /** Active clip (history is newest-first); index clamped so a shrunk history can't dangle. */
  const clampedIndex = history.length ? Math.min(historyIndex, history.length - 1) : 0
  const current = history[clampedIndex] ?? null
  const lastClip = useMemo(
    () =>
      current
        ? { title: current.name.replace(/\.mp3$/i, ''), dockId: current.id, sizeKb: Math.round(current.size / 1024) }
        : null,
    [current],
  )

  // The inline player's object URL follows the active clip (created/revoked per clip).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- sync the player's object URL + reset to the active clip */
    if (!current) {
      setClipObjectUrl(null)
      setDuration(null)
      return
    }
    const objUrl = URL.createObjectURL(current.blob)
    setClipObjectUrl(objUrl)
    setDuration(null)
    setPreviewTime(0)
    setPlayingPreview(false)
    return () => URL.revokeObjectURL(objUrl)
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key on clip id; blob is stable per id
  }, [current?.id])

  const goOlder = useCallback(
    () => setHistoryIndex(Math.min(history.length - 1, clampedIndex + 1)),
    [history.length, clampedIndex],
  )
  const goNewer = useCallback(() => setHistoryIndex(Math.max(0, clampedIndex - 1)), [clampedIndex])

  const pasteUrl = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setUrl(text.trim())
        setError(null)
      }
    } catch {
      setError('Clipboard blocked — press ⌘V / Ctrl+V in the field instead.')
    }
  }, [])

  const spawnRipple = useCallback((x: number, y: number, size: number) => {
    const id = rippleIdRef.current++
    setRipples(prev => [...prev, { id, x, y, size }])
    window.setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== id))
    }, 600)
  }, [])

  const startDownload = useCallback(
    async (origin?: { clientX: number; clientY: number }) => {
      const raw = url.trim()
      if (!raw || status === 'DOWNLOADING') return

      // Spawn ripple at click coords for feedback
      const btn = tapButtonRef.current
      if (btn) {
        const rect = btn.getBoundingClientRect()
        const size = Math.max(rect.width, rect.height)
        const x = origin ? origin.clientX - rect.left : rect.width / 2
        const y = origin ? origin.clientY - rect.top : rect.height / 2
        spawnRipple(x, y, size)
      }

      setStatus('DOWNLOADING')
      setError(null)

      try {
        const res = await fetchWithKeys('/api/mixing/youtube-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: raw }),
        })

        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { message?: string } | null
          setError(j?.message ?? `Request failed (${res.status})`)
          setStatus('ERROR')
          return
        }

        const videoId = res.headers.get('X-Video-Id') ?? `yt-${Date.now()}`
        let title = `YouTube ${videoId}`
        const titleHdr = res.headers.get('X-Audio-Title')
        if (titleHdr) {
          try {
            title = decodeURIComponent(titleHdr)
          } catch {
            title = titleHdr
          }
        }

        const blob = await res.blob()
        const safeName = `${title}.mp3`
        await addDownloadedFile({
          blob,
          name: safeName,
          source: 'YouTube grab',
          lane: 'downloads',
        })

        // Newest clip becomes active; the dock subscription refreshes history,
        // and the object-URL effect spins up the preview player.
        setHistoryIndex(0)
        setDownloadCount(c => {
          const n = c + 1
          try { localStorage.setItem(DOWNLOAD_COUNT_KEY, String(n)) } catch { /* ignore quota */ }
          return n
        })
        setStatus('COMPLETE')
        setUrl('')
      } catch {
        setError('Network error — is the dev BFF running?')
        setStatus('ERROR')
      }
    },
    [url, status, spawnRipple],
  )

  const reset = useCallback(() => {
    setUrl('')
    setError(null)
    setStatus('IDLE')
    if (audioElRef.current) {
      audioElRef.current.pause()
      audioElRef.current.currentTime = 0
    }
    setPlayingPreview(false)
  }, [])

  const togglePreviewPlay = useCallback(async () => {
    const el = audioElRef.current
    if (!el) return
    if (el.paused) {
      try {
        await el.play()
        setPlayingPreview(true)
      } catch {
        setPlayingPreview(false)
      }
    } else {
      el.pause()
      setPlayingPreview(false)
    }
  }, [])

  const downloadLocal = useCallback(() => {
    if (!clipObjectUrl || !lastClip) return
    const a = document.createElement('a')
    a.href = clipObjectUrl
    a.download = `${lastClip.title.replace(/[/\\?%*:|"<>]/g, '_')}.mp3`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }, [clipObjectUrl, lastClip])

  /** The active clip's blob (kept in memory by the dock store) for analysis. */
  const getClipBlob = useCallback(async (): Promise<Blob | null> => current?.blob ?? null, [current])

  const runKey = useCallback(async () => {
    if (!lastClip || keyLoading) return
    setKeyOpen(true)
    setKeyError(null)
    setKeyInfo(null)
    setKeyLoading(true)
    await new Promise(r => setTimeout(r, 30)) // let the popup paint before heavy work
    try {
      const blob = await getClipBlob()
      if (!blob) {
        setKeyError('Clip not found in the dock — grab it again.')
        return
      }
      setKeyInfo(await analyzeClipKey(blob))
    } catch {
      setKeyError('Could not read the key for this clip.')
    } finally {
      setKeyLoading(false)
    }
  }, [lastClip, keyLoading, getClipBlob])

  const runStems = useCallback(async () => {
    if (!lastClip || stemsLoading) return
    setStemsOpen(true)
    setStemsError(null)
    setStems(null)
    setStemsLoading(true)
    await new Promise(r => setTimeout(r, 30))
    try {
      const blob = await getClipBlob()
      if (!blob) {
        setStemsError('Clip not found in the dock — grab it again.')
        return
      }
      setStems(await splitStems(blob, lastClip.title))
    } catch {
      setStemsError('Could not split this clip into stems.')
    } finally {
      setStemsLoading(false)
    }
  }, [lastClip, stemsLoading, getClipBlob])

  const downloadBlob = useCallback((blob: Blob, name: string) => {
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(href), 1000)
  }, [])

  const downloadAllStems = useCallback(async () => {
    if (!stems || stems.length === 0) return
    const zip = await zipStore(stems.map(s => ({ name: s.fileName, blob: s.blob })))
    const base = (lastClip?.title ?? 'clip').replace(/[/\\?%*:|"<>]/g, '_').slice(0, 60) || 'clip'
    downloadBlob(zip, `${base} - stems.zip`)
  }, [stems, lastClip, downloadBlob])

  /** Friendly elapsed/total time string for the inline player. */
  const inlinePlayerState = useMemo(() => {
    const fmt = (s: number) => {
      if (!Number.isFinite(s) || s < 0) return '0:00'
      const m = Math.floor(s / 60)
      const r = Math.floor(s % 60)
      return `${m}:${String(r).padStart(2, '0')}`
    }
    return { fmt }
  }, [])

  const statusColor =
    status === 'DOWNLOADING'
      ? PALETTE.amber
      : status === 'COMPLETE'
        ? PALETTE.amber
        : status === 'ERROR'
          ? '#ef4444'
          : PALETTE.textMuted

  const heroLabel = lastClip ? lastClip.title : 'YT → MP3'
  const urlValid = /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(url.trim())
  /** Central control flips to a play/pause + scrubber once a clip is loaded and the input is clear. */
  const transportMode = !!current && !urlValid && status !== 'DOWNLOADING'

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}
    >
      <StudioToolsHeader
        toolId="tools-youtube-downloader"
        crumbs={[{ label: 'Workspace' }, { label: 'Tools' }, { label: 'YouTube downloader', emphasis: true }]}
        leftExtra={
          <button
            type="button"
            onClick={() => onNavigate('tools-hub')}
            className="mr-2 rounded-lg border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition hover:bg-slate-50"
            aria-label="Back to Tools Hub"
          >
            <ArrowLeft className="size-4" strokeWidth={2} />
          </button>
        }
      />

      <div className="flex-1 overflow-auto" style={{ background: PALETTE.bg }}>
        <style>{`
          @keyframes yt-ripple { to { transform: scale(4); opacity: 0; } }
          .yt-ripple-anim { animation: yt-ripple 0.6s linear forwards; }
        `}</style>

        <div className="mx-auto flex w-full flex-col" style={{ minHeight: 'calc(100dvh - 56px)' }}>
          <div
            className="grid w-full flex-1"
            style={{
              gridTemplateRows: 'auto auto auto auto auto 1fr auto',
              gap: '1px',
              background: PALETTE.line,
            }}
          >
            {/* ── Header ── */}
            <header
              className="flex items-center justify-between px-6 py-4"
              style={{ background: PALETTE.surface }}
            >
              <PillButton label="MP3" decorative />
              <div
                className="text-[10px] uppercase tracking-[0.2em]"
                style={{ color: PALETTE.textMuted, fontFamily: "'DM Mono', monospace" }}
              >
                YouTube downloader
              </div>
              <PillButton label="RESET" onClick={reset} />
            </header>

            {/* ── Hero (sidebar + headline + status) ── */}
            <section
              className="grid"
              style={{
                gridTemplateColumns: '2.5rem 1fr',
                gap: '1px',
                background: PALETTE.line,
              }}
            >
              <div
                className="flex flex-col items-center justify-between py-6"
                style={{ background: PALETTE.surface }}
              >
                <CircleNum n={1} />
                <span
                  className="text-[9px] uppercase tracking-[0.2em]"
                  style={{
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)',
                    color: PALETTE.textMuted,
                  }}
                >
                  GRABBER
                </span>
                <CircleNum n={2} />
              </div>

              <div
                className="relative flex min-w-0 flex-col items-center justify-center overflow-hidden px-6 py-10"
                style={{ background: PALETTE.surface }}
              >
                <span
                  className="absolute right-4 top-4 text-[10px] tracking-[0.1em]"
                  style={{ color: PALETTE.textMuted }}
                >
                  AUDIO PIPELINE
                </span>

                <div
                  className="max-w-full select-none text-center"
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 'clamp(2.5rem, 8vw, 7rem)',
                    fontWeight: 400,
                    lineHeight: 1.05,
                    letterSpacing: '-0.04em',
                    color: status === 'COMPLETE' ? PALETTE.amber : PALETTE.textMain,
                    textShadow: status === 'DOWNLOADING' ? `0 0 24px ${PALETTE.amberGlow}` : 'none',
                    transition: 'color 0.2s ease, text-shadow 0.2s ease',
                    overflowWrap: 'anywhere',
                  }}
                  aria-live="polite"
                  aria-label={heroLabel}
                >
                  {heroLabel}
                </div>

                <span
                  className="mt-4 text-[10px] uppercase tracking-[0.2em]"
                  style={{ color: statusColor, fontFamily: "'DM Mono', monospace" }}
                >
                  {status === 'DOWNLOADING' ? '⟳ FETCHING …' : status === 'COMPLETE' ? '✓ STORED IN DOCK' : status === 'ERROR' ? '✕ FAILED' : 'IDLE · PASTE A LINK'}
                </span>
              </div>
            </section>

            {/* ── Stats ── */}
            <section className="flex flex-col" style={{ background: PALETTE.surface }}>
              <div
                className="flex items-center justify-between border-b px-6 py-3 text-[11px] uppercase tracking-[0.15em]"
                style={{ borderColor: PALETTE.line, color: PALETTE.textMain }}
              >
                <span>STATISTICS</span>
                <span
                  className="flex items-center gap-1.5"
                  style={{ fontFamily: "'DM Mono', monospace", color: PALETTE.textMuted }}
                >
                  <span
                    className="block size-1.5 rounded-full"
                    style={{
                      background: status === 'DOWNLOADING' ? PALETTE.amber : PALETTE.textMuted,
                      boxShadow: status === 'DOWNLOADING' ? `0 0 6px ${PALETTE.amber}` : 'none',
                    }}
                    aria-hidden
                  />
                  {status === 'DOWNLOADING' ? 'WORKING' : 'IDLE'}
                </span>
              </div>
              <div
                className="grid"
                style={{ gridTemplateColumns: '1fr 1fr', gap: '1px', background: PALETTE.line }}
              >
                <StatCell label="DOWNLOADS" value={String(downloadCount).padStart(2, '0')} />
                <StatCell
                  label="LENGTH"
                  value={duration != null ? inlinePlayerState.fmt(duration) : '—'}
                />
              </div>
              <div
                className="grid"
                style={{ gridTemplateColumns: '1fr 1fr', gap: '1px', background: PALETTE.line, borderTop: `1px solid ${PALETTE.line}` }}
              >
                <StatCell label="BFF ENDPOINT" value="POST /yt-audio" />
                <StatCell
                  label="STATUS"
                  value={status}
                  valueColor={statusColor}
                />
              </div>
            </section>

            {/* ── URL input row ── */}
            <section
              className="flex items-center justify-center px-6 py-4"
              style={{ background: PALETTE.surface }}
            >
              <div className="flex w-full max-w-[clamp(280px,70vw,720px)] items-stretch gap-2">
                <input
                  type="url"
                  inputMode="url"
                  spellCheck={false}
                  placeholder="PASTE A YOUTUBE LINK HERE"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && urlValid && status !== 'DOWNLOADING') {
                      e.preventDefault()
                      void startDownload()
                    }
                  }}
                  className="min-w-0 flex-1 rounded-none px-3 py-2 text-center text-[11px] uppercase tracking-[0.12em] outline-none placeholder:text-[color:rgba(245,166,35,0.55)]"
                  style={{
                    background: 'rgba(245,166,35,0.07)',
                    border: `1.5px solid ${PALETTE.amber}`,
                    color: PALETTE.textMain,
                    fontFamily: "'DM Mono', monospace",
                    boxShadow: url ? 'none' : `0 0 0 1px ${PALETTE.amber}, 0 0 16px ${PALETTE.amberGlow}`,
                  }}
                  aria-label="YouTube video URL"
                  disabled={status === 'DOWNLOADING'}
                />
                <button
                  type="button"
                  onClick={() => void pasteUrl()}
                  disabled={status === 'DOWNLOADING'}
                  className="flex shrink-0 items-center gap-1.5 px-3 py-2 text-[10px] uppercase tracking-[0.12em] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ border: `1.5px solid ${PALETTE.amber}`, color: PALETTE.amber, background: 'transparent', fontFamily: "'DM Mono', monospace" }}
                  aria-label="Paste link from clipboard"
                  title="Paste link from clipboard"
                >
                  <ClipboardPaste size={13} strokeWidth={2} />
                  PASTE
                </button>
              </div>
            </section>

            {/* ── Central control: GRAB to download, or transport once a clip is loaded ── */}
            <section
              className="flex items-center justify-center gap-4 p-6"
              style={{ background: PALETTE.surface }}
            >
              {transportMode && (
                <TransportArrow dir="prev" disabled={clampedIndex >= history.length - 1} onClick={goOlder} />
              )}

              <button
                ref={tapButtonRef}
                type="button"
                onMouseDown={e => {
                  if (transportMode || !urlValid || status === 'DOWNLOADING') return
                  void startDownload({ clientX: e.clientX, clientY: e.clientY })
                }}
                onTouchStart={e => {
                  if (transportMode || !urlValid || status === 'DOWNLOADING') return
                  if (e.touches.length === 0) return
                  e.preventDefault()
                  const t = e.touches[0]!
                  void startDownload({ clientX: t.clientX, clientY: t.clientY })
                }}
                onClick={() => {
                  if (transportMode) void togglePreviewPlay()
                }}
                disabled={!transportMode && (!urlValid || status === 'DOWNLOADING')}
                className="relative flex aspect-square w-full max-w-[clamp(180px,22vw,260px)] items-center justify-center overflow-hidden rounded-full transition-transform duration-100 active:scale-[0.97] disabled:cursor-not-allowed"
                style={{
                  background: 'transparent',
                  border: `1px solid ${
                    status === 'DOWNLOADING' ? PALETTE.amber : transportMode ? PALETTE.line : urlValid ? PALETTE.textMain : PALETTE.line
                  }`,
                  cursor: transportMode || (urlValid && status !== 'DOWNLOADING') ? 'pointer' : 'not-allowed',
                  opacity: !transportMode && !urlValid && status !== 'DOWNLOADING' ? 0.55 : 1,
                }}
                aria-label={transportMode ? (playingPreview ? 'Pause' : 'Play') : 'Start download'}
              >
                {/* Scrubber ring (transport mode) — fills as the clip plays. */}
                {transportMode && (
                  <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden>
                    <circle cx="50" cy="50" r="48" fill="none" stroke={PALETTE.line} strokeWidth="1.5" />
                    <circle
                      cx="50"
                      cy="50"
                      r="48"
                      fill="none"
                      stroke={PALETTE.amber}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 48}
                      strokeDashoffset={2 * Math.PI * 48 * (1 - (duration ? Math.min(1, previewTime / duration) : 0))}
                      transform="rotate(-90 50 50)"
                      style={{ transition: 'stroke-dashoffset 0.2s linear' }}
                    />
                  </svg>
                )}

                <span
                  className="pointer-events-none absolute inset-0 rounded-full transition-opacity duration-200"
                  style={{
                    background: `radial-gradient(circle, ${PALETTE.amberGlow} 0%, transparent 70%)`,
                    opacity: status === 'DOWNLOADING' ? 1 : 0,
                  }}
                  aria-hidden
                />
                {ripples.map(r => (
                  <span
                    key={r.id}
                    className="yt-ripple-anim pointer-events-none absolute rounded-full"
                    style={{
                      left: r.x - r.size / 2,
                      top: r.y - r.size / 2,
                      width: r.size,
                      height: r.size,
                      border: `1px solid ${PALETTE.amber}`,
                      transform: 'scale(0)',
                    }}
                    aria-hidden
                  />
                ))}
                <span className="pointer-events-none flex select-none flex-col items-center gap-2" aria-hidden>
                  {status === 'DOWNLOADING' ? (
                    <Loader2 className="size-10 animate-spin" style={{ color: PALETTE.amber }} />
                  ) : transportMode ? (
                    playingPreview ? (
                      <span className="flex gap-[5px]">
                        <span style={{ width: 6, height: 30, background: PALETTE.amber, display: 'block' }} />
                        <span style={{ width: 6, height: 30, background: PALETTE.amber, display: 'block' }} />
                      </span>
                    ) : (
                      <span
                        style={{
                          width: 0,
                          height: 0,
                          borderTop: '18px solid transparent',
                          borderBottom: '18px solid transparent',
                          borderLeft: `28px solid ${PALETTE.amber}`,
                          marginLeft: '6px',
                        }}
                      />
                    )
                  ) : (
                    <span
                      className="block"
                      style={{
                        width: 0,
                        height: 0,
                        borderTop: '18px solid transparent',
                        borderBottom: '18px solid transparent',
                        borderLeft: `28px solid ${urlValid ? PALETTE.textMain : PALETTE.textMuted}`,
                        marginLeft: '5px',
                      }}
                    />
                  )}
                  <span
                    style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: transportMode ? '0.72rem' : '0.95rem',
                      letterSpacing: '0.2em',
                      color: status === 'DOWNLOADING' ? PALETTE.amber : transportMode ? PALETTE.textMuted : urlValid ? PALETTE.textMain : PALETTE.textMuted,
                    }}
                  >
                    {status === 'DOWNLOADING'
                      ? 'FETCHING'
                      : transportMode
                        ? `${inlinePlayerState.fmt(previewTime)} / ${inlinePlayerState.fmt(duration ?? 0)}`
                        : 'GRAB'}
                  </span>
                </span>
              </button>

              {transportMode && (
                <TransportArrow dir="next" disabled={clampedIndex <= 0} onClick={goNewer} />
              )}
            </section>

            {/* ── Inline player + local download (only when a clip exists) ── */}
            {lastClip && clipObjectUrl ? (
              <section
                className="flex flex-col gap-3 px-6 py-4"
                style={{ background: PALETTE.surface }}
              >
                <div
                  className="flex items-center justify-between text-[10px] uppercase tracking-[0.15em]"
                  style={{ color: PALETTE.textMuted }}
                >
                  <span>PREVIEW {history.length > 0 ? `${clampedIndex + 1}/${history.length}` : ''}</span>
                  <span
                    className="truncate"
                    style={{ fontFamily: "'DM Mono', monospace", maxWidth: '60%' }}
                    title={lastClip.title}
                  >
                    {lastClip.title}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {/* CSS play/pause toggle button */}
                  <button
                    type="button"
                    onClick={() => void togglePreviewPlay()}
                    className="flex h-8 w-8 shrink-0 items-center justify-center transition-colors"
                    style={{
                      border: `1px solid ${playingPreview ? PALETTE.amber : PALETTE.line}`,
                      background: 'transparent',
                      color: playingPreview ? PALETTE.amber : PALETTE.textMain,
                    }}
                    aria-label={playingPreview ? 'Pause preview' : 'Play preview'}
                    title={playingPreview ? 'Pause preview' : 'Play preview'}
                  >
                    {playingPreview ? (
                      <span className="flex gap-[2px]" aria-hidden>
                        <span style={{ width: 2, height: 10, background: PALETTE.amber, display: 'block' }} />
                        <span style={{ width: 2, height: 10, background: PALETTE.amber, display: 'block' }} />
                      </span>
                    ) : (
                      <span
                        style={{
                          width: 0,
                          height: 0,
                          borderTop: '5px solid transparent',
                          borderBottom: '5px solid transparent',
                          borderLeft: `7px solid ${PALETTE.textMain}`,
                          marginLeft: '2px',
                        }}
                        aria-hidden
                      />
                    )}
                  </button>

                  {/* Native HTML5 audio (slim controls). Hooked to a ref so our
                      Play button stays in sync with the actual playback state. */}
                  <audio
                    ref={audioElRef}
                    src={clipObjectUrl}
                    onEnded={() => setPlayingPreview(false)}
                    onPause={() => setPlayingPreview(false)}
                    onPlay={() => setPlayingPreview(true)}
                    onTimeUpdate={e => setPreviewTime(e.currentTarget.currentTime)}
                    onLoadedMetadata={e => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : null)}
                    onDurationChange={e => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : null)}
                    controls
                    preload="metadata"
                    className="flex-1"
                    style={{
                      height: 32,
                      maxWidth: 'calc(100% - 130px)',
                      filter: 'invert(0.85) hue-rotate(180deg) saturate(0.6)',
                    }}
                  />

                  {/* Local download — uses the same object URL we keep for the
                      <audio>. Saves under the original video title. */}
                  <button
                    type="button"
                    onClick={downloadLocal}
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] transition-colors"
                    style={{
                      border: `1px solid ${PALETTE.line}`,
                      color: PALETTE.textMain,
                      background: 'transparent',
                      fontFamily: "'DM Mono', monospace",
                    }}
                    aria-label="Download MP3 locally"
                    title="Save MP3 to your computer"
                  >
                    <DownloadGlyph color={PALETTE.textMain} />
                    DOWNLOAD MP3
                  </button>
                </div>

                <span
                  className="text-[9px] uppercase tracking-[0.1em]"
                  style={{ color: PALETTE.textMuted, fontFamily: "'DM Mono', monospace" }}
                >
                  {inlinePlayerState.fmt(previewTime)} / {inlinePlayerState.fmt(duration ?? 0)} ·{' '}
                  {lastClip.sizeKb.toLocaleString()} KB
                </span>
              </section>
            ) : null}

            {/* ── Error / status banner ── */}
            {error ? (
              <section
                className="flex items-center gap-3 px-6 py-3"
                style={{
                  background: PALETTE.surface,
                  borderLeft: `2px solid #ef4444`,
                }}
              >
                <span
                  className="text-[10px] uppercase tracking-[0.15em]"
                  style={{ color: '#ef4444', fontFamily: "'DM Mono', monospace" }}
                >
                  ERROR
                </span>
                <span className="text-[11px]" style={{ color: PALETTE.textMain }}>
                  {error}
                </span>
              </section>
            ) : (
              <div style={{ background: PALETTE.surface }} />
            )}

            {/* ── Clip actions — run on the grabbed clip (enabled once it exists) ── */}
            <section
              className="grid"
              style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', background: PALETTE.line }}
            >
              <ControlButton
                active={false}
                disabled={!lastClip}
                onClick={() => lastClip && sendClipToRoute('tools-chord-detector', lastClip.dockId)}
                icon={<SendGlyph color={lastClip ? PALETTE.textMain : PALETTE.textMuted} />}
                label="SEND TO CHORDS"
              />
              <ControlButton
                active={keyOpen}
                disabled={!lastClip}
                onClick={() => void runKey()}
                icon={<KeyRound size={12} strokeWidth={2} style={{ color: lastClip ? (keyOpen ? PALETTE.amber : PALETTE.textMain) : PALETTE.textMuted }} />}
                label="GET KEY"
              />
              <ControlButton
                active={stemsOpen}
                disabled={!lastClip}
                onClick={() => void runStems()}
                icon={<Layers size={12} strokeWidth={2} style={{ color: lastClip ? (stemsOpen ? PALETTE.amber : PALETTE.textMain) : PALETTE.textMuted }} />}
                label="STEM OUT"
              />
            </section>

            {/* ── Rights notice (kept, restyled GRAY2020) ── */}
            <section
              className="px-6 py-4"
              style={{ background: PALETTE.surface, borderTop: `1px solid ${PALETTE.line}` }}
            >
              <p
                className="text-[10px] leading-relaxed tracking-[0.05em]"
                style={{ color: PALETTE.textMuted, fontFamily: "'DM Mono', monospace" }}
              >
                <span style={{ color: PALETTE.amber }}>RIGHTS</span> · Only grab audio you own or have permission to use. The dev BFF
                runs locally via <span style={{ color: PALETTE.textMain }}>yt-dlp</span> + <span style={{ color: PALETTE.textMain }}>ffmpeg</span>; clips stay in
                browser IndexedDB.
              </p>
            </section>
          </div>
        </div>
      </div>

      <KeyModal
        open={keyOpen}
        loading={keyLoading}
        info={keyInfo}
        error={keyError}
        onClose={() => setKeyOpen(false)}
      />
      <StemsModal
        open={stemsOpen}
        loading={stemsLoading}
        stems={stems}
        error={stemsError}
        onDownload={downloadBlob}
        onDownloadAll={() => void downloadAllStems()}
        onClose={() => setStemsOpen(false)}
      />
    </div>
  )
}

/* ── GRAY2020 sub-components ─────────────────────────────────────────────────── */

function TransportArrow({ dir, disabled, onClick }: { dir: 'prev' | 'next'; disabled: boolean; onClick: () => void }) {
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-30"
      style={{ border: `1px solid ${PALETTE.line}`, color: PALETTE.textMain, background: 'transparent' }}
      aria-label={dir === 'prev' ? 'Older download' : 'Newer download'}
      title={dir === 'prev' ? 'Older download' : 'Newer download'}
    >
      <Icon size={18} />
    </button>
  )
}

function PillButton({
  label,
  onClick,
  active,
  decorative,
}: {
  label: string
  onClick?: () => void
  active?: boolean
  decorative?: boolean
}) {
  const sharedStyle: React.CSSProperties = {
    border: `1px solid ${active ? PALETTE.amber : PALETTE.line}`,
    color: active ? PALETTE.amber : decorative ? PALETTE.textMuted : PALETTE.textMain,
    background: 'transparent',
    fontFamily: "'DM Mono', monospace",
  }
  if (decorative) {
    return (
      <span
        className="rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.15em]"
        style={sharedStyle}
        aria-hidden
      >
        {label}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] transition-colors"
      style={sharedStyle}
      aria-pressed={active}
    >
      {label}
    </button>
  )
}

function CircleNum({ n }: { n: number }) {
  return (
    <span
      className="grid place-items-center rounded-full"
      style={{
        width: '1.2rem',
        height: '1.2rem',
        border: `1px solid ${PALETTE.line}`,
        fontFamily: "'DM Mono', monospace",
        fontSize: '0.55rem',
        color: PALETTE.textMuted,
      }}
      aria-hidden
    >
      {n}
    </span>
  )
}

function StatCell({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div
      className="flex items-center justify-between px-6 py-4"
      style={{ background: PALETTE.surface }}
    >
      <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: PALETTE.textMuted }}>
        {label}
      </span>
      <span
        className="truncate text-[13px]"
        style={{
          fontFamily: "'DM Mono', monospace",
          color: valueColor ?? PALETTE.textMain,
          maxWidth: '60%',
        }}
        title={value}
      >
        {value}
      </span>
    </div>
  )
}

function ControlButton({
  active,
  disabled,
  onClick,
  icon,
  label,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-2 py-5 text-[11px] uppercase tracking-[0.2em] transition-colors disabled:cursor-not-allowed"
      style={{
        background: PALETTE.surface,
        color: disabled ? PALETTE.textMuted : active ? PALETTE.amber : PALETTE.textMain,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon}
      {label}
    </button>
  )
}

/** CSS-only download glyph (arrow into a tray). */
function DownloadGlyph({ color }: { color: string }) {
  return (
    <span className="relative flex h-3 w-3 items-end justify-center" aria-hidden>
      <span
        className="absolute top-0 block"
        style={{
          width: 2,
          height: 6,
          background: color,
          left: 'calc(50% - 1px)',
        }}
      />
      <span
        className="absolute"
        style={{
          top: 4,
          left: 'calc(50% - 3px)',
          width: 0,
          height: 0,
          borderLeft: '3px solid transparent',
          borderRight: '3px solid transparent',
          borderTop: `3px solid ${color}`,
        }}
      />
      <span
        className="absolute bottom-0 block"
        style={{
          width: 8,
          height: 2,
          background: color,
          left: 'calc(50% - 4px)',
        }}
      />
    </span>
  )
}

/** Simple arrow-right CSS glyph for "Send to" buttons. */
function SendGlyph({ color }: { color: string }) {
  return (
    <span className="relative flex h-3 w-3 items-center" aria-hidden>
      <span
        className="absolute block"
        style={{
          left: 0,
          top: 'calc(50% - 1px)',
          width: 8,
          height: 2,
          background: color,
        }}
      />
      <span
        className="absolute"
        style={{
          right: 0,
          top: 'calc(50% - 3px)',
          width: 0,
          height: 0,
          borderTop: '3px solid transparent',
          borderBottom: '3px solid transparent',
          borderLeft: `4px solid ${color}`,
        }}
      />
    </span>
  )
}

/* ── Clip-action popups (KEY / STEM OUT) ─────────────────────────────────────── */

function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.62)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md"
        style={{ background: PALETTE.surface, border: `1px solid ${PALETTE.line}` }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: `1px solid ${PALETTE.line}` }}
        >
          <span
            className="text-[11px] uppercase tracking-[0.2em]"
            style={{ color: PALETTE.textMain, fontFamily: "'DM Mono', monospace" }}
          >
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center transition-colors"
            style={{ color: PALETTE.textMuted }}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

function LoadingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-6" style={{ color: PALETTE.textMuted }}>
      <Loader2 className="size-5 animate-spin" style={{ color: PALETTE.amber }} />
      <span className="text-[12px] uppercase tracking-[0.15em]" style={{ fontFamily: "'DM Mono', monospace" }}>
        {label}
      </span>
    </div>
  )
}

function ErrorRow({ text }: { text: string }) {
  return (
    <div className="py-4 text-[12px]" style={{ color: '#ef4444', fontFamily: "'DM Mono', monospace" }}>
      {text}
    </div>
  )
}

function InfoRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${PALETTE.line}` }}>
      <span className="text-[10px] uppercase tracking-[0.15em]" style={{ color: PALETTE.textMuted }}>
        {label}
      </span>
      <span
        className="text-[15px] tabular-nums"
        style={{ color: accent ? PALETTE.amber : PALETTE.textMain, fontFamily: "'DM Mono', monospace" }}
      >
        {value}
      </span>
    </div>
  )
}

function KeyModal({
  open,
  loading,
  info,
  error,
  onClose,
}: {
  open: boolean
  loading: boolean
  info: KeyInfo | null
  error: string | null
  onClose: () => void
}) {
  if (!open) return null
  return (
    <Overlay title="KEY · BPM · SCALE" onClose={onClose}>
      {loading ? (
        <LoadingRow label="Reading key & tempo…" />
      ) : error ? (
        <ErrorRow text={error} />
      ) : info ? (
        <div>
          <InfoRow label="Key" value={info.key ?? 'Undetected'} accent />
          <InfoRow label="BPM" value={info.bpm != null ? String(info.bpm) : '—'} accent />
          <InfoRow label="Camelot" value={info.camelot ?? '—'} />
          <InfoRow label="Auto-tune scale" value={info.autotune ?? '—'} />
          <div className="pt-3">
            <span className="text-[10px] uppercase tracking-[0.15em]" style={{ color: PALETTE.textMuted }}>
              Scale notes
            </span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {info.scale.length ? (
                info.scale.map(n => (
                  <span
                    key={n}
                    className="px-2 py-1 text-[12px]"
                    style={{ border: `1px solid ${PALETTE.line}`, color: PALETTE.textMain, fontFamily: "'DM Mono', monospace" }}
                  >
                    {n}
                  </span>
                ))
              ) : (
                <span className="text-[12px]" style={{ color: PALETTE.textMuted }}>
                  —
                </span>
              )}
            </div>
          </div>
          <p className="mt-4 text-[10px] leading-snug" style={{ color: PALETTE.textMuted, fontFamily: "'DM Mono', monospace" }}>
            {info.key
              ? <>Set your Auto-Tune key to <span style={{ color: PALETTE.textMain }}>{info.autotune}</span>{info.confidence != null ? ` · ${(info.confidence * 100).toFixed(0)}% confidence` : ''}. Chromagram + tempo estimate.</>
              : 'Key came back ambiguous (atonal or very percussive). BPM is still shown above.'}
          </p>
        </div>
      ) : null}
    </Overlay>
  )
}

function StemRow({ stem, onDownload }: { stem: Stem; onDownload: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3" style={{ borderBottom: `1px solid ${PALETTE.line}` }}>
      <div className="min-w-0">
        <div className="text-[13px]" style={{ color: PALETTE.textMain, fontFamily: "'DM Mono', monospace" }}>
          {stem.label}
        </div>
        <div className="text-[10px] leading-snug" style={{ color: PALETTE.textMuted }}>
          {stem.hint}
        </div>
      </div>
      <button
        type="button"
        onClick={onDownload}
        className="flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] transition-colors"
        style={{ border: `1px solid ${PALETTE.line}`, color: PALETTE.textMain, fontFamily: "'DM Mono', monospace" }}
      >
        <DownloadGlyph color={PALETTE.textMain} /> WAV
      </button>
    </div>
  )
}

function StemsModal({
  open,
  loading,
  stems,
  error,
  onDownload,
  onDownloadAll,
  onClose,
}: {
  open: boolean
  loading: boolean
  stems: Stem[] | null
  error: string | null
  onDownload: (blob: Blob, name: string) => void
  onDownloadAll: () => void
  onClose: () => void
}) {
  if (!open) return null
  return (
    <Overlay title="STEM OUT · 4 STEMS" onClose={onClose}>
      {loading ? (
        <LoadingRow label="Splitting stems…" />
      ) : error ? (
        <ErrorRow text={error} />
      ) : stems ? (
        <div>
          {stems.map(s => (
            <StemRow key={s.id} stem={s} onDownload={() => onDownload(s.blob, s.fileName)} />
          ))}
          <button
            type="button"
            onClick={onDownloadAll}
            className="mt-4 flex w-full items-center justify-center gap-2 py-3 text-[11px] uppercase tracking-[0.2em] transition-colors"
            style={{ background: PALETTE.amber, color: '#0A0A0C', fontFamily: "'DM Mono', monospace" }}
          >
            <DownloadGlyph color="#0A0A0C" /> Download all (.zip)
          </button>
          <p className="mt-3 text-[10px] leading-snug" style={{ color: PALETTE.textMuted, fontFamily: "'DM Mono', monospace" }}>
            Split via harmonic/percussive separation + frequency bands — a fast approximation, not surgical AI isolation.
          </p>
        </div>
      ) : null}
    </Overlay>
  )
}
