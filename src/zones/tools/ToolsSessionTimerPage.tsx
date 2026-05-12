import { ArrowLeft, ClipboardList, Download, Pause, Play, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

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

export default function ToolsSessionTimerPage({ onNavigate }: ToolsSessionTimerPageProps) {
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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50">
      <StudioToolsHeader
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

      <div className="flex-1 overflow-auto px-8 pb-16 pt-8">
        <div className="mx-auto max-w-lg">
          <div className="mono mb-2 text-[11px] uppercase tracking-wide text-slate-500">Production</div>
          <h1 className="mb-2 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
            <ClipboardList className="size-7 text-sky-500" aria-hidden />
            Session timer / cue sheet
          </h1>
          <p className="mb-8 text-sm leading-relaxed text-slate-500">
            Running clock with markers you can export as Markdown or plain text for notes or rehearsals.
          </p>

          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mono text-5xl font-semibold tabular-nums tracking-tight text-slate-900">{msToClock(elapsedMs)}</div>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (running) pause()
                  else {
                    lapStartRef.current = performance.now()
                    setRunning(true)
                  }
                }}
                className={[
                  'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition',
                  running ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-sky-600 text-white hover:bg-sky-700',
                ].join(' ')}
              >
                {running ? <Pause className="size-4" /> : <Play className="size-4" />}
                {running ? 'Pause' : 'Start'}
              </button>
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-white"
              >
                <RotateCcw className="size-4" />
                Reset
              </button>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-600">Add cue at current time</div>
            <div className="flex flex-wrap gap-2">
              <input
                value={cueDraft}
                onChange={e => setCueDraft(e.target.value)}
                placeholder="Optional label…"
                className="min-w-[200px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-sky-500 focus:ring-2"
              />
              <button
                type="button"
                onClick={markCue}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Mark cue
              </button>
            </div>

            {cues.length > 0 && (
              <ol className="mt-6 space-y-2 border-t border-slate-100 pt-6 text-sm">
                {cues.map(c => (
                  <li key={c.id} className="flex items-baseline gap-3">
                    <span className="mono shrink-0 text-xs text-slate-500">{msToClock(c.startedAtElapsed)}</span>
                    <span className="font-medium text-slate-900">{c.label}</span>
                  </li>
                ))}
              </ol>
            )}

            <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-6">
              <button
                type="button"
                onClick={exportMd}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-white"
              >
                <Download className="size-4" />
                Export Markdown
              </button>
              <button
                type="button"
                onClick={exportTxt}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-white"
              >
                <Download className="size-4" />
                Export TXT
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
