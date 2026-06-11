import { ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import StudioToolsHeader from './StudioToolsHeader'

interface ToolsTempoTapPageProps {
  onNavigate: (routeId: string) => void
}

/* ── Tempo-tap math ──────────────────────────────────────────────────────────── */

const BPM_MIN = 40
const BPM_MAX = 240
const TAP_GAP_RESET_MS = 2500
const MAX_TAP_HISTORY = 8

type Confidence = 'LOW' | 'MED' | 'HIGH'

type BpmResult = {
  bpm: number
  intervalMs: number
  confidence: Confidence
}

function clampBpm(n: number): number {
  return Math.min(BPM_MAX, Math.max(BPM_MIN, n))
}

/** Calculate BPM + variance-based confidence from a rolling window of tap times. */
function tapsToBpm(times: readonly number[]): BpmResult | null {
  if (times.length < 2) return null
  const intervals: number[] = []
  for (let i = 1; i < times.length; i++) {
    const d = times[i]! - times[i - 1]!
    if (d < 100 || d > 1900) return null
    intervals.push(d)
  }
  const last = intervals[intervals.length - 1]!
  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
  const bpm = clampBpm(60000 / avg)
  let confidence: Confidence = 'LOW'
  if (intervals.length >= 3) {
    const variance =
      intervals.reduce((acc, val) => acc + Math.abs(val - avg), 0) / intervals.length
    confidence = variance < 20 ? 'HIGH' : variance < 50 ? 'MED' : 'LOW'
  }
  return { bpm, intervalMs: Math.round(last), confidence }
}

function playClick(ctx: AudioContext, time: number, accented: boolean): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = accented ? 1200 : 800
  osc.connect(gain)
  gain.connect(ctx.destination)
  const peak = accented ? 0.4 : 0.28
  gain.gain.setValueAtTime(0, time)
  gain.gain.linearRampToValueAtTime(peak, time + 0.003)
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05)
  osc.start(time)
  osc.stop(time + 0.05)
}

/* ── Display helpers ─────────────────────────────────────────────────────────── */

/** Pad and split BPM to "xxx.x" for the hero typography (e.g. 100 → "100.0", 85 → "085.0"). */
function formatBpmDisplay(bpm: number): { whole: string; decimal: string } {
  const fixed = bpm.toFixed(1)
  const [w, d] = fixed.split('.')
  return { whole: w!.padStart(3, '0'), decimal: d ?? '0' }
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

/* ── Page ────────────────────────────────────────────────────────────────────── */

type Ripple = { id: number; x: number; y: number; size: number }

export default function ToolsTempoTapPage({ onNavigate }: ToolsTempoTapPageProps) {
  const [bpm, setBpm] = useState(0)
  const [intervalMs, setIntervalMs] = useState<number | null>(null)
  const [confidence, setConfidence] = useState<Confidence>('LOW')
  const [tapCount, setTapCount] = useState(0)
  const [metronomeOn, setMetronomeOn] = useState(false)
  const [beatFlash, setBeatFlash] = useState(false)
  const [activeDot, setActiveDot] = useState<number | null>(null)
  const [ripples, setRipples] = useState<Ripple[]>([])

  const tapTimesRef = useRef<number[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number>(0)
  const nextBeatRef = useRef<number>(0)
  const beatIdxRef = useRef<number>(0)
  const flashTimeoutRef = useRef<number | null>(null)
  const tapButtonRef = useRef<HTMLButtonElement | null>(null)
  const rippleIdRef = useRef<number>(0)

  const ensureCtx = useCallback((): AudioContext => {
    let ctx = audioCtxRef.current
    if (!ctx || ctx.state === 'closed') {
      ctx = new AudioContext()
      audioCtxRef.current = ctx
    }
    return ctx
  }, [])

  /** Flash the BPM display amber for 100ms. */
  const triggerFlash = useCallback(() => {
    setBeatFlash(true)
    if (flashTimeoutRef.current != null) window.clearTimeout(flashTimeoutRef.current)
    flashTimeoutRef.current = window.setTimeout(() => setBeatFlash(false), 100)
  }, [])

  /** Append a ripple at (x,y) inside the tap button. Auto-cleaned after 600ms. */
  const spawnRipple = useCallback((x: number, y: number, size: number) => {
    const id = rippleIdRef.current++
    setRipples(prev => [...prev, { id, x, y, size }])
    window.setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== id))
    }, 600)
  }, [])

  /** Schedule the metronome via a lookahead loop. Drives the 4 dot indicators. */
  useEffect(() => {
    if (!metronomeOn || bpm <= 0) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the beat indicator when the metronome is turned off (cleanup branch of the scheduler)
      setActiveDot(null)
      return
    }

    const ctx = ensureCtx()
    void ctx.resume()

    const secPerBeat = 60 / bpm
    nextBeatRef.current = ctx.currentTime + 0.05
    beatIdxRef.current = 0

    const tick = (): void => {
      const c = audioCtxRef.current
      if (!c || c.state === 'closed') return
      const lookahead = 0.12
      while (nextBeatRef.current < c.currentTime + lookahead) {
        const t = nextBeatRef.current
        const beat = beatIdxRef.current % 4
        const accented = beat === 0
        playClick(c, t, accented)
        const dueInMs = Math.max(0, (t - c.currentTime) * 1000)
        window.setTimeout(() => {
          triggerFlash()
          setActiveDot(beat)
        }, dueInMs)
        nextBeatRef.current += secPerBeat
        beatIdxRef.current++
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }, [metronomeOn, bpm, ensureCtx, triggerFlash])

  /** Close AudioContext + clear timers on unmount. */
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (flashTimeoutRef.current != null) window.clearTimeout(flashTimeoutRef.current)
      void audioCtxRef.current?.close().catch(() => {})
      audioCtxRef.current = null
    }
  }, [])

  const registerTap = useCallback(
    (origin?: { clientX: number; clientY: number }) => {
      void ensureCtx().resume()
      triggerFlash()

      const now = performance.now()
      const arr = tapTimesRef.current
      const last = arr[arr.length - 1]
      if (last != null && now - last > TAP_GAP_RESET_MS) {
        arr.length = 0
        setConfidence('LOW')
      }
      arr.push(now)
      while (arr.length > MAX_TAP_HISTORY) arr.shift()
      setTapCount(prev => prev + 1)

      const result = tapsToBpm(arr)
      if (result != null) {
        setBpm(result.bpm)
        setIntervalMs(result.intervalMs)
        setConfidence(result.confidence)
      }

      // Spawn ripple at click point inside the tap button
      const btn = tapButtonRef.current
      if (btn && origin) {
        const rect = btn.getBoundingClientRect()
        const size = Math.max(rect.width, rect.height)
        const x = origin.clientX - rect.left
        const y = origin.clientY - rect.top
        spawnRipple(x, y, size)
      } else if (btn) {
        // Keyboard tap — ripple from center
        const rect = btn.getBoundingClientRect()
        const size = Math.max(rect.width, rect.height)
        spawnRipple(rect.width / 2, rect.height / 2, size)
      }
    },
    [ensureCtx, triggerFlash, spawnRipple],
  )

  const resetAll = useCallback(() => {
    tapTimesRef.current.length = 0
    setTapCount(0)
    setBpm(0)
    setIntervalMs(null)
    setConfidence('LOW')
    setMetronomeOn(false)
  }, [])

  /** Space bar = tap. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code !== 'Space') return
      const t = e.target
      if (t instanceof HTMLElement && t.closest('button, input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      registerTap()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [registerTap])

  const startMetronome = useCallback(() => {
    if (bpm <= 0) {
      // No tempo yet — give a small shake to nudge the user to tap first.
      triggerFlash()
      return
    }
    void ensureCtx().resume()
    setMetronomeOn(true)
  }, [bpm, ensureCtx, triggerFlash])

  const stopMetronome = useCallback(() => {
    setMetronomeOn(false)
  }, [])

  const bpmFormatted = useMemo(() => formatBpmDisplay(bpm), [bpm])
  const confidenceColor = confidence === 'HIGH' ? PALETTE.amber : confidence === 'MED' ? PALETTE.textMain : PALETTE.textMuted

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}>
      <StudioToolsHeader
        toolId="tools-tempo-tap"
        crumbs={[{ label: 'Workspace' }, { label: 'Tools' }, { label: 'Tempo Tap', emphasis: true }]}
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
        {/* Scoped styles: keyframes + a few classes that are easier than long Tailwind chains. */}
        <style>{`
          @keyframes tempo-ripple { to { transform: scale(4); opacity: 0; } }
          .tempo-ripple-anim { animation: tempo-ripple 0.6s linear forwards; }
        `}</style>

        <div className="mx-auto flex w-full flex-col" style={{ minHeight: 'calc(100dvh - 56px)' }}>
          <div
            className="grid w-full flex-1"
            style={{
              gridTemplateRows: 'auto auto auto 1fr auto',
              gap: '1px',
              background: PALETTE.line,
            }}
          >
            {/* ── Header ── */}
            <header
              className="flex items-center justify-between px-6 py-4"
              style={{ background: PALETTE.surface }}
            >
              {/* UTIL.01 is decorative — back arrow already handles navigation */}
              <PillButton label="UTIL.01" decorative />
              <div
                className="text-[10px] uppercase tracking-[0.2em]"
                style={{ color: PALETTE.textMuted, fontFamily: "'DM Mono', monospace" }}
              >
                TEMPO_SYNC
              </div>
              <PillButton label="RESET" onClick={resetAll} />
            </header>

            {/* ── Hero (sidebar + BPM display + dots) ── */}
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
                  CURRENT BPM
                </span>

                <div
                  className="select-none"
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 'clamp(4.5rem, 15vw, 14rem)',
                    fontWeight: 400,
                    lineHeight: 1,
                    letterSpacing: '-0.05em',
                    color: beatFlash ? PALETTE.amber : PALETTE.textMain,
                    textShadow: beatFlash ? `0 0 24px ${PALETTE.amberGlow}` : 'none',
                    transition: 'color 0.1s ease, text-shadow 0.1s ease',
                  }}
                  aria-live="polite"
                  aria-label={`Current BPM ${bpm > 0 ? Math.round(bpm) : 'not yet measured'}`}
                >
                  {bpmFormatted.whole}
                  <span className="text-[0.4em]" style={{ color: PALETTE.textMuted }}>
                    .{bpmFormatted.decimal}
                  </span>
                </div>

                {/* Metronome dot indicators (1-4) */}
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
                      background: metronomeOn ? PALETTE.amber : PALETTE.textMuted,
                      boxShadow: metronomeOn ? `0 0 6px ${PALETTE.amber}` : 'none',
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
                <StatCell label="INTERVAL" value={intervalMs != null ? `${intervalMs} ms` : '— ms'} />
                <StatCell label="AVERAGE" value={bpm > 0 ? Math.round(bpm).toString() : '—'} />
              </div>
              <div
                className="grid"
                style={{ gridTemplateColumns: '1fr 1fr', gap: '1px', background: PALETTE.line, borderTop: `1px solid ${PALETTE.line}` }}
              >
                <StatCell label="TAPS LOGGED" value={tapCount.toString()} />
                <StatCell label="CONFIDENCE" value={confidence} valueColor={confidenceColor} />
              </div>
            </section>

            {/* ── Tap section (big circular button with ripple) ── */}
            <section
              className="relative flex items-center justify-center p-8"
              style={{ background: PALETTE.surface }}
            >
              <button
                ref={tapButtonRef}
                type="button"
                onMouseDown={e => registerTap({ clientX: e.clientX, clientY: e.clientY })}
                onTouchStart={e => {
                  if (e.touches.length === 0) return
                  e.preventDefault()
                  const t = e.touches[0]!
                  registerTap({ clientX: t.clientX, clientY: t.clientY })
                }}
                className="relative flex aspect-square w-full max-w-[clamp(240px,32vw,420px)] items-center justify-center overflow-hidden rounded-full transition-transform duration-100 active:scale-[0.97]"
                style={{
                  background: 'transparent',
                  border: `1px solid ${beatFlash ? PALETTE.amber : PALETTE.line}`,
                  cursor: 'pointer',
                }}
                aria-label="Tap to log a beat"
              >
                {/* Inner radial-glow that fades in on tap */}
                <span
                  className="pointer-events-none absolute inset-0 rounded-full transition-opacity duration-200"
                  style={{
                    background: `radial-gradient(circle, ${PALETTE.amberGlow} 0%, transparent 70%)`,
                    opacity: beatFlash ? 1 : 0,
                  }}
                  aria-hidden
                />
                {ripples.map(r => (
                  <span
                    key={r.id}
                    className="tempo-ripple-anim pointer-events-none absolute rounded-full"
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
                  className="pointer-events-none select-none"
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: '1.5rem',
                    letterSpacing: '0.2em',
                    color: beatFlash ? PALETTE.amber : PALETTE.textMuted,
                    transition: 'color 0.1s ease',
                  }}
                >
                  TAP
                </span>
              </button>
            </section>

            {/* ── Controls: just the metronome toggle.
                  STOP button was removed because RESET pill (header) already handles
                  the "clear everything" intent. The single toggle here switches
                  between START METRO and STOP METRO based on `metronomeOn`. ── */}
            <section style={{ background: PALETTE.line, padding: '1px 0 0 0' }}>
              <ControlButton
                active={metronomeOn}
                disabled={bpm <= 0}
                onClick={metronomeOn ? stopMetronome : startMetronome}
                icon={
                  metronomeOn ? (
                    <span
                      className="block size-2"
                      style={{ background: PALETTE.amber }}
                      aria-hidden
                    />
                  ) : (
                    <span
                      className="block"
                      style={{
                        width: 0,
                        height: 0,
                        borderTop: '4px solid transparent',
                        borderBottom: '4px solid transparent',
                        borderLeft: `6px solid ${bpm <= 0 ? PALETTE.textMuted : PALETTE.textMain}`,
                      }}
                      aria-hidden
                    />
                  )
                }
                label={metronomeOn ? 'STOP METRO' : 'START METRO'}
              />
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Internal components ─────────────────────────────────────────────────────── */

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
