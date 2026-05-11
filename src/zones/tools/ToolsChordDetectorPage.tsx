import {
  ArrowLeft,
  Copy,
  Download,
  Loader2,
  Music,
  RotateCcw,
  Scissors,
  Upload,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import {
  analyzeChordProgressionFromBlob,
  buildChordMidiBlob,
  clipChordSegmentsForExport,
  type ChordAnalysisResult,
} from './chord-detector-engine'
import StudioToolsHeader from './StudioToolsHeader'

interface ToolsChordDetectorPageProps {
  onNavigate: (routeId: string) => void
}

function hueFromLabel(label: string): number {
  let h = 0
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0
  return h % 360
}

function formatMmSs(seconds: number): string {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  const r = s - m * 60
  const frac = Math.round((r % 1) * 10) / 10
  const whole = Math.floor(r)
  const dec = frac % 1 > 0.001 ? `.${String(Math.round(frac * 10)).replace(/^0\./, '')}` : ''
  return `${m}:${String(whole).padStart(2, '0')}${dec}`
}

function ChordTrimTimeline({
  result,
  trimStart,
  trimEnd,
  onTrimChange,
}: {
  result: ChordAnalysisResult
  trimStart: number
  trimEnd: number
  onTrimChange: (start: number, end: number) => void
}) {
  const timelineHeadingId = useId()
  const trimRangeId = useId()
  const barRef = useRef<HTMLDivElement>(null)
  const trimLiveRef = useRef({ start: trimStart, end: trimEnd })
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null)
  const dur = result.durationSec
  const minGap = Math.max(0.2, (60 / result.bpm) * 0.35)

  useEffect(() => {
    trimLiveRef.current = { start: trimStart, end: trimEnd }
  }, [trimStart, trimEnd])

  const clientXToSec = useCallback(
    (clientX: number): number => {
      const el = barRef.current
      if (!el || dur <= 0) return 0
      const r = el.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
      return ratio * dur
    },
    [dur],
  )

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: PointerEvent): void => {
      const sec = clientXToSec(e.clientX)
      const { start, end } = trimLiveRef.current
      if (dragging === 'start') {
        onTrimChange(Math.max(0, Math.min(sec, end - minGap)), end)
      } else {
        onTrimChange(start, Math.min(dur, Math.max(sec, start + minGap)))
      }
    }
    const onUp = (): void => setDragging(null)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [dragging, clientXToSec, dur, minGap, onTrimChange])

  const sp = dur > 0 ? trimStart / dur : 0
  const ep = dur > 0 ? trimEnd / dur : 1

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id={timelineHeadingId} className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Chord timeline
        </h3>
        <span className="mono text-[10px] text-slate-400">drag handles · trimmed MIDI</span>
      </div>

      <div
        ref={barRef}
        role="group"
        aria-labelledby={timelineHeadingId}
        aria-describedby={trimRangeId}
        className="relative h-14 w-full select-none rounded-xl ring-1 ring-slate-200 touch-none"
      >
        <div className="flex h-full w-full overflow-hidden rounded-[inherit]">
          {result.segments.map((seg, idx) => {
            const w = Math.max(2, (seg.durationSec / result.durationSec) * 100)
            const hue = hueFromLabel(seg.label)
            return (
              <div
                key={`${idx}-${seg.startSec}-${seg.label}`}
                className="flex min-w-0 items-center justify-center border-r border-white/40 px-1 text-center text-[11px] font-semibold text-white shadow-inner last:border-r-0"
                style={{
                  width: `${w}%`,
                  background: `linear-gradient(145deg, hsl(${hue} 58% 42%), hsl(${hue} 52% 28%))`,
                }}
                title={`${seg.label} · ${seg.startSec.toFixed(2)}s · ${seg.durationSec.toFixed(2)}s`}
              >
                <span className="truncate drop-shadow-sm">{seg.label}</span>
              </div>
            )
          })}
        </div>

        <div
          className="pointer-events-none absolute inset-y-0 left-0 bg-slate-950/55"
          style={{ width: `${sp * 100}%` }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 bg-slate-950/55"
          style={{ width: `${(1 - ep) * 100}%` }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 border-x-2 border-white/90 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]"
          style={{ left: `${sp * 100}%`, width: `${Math.max(0, ep - sp) * 100}%` }}
          aria-hidden
        />

        <button
          type="button"
          aria-label={`Trim start ${formatMmSs(trimStart)}`}
          className="absolute inset-y-0 z-10 flex w-4 cursor-ew-resize items-center justify-center -translate-x-1/2 rounded-sm bg-white shadow-md ring-1 ring-slate-300 hover:bg-fuchsia-50"
          style={{ left: `${sp * 100}%` }}
          onPointerDown={(e: ReactPointerEvent) => {
            e.preventDefault()
            ;(e.target as HTMLButtonElement).setPointerCapture(e.pointerId)
            setDragging('start')
          }}
        >
          <span className="sr-only">Start handle</span>
        </button>
        <button
          type="button"
          aria-label={`Trim end ${formatMmSs(trimEnd)}`}
          className="absolute inset-y-0 z-10 flex w-4 cursor-ew-resize items-center justify-center -translate-x-1/2 rounded-sm bg-white shadow-md ring-1 ring-slate-300 hover:bg-fuchsia-50"
          style={{ left: `${ep * 100}%` }}
          onPointerDown={(e: ReactPointerEvent) => {
            e.preventDefault()
            ;(e.target as HTMLButtonElement).setPointerCapture(e.pointerId)
            setDragging('end')
          }}
        >
          <span className="sr-only">End handle</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span id={trimRangeId} className="mono tabular-nums">
          <span className="text-slate-700">{formatMmSs(trimStart)}</span>
          <span className="mx-1.5 text-slate-300">→</span>
          <span className="text-slate-700">{formatMmSs(trimEnd)}</span>
          <span className="ml-2 font-medium text-fuchsia-700">
            ({(trimEnd - trimStart).toFixed(1)}s window)
          </span>
        </span>
      </div>
    </div>
  )
}

export default function ToolsChordDetectorPage({ onNavigate }: ToolsChordDetectorPageProps) {
  const inputId = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [result, setResult] = useState<ChordAnalysisResult | null>(null)

  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [trimCommitted, setTrimCommitted] = useState(false)

  useEffect(() => {
    if (!result) return
    setTrimStart(0)
    setTrimEnd(result.durationSec)
    setTrimCommitted(false)
  }, [result])

  const exportDurationSec = result ? Math.max(0, trimEnd - trimStart) : 0
  const isSelectionTrimmed = result ? exportDurationSec < result.durationSec - 0.08 : false

  const clippedSegments = useMemo(() => {
    if (!result) return []
    return clipChordSegmentsForExport(result.segments, trimStart, trimEnd, result.durationSec)
  }, [result, trimStart, trimEnd])

  const progressionTextFull = useMemo(() => {
    if (!result?.segments.length) return ''
    return result.segments.map(s => s.label).join(' → ')
  }, [result])

  const progressionTextExport = useMemo(() => {
    if (!clippedSegments.length) return ''
    return clippedSegments.map(s => s.label).join(' → ')
  }, [clippedSegments])

  const runFile = useCallback(async (file: File) => {
    setBusy(true)
    setError(null)
    setFileName(file.name)
    setResult(null)
    try {
      const r = await analyzeChordProgressionFromBlob(file)
      setResult(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed.')
    } finally {
      setBusy(false)
    }
  }, [])

  const onInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      if (f) void runFile(f)
      e.target.value = ''
    },
    [runFile],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const f = e.dataTransfer.files?.[0]
      if (f) void runFile(f)
    },
    [runFile],
  )

  const onTrimChange = useCallback((start: number, end: number) => {
    setTrimStart(start)
    setTrimEnd(end)
    setTrimCommitted(false)
  }, [])

  const resetTrim = useCallback(() => {
    if (!result) return
    setTrimStart(0)
    setTrimEnd(result.durationSec)
    setTrimCommitted(false)
  }, [result])

  const applyTrim = useCallback(() => {
    setTrimCommitted(true)
  }, [])

  const downloadMidi = useCallback(() => {
    if (!result || clippedSegments.length === 0) return
    const blob = buildChordMidiBlob(clippedSegments, result.bpm)
    const base = (fileName ?? 'clip').replace(/\.[^/.]+$/, '')
    const tag = isSelectionTrimmed ? '-trim' : ''
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${base}-chords${tag}.mid`
    a.click()
    URL.revokeObjectURL(url)
  }, [clippedSegments, fileName, isSelectionTrimmed, result])

  const copyProgression = useCallback(async () => {
    const text = progressionTextExport || progressionTextFull
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* ignore */
    }
  }, [progressionTextExport, progressionTextFull])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50">
      <StudioToolsHeader
        crumbs={[{ label: 'Workspace' }, { label: 'Tools' }, { label: 'Chord Detector', emphasis: true }]}
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
        <div className="mx-auto max-w-3xl">
          <div className="mono mb-2 text-[11px] uppercase tracking-wide text-slate-500">Analysis</div>
          <h1 className="mb-2 text-2xl font-semibold tracking-tight text-slate-900">Chord Detector</h1>
          <p className="mb-3 text-sm leading-relaxed text-slate-500">
            Offline chromagram + triad templates per beat — same BPM engine as Key &amp; BPM Finder (energy autocorrelation +
            embedded TBPM when present). Export a compact MIDI sketch of block chords for your DAW.
          </p>
          <p className="mb-8 rounded-xl border border-fuchsia-100 bg-fuchsia-50/60 px-4 py-3 text-xs leading-relaxed text-fuchsia-950/80">
            Heuristic only: dense mixes, borrowed chords, and jazz voicings confuse template matchers. For ML-grade
            transcription in production, pair this UI with models such as{' '}
            <a
              className="font-medium underline decoration-fuchsia-300 underline-offset-2 hover:text-fuchsia-900"
              href="https://github.com/spotify/basic-pitch"
              target="_blank"
              rel="noreferrer"
            >
              Spotify Basic Pitch
            </a>{' '}
            or dedicated chord APIs — this page gives you an instant local baseline plus MIDI out.
          </p>

          <label htmlFor={inputId} className="block cursor-pointer">
            <input id={inputId} type="file" accept="audio/*,.mp3,.wav,.m4a,.flac,.aac" className="sr-only" onChange={onInputChange} />
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={onDrop}
              className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm transition hover:border-fuchsia-300 hover:bg-fuchsia-50/30"
            >
              {busy ? (
                <Loader2 className="size-8 animate-spin text-fuchsia-600" aria-hidden />
              ) : (
                <Upload className="size-8 text-slate-400" strokeWidth={1.5} aria-hidden />
              )}
              <div>
                <span className="text-sm font-medium text-slate-900">
                  {busy ? 'Analyzing chords…' : 'Drop audio here or click to browse'}
                </span>
                <p className="mt-1 text-xs text-slate-500">
                  First ~96s analyzed in-browser — WAV/MP3/M4A/FLAC.
                </p>
              </div>
            </div>
          </label>

          {error && (
            <p className="mt-4 text-sm text-rose-600" role="alert">
              {error}
            </p>
          )}

          {result && (
            <div className="mt-8 space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{fileName ?? 'Clip'}</div>
                    {trimCommitted ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-lg font-semibold tabular-nums text-slate-900">
                          {exportDurationSec.toFixed(1)}s{' '}
                          <span className="text-sm font-medium text-fuchsia-700">export duration</span>
                        </p>
                        <p className="text-xs text-slate-500">
                          Full analyzed clip{' '}
                          <span className="tabular-nums font-medium text-slate-700">{result.durationSec.toFixed(1)}s</span>
                        </p>
                      </div>
                    ) : (
                      <div className="mt-1 space-y-1">
                        <p className="text-xs text-slate-500">
                          Analyzed duration{' '}
                          <span className="tabular-nums font-medium text-slate-800">{result.durationSec.toFixed(1)}s</span>
                        </p>
                        {isSelectionTrimmed ? (
                          <p className="text-xs font-medium text-fuchsia-800">
                            Selection {(trimEnd - trimStart).toFixed(1)}s — tap{' '}
                            <span className="font-semibold">Apply trim</span> to lock this as the export length shown above.
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <dl className="flex gap-6 text-right">
                    <div>
                      <dt className="mono text-[10px] uppercase tracking-wide text-slate-400">BPM</dt>
                      <dd className="text-xl font-semibold tabular-nums text-slate-900">{result.bpm}</dd>
                      <dd className="text-[10px] text-slate-400">{result.bpmSource === 'tags' ? 'From tags' : 'Estimated'}</dd>
                    </div>
                  </dl>
                </div>

                <div className="mt-5">
                  <ChordTrimTimeline result={result} trimStart={trimStart} trimEnd={trimEnd} onTrimChange={onTrimChange} />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={applyTrim}
                    disabled={!isSelectionTrimmed}
                    className="inline-flex items-center gap-2 rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-xs font-semibold text-fuchsia-900 shadow-sm transition hover:bg-fuchsia-100 disabled:pointer-events-none disabled:opacity-40"
                  >
                    <Scissors className="size-3.5 shrink-0" aria-hidden />
                    Apply trim
                  </button>
                  <button
                    type="button"
                    onClick={resetTrim}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    <RotateCcw className="size-3.5 shrink-0" aria-hidden />
                    Reset range
                  </button>
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={downloadMidi}
                    disabled={clippedSegments.length === 0}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-45"
                  >
                    <Download className="size-4 shrink-0" aria-hidden />
                    Export MIDI
                  </button>
                  <button
                    type="button"
                    onClick={copyProgression}
                    disabled={!progressionTextExport && !progressionTextFull}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Copy className="size-4 shrink-0" aria-hidden />
                    Copy progression
                  </button>
                </div>

                {(progressionTextExport || progressionTextFull) ? (
                  <p className="mono mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700">
                    {progressionTextExport || progressionTextFull}
                  </p>
                ) : null}
              </div>

              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/90 px-5 py-4 text-xs leading-relaxed text-slate-600">
                <div className="flex items-start gap-2">
                  <Music className="mt-0.5 size-4 shrink-0 text-fuchsia-600" aria-hidden />
                  <div>
                    <strong className="font-medium text-slate-800">MIDI export</strong> uses the trimmed window only.
                    Notes are re-zeroed at the selection start. Import into Logic, Ableton, Reaper, etc., then swap instruments
                    or voice-lead.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
