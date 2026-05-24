/**
 * Note Detector 2 — dashboard tool front-end for the Docker-backed FastAPI
 * service in `note-detector-2/`. Pipeline: upload audio → POST /transcribe →
 * poll /status → GET /download → render merged multi-track MIDI in a piano
 * roll.
 *
 * The backend has to be running locally (`cd note-detector-2 && docker compose
 * up --build`). The page shows a clear "service unreachable" banner when it
 * isn't, so the user knows immediately what's wrong rather than getting a
 * cryptic fetch failure mid-flow.
 *
 * Grade chips (PIANO ROLL · NOTES) reuse the same self-grade helper the
 * chord-detector uses, so both tools score by identical signals.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Download, Loader2, Upload } from 'lucide-react'
import tonejsMidi from '@tonejs/midi'

import { gradeAnalysis, GRADE_COLOR, type QualityGrade } from './chord-detector-self-grade'

const { Midi } = tonejsMidi

interface ToolsNoteDetector2PageProps {
  onNavigate: (routeId: string) => void
}

/** GRAY2020 palette — mirrors `ToolsChordDetectorPage`. */
const PALETTE = {
  bg: '#0A0A0C',
  surface: '#121214',
  surfaceAlt: '#16161A',
  line: '#2C2C30',
  textMain: '#EAEAEA',
  textMuted: '#707075',
  amber: '#F5A623',
  amberGlow: 'rgba(245, 166, 35, 0.15)',
  green: '#54C98E',
  red: '#ef4444',
}

/**
 * Resolve the backend base URL at call time.
 * Precedence:
 *   1. localStorage scratch (writable from Dev → Settings without rebuilding).
 *   2. Vite-inlined `VITE_ND2_API` (requires `npm run dev` restart to change).
 *   3. Hard default `http://localhost:8000`.
 */
function getNd2Api(): string {
  let v: string | null = null
  try {
    if (typeof localStorage !== 'undefined') v = localStorage.getItem('VITE_ND2_API')
  } catch { /* private mode, etc. */ }
  if (!v) v = (import.meta.env.VITE_ND2_API as string | undefined) ?? null
  return (v?.replace(/\/+$/, '') || 'http://localhost:8000')
}

/** Per-stem visual identity in the piano roll. */
const TRACK_COLORS: Record<string, string> = {
  vocals: '#7C9CFF',
  bass: '#F5A623',
  other: '#54C98E',
  drums: '#B388FF',
}

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface ParsedNote {
  midi: number
  startSec: number
  durationSec: number
  velocity: number
}

interface ParsedTrack {
  name: string
  color: string
  isDrum: boolean
  notes: ParsedNote[]
}

interface ParsedMidi {
  tracks: ParsedTrack[]
  durationSec: number
}

type Phase = 'idle' | 'uploading' | 'processing' | 'downloading' | 'done' | 'error'

/* ── MIDI parsing ──────────────────────────────────────────────────────────── */

function parseMidiBytes(buf: ArrayBuffer): ParsedMidi {
  const midi = new Midi(buf)
  const tracks: ParsedTrack[] = []
  let maxEnd = 0
  for (const t of midi.tracks) {
    if (t.notes.length === 0) continue
    const name = (t.name || 'unknown').toLowerCase()
    const isDrum =
      t.instrument?.percussion === true ||
      /drum/i.test(t.name || '') ||
      t.channel === 9
    const notes: ParsedNote[] = t.notes.map(n => {
      const end = n.time + n.duration
      if (end > maxEnd) maxEnd = end
      return {
        midi: Math.round(n.midi),
        startSec: n.time,
        durationSec: n.duration,
        velocity: n.velocity,
      }
    })
    tracks.push({
      name,
      color: TRACK_COLORS[name] || '#999',
      isDrum,
      notes,
    })
  }
  return { tracks, durationSec: maxEnd }
}

/* ── Multi-track piano roll (compact, read-only) ───────────────────────────── */

function MultiTrackPianoRoll({ midi }: { midi: ParsedMidi }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(900)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    setWidth(el.getBoundingClientRect().width)
    const ro = new ResizeObserver(es => {
      for (const e of es) setWidth(e.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const allNotes = useMemo(
    () => midi.tracks.flatMap(t => (t.isDrum ? [] : t.notes)),
    [midi],
  )

  /* Auto-fit pitch range over melodic tracks only — drums sit in their own row.
   * 2-octave minimum so a sparse clip still draws as a real piano roll. */
  const { lo, hi } = useMemo(() => {
    if (allNotes.length === 0) return { lo: 48, hi: 84 }
    let mn = allNotes[0].midi
    let mx = allNotes[0].midi
    for (const n of allNotes) {
      if (n.midi < mn) mn = n.midi
      if (n.midi > mx) mx = n.midi
    }
    mn = Math.max(0, mn - 2)
    mx = Math.min(127, mx + 2)
    if (mx - mn < 24) {
      const grow = Math.ceil((24 - (mx - mn)) / 2)
      mn = Math.max(0, mn - grow)
      mx = Math.min(127, mx + grow)
    }
    return { lo: mn, hi: mx }
  }, [allNotes])

  const keyWidth = 36
  const height = 280
  const rollLeft = keyWidth
  const rollWidth = Math.max(40, width - keyWidth)
  const innerPad = 6
  const rowH = (height - innerPad * 2) / (hi - lo + 1)
  const dur = Math.max(0.001, midi.durationSec)

  const midiToY = (m: number): number => innerPad + (hi - m) * rowH
  const timeToX = (t: number): number => rollLeft + (t / dur) * rollWidth

  /* Black-key row backgrounds — gives the eye a piano-style stripe. */
  const blackRows: number[] = []
  for (let m = lo; m <= hi; m++) {
    const pc = ((m % 12) + 12) % 12
    if (pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10) blackRows.push(m)
  }

  return (
    <div ref={wrapRef} style={{ width: '100%' }}>
      <svg width={width} height={height} style={{ display: 'block', background: PALETTE.bg }}>
        {/* Black-key tint */}
        {blackRows.map(m => (
          <rect
            key={`bk-${m}`}
            x={rollLeft}
            y={midiToY(m)}
            width={rollWidth}
            height={rowH}
            fill="rgba(255,255,255,0.025)"
          />
        ))}
        {/* Octave grid lines */}
        {Array.from({ length: hi - lo + 1 }).map((_, idx) => {
          const m = lo + idx
          if (m % 12 !== 0) return null
          return (
            <line
              key={`oct-${m}`}
              x1={rollLeft}
              x2={rollLeft + rollWidth}
              y1={midiToY(m)}
              y2={midiToY(m)}
              stroke={PALETTE.line}
              strokeWidth={0.5}
            />
          )
        })}
        {/* Piano-key strip on the left. Black keys filled, C labels printed. */}
        <rect x={0} y={0} width={keyWidth} height={height} fill={PALETTE.surface} />
        <line x1={keyWidth} y1={0} x2={keyWidth} y2={height} stroke={PALETTE.line} />
        {Array.from({ length: hi - lo + 1 }).map((_, idx) => {
          const m = lo + idx
          const pc = ((m % 12) + 12) % 12
          const isBlack = pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10
          return (
            <g key={`key-${m}`}>
              <rect
                x={0}
                y={midiToY(m)}
                width={keyWidth}
                height={rowH}
                fill={isBlack ? PALETTE.surfaceAlt : PALETTE.surface}
                stroke={PALETTE.line}
                strokeWidth={0.25}
              />
              {pc === 0 && rowH >= 8 && (
                <text
                  x={4}
                  y={midiToY(m) + rowH - 2}
                  fill={PALETTE.textMuted}
                  fontSize={Math.min(10, rowH - 2)}
                  fontFamily="'DM Mono', monospace"
                >
                  C{Math.floor(m / 12) - 1}
                </text>
              )}
            </g>
          )
        })}
        {/* Notes per track. Drums skipped (no pitched data). */}
        {midi.tracks.map(track =>
          track.isDrum
            ? null
            : track.notes.map((n, i) => {
                const x = timeToX(n.startSec)
                const w = Math.max(1.5, (n.durationSec / dur) * rollWidth)
                const y = midiToY(n.midi)
                return (
                  <rect
                    key={`${track.name}-${i}`}
                    x={x}
                    y={y + 0.5}
                    width={w}
                    height={Math.max(2, rowH - 1)}
                    fill={track.color}
                    fillOpacity={Math.max(0.35, Math.min(1, n.velocity))}
                    rx={1}
                  />
                )
              }),
        )}
      </svg>
      {/* Track legend */}
      <div
        className="flex flex-wrap items-center gap-3 px-1 pt-2"
        style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: PALETTE.textMuted }}
      >
        {midi.tracks.map(t => (
          <span key={t.name} className="inline-flex items-center gap-1.5">
            <span
              style={{ width: 10, height: 10, background: t.color, display: 'inline-block', borderRadius: 2 }}
            />
            <span style={{ textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              {t.name}
            </span>
            <span style={{ color: PALETTE.textMain }}>({t.notes.length})</span>
            {t.isDrum && <span style={{ color: PALETTE.textMuted }}> · not transcribed</span>}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ── Self-grade chip — same component shape as the chord-detector page ─────── */

function GradeBadge({ grade, reasoning }: { grade: QualityGrade; reasoning: string }) {
  return (
    <span
      title={reasoning}
      className="inline-flex items-center justify-center px-1.5 py-[1px] text-[10px] font-bold leading-none rounded-sm align-middle"
      style={{
        background: GRADE_COLOR[grade],
        color: '#fff',
        fontFamily: "'DM Mono', monospace",
        letterSpacing: '0.05em',
        minWidth: '1.5rem',
      }}
    >
      {grade}
    </span>
  )
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function ToolsNoteDetector2Page({ onNavigate }: ToolsNoteDetector2PageProps) {
  /* Service health is probed on mount + on a 10-second loop, so the user gets
   * fast feedback when they forgot to `docker compose up`. */
  const [serviceUp, setServiceUp] = useState<'unknown' | 'up' | 'down'>('unknown')
  const [phase, setPhase] = useState<Phase>('idle')
  const [stage, setStage] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stems, setStems] = useState<string[]>([])
  const [midi, setMidi] = useState<ParsedMidi | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [wallMs, setWallMs] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /* Health probe. */
  useEffect(() => {
    let mounted = true
    const probe = async (): Promise<void> => {
      try {
        const r = await fetch(`${getNd2Api()}/`, { signal: AbortSignal.timeout(2_000) })
        if (mounted) setServiceUp(r.ok ? 'up' : 'down')
      } catch {
        if (mounted) setServiceUp('down')
      }
    }
    void probe()
    const id = setInterval(probe, 10_000)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [])

  /* Self-grade — flatten non-drum tracks, same scoring as chord-detector. */
  const selfGrade = useMemo(() => {
    if (!midi) return null
    const leadNotes = midi.tracks.flatMap(t => (t.isDrum ? [] : t.notes))
    return gradeAnalysis({ leadNotes, durationSec: midi.durationSec })
  }, [midi])

  /* Free the blob URL when a new run starts / on unmount. */
  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl)
    }
  }, [downloadUrl])

  const handleFile = useCallback(async (file: File): Promise<void> => {
    if (serviceUp !== 'up') {
      setError(`Backend not reachable at ${getNd2Api()}. Start it with \`cd note-detector-2 && docker compose up\`.`)
      return
    }
    /* Reset everything before a new run so leftover UI from the last run doesn't bleed in. */
    if (downloadUrl) URL.revokeObjectURL(downloadUrl)
    setMidi(null)
    setDownloadUrl(null)
    setStems([])
    setWallMs(null)
    setError(null)
    setFileName(file.name)
    setPhase('uploading')
    setStage('uploading')
    const t0 = Date.now()
    try {
      const form = new FormData()
      form.append('file', file, file.name)
      const submit = await fetch(`${getNd2Api()}/transcribe`, { method: 'POST', body: form })
      if (!submit.ok) {
        const body = await submit.text()
        throw new Error(`/transcribe ${submit.status}: ${body.slice(0, 200)}`)
      }
      const { task_id }: { task_id: string } = await submit.json()
      setPhase('processing')

      /* Poll until terminal. 2.5 s is a fine cadence for Demucs jobs (minutes long). */
      for (;;) {
        await new Promise(r => setTimeout(r, 2_500))
        const sr = await fetch(`${getNd2Api()}/status/${task_id}`)
        const sb = (await sr.json()) as {
          status: 'Queued' | 'Processing' | 'Completed' | 'Failed'
          stage?: string
          stems?: string[]
          error?: string
        }
        setStage(sb.stage ?? sb.status)
        if (sb.status === 'Completed') {
          setStems(sb.stems ?? [])
          setPhase('downloading')
          const midiRes = await fetch(`${getNd2Api()}/download/${task_id}`)
          if (!midiRes.ok) throw new Error(`/download ${midiRes.status}`)
          const buf = await midiRes.arrayBuffer()
          setMidi(parseMidiBytes(buf))
          const blob = new Blob([buf], { type: 'audio/midi' })
          setDownloadUrl(URL.createObjectURL(blob))
          setPhase('done')
          setStage(null)
          setWallMs(Date.now() - t0)
          return
        }
        if (sb.status === 'Failed') throw new Error(sb.error ?? 'Transcription failed')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
      setStage(null)
    }
  }, [serviceUp, downloadUrl])

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0]
    if (f) void handleFile(f)
    /* Allow re-uploading the same file (input only fires on change otherwise). */
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) void handleFile(f)
  }

  const isBusy = phase === 'uploading' || phase === 'processing' || phase === 'downloading'

  const serviceLabel =
    serviceUp === 'up'
      ? 'BACKEND ONLINE'
      : serviceUp === 'down'
        ? 'BACKEND OFFLINE'
        : 'PROBING BACKEND…'
  const serviceColor =
    serviceUp === 'up' ? PALETTE.green : serviceUp === 'down' ? PALETTE.red : PALETTE.textMuted

  return (
    <div className="flex h-full flex-col" style={{ background: PALETTE.bg, color: PALETTE.textMain }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: `1px solid ${PALETTE.line}`, background: PALETTE.surface }}
      >
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => onNavigate('tools-hub')}
            className="inline-flex items-center gap-1.5 text-[12px]"
            style={{ color: PALETTE.textMuted, fontFamily: "'DM Mono', monospace" }}
          >
            <ArrowLeft size={14} />
            BACK
          </button>
          <h1
            className="text-[16px] font-semibold tracking-wide"
            style={{ fontFamily: "'DM Mono', monospace" }}
          >
            NOTE DETECTOR 2
          </h1>
          <span
            className="text-[10px] uppercase tracking-[0.15em] px-2 py-0.5"
            style={{
              fontFamily: "'DM Mono', monospace",
              color: PALETTE.amber,
              border: `1px solid ${PALETTE.amber}`,
            }}
          >
            BETA · DOCKER-BACKED
          </span>
        </div>
        <span
          className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.15em]"
          style={{ color: serviceColor, fontFamily: "'DM Mono', monospace" }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: serviceColor,
              boxShadow: serviceUp === 'up' ? '0 0 8px rgba(84,201,142,0.7)' : 'none',
            }}
          />
          {serviceLabel}
        </span>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {/* Help banner when service is down */}
        {serviceUp === 'down' && (
          <section
            className="flex items-start gap-3 px-6 py-3"
            style={{ background: PALETTE.surface, borderLeft: `2px solid ${PALETTE.red}` }}
          >
            <span
              className="text-[10px] uppercase tracking-[0.15em]"
              style={{ color: PALETTE.red, fontFamily: "'DM Mono', monospace" }}
            >
              SERVICE DOWN
            </span>
            <span className="text-[11px]" style={{ color: PALETTE.textMain }}>
              The FastAPI backend at <code>{getNd2Api()}</code> isn't responding.
              Start it from the repo root with{' '}
              <code style={{ background: PALETTE.bg, padding: '1px 4px' }}>
                cd note-detector-2 && docker compose up --build
              </code>
              .
            </span>
          </section>
        )}

        {/* Upload zone */}
        <section
          className="flex flex-col items-stretch gap-4 px-6 py-6"
          style={{ background: PALETTE.surface, borderBottom: `1px solid ${PALETTE.line}` }}
        >
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={onDrop}
            className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center"
            style={{
              border: `1px dashed ${PALETTE.line}`,
              background: PALETTE.bg,
              opacity: isBusy ? 0.6 : 1,
            }}
          >
            <Upload size={20} color={PALETTE.textMuted} />
            <p className="text-[12px]" style={{ color: PALETTE.textMain }}>
              Drop an audio file here, or click the button below.
            </p>
            <p className="text-[10px]" style={{ color: PALETTE.textMuted }}>
              WAV / MP3 / FLAC / M4A. The file is uploaded to{' '}
              <code style={{ background: PALETTE.surface, padding: '0 4px' }}>{getNd2Api()}</code>{' '}
              for stem separation + transcription.
            </p>
            <button
              type="button"
              disabled={isBusy || serviceUp !== 'up'}
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 text-[11px] uppercase tracking-[0.15em]"
              style={{
                background: serviceUp === 'up' ? PALETTE.amber : PALETTE.line,
                color: serviceUp === 'up' ? '#0A0A0C' : PALETTE.textMuted,
                fontFamily: "'DM Mono', monospace",
                cursor: isBusy || serviceUp !== 'up' ? 'not-allowed' : 'pointer',
              }}
            >
              {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              {isBusy ? 'WORKING…' : 'CHOOSE FILE'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept="audio/*,.wav,.mp3,.flac,.m4a,.aac,.ogg"
              onChange={onFileInputChange}
            />
          </div>

          {/* Status line */}
          {(fileName || phase !== 'idle') && (
            <div
              className="flex items-center gap-3 text-[11px]"
              style={{ color: PALETTE.textMuted, fontFamily: "'DM Mono', monospace" }}
            >
              <span style={{ color: PALETTE.textMain }}>FILE</span>
              <span>{fileName ?? '—'}</span>
              <span style={{ color: PALETTE.line }}>·</span>
              <span style={{ color: PALETTE.textMain }}>STATUS</span>
              <span>{phase.toUpperCase()}</span>
              {stage && (
                <>
                  <span style={{ color: PALETTE.line }}>·</span>
                  <span style={{ color: PALETTE.amber }}>{stage}</span>
                </>
              )}
              {wallMs != null && (
                <>
                  <span style={{ color: PALETTE.line }}>·</span>
                  <span>{(wallMs / 1000).toFixed(1)}s wall</span>
                </>
              )}
            </div>
          )}
        </section>

        {/* Error */}
        {error && (
          <section
            className="flex items-start gap-3 px-6 py-3"
            style={{ background: PALETTE.surface, borderLeft: `2px solid ${PALETTE.red}` }}
          >
            <span
              className="text-[10px] uppercase tracking-[0.15em]"
              style={{ color: PALETTE.red, fontFamily: "'DM Mono', monospace" }}
            >
              ERROR
            </span>
            <span className="text-[11px]" style={{ color: PALETTE.textMain }}>{error}</span>
          </section>
        )}

        {/* Result */}
        {midi && selfGrade && (
          <section
            className="flex flex-col gap-5 px-6 py-5"
            style={{ background: PALETTE.surface }}
          >
            <header
              className="flex items-center justify-between"
              style={{ fontFamily: "'DM Mono', monospace" }}
            >
              <span
                className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.15em]"
                style={{ color: PALETTE.textMuted }}
              >
                PIANO ROLL
                <GradeBadge grade={selfGrade.piano.grade} reasoning={selfGrade.piano.reasoning} />
              </span>
              <span
                className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.15em]"
                style={{ color: PALETTE.textMuted }}
              >
                NOTES ({midi.tracks.reduce((s, t) => s + (t.isDrum ? 0 : t.notes.length), 0)})
                <GradeBadge grade={selfGrade.notes.grade} reasoning={selfGrade.notes.reasoning} />
              </span>
            </header>

            <MultiTrackPianoRoll midi={midi} />

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div
                className="text-[11px]"
                style={{ color: PALETTE.textMuted, fontFamily: "'DM Mono', monospace" }}
              >
                STEMS: <span style={{ color: PALETTE.textMain }}>{stems.join(' · ') || '—'}</span>
                <span style={{ color: PALETTE.line }}> · </span>
                DURATION: <span style={{ color: PALETTE.textMain }}>{midi.durationSec.toFixed(1)}s</span>
              </div>
              {downloadUrl && (
                <a
                  href={downloadUrl}
                  download={(fileName?.replace(/\.[^.]+$/, '') ?? 'note-detector-2') + '.mid'}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-[11px] uppercase tracking-[0.15em]"
                  style={{
                    background: PALETTE.amber,
                    color: '#0A0A0C',
                    fontFamily: "'DM Mono', monospace",
                  }}
                >
                  <Download size={12} />
                  DOWNLOAD MIDI
                </a>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
