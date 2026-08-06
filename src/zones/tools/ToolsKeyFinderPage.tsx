import { ArrowLeft, Download, ExternalLink, Layers, Loader2, Radio, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useState, type ChangeEvent, type CSSProperties } from 'react'

import type { MixClipMeta } from '../mixing/mixing-audio-idb'
import { dispatchFileDownload, getFileById, receiveDockOrFileDrop } from '../../components/files-dock/files-store'
import ZoneHeader from '../../components/ZoneHeader'
import {
  appendKeyFinderHistory,
  clearKeyFinderHistory,
  loadKeyFinderHistory,
  type KeyFinderHistoryEntry,
} from './key-finder-history'
import StudioToolsHeader from './StudioToolsHeader'
import { filenameToWhoSampledQueries, openWhoSampledSearch } from '../../lib/whosampled-search'
import { triggerDownload } from '../../lib/pcm-wav'
import { splitStems, zipStore, type Stem } from './youtube-clip-tools'

interface ToolsKeyFinderPageProps {
  onNavigate: (routeId: string) => void
}

function SourceLabel({ source }: { source: MixClipMeta['source'] }) {
  const map: Record<MixClipMeta['source'], string> = {
    tags: 'Embedded tags', estimated: 'Estimated', hybrid: 'Hybrid',
    tunebat: 'Manual paste', chromagram: 'Chromagram',
  }
  return <span className="mono text-[11px]" style={{ color: 'var(--text-3)' }}>{map[source] ?? source}</span>
}

function hasKeyAndBpm(m: MixClipMeta): boolean {
  return m.key != null && String(m.key).trim().length > 0
    && m.bpm != null && Number.isFinite(m.bpm) && m.bpm > 0
}

function WhoSampledPanel({
  fileName,
  labelStyle,
}: {
  fileName: string
  labelStyle: CSSProperties
}) {
  const { primary, simplified } = useMemo(() => filenameToWhoSampledQueries(fileName), [fileName])
  const showBoth = simplified !== primary && simplified.length > 0

  const btnClass =
    'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition'

  return (
    <div
      className="space-y-3 rounded-xl p-4"
      style={{ background: 'var(--bg-muted)', border: '1px solid var(--border-soft)' }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="mono text-[10px] uppercase tracking-wide" style={labelStyle}>
          WhoSampled
        </span>
        <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
          Sample / cover / remix lookups on whosampled.com (new tab).
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btnClass}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--text-1)',
            boxShadow: 'var(--shadow-sm)',
          }}
          onClick={() => openWhoSampledSearch(primary)}
        >
          <ExternalLink className="size-3.5 shrink-0" aria-hidden />
          Search full title
        </button>
        {showBoth ? (
          <button
            type="button"
            className={btnClass}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-1)',
              boxShadow: 'var(--shadow-sm)',
            }}
            onClick={() => openWhoSampledSearch(simplified)}
          >
            <ExternalLink className="size-3.5 shrink-0" aria-hidden />
            Search cleaned title
          </button>
        ) : null}
      </div>
      <p className="mono text-[10px] leading-relaxed break-all" style={{ color: 'var(--text-4)' }}>
        Full: “{primary}”
        {showBoth ? (
          <>
            <br />
            Cleaned: “{simplified}”
          </>
        ) : null}
      </p>
      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
        Instrumentals and unofficial uploads may not appear. WhoSampled has no public API here — we only pass your filename as their search query.
      </p>
    </div>
  )
}

function HistoryWhoSampledLink({ fileName }: { fileName: string }) {
  const { simplified, primary } = useMemo(() => filenameToWhoSampledQueries(fileName), [fileName])
  const q = simplified !== primary ? simplified : primary
  return (
    <button
      type="button"
      className="mono mt-2 inline-flex items-center gap-1 text-[10px] font-medium underline-offset-2 hover:underline"
      style={{ color: 'var(--accent)' }}
      onClick={() => openWhoSampledSearch(q)}
    >
      <ExternalLink className="size-3 shrink-0" aria-hidden />
      WhoSampled
    </button>
  )
}

export default function ToolsKeyFinderPage({ onNavigate }: ToolsKeyFinderPageProps) {
  const inputId = useId()
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [meta,     setMeta]     = useState<MixClipMeta | null>(null)
  const [history,  setHistory]  = useState<KeyFinderHistoryEntry[]>(() => loadKeyFinderHistory())
  /** Inbound clip relayed from another tool (Audio grabber, Recent clips tray). */
  const [inboundNotice, setInboundNotice] = useState<string | null>(null)
  // Stem split — runs alongside key/BPM on every dropped file.
  const [stems, setStems] = useState<Stem[] | null>(null)
  const [stemming, setStemming] = useState(false)
  const [stemError, setStemError] = useState<string | null>(null)

  const historyAscending = useMemo(() => [...history].sort((a, b) => a.analyzedAt - b.analyzedAt), [history])

  const runFile = useCallback(async (file: File) => {
    setBusy(true); setError(null); setFileName(file.name); setMeta(null)
    setStems(null); setStemError(null); setStemming(true)
    try {
      const { analyzeMixClipBlob } = await import('../mixing/mixing-audio-analysis')
      const m = await analyzeMixClipBlob(file)
      setMeta(m)
      if (hasKeyAndBpm(m)) {
        setHistory(appendKeyFinderHistory({
          fileName: file.name, key: m.key as string, bpm: m.bpm as number,
          scale: m.scale, source: m.source, analyzedAt: m.analyzedAt,
        }))
      }
      // Surface in the gallery so the user can re-open / delete it.
      dispatchFileDownload({
        blob: file, name: file.name, source: 'Key finder',
        sourceTool: 'tools-key-finder', outputType: 'key-analysis', lane: 'analysis',
      })
    } catch { setError('Could not decode that file. Try WAV or MP3.')
    } finally { setBusy(false) }

    // Stems run after key/BPM so a stem failure never blocks the analysis above.
    try {
      const out = await splitStems(file, file.name.replace(/\.[^.]+$/, ''), { drums: true })
      setStems(out)
    } catch { setStemError('Could not split this file into stems.')
    } finally { setStemming(false) }
  }, [])

  const downloadAllStems = useCallback(async () => {
    if (!stems || stems.length === 0) return
    const zip = await zipStore(stems.map(s => ({ name: s.fileName, blob: s.blob })))
    triggerDownload(zip, `${(fileName ?? 'audio').replace(/\.[^.]+$/, '')} - stems.zip`)
  }, [stems, fileName])

  // Receive a clip handed off from the Mixing Audio Grabber (or any other
  // sender that writes the agreed `inbound-clip-<routeId>` sessionStorage key).
  // The contract is one-shot: we clear the key as soon as we've read it so a
  // refresh / navigation doesn't re-trigger the import.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      let id: string | null
      try {
        id = sessionStorage.getItem('inbound-clip-tools-key-finder')
        if (id) sessionStorage.removeItem('inbound-clip-tools-key-finder')
      } catch {
        id = null
      }
      if (!id || cancelled) return
      const stored = await getFileById(id)
      if (!stored || cancelled) return
      const f = new File([stored.blob], stored.name, { type: stored.mime || 'audio/mpeg' })
      setInboundNotice(`Loaded clip “${stored.name}” from grabber`)
      void runFile(f)
    })()
    return () => { cancelled = true }
    // Intentionally only on mount: clip pickup is one-shot per route entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) void runFile(f); e.target.value = ''
  }, [runFile])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    void (async () => {
      const f = await receiveDockOrFileDrop(e)
      if (f) {
        // receiveDockOrFileDrop returns a File when the dock supplied a name; cast safely.
        await runFile(f instanceof File ? f : new File([f], 'dock-clip', { type: f.type || 'audio/*' }))
      }
    })()
  }, [runFile])

  const card: React.CSSProperties = {
    background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)',
  }
  const label: React.CSSProperties = { color: 'var(--text-4)', fontFamily: "'DM Mono', monospace" }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ background: 'var(--bg-canvas)' }}>
      <StudioToolsHeader
        toolId="tools-key-finder"
        crumbs={[{ label: 'Workspace' }, { label: 'Tools' }, { label: 'Key & STEM', emphasis: true }]}
        leftExtra={
          <button
            type="button"
            onClick={() => onNavigate('tools-hub')}
            className="mr-2 rounded-lg p-2 transition"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-2)', boxShadow: 'var(--shadow-sm)' }}
            aria-label="Back to Tools Hub"
          >
            <ArrowLeft className="size-4" strokeWidth={2} />
          </button>
        }
      />

      <div className="flex-1 overflow-auto px-8 pb-16 pt-8">
        <div className="mx-auto w-full max-w-3xl">
          <ZoneHeader
            eyebrow="ANALYSIS"
            title="Key & STEM"
            icon={Radio}
            description="Drop a file once — it finds the key, BPM, and scale, and splits it into downloadable stems. All in your browser."
            className="mb-8"
          />

          {/* Drop zone */}
          <label htmlFor={inputId} className="block cursor-pointer">
            <input id={inputId} type="file" accept="audio/*,.mp3,.wav,.m4a,.flac,.aac" className="sr-only" onChange={onInputChange} />
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={onDrop}
              className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition"
              style={{
                background:   'var(--bg-card)',
                borderColor:  'var(--border-strong)',
                boxShadow:    'var(--shadow-sm)',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
            >
              {busy
                ? <Loader2 className="size-8 animate-spin" style={{ color: 'var(--accent)' }} aria-hidden />
                : <Upload className="size-8" style={{ color: 'var(--text-4)' }} strokeWidth={1.5} aria-hidden />
              }
              <div>
                <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
                  {busy ? 'Analyzing…' : 'Drop audio here or click to browse'}
                </span>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>MP3, WAV, M4A, FLAC — processed in your browser.</p>
              </div>
            </div>
          </label>

          {inboundNotice && (
            <p
              className="mt-4 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium"
              style={{
                background: 'var(--accent-soft)',
                border: '1px solid var(--border)',
                color: 'var(--accent-fg)',
              }}
              role="status"
            >
              {inboundNotice}
            </p>
          )}

          {error && (
            <p className="mt-4 text-sm" role="alert" style={{ color: 'var(--bad)' }}>{error}</p>
          )}

          {/* Result */}
          {meta && (
            <div className="mt-8 space-y-4 rounded-2xl p-6" style={card}>
              <div
                className="flex flex-wrap items-center justify-between gap-2 pb-4"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <div className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{fileName ?? 'Clip'}</div>
                <SourceLabel source={meta.source} />
              </div>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="mono text-[10px] uppercase tracking-wide" style={label}>Key</dt>
                  <dd className="mt-1 text-lg font-semibold" style={{ color: 'var(--text-1)' }}>{meta.key ?? '—'}</dd>
                </div>
                <div>
                  <dt className="mono text-[10px] uppercase tracking-wide" style={label}>BPM</dt>
                  <dd className="mt-1 text-lg font-semibold" style={{ color: 'var(--text-1)' }}>{meta.bpm ?? '—'}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="mono text-[10px] uppercase tracking-wide" style={label}>Scale hint</dt>
                  <dd className="mt-1 text-sm" style={{ color: 'var(--text-2)' }}>{meta.scale ?? '—'}</dd>
                </div>
              </dl>
              <div
                className="rounded-xl p-4 text-sm leading-relaxed"
                style={{ background: 'var(--bg-muted)', color: 'var(--text-2)' }}
              >
                {meta.rapKeyTip}
              </div>
              {fileName ? <WhoSampledPanel fileName={fileName} labelStyle={label} /> : null}
            </div>
          )}

          {/* Stems — runs on every dropped file */}
          {(stemming || stems || stemError) && (
            <div className="mt-6 space-y-4 rounded-2xl p-6" style={card}>
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                  <Layers className="size-4" style={{ color: 'var(--accent)' }} strokeWidth={2} aria-hidden /> Stems
                </h2>
                {stemming && (
                  <span className="mono inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
                    <Loader2 className="size-3.5 animate-spin" aria-hidden /> Splitting…
                  </span>
                )}
              </div>

              {stemError ? (
                <p className="text-sm" style={{ color: 'var(--bad)' }}>{stemError}</p>
              ) : stems ? (
                <>
                  <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border-soft)' }}>
                    <table className="w-full border-collapse text-left text-sm">
                      <thead>
                        <tr>
                          <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-4)', borderBottom: '1px solid var(--border-soft)' }}>Stem</th>
                          <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-4)', borderBottom: '1px solid var(--border-soft)' }}>What it is</th>
                          <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-4)', borderBottom: '1px solid var(--border-soft)' }}>File</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stems.map(s => (
                          <tr
                            key={s.id}
                            className="transition-colors"
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-soft)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <td className="px-4 py-3 align-top font-medium" style={{ color: 'var(--text-1)', borderTop: '1px solid var(--border-soft)' }}>{s.label}</td>
                            <td className="px-4 py-3 align-top text-[12px] leading-snug" style={{ color: 'var(--text-3)', borderTop: '1px solid var(--border-soft)' }}>{s.hint}</td>
                            <td className="px-4 py-3 align-top text-right" style={{ borderTop: '1px solid var(--border-soft)' }}>
                              <button
                                type="button"
                                onClick={() => triggerDownload(s.blob, s.fileName)}
                                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition"
                                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
                              >
                                <Download className="size-3.5" strokeWidth={2} aria-hidden /> WAV
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={2} className="px-4 py-3 text-[12px]" style={{ color: 'var(--text-4)', borderTop: '1px solid var(--border)' }}>
                            {stems.length} stems · approximate split
                          </td>
                          <td className="px-4 py-3 text-right" style={{ borderTop: '1px solid var(--border)' }}>
                            <button
                              type="button"
                              onClick={() => void downloadAllStems()}
                              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                              style={{ background: 'var(--accent)', color: 'var(--accent-contrast, #fff)' }}
                            >
                              <Download className="size-3.5" strokeWidth={2.2} aria-hidden /> All (.zip)
                            </button>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <p className="text-[11px] leading-snug" style={{ color: 'var(--text-4)' }}>
                    Split via harmonic/percussive separation + frequency bands — a fast approximation, not surgical AI
                    isolation.
                  </p>
                </>
              ) : null}
            </div>
          )}

          {/* History */}
          <section className="mt-10" aria-labelledby="key-finder-recent-heading">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="key-finder-recent-heading" className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                  Recently analyzed
                </h2>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
                  Oldest at the top — only files where both key and BPM were detected are saved locally.
                </p>
              </div>
              {historyAscending.length > 0 && (
                <button
                  type="button"
                  onClick={() => { clearKeyFinderHistory(); setHistory([]) }}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-2)', boxShadow: 'var(--shadow-sm)' }}
                >
                  <Trash2 className="size-3.5 shrink-0" aria-hidden />
                  Clear history
                </button>
              )}
            </div>

            {historyAscending.length === 0 ? (
              <div
                className="rounded-2xl border-dashed px-5 py-8 text-center text-sm"
                style={{ background: 'var(--bg-card)', border: '1px dashed var(--border)', color: 'var(--text-3)' }}
              >
                No saved runs yet. When both key and BPM resolve for a file, it appears here.
              </div>
            ) : (
              <ol className="space-y-2 rounded-2xl p-3" style={card}>
                {historyAscending.map((row, index) => (
                  <li
                    key={row.id}
                    className="rounded-xl px-4 py-3 transition"
                    style={{ background: 'var(--bg-card-soft)', border: '1px solid var(--border-soft)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-card-soft)')}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="mono text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-4)' }}>
                            #{index + 1}
                          </span>
                          <span className="truncate text-sm font-medium" style={{ color: 'var(--text-1)' }} title={row.fileName}>
                            {row.fileName}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
                          {new Date(row.analyzedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                        </p>
                        <HistoryWhoSampledLink fileName={row.fileName} />
                      </div>
                      <SourceLabel source={row.source} />
                    </div>
                    <dl
                      className="mt-3 grid gap-3 pt-3 sm:grid-cols-3"
                      style={{ borderTop: '1px solid var(--border-soft)' }}
                    >
                      <div>
                        <dt className="mono text-[10px] uppercase tracking-wide" style={label}>Key</dt>
                        <dd className="mt-0.5 text-base font-semibold tabular-nums" style={{ color: 'var(--text-1)' }}>{row.key}</dd>
                      </div>
                      <div>
                        <dt className="mono text-[10px] uppercase tracking-wide" style={label}>BPM</dt>
                        <dd className="mt-0.5 text-base font-semibold tabular-nums" style={{ color: 'var(--text-1)' }}>{row.bpm}</dd>
                      </div>
                      <div>
                        <dt className="mono text-[10px] uppercase tracking-wide" style={label}>Scale hint</dt>
                        <dd className="mt-0.5 truncate text-sm" style={{ color: 'var(--text-2)' }} title={row.scale ?? undefined}>
                          {row.scale ?? '—'}
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
