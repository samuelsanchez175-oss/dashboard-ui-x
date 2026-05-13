import { ArrowLeft, Activity, Minus, Plus, RotateCcw, Volume2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import Button from '../../components/ui/Button'
import ZoneHeader from '../../components/ZoneHeader'
import StudioToolsHeader from './StudioToolsHeader'

interface ToolsTempoTapPageProps {
  onNavigate: (routeId: string) => void
}

const BPM_MIN = 40
const BPM_MAX = 240
const TAP_GAP_RESET_MS = 1800
const MAX_TAP_HISTORY = 14

function clampBpm(n: number): number {
  return Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(n)))
}

function tapsToBpm(times: readonly number[]): number | null {
  if (times.length < 2) return null
  const intervals: number[] = []
  for (let i = 1; i < times.length; i++) {
    const d = times[i]! - times[i - 1]!
    if (d < 100 || d > 1900) return null
    intervals.push(d)
  }
  const useLast = Math.min(8, intervals.length)
  let sum = 0
  for (let i = intervals.length - useLast; i < intervals.length; i++) sum += intervals[i]!
  const avg = sum / useLast
  return clampBpm(60000 / avg)
}

function playClick(ctx: AudioContext, time: number, accented: boolean): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = accented ? 1320 : 880
  osc.connect(gain)
  gain.connect(ctx.destination)
  const peak = accented ? 0.38 : 0.26
  gain.gain.setValueAtTime(0, time)
  gain.gain.linearRampToValueAtTime(peak, time + 0.003)
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.07)
  osc.start(time)
  osc.stop(time + 0.075)
}

export default function ToolsTempoTapPage({ onNavigate }: ToolsTempoTapPageProps) {
  const [bpm, setBpm] = useState(100)
  const [metronomeOn, setMetronomeOn] = useState(false)
  const [tapCount, setTapCount] = useState(0)

  const tapTimesRef = useRef<number[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number>(0)
  const nextBeatRef = useRef<number>(0)
  const beatIdxRef = useRef<number>(0)

  const ensureCtx = useCallback((): AudioContext => {
    let ctx = audioCtxRef.current
    if (!ctx || ctx.state === 'closed') {
      ctx = new AudioContext()
      audioCtxRef.current = ctx
    }
    return ctx
  }, [])

  const stopMetronome = useCallback(() => {
    setMetronomeOn(false)
  }, [])

  useEffect(() => {
    if (!metronomeOn) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      return
    }

    const ctx = ensureCtx()
    void ctx.resume()

    const secPerBeat = 60 / bpm
    nextBeatRef.current = ctx.currentTime + 0.06
    beatIdxRef.current = 0

    const tick = (): void => {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') return
      const c = audioCtxRef.current
      const lookahead = 0.14
      while (nextBeatRef.current < c.currentTime + lookahead) {
        const t = nextBeatRef.current
        const accented = beatIdxRef.current % 4 === 0
        playClick(c, t, accented)
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
  }, [metronomeOn, bpm, ensureCtx])

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      void audioCtxRef.current?.close().catch(() => {})
      audioCtxRef.current = null
    }
  }, [])

  const registerTap = useCallback(() => {
    void ensureCtx().resume()
    const now = performance.now()
    const arr = tapTimesRef.current
    const last = arr[arr.length - 1]
    if (last != null && now - last > TAP_GAP_RESET_MS) arr.length = 0
    arr.push(now)
    while (arr.length > MAX_TAP_HISTORY) arr.shift()
    setTapCount(arr.length)
    const next = tapsToBpm(arr)
    if (next != null) setBpm(next)
  }, [ensureCtx])

  const resetTaps = useCallback(() => {
    tapTimesRef.current.length = 0
    setTapCount(0)
  }, [])

  const nudge = useCallback((delta: number) => {
    setBpm(prev => clampBpm(prev + delta))
  }, [])

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

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}
    >
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

      <div className="flex-1 overflow-auto px-8 pb-16 pt-8">
        <div className="mx-auto w-full max-w-3xl">
          <ZoneHeader
            eyebrow="UTILITY"
            title="Tempo Tap"
            icon={Activity}
            description="Tap the pulse or press Space — BPM settles from your last few beats. Start the metronome for a steady 4/4 click with an accented downbeat."
            className="mb-8"
          />

          <div
            className="rounded-2xl p-8"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
          >
            <div className="mb-6 text-center">
              <div className="mono text-[11px] uppercase tracking-wide text-slate-400">BPM</div>
              <div className="mt-1 text-5xl font-semibold tabular-nums tracking-tight text-slate-900">{bpm}</div>
              <p className="mt-2 text-xs text-slate-500">
                {tapCount < 2 ? 'Tap at least twice to estimate tempo.' : `${tapCount} taps in window`}
              </p>
            </div>

            <button
              type="button"
              onClick={registerTap}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-emerald-200 bg-gradient-to-b from-emerald-50 to-white py-14 text-emerald-950 shadow-inner transition hover:border-emerald-300 hover:from-emerald-100/80 active:scale-[0.99]"
            >
              <Activity className="size-10 text-emerald-600" strokeWidth={2} aria-hidden />
              <span className="text-sm font-semibold">Tap tempo</span>
              <span className="mono text-[11px] text-emerald-700/80">Space bar works too</span>
            </button>

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={resetTaps}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-white"
              >
                <RotateCcw className="size-3.5" aria-hidden />
                Reset taps
              </button>
            </div>

            <div className="mt-8 border-t border-slate-100 pt-8">
              <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <Volume2 className="size-4 text-slate-500" aria-hidden />
                Metronome · 4/4
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant={metronomeOn ? 'destructive' : 'primary'}
                  size="lg"
                  onClick={() => {
                    if (metronomeOn) stopMetronome()
                    else {
                      void ensureCtx().resume()
                      setMetronomeOn(true)
                    }
                  }}
                >
                  {metronomeOn ? 'Stop' : 'Start'}
                </Button>
                <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    aria-label="Decrease BPM"
                    onClick={() => nudge(-1)}
                    className="rounded-lg p-2 text-slate-600 transition hover:bg-white hover:text-slate-900"
                  >
                    <Minus className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Increase BPM"
                    onClick={() => nudge(1)}
                    className="rounded-lg p-2 text-slate-600 transition hover:bg-white hover:text-slate-900"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
                <label className="flex flex-1 items-center gap-2 text-xs text-slate-600">
                  <span className="mono shrink-0 text-[10px] uppercase tracking-wide text-slate-400">Fine</span>
                  <input
                    type="range"
                    min={BPM_MIN}
                    max={BPM_MAX}
                    value={bpm}
                    onChange={e => setBpm(clampBpm(Number(e.target.value)))}
                    className="h-2 flex-1 accent-emerald-600"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
