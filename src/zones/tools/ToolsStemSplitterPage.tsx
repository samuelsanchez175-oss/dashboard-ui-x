import { ArrowLeft, Columns2, Cpu, Loader2, Upload } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

import Button from '../../components/ui/Button'
import ZoneHeader from '../../components/ZoneHeader'
import { getFileById } from '../../components/files-dock/files-store'
import { encodeMonoPcm16Wav, triggerDownload } from '../../lib/pcm-wav'
import StudioToolsHeader from './StudioToolsHeader'

interface ToolsStemSplitterPageProps {
  onNavigate: (routeId: string) => void
}

/**
 * HTTP stub for `VITE_STEM_SERVICE_URL` (optional ML / cloud stems).
 *
 * Sends: `multipart/form-data` with file field **`file`** (binary audio).
 *
 * Accepted JSON shapes (first that matches):
 * - `{ "brightnessUrl": "<url>", "bodyUrl": "<url>" }` — optional `brightness`/`body`
 * - `{ "stems": [{ "kind": string, "url": string }] }`
 * - `{ "urls": string[] }` — order: bright → body
 *
 * Each URL must be reachable (CORS) and respond with playable audio (`fetch` blob).
 */

function bufferToMonoWav(buf: AudioBuffer): Blob {
  const len = buf.length
  const out = new Float32Array(len)
  if (buf.numberOfChannels === 1) {
    out.set(buf.getChannelData(0))
  } else {
    for (let i = 0; i < len; i++) {
      let acc = 0
      for (let c = 0; c < buf.numberOfChannels; c++) acc += buf.getChannelData(c)[i] ?? 0
      out[i] = acc / buf.numberOfChannels
    }
  }
  return encodeMonoPcm16Wav(out, buf.sampleRate)
}

async function renderFiltered(input: AudioBuffer, filterType: 'lowpass' | 'highpass', freqHz: number): Promise<AudioBuffer> {
  const sr = input.sampleRate
  const nCh = input.numberOfChannels
  const offline = new OfflineAudioContext(nCh, input.length, sr)
  const filt = offline.createBiquadFilter()
  filt.type = filterType
  filt.frequency.value = freqHz
  filt.Q.value = Math.SQRT1_2

  const src = offline.createBufferSource()
  src.buffer = input
  src.connect(filt)
  filt.connect(offline.destination)
  src.start(0)
  return offline.startRendering()
}

export default function ToolsStemSplitterPage({ onNavigate }: ToolsStemSplitterPageProps) {
  const fileId = useId()
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [remoteBusy, setRemoteBusy] = useState(false)
  const [crossoverHz, setCrossoverHz] = useState(1200)
  /** Inbound clip relayed from another tool (Audio grabber, Recent clips tray). */
  const [inboundNotice, setInboundNotice] = useState<string | null>(null)

  const ctxRef = useRef<AudioContext | null>(null)

  const serviceUrl = useMemo(() => {
    try {
      return (import.meta.env.VITE_STEM_SERVICE_URL as string | undefined)?.trim() || ''
    } catch {
      return ''
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
      setName(file.name.replace(/\.[^/.]+$/, '') || 'stem_preview')
    } finally {
      setLoading(false)
    }
  }, [])

  // Receive a clip handed off from the Mixing Audio Grabber (or any other
  // sender that writes the agreed `inbound-clip-<routeId>` sessionStorage key).
  // The pickup is one-shot — the key is cleared as soon as it's consumed.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      let id: string | null
      try {
        id = sessionStorage.getItem('inbound-clip-tools-stem-splitter')
        if (id) sessionStorage.removeItem('inbound-clip-tools-stem-splitter')
      } catch {
        id = null
      }
      if (!id || cancelled) return
      const stored = await getFileById(id)
      if (!stored || cancelled) return
      const f = new File([stored.blob], stored.name, { type: stored.mime || 'audio/mpeg' })
      setInboundNotice(`Loaded clip “${stored.name}” from grabber`)
      void decodeFile(f)
    })()
    return () => { cancelled = true }
    // Intentionally only on mount: clip pickup is one-shot per route entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const exportCrossovers = useCallback(async () => {
    if (!buffer) return
    setProcessing(true)
    try {
      const body = await renderFiltered(buffer, 'lowpass', crossoverHz)
      const bright = await renderFiltered(buffer, 'highpass', crossoverHz)

      triggerDownload(bufferToMonoWav(body), `${name}_body_crossover_lp.wav`)
      triggerDownload(bufferToMonoWav(bright), `${name}_brightness_crossover_hp.wav`)
    } finally {
      setProcessing(false)
    }
  }, [buffer, crossoverHz, name])

  const tryRemoteStub = useCallback(async () => {
    if (!buffer || !serviceUrl) return
    setRemoteBusy(true)
    try {
      const wavBlob = bufferToMonoWav(buffer)

      const fd = new FormData()
      fd.append('file', wavBlob, `${name}.wav`)

      const res = await fetch(serviceUrl.replace(/\/$/, ''), { method: 'POST', body: fd })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const jsonUnknown = (await res.json()) as unknown

      const urls: string[] = []

      const j = jsonUnknown as Record<string, unknown>

      const b = j.bodyUrl ?? j.body
      const br = j.brightnessUrl ?? j.brightness
      if (typeof b === 'string' && typeof br === 'string') urls.push(br, b)
      else if (Array.isArray(j.urls)) urls.push(...(j.urls.filter(x => typeof x === 'string') as string[]))
      else if (Array.isArray(j.stems)) {
        const arr = j.stems as unknown[]
        for (const row of arr) {
          const u =
            typeof row === 'object' &&
            row != null &&
            'url' in row &&
            typeof (row as { url: unknown }).url === 'string'
              ? (row as { url: string }).url
              : null
          if (u) urls.push(u)
        }
      }

      for (let i = 0; i < urls.length; i++) {
        const sr = await fetch(urls[i]!)
        const blob = await sr.blob()
        triggerDownload(blob, `${name}_remote_stem_${i + 1}.wav`)
      }
    } catch {
      console.warn('[stem-service] Stub request failed; check URL, JSON shape (see ToolsStemSplitter comments), or CORS.')
    } finally {
      setRemoteBusy(false)
    }
  }, [buffer, name, serviceUrl])

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}
    >
      <StudioToolsHeader
        toolId="tools-stem-splitter"
        crumbs={[{ label: 'Workspace' }, { label: 'Tools' }, { label: 'Stem splitter', emphasis: true }]}
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
            eyebrow="UTILITY · ANALYSIS"
            title="Stem splitter preview"
            icon={Columns2}
            className="mb-6"
          />

          <div
            role="alert"
            className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950"
          >
            <strong>Not ML stems.</strong> Offline export uses complementary low-pass (“body”) and high-pass (“brightness”) split at a
            crossover frequency. Honest crossover preview — not vocal/drum isolation like Demucs.
          </div>

          <label
            htmlFor={fileId}
            className="mb-4 flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 shadow-sm transition hover:border-blue-400"
          >
            {loading ? <Loader2 className="size-8 animate-spin text-blue-500" /> : <Upload className="size-8 text-blue-500" />}
            <span className="mt-2 text-sm font-medium text-slate-700">Upload mix / loop…</span>
            <input
              id={fileId}
              type="file"
              accept="audio/*,.wav,.mp3"
              className="sr-only"
              onChange={ev => {
                const f = ev.target.files?.[0]
                if (f) void decodeFile(f)
              }}
            />
          </label>

          {inboundNotice && (
            <p
              className="mb-4 inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-900"
              role="status"
            >
              {inboundNotice}
            </p>
          )}

          {buffer ? (
            <>
              <div className="mono mb-4 text-xs text-slate-500">
                Loaded · {buffer.sampleRate} Hz · {buffer.duration.toFixed(1)} s · mono export from multichannel averaging
              </div>

              <label className="mb-6 block rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <span className="mono text-[11px] uppercase tracking-wide text-slate-500">Crossover (Hz)</span>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <input
                    type="range"
                    min={200}
                    max={8000}
                    step={50}
                    value={crossoverHz}
                    onChange={e => setCrossoverHz(Number(e.target.value))}
                    className="h-2 min-w-[220px] flex-1 accent-blue-600"
                  />
                  <input
                    type="number"
                    min={120}
                    max={12000}
                    value={crossoverHz}
                    onChange={e => setCrossoverHz(Math.round(Number(e.target.value) || crossoverHz))}
                    className="w-28 rounded-lg border border-slate-200 px-2 py-2 text-sm tabular-nums"
                  />
                </div>
              </label>

              <Button
                variant="primary"
                size="lg"
                disabled={processing}
                onClick={() => void exportCrossovers()}
                className="mb-6 w-full"
              >
                {processing ? 'Rendering…' : 'Download crossover stems (brightness + body WAV)'}
              </Button>

              {serviceUrl ? (
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start gap-2 text-sm text-slate-700">
                    <Cpu className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden />
                    <span>
                      <span className="font-semibold">Remote stub active.</span> POSTing to configured{' '}
                      <code className="mono rounded bg-slate-100 px-1 py-0.5 text-xs">VITE_STEM_SERVICE_URL</code>. Handles CORS /
                      URLs like any browser fetch — configure your service accordingly.
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={remoteBusy}
                    onClick={() => void tryRemoteStub()}
                    className="mt-4 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium transition hover:bg-white disabled:opacity-50"
                  >
                    {remoteBusy ? 'Fetching…' : 'Request remote stems (stub)'}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Optional: set <code className="mono">VITE_STEM_SERVICE_URL</code> to enable the minimal multipart JSON URL stub described
                  in source comments.
                </p>
              )}
            </>
          ) : (
            !loading && <p className="text-sm text-slate-400">No file loaded.</p>
          )}
        </div>
      </div>
    </div>
  )
}
