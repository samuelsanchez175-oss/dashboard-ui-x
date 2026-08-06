import { ArrowLeft, Crop, Layers, Loader2, Upload } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import Button from '../../components/ui/Button'
import ZoneHeader from '../../components/ZoneHeader'
import { encodeMonoPcm16Wav, triggerDownload } from '../../lib/pcm-wav'
import StudioToolsHeader from './StudioToolsHeader'
import { splitStemsFromBuffer, zipStore, type Stem } from './youtube-clip-tools'

interface ToolsSampleSlicerPageProps {
  onNavigate: (routeId: string) => void
}

type DragMode = 'none' | 'start' | 'end' | 'scrub'

export default function ToolsSampleSlicerPage({ onNavigate }: ToolsSampleSlicerPageProps) {
  const fileId = useId()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [trim0, setTrim0] = useState(0)
  const [trim1, setTrim1] = useState(1)

  // Auto-stem output (runs on drop)
  const [stems, setStems] = useState<Stem[] | null>(null)
  const [stemming, setStemming] = useState(false)
  const [stemError, setStemError] = useState<string | null>(null)

  /** Active drag tail — avoids stale closures on first move */
  const dragRef = useRef<DragMode>('none')
  const trim0Ref = useRef(trim0)
  const trim1Ref = useRef(trim1)

  useEffect(() => {
    trim0Ref.current = trim0
    trim1Ref.current = trim1
  }, [trim0, trim1])

  const ctxRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    return () => {
      void ctxRef.current?.close().catch(() => {})
      ctxRef.current = null
    }
  }, [])

  const decodeFile = useCallback(async (file: File) => {
    setLoading(true)
    try {
      const ab = await file.arrayBuffer()
      const ctx = ctxRef.current ?? new AudioContext()
      ctxRef.current = ctx
      const decoded = await ctx.decodeAudioData(ab.slice(0))
      setBuffer(decoded)
      setFileName(file.name.replace(/\.[^/.]+$/, ''))
      setTrim0(0)
      setTrim1(1)
    } finally {
      setLoading(false)
    }
  }, [])

  // Split into stems the moment a file is decoded.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- reset + kick off the stem split when a new file decodes */
    if (!buffer) {
      setStems(null)
      setStemError(null)
      return
    }
    let cancelled = false
    setStemming(true)
    setStems(null)
    setStemError(null)
    /* eslint-enable react-hooks/set-state-in-effect */
    void (async () => {
      await new Promise(r => setTimeout(r, 30)) // let the "Splitting…" state paint
      try {
        const out = await splitStemsFromBuffer(buffer, fileName || 'sample', { drums: true })
        if (!cancelled) setStems(out)
      } catch {
        if (!cancelled) setStemError('Could not split this file into stems.')
      } finally {
        if (!cancelled) setStemming(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run when a new file is decoded
  }, [buffer])

  const downloadAllStems = useCallback(async () => {
    if (!stems || stems.length === 0) return
    const zip = await zipStore(stems.map(s => ({ name: s.fileName, blob: s.blob })))
    triggerDownload(zip, `${fileName || 'sample'} - stems.zip`,
      { sourceTool: 'tools-sample-slicer', outputType: 'sample', tags: ['sample', 'slices-zip'] })
  }, [stems, fileName])

  const peaks = useMemo(() => {
    if (!buffer) return []
    const ch0 = buffer.getChannelData(0)
    const step = Math.max(1, Math.floor(ch0.length / 2000))
    const out: number[] = []
    for (let i = 0; i < ch0.length; i += step) {
      let m = 0
      const end = Math.min(i + step, ch0.length)
      for (let j = i; j < end; j++) m = Math.max(m, Math.abs(ch0[j] ?? 0))
      out.push(m)
    }
    return out
  }, [buffer])

  const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

  const clientToNorm = useCallback((clientX: number, el: HTMLElement): number => {
    const r = el.getBoundingClientRect()
    return clamp01((clientX - r.left) / r.width)
  }, [])

  const draw = useCallback(() => {
    const c = canvasRef.current
    if (!c || !peaks.length) return
    const rect = c.getBoundingClientRect()
    c.width = Math.max(520, rect.width)
    const width = c.width
    const height = 180

    const g = c.getContext('2d')
    if (!g) return
    g.clearRect(0, 0, width, height)
    g.fillStyle = '#f8fafc'
    g.fillRect(0, 0, width, height)
    g.strokeStyle = '#cbd5e1'
    g.beginPath()
    g.moveTo(0, height / 2)
    g.lineTo(width, height / 2)
    g.stroke()

    const mid = height / 2
    g.strokeStyle = '#64748b'
    g.beginPath()
    for (let x = 0; x < width; x++) {
      const ix = Math.floor((x / width) * (peaks.length - 1))
      const px = peaks[ix] ?? 0
      const y = px * mid * 0.95
      g.moveTo(x + 0.5, mid - y)
      g.lineTo(x + 0.5, mid + y)
    }
    g.stroke()

    const x0 = trim0 * width
    const x1 = trim1 * width

    g.fillStyle = 'rgba(14,165,233,0.15)'
    g.fillRect(x0, 0, Math.max(0, x1 - x0), height)

    g.fillStyle = 'rgba(239,68,68,0.92)'
    g.fillRect(x0 - 2, 0, 4, height)
    g.fillRect(x1 - 2, 0, 4, height)
  }, [peaks, trim0, trim1])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    const onResize = (): void => draw()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [draw])

  const sliceAndExport = useCallback(() => {
    if (!buffer) return

    let a = trim0Ref.current
    let b = trim1Ref.current
    if (b - a < 0.005) return
    if (a > b) [a, b] = [b, a]

    const startSample = Math.floor(a * buffer.length)
    const endSample = Math.floor(b * buffer.length)
    const len = Math.max(1, endSample - startSample)
    const out = new Float32Array(len)

    if (buffer.numberOfChannels === 1) {
      out.set(buffer.getChannelData(0).subarray(startSample, endSample))
    } else {
      for (let i = 0; i < len; i++) {
        let acc = 0
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) acc += buffer.getChannelData(ch)[startSample + i] ?? 0
        out[i] = acc / buffer.numberOfChannels
      }
    }

    const blob = encodeMonoPcm16Wav(out, buffer.sampleRate)
    triggerDownload(blob, `${fileName || 'slice'}_trim.wav`,
      { sourceTool: 'tools-sample-slicer', outputType: 'sample', tags: ['sample', 'trim'] })
  }, [buffer, fileName])

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const el = e.currentTarget
    const x = clientToNorm(e.clientX, el)
    const wPx = el.getBoundingClientRect().width
    const t0 = trim0Ref.current
    const t1 = trim1Ref.current
    const d0 = Math.abs(x - t0) * wPx
    const d1 = Math.abs(x - t1) * wPx
    let mode: DragMode = 'scrub'

    const nearTrim = Math.max(14, wPx * 0.015)
    if (d0 < nearTrim && d1 < nearTrim) mode = x < (t0 + t1) / 2 ? 'start' : 'end'
    else if (d0 < nearTrim) mode = 'start'
    else if (d1 < nearTrim) mode = 'end'

    dragRef.current = mode
    void el.setPointerCapture(e.pointerId)

    if (mode === 'start') setTrim0(Math.min(t1 - 0.01, clamp01(x)))
    else if (mode === 'end') setTrim1(Math.max(t0 + 0.01, clamp01(x)))
    else setTrim1(Math.max(t0 + 0.01, clamp01(x)))
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current === 'none') return
    const el = e.currentTarget
    const x = clamp01(clientToNorm(e.clientX, el))
    const t0 = trim0Ref.current
    const t1 = trim1Ref.current

    if (dragRef.current === 'start') setTrim0(Math.min(t1 - 0.01, x))
    else if (dragRef.current === 'end') setTrim1(Math.max(t0 + 0.01, x))
    else setTrim1(Math.max(t0 + 0.01, x))
  }

  const endDrag = (): void => {
    dragRef.current = 'none'
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}
    >
      <StudioToolsHeader
        toolId="tools-sample-slicer"
        crumbs={[{ label: 'Workspace' }, { label: 'Tools' }, { label: 'Sample slicer', emphasis: true }]}
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
            eyebrow="PRODUCTION"
            title="Sample / loop slicer"
            icon={Crop}
            description="Upload WAV/MP3, drag the handles to bracket a region, export as mono WAV (multichannel averages to mono)."
            className="mb-6"
          />

          <label
            htmlFor={fileId}
            className="mb-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 shadow-sm transition hover:border-amber-400"
          >
            {loading ? <Loader2 className="size-8 animate-spin text-amber-500" /> : <Upload className="size-8 text-amber-500" />}
            <span className="mt-2 text-sm font-medium text-slate-700">Choose audio file…</span>
            <span className="mt-1 mono text-xs text-slate-400">Decoded in-browser</span>
            <input
              id={fileId}
              type="file"
              accept="audio/*,.wav,.mp3,.aac,.ogg,.flac,.m4a"
              className="sr-only"
              onChange={ev => {
                const f = ev.target.files?.[0]
                if (f) void decodeFile(f)
              }}
            />
          </label>

          {buffer && (
            <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Layers className="size-4 text-amber-500" strokeWidth={2} /> Stems
                </h2>
                {stemming && (
                  <span className="mono flex items-center gap-1.5 text-xs text-slate-400">
                    <Loader2 className="size-3.5 animate-spin" /> Splitting…
                  </span>
                )}
              </div>

              {stemError ? (
                <p className="text-sm text-rose-600">{stemError}</p>
              ) : stems ? (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {stems.map(s => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-700">{s.label}</div>
                          <div className="text-[11px] leading-snug text-slate-400">{s.hint}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => triggerDownload(s.blob, s.fileName)}
                          className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-amber-400 hover:text-amber-600"
                        >
                          WAV
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button variant="primary" size="sm" onClick={() => void downloadAllStems()} className="mt-4">
                    Download all stems (.zip)
                  </Button>
                  <p className="mt-2 text-[11px] leading-snug text-slate-400">
                    Split via harmonic/percussive separation + frequency bands — a fast approximation, not surgical AI
                    isolation.
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-400">Splitting into stems…</p>
              )}
            </div>
          )}

          {buffer ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mono mb-4 text-xs text-slate-500">
                {buffer.sampleRate} Hz · {buffer.duration.toFixed(2)} s · {(buffer.duration * (trim1 - trim0)).toFixed(2)} s selection
              </div>
              <canvas
                ref={canvasRef}
                height={180}
                className="mx-auto flex w-full max-w-full cursor-ew-resize rounded-lg bg-slate-100"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              />
              <p className="mt-4 text-[11px] text-slate-500">
                Drag near red handles for trim in/out on the waveform; sliders below fine-tune the window.
              </p>
              <div className="mt-5 flex gap-4 text-sm">
                <label className="flex flex-1 flex-col gap-1">
                  <span className="mono text-[10px] uppercase tracking-wide text-slate-400">Start</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={clamp01(trim0) * 100}
                    onChange={e => {
                      const v = clamp01(Number(e.target.value) / 100)
                      setTrim0(Math.min(v, trim1 - 0.01))
                    }}
                    className="accent-amber-500"
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1">
                  <span className="mono text-[10px] uppercase tracking-wide text-slate-400">End</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={clamp01(trim1) * 100}
                    onChange={e => {
                      const v = clamp01(Number(e.target.value) / 100)
                      setTrim1(Math.max(v, trim0 + 0.01))
                    }}
                    className="accent-amber-500"
                  />
                </label>
              </div>

              <Button
                variant="primary"
                size="lg"
                onClick={sliceAndExport}
                className="mt-6"
              >
                Export selection as WAV
              </Button>
            </div>
          ) : (
            !loading && <p className="text-sm text-slate-400">No file loaded.</p>
          )}
        </div>
      </div>
    </div>
  )
}
