import { ArrowLeft, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { addDownloadedFile, getFileById, subscribeFiles } from '../../components/files-dock/files-store'
import { fetchWithKeys } from '../../lib/api-keys'
import StudioToolsHeader from './StudioToolsHeader'

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
  const [lastClip, setLastClip] = useState<{ title: string; dockId: string; videoId: string; sizeKb: number } | null>(null)
  const [dockCount, setDockCount] = useState(0)

  /** Object URL for the most recent clip — used by the inline <audio> player. */
  const [clipObjectUrl, setClipObjectUrl] = useState<string | null>(null)
  const [playingPreview, setPlayingPreview] = useState(false)
  const [previewTime, setPreviewTime] = useState(0)
  const audioElRef = useRef<HTMLAudioElement | null>(null)

  const tapButtonRef = useRef<HTMLButtonElement | null>(null)
  const rippleIdRef = useRef(0)
  const [ripples, setRipples] = useState<Ripple[]>([])

  // Total clips count comes straight from the global FilesDock store.
  useEffect(() => subscribeFiles(list => setDockCount(list.length)), [])

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
        const row = await addDownloadedFile({
          blob,
          name: safeName,
          source: 'YouTube grab',
          lane: 'downloads',
        })

        setLastClip({
          title,
          dockId: row.id,
          videoId,
          sizeKb: Math.round(blob.size / 1024),
        })
        // Keep an object URL alive for the inline player + the local Download
        // button. Replace any prior URL (free its handle) so we don't leak.
        setClipObjectUrl(prev => {
          if (prev) URL.revokeObjectURL(prev)
          return URL.createObjectURL(blob)
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
    setLastClip(null)
    // Tear down the inline player and free its object URL.
    if (audioElRef.current) {
      audioElRef.current.pause()
      audioElRef.current.currentTime = 0
    }
    setPlayingPreview(false)
    setClipObjectUrl(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }, [])

  // Free the object URL on unmount so we don't leak across page navigations.
  useEffect(() => {
    return () => {
      if (clipObjectUrl) URL.revokeObjectURL(clipObjectUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const togglePreviewPlay = useCallback(async () => {
    if (!clipObjectUrl && lastClip) {
      // Late path: dock item exists but we lost the in-memory URL (e.g. after
      // a hot-reload). Recreate it from the dock store.
      const stored = await getFileById(lastClip.dockId)
      if (stored) {
        setClipObjectUrl(URL.createObjectURL(stored.blob))
      }
      return
    }
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
  }, [clipObjectUrl, lastClip])

  const downloadLocal = useCallback(() => {
    if (!clipObjectUrl || !lastClip) return
    const a = document.createElement('a')
    a.href = clipObjectUrl
    a.download = `${lastClip.title.replace(/[/\\?%*:|"<>]/g, '_')}.mp3`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }, [clipObjectUrl, lastClip])

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

  const heroLabel = status === 'COMPLETE' && lastClip ? lastClip.title : 'YT → MP3'
  const urlValid = /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(url.trim())

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
              <PillButton label="UTIL.10" decorative />
              <div
                className="text-[10px] uppercase tracking-[0.2em]"
                style={{ color: PALETTE.textMuted, fontFamily: "'DM Mono', monospace" }}
              >
                YT_GRAB
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
                <StatCell label="DOCK ITEMS" value={String(dockCount).padStart(2, '0')} />
                <StatCell
                  label="LAST CLIP SIZE"
                  value={lastClip ? `${lastClip.sizeKb.toLocaleString()} KB` : '—'}
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
              <input
                type="url"
                inputMode="url"
                spellCheck={false}
                placeholder="HTTPS://WWW.YOUTUBE.COM/WATCH?V=…"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && urlValid && status !== 'DOWNLOADING') {
                    e.preventDefault()
                    void startDownload()
                  }
                }}
                className="w-full max-w-[clamp(280px,70vw,720px)] rounded-none px-3 py-2 text-center text-[11px] uppercase tracking-[0.12em] outline-none"
                style={{
                  background: 'transparent',
                  border: `1px solid ${urlValid ? PALETTE.amber : PALETTE.line}`,
                  color: PALETTE.textMain,
                  fontFamily: "'DM Mono', monospace",
                }}
                aria-label="YouTube video URL"
                disabled={status === 'DOWNLOADING'}
              />
            </section>

            {/* ── Big circular Start button ── */}
            <section
              className="flex items-center justify-center p-6"
              style={{ background: PALETTE.surface }}
            >
              <button
                ref={tapButtonRef}
                type="button"
                onMouseDown={e => {
                  if (!urlValid || status === 'DOWNLOADING') return
                  void startDownload({ clientX: e.clientX, clientY: e.clientY })
                }}
                onTouchStart={e => {
                  if (!urlValid || status === 'DOWNLOADING') return
                  if (e.touches.length === 0) return
                  e.preventDefault()
                  const t = e.touches[0]!
                  void startDownload({ clientX: t.clientX, clientY: t.clientY })
                }}
                disabled={!urlValid || status === 'DOWNLOADING'}
                className="relative flex aspect-square w-full max-w-[clamp(200px,24vw,280px)] items-center justify-center overflow-hidden rounded-full transition-transform duration-100 active:scale-[0.97] disabled:cursor-not-allowed"
                style={{
                  background: 'transparent',
                  border: `1px solid ${status === 'DOWNLOADING' ? PALETTE.amber : urlValid ? PALETTE.textMain : PALETTE.line}`,
                  cursor: urlValid && status !== 'DOWNLOADING' ? 'pointer' : 'not-allowed',
                  opacity: !urlValid && status !== 'DOWNLOADING' ? 0.55 : 1,
                }}
                aria-label="Start download"
              >
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
                <span
                  className="pointer-events-none flex select-none flex-col items-center gap-3"
                  aria-hidden
                >
                  {status === 'DOWNLOADING' ? (
                    <Loader2 className="size-10 animate-spin" style={{ color: PALETTE.amber }} />
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
                      fontSize: '0.95rem',
                      letterSpacing: '0.25em',
                      color: status === 'DOWNLOADING' ? PALETTE.amber : urlValid ? PALETTE.textMain : PALETTE.textMuted,
                    }}
                  >
                    {status === 'DOWNLOADING' ? 'FETCHING' : 'GRAB'}
                  </span>
                </span>
              </button>
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
                  <span>PREVIEW</span>
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
                  {inlinePlayerState.fmt(previewTime)} ·{' '}
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

            {/* ── Send-to controls (enabled when a clip exists) ── */}
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
                active={false}
                disabled={!lastClip}
                onClick={() => lastClip && sendClipToRoute('tools-key-finder', lastClip.dockId)}
                icon={<SendGlyph color={lastClip ? PALETTE.textMain : PALETTE.textMuted} />}
                label="SEND TO KEY"
              />
              <ControlButton
                active={false}
                disabled={!lastClip}
                onClick={() => lastClip && sendClipToRoute('tools-stem-splitter', lastClip.dockId)}
                icon={<SendGlyph color={lastClip ? PALETTE.textMain : PALETTE.textMuted} />}
                label="SEND TO STEMS"
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
    </div>
  )
}

/* ── GRAY2020 sub-components ─────────────────────────────────────────────────── */

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
