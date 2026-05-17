import { ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { triggerDownload } from '../../lib/pcm-wav'
import StudioToolsHeader from './StudioToolsHeader'

interface ToolsSessionTimerPageProps {
  onNavigate: (routeId: string) => void
}

type Cue = { id: string; label: string; startedAtElapsed: number }

function msToClock(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  const cs = ms % 1000
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}.${String(Math.floor(cs / 10)).padStart(2, '0')}`
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

export default function ToolsSessionTimerPage({ onNavigate }: ToolsSessionTimerPageProps) {
  /* ── State / handlers carried over verbatim from the previous implementation ── */
  const [running, setRunning] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [cues, setCues] = useState<Cue[]>([])
  const [cueDraft, setCueDraft] = useState('')
  const lapStartRef = useRef<number | null>(null)
  const accumulatedRef = useRef(0)

  const pause = useCallback(() => {
    if (!running) return
    if (lapStartRef.current != null) {
      accumulatedRef.current += performance.now() - lapStartRef.current
      lapStartRef.current = null
    }
    setElapsedMs(accumulatedRef.current)
    setRunning(false)
  }, [running])

  useEffect(() => {
    if (!running) return
    let lap0 = lapStartRef.current
    if (lap0 == null) {
      lap0 = performance.now()
      lapStartRef.current = lap0
    }
    let frame: number
    const loop = (): void => {
      setElapsedMs(accumulatedRef.current + (performance.now() - lap0))
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [running])

  const reset = useCallback(() => {
    lapStartRef.current = null
    accumulatedRef.current = 0
    setElapsedMs(0)
    setRunning(false)
    setCues([])
  }, [])

  const markCue = useCallback(() => {
    const lap = lapStartRef.current
    const ms = lap != null ? accumulatedRef.current + (performance.now() - lap) : accumulatedRef.current

    const label = cueDraft.trim() || `Cue ${cues.length + 1}`
    setCues(prev => [...prev, { id: crypto.randomUUID(), label, startedAtElapsed: ms }])
    setCueDraft('')
  }, [cueDraft, cues.length])

  const exportMd = useCallback(() => {
    const lines = [
      '# Session cues',
      '',
      `Elapsed: ${msToClock(elapsedMs)}`,
      '',
      '| Time | Label |',
      '|------|-------|',
      ...cues.map(c => `| ${msToClock(c.startedAtElapsed)} | ${c.label.replace(/\|/g, '\\|')} |`),
      '',
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
    triggerDownload(blob, 'session_cues.md')
  }, [cues, elapsedMs])

  const exportTxt = useCallback(() => {
    const lines = [
      'Session cues',
      `Elapsed: ${msToClock(elapsedMs)}`,
      '',
      ...cues.map(c => `${msToClock(c.startedAtElapsed)} — ${c.label}`),
      '',
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    triggerDownload(blob, 'session_cues.txt')
  }, [cues, elapsedMs])

  /* ── GRAY2020-specific UI state ── */
  const tapButtonRef = useRef<HTMLButtonElement | null>(null)
  const rippleIdRef = useRef<number>(0)
  const [ripples, setRipples] = useState<Ripple[]>([])

  const spawnRipple = useCallback((x: number, y: number, size: number) => {
    const id = rippleIdRef.current++
    setRipples(prev => [...prev, { id, x, y, size }])
    window.setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== id))
    }, 600)
  }, [])

  const handleMarkCue = useCallback(() => {
    markCue()
  }, [markCue])

  const handleStartPause = useCallback(
    (origin?: { clientX: number; clientY: number }) => {
      // Toggle the timer + ripple from the click coords (or center for keyboard).
      if (running) pause()
      else {
        lapStartRef.current = performance.now()
        setRunning(true)
      }
      const btn = tapButtonRef.current
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      const size = Math.max(rect.width, rect.height)
      const x = origin ? origin.clientX - rect.left : rect.width / 2
      const y = origin ? origin.clientY - rect.top : rect.height / 2
      spawnRipple(x, y, size)
    },
    [running, pause, spawnRipple],
  )

  /* ── Derived stats for the 2x2 grid ── */
  const lastCueMs = cues.length > 0 ? cues[cues.length - 1]!.startedAtElapsed : null
  const avgInterval = useMemo<number | null>(() => {
    if (cues.length < 2) return null
    let sum = 0
    for (let i = 1; i < cues.length; i++) sum += cues[i]!.startedAtElapsed - cues[i - 1]!.startedAtElapsed
    return sum / (cues.length - 1)
  }, [cues])

  const status: { label: string; color: string } = running
    ? { label: 'RUNNING', color: PALETTE.amber }
    : elapsedMs > 0
      ? { label: 'PAUSED', color: PALETTE.textMain }
      : { label: 'READY', color: PALETTE.textMuted }

  // 4 quarter-second dots — visualizes the clock advancing while running
  const activeDot = running ? Math.floor((elapsedMs % 1000) / 250) : null

  const clockText = msToClock(elapsedMs)

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}
    >
      <StudioToolsHeader
        toolId="tools-session-timer"
        crumbs={[{ label: 'Workspace' }, { label: 'Tools' }, { label: 'Session timer', emphasis: true }]}
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
          @keyframes session-ripple { to { transform: scale(4); opacity: 0; } }
          .session-ripple-anim { animation: session-ripple 0.6s linear forwards; }
        `}</style>

        <div
          className="mx-auto flex w-full flex-col"
          style={{ minHeight: 'calc(100dvh - 56px)' }}
        >
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
              {/* UTIL.04 is decorative (module identifier) — the back arrow already handles navigation */}
              <PillButton label="UTIL.04" decorative />
              <div
                className="text-[10px] uppercase tracking-[0.2em]"
                style={{ color: PALETTE.textMuted, fontFamily: "'DM Mono', monospace" }}
              >
                SESSION_T
              </div>
              <PillButton label="RESET" onClick={reset} />
            </header>

            {/* ── Hero (sidebar + clock + dots) ── */}
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
                  MONITORING
                </span>
                <CircleNum n={2} />
              </div>

              <div
                className="relative flex flex-col items-center justify-center px-4 py-8"
                style={{ background: PALETTE.surface }}
              >
                <span
                  className="absolute right-4 top-4 text-[10px] tracking-[0.1em]"
                  style={{ color: PALETTE.textMuted }}
                >
                  ELAPSED
                </span>

                <div
                  className="select-none"
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 'clamp(3rem, 12vw, 10rem)',
                    fontWeight: 400,
                    lineHeight: 1,
                    letterSpacing: '-0.05em',
                    color: PALETTE.textMain,
                    textShadow: running ? `0 0 24px ${PALETTE.amberGlow}` : 'none',
                    transition: 'text-shadow 0.2s ease',
                  }}
                  aria-live="polite"
                  aria-label={`Elapsed ${clockText}`}
                >
                  {clockText}
                </div>

                <div className="mt-6 flex gap-2" aria-hidden>
                  {[0, 1, 2, 3].map(i => (
                    <span
                      key={i}
                      className="block size-1.5 rounded-full transition-colors duration-100"
                      style={{
                        background: activeDot === i ? PALETTE.amber : PALETTE.line,
                        boxShadow: activeDot === i ? `0 0 8px ${PALETTE.amber}` : 'none',
                      }}
                    />
                  ))}
                </div>
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
                      background: running ? PALETTE.amber : PALETTE.textMuted,
                      boxShadow: running ? `0 0 6px ${PALETTE.amber}` : 'none',
                    }}
                    aria-hidden
                  />
                  LIVE
                </span>
              </div>
              <div
                className="grid"
                style={{ gridTemplateColumns: '1fr 1fr', gap: '1px', background: PALETTE.line }}
              >
                <StatCell label="LAPS LOGGED" value={cues.length.toString()} />
                <StatCell label="LAST CUE" value={lastCueMs != null ? msToClock(lastCueMs) : '—'} />
              </div>
              <div
                className="grid"
                style={{ gridTemplateColumns: '1fr 1fr', gap: '1px', background: PALETTE.line, borderTop: `1px solid ${PALETTE.line}` }}
              >
                <StatCell label="AVG INTERVAL" value={avgInterval != null ? msToClock(avgInterval) : '—'} />
                <StatCell label="STATUS" value={status.label} valueColor={status.color} />
              </div>
            </section>

            {/* ── Interaction: big circular START / PAUSE ── */}
            <section
              className="flex flex-col items-center gap-5 p-6"
              style={{ background: PALETTE.surface }}
            >
              <button
                ref={tapButtonRef}
                type="button"
                onMouseDown={e => handleStartPause({ clientX: e.clientX, clientY: e.clientY })}
                onTouchStart={e => {
                  if (e.touches.length === 0) return
                  e.preventDefault()
                  const t = e.touches[0]!
                  handleStartPause({ clientX: t.clientX, clientY: t.clientY })
                }}
                className="relative flex aspect-square w-full max-w-[clamp(220px,32vw,360px)] items-center justify-center overflow-hidden rounded-full transition-transform duration-100 active:scale-[0.97]"
                style={{
                  background: 'transparent',
                  border: `1px solid ${running ? PALETTE.amber : PALETTE.line}`,
                  cursor: 'pointer',
                }}
                aria-label={running ? 'Pause session timer' : 'Start session timer'}
                aria-pressed={running}
              >
                <span
                  className="pointer-events-none absolute inset-0 rounded-full transition-opacity duration-200"
                  style={{
                    background: `radial-gradient(circle, ${PALETTE.amberGlow} 0%, transparent 70%)`,
                    opacity: running ? 1 : 0,
                  }}
                  aria-hidden
                />
                {ripples.map(r => (
                  <span
                    key={r.id}
                    className="session-ripple-anim pointer-events-none absolute rounded-full"
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
                  {running ? (
                    // Pause icon — two amber vertical bars
                    <span className="flex gap-[5px]">
                      <span style={{ width: 8, height: 32, background: PALETTE.amber, display: 'block' }} />
                      <span style={{ width: 8, height: 32, background: PALETTE.amber, display: 'block' }} />
                    </span>
                  ) : (
                    // Play icon — solid triangle (CSS-only)
                    <span
                      className="block"
                      style={{
                        width: 0,
                        height: 0,
                        borderTop: '20px solid transparent',
                        borderBottom: '20px solid transparent',
                        borderLeft: `30px solid ${PALETTE.textMain}`,
                        marginLeft: '6px',
                      }}
                    />
                  )}
                  <span
                    style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: '1rem',
                      letterSpacing: '0.25em',
                      color: running ? PALETTE.amber : PALETTE.textMuted,
                    }}
                  >
                    {running ? 'PAUSE' : elapsedMs > 0 ? 'RESUME' : 'START'}
                  </span>
                </span>
              </button>
            </section>

            {/* ── Cue input row (paired with MARK CUE in the controls below) ── */}
            <section
              className="flex items-center justify-center px-6 py-4"
              style={{ background: PALETTE.surface }}
            >
              <input
                value={cueDraft}
                onChange={e => setCueDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleMarkCue()
                  }
                }}
                placeholder="OPTIONAL CUE LABEL — PRESS ENTER TO MARK"
                spellCheck={false}
                className="w-full max-w-[clamp(280px,60vw,640px)] rounded-none px-3 py-2 text-center text-[11px] uppercase tracking-[0.15em] outline-none"
                style={{
                  background: 'transparent',
                  border: `1px solid ${PALETTE.line}`,
                  color: PALETTE.textMain,
                  fontFamily: "'DM Mono', monospace",
                }}
                aria-label="Optional cue label"
              />
            </section>

            {/* ── Cue list ── */}
            <section
              className="flex max-h-[200px] flex-col overflow-y-auto"
              style={{ background: PALETTE.surface }}
            >
              <div
                className="sticky top-0 flex items-center justify-between border-b px-6 py-3 text-[11px] uppercase tracking-[0.15em]"
                style={{ borderColor: PALETTE.line, color: PALETTE.textMain, background: PALETTE.surface }}
              >
                <span>CUE LOG</span>
                <span style={{ color: PALETTE.textMuted, fontFamily: "'DM Mono', monospace" }}>
                  {cues.length === 0 ? 'EMPTY' : `${String(cues.length).padStart(2, '0')} ENTRIES`}
                </span>
              </div>
              {cues.length === 0 ? (
                <div
                  className="px-6 py-8 text-center text-[11px] uppercase tracking-[0.15em]"
                  style={{ color: PALETTE.textMuted }}
                >
                  — NO CUES MARKED —
                </div>
              ) : (
                <ol>
                  {cues.map((c, idx) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between px-6 py-2.5"
                      style={{
                        borderTop: idx === 0 ? 'none' : `1px solid ${PALETTE.line}`,
                      }}
                    >
                      <span
                        className="flex items-center gap-3"
                        style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.7rem' }}
                      >
                        <span style={{ color: PALETTE.textMuted, fontSize: '0.65rem' }}>
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span style={{ color: PALETTE.amber }}>{msToClock(c.startedAtElapsed)}</span>
                      </span>
                      <span
                        className="truncate text-[12px]"
                        style={{ color: PALETTE.textMain, maxWidth: '60%' }}
                      >
                        {c.label}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* ── Controls: MARK CUE | EXPORT MD | EXPORT TXT
                  (Start/pause moved to the big center button; this row is now
                   the secondary actions — log a cue and export the cue list.) ── */}
            <section
              className="grid"
              style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', background: PALETTE.line }}
            >
              <ControlButton
                active={false}
                disabled={!running && elapsedMs === 0}
                onClick={handleMarkCue}
                icon={
                  <span
                    className="block size-2 rounded-full"
                    style={{
                      background: !running && elapsedMs === 0 ? PALETTE.textMuted : PALETTE.amber,
                      boxShadow: running ? `0 0 6px ${PALETTE.amber}` : 'none',
                    }}
                    aria-hidden
                  />
                }
                label="MARK CUE"
              />
              <ControlButton
                active={false}
                disabled={cues.length === 0}
                onClick={exportMd}
                icon={<DownloadGlyph color={cues.length === 0 ? PALETTE.textMuted : PALETTE.textMain} />}
                label="EXPORT MD"
              />
              <ControlButton
                active={false}
                disabled={cues.length === 0}
                onClick={exportTxt}
                icon={<DownloadGlyph color={cues.length === 0 ? PALETTE.textMuted : PALETTE.textMain} />}
                label="EXPORT TXT"
              />
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
  /** Render as a non-interactive identifier badge (no hover, no click). */
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
        className="text-[13px]"
        style={{
          fontFamily: "'DM Mono', monospace",
          color: valueColor ?? PALETTE.textMain,
        }}
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

/** Simple CSS-only download glyph — arrow into a tray. */
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
