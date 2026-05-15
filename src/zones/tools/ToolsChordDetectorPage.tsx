import { ArrowLeft, Loader2, Upload } from 'lucide-react'
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

import { getFileById, receiveDockOrFileDrop } from '../../components/files-dock/files-store'
import { buildChord, CHORD_QUALITIES } from '../../components/piano/chords'
import { piano } from '../../components/piano/engine'
import {
  analyzeChordProgressionFromBlob,
  buildChordMidiBlob,
  clipChordSegmentsForExport,
  clipLeadNotesForExport,
  NEURALNOTE_STYLE,
  NEURALNOTE_TIME_DIVISION_LABELS,
  validateChordOutput,
  type ChordAnalysisResult,
  type NeuralNoteStyleMelodyPostInput,
  type ValidationReport,
} from './chord-detector-engine'
import StudioToolsHeader from './StudioToolsHeader'

interface ToolsChordDetectorPageProps {
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
  /** "Pass" indicator for the Output Check panel — muted to fit the instrument-panel look. */
  green: '#54C98E',
} as const

function formatMmSs(seconds: number): string {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  const r = s - m * 60
  const whole = Math.floor(r)
  const dec = Math.round((r - whole) * 10)
  return `${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${dec}`
}

/** Single-key persistence for MELODY POST sliders (`chord-detector:melodyPost:` prefix). */
const MELODY_POST_LOCAL_STORAGE_KEY = 'chord-detector:melodyPost:ui'
/** Bump when persisted shape or baseline defaults change; v1 loads are re-saved as v2 on read. */
const MELODY_POST_UI_SCHEMA_V = 2 as const

type MelodyPostUiState = {
  enabled: boolean
  timeQuantizeEnabled: boolean
  quantizeForcePct: number
  timeDivisionIndex: number
  minNoteDurationMs: number
  velocityGainPct: number
  velocityCompressionPct: number
}

function defaultMelodyPostUiState(): MelodyPostUiState {
  const m = NEURALNOTE_STYLE.melodyPost
  return {
    enabled: m.enabled,
    timeQuantizeEnabled: m.timeQuantizeEnabled,
    quantizeForcePct: Math.round(m.quantizeForce * 100),
    timeDivisionIndex: m.timeDivisionIndex,
    minNoteDurationMs: m.minNoteDurationMs,
    velocityGainPct: Math.round(m.velocityGain * 100),
    velocityCompressionPct: Math.round(m.velocityCompression * 100),
  }
}

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function loadMelodyPostUiStateFromStorage(): MelodyPostUiState | null {
  try {
    const raw = localStorage.getItem(MELODY_POST_LOCAL_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const o = parsed as Record<string, unknown>
    const v = o._v
    if (v !== 1 && v !== MELODY_POST_UI_SCHEMA_V) return null
    const fb = defaultMelodyPostUiState()
    const maxDiv = NEURALNOTE_TIME_DIVISION_LABELS.length - 1
    const state: MelodyPostUiState = {
      enabled: typeof o.enabled === 'boolean' ? o.enabled : fb.enabled,
      timeQuantizeEnabled:
        typeof o.timeQuantizeEnabled === 'boolean' ? o.timeQuantizeEnabled : fb.timeQuantizeEnabled,
      quantizeForcePct: clampInt(o.quantizeForcePct, 0, 100, fb.quantizeForcePct),
      timeDivisionIndex: clampInt(o.timeDivisionIndex, 0, maxDiv, fb.timeDivisionIndex),
      minNoteDurationMs: clampInt(o.minNoteDurationMs, 35, 580, fb.minNoteDurationMs),
      velocityGainPct: clampInt(o.velocityGainPct, 50, 150, fb.velocityGainPct),
      velocityCompressionPct: clampInt(o.velocityCompressionPct, 0, 100, fb.velocityCompressionPct),
    }
    if (v === 1) {
      saveMelodyPostUiStateToStorage(state)
    }
    return state
  } catch {
    return null
  }
}

function saveMelodyPostUiStateToStorage(state: MelodyPostUiState): void {
  try {
    localStorage.setItem(
      MELODY_POST_LOCAL_STORAGE_KEY,
      JSON.stringify({ _v: MELODY_POST_UI_SCHEMA_V, ...state }),
    )
  } catch {
    // private mode, quota, or storage disabled
  }
}

/* ── Piano roll (NeuralNote-style MIDI view, replaces ChordTrimTimeline) ─────── */

/**
 * Vertical piano keyboard on the left, time-aligned note bars on the right.
 *
 * Renders `result.leadNotes` (the melody/lead transcribed by Basic Pitch — same
 * data the MIDI export emits). Chord segments are NOT drawn as triads here;
 * they live in the chip strip below, and the engine's `buildChordMidiBlob`
 * prefers leadNotes over segments so what you see is what you export.
 *
 * Trim "brackets" replace the old trim handles: two amber vertical lines with
 * a dimmed overlay outside [trimStart, trimEnd]. Drag the bracket to retrim.
 */
function PianoRoll({
  result,
  trimStart,
  trimEnd,
  onTrimChange,
  playheadSec,
}: {
  result: ChordAnalysisResult
  trimStart: number
  trimEnd: number
  onTrimChange: (start: number, end: number) => void
  playheadSec: number | null
}) {
  const trimRangeId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(880)
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null)
  const trimLiveRef = useRef({ start: trimStart, end: trimEnd })
  const dur = result.durationSec
  const minGap = Math.max(0.2, (60 / result.bpm) * 0.35)

  useEffect(() => {
    trimLiveRef.current = { start: trimStart, end: trimEnd }
  }, [trimStart, trimEnd])

  // Track the SVG's actual width — the piano-key strip stays fixed, the roll
  // stretches to fill. Without this we'd guess (and bars would misalign).
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    setWidth(el.getBoundingClientRect().width)
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setWidth(e.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /** Auto-fit pitch range to the note set, with 2-semitone padding and a
   * 2-octave minimum so a 3-note clip still draws as a piano roll. */
  const { lo, hi } = useMemo(() => {
    const notes = result.leadNotes
    if (!notes.length) return { lo: 48, hi: 84 } // C3..C6 default
    let mn = notes[0].midi
    let mx = notes[0].midi
    for (const n of notes) {
      if (n.midi < mn) mn = n.midi
      if (n.midi > mx) mx = n.midi
    }
    mn = Math.max(0, mn - 2)
    mx = Math.min(127, mx + 2)
    const span = mx - mn
    if (span < 24) {
      const grow = Math.ceil((24 - span) / 2)
      mn = Math.max(0, mn - grow)
      mx = Math.min(127, mx + grow)
    }
    return { lo: mn, hi: mx }
  }, [result.leadNotes])

  const keyWidth = 48
  const height = 280
  const rollLeft = keyWidth
  const rollWidth = Math.max(40, width - keyWidth)
  const innerTop = 6
  const innerBottom = 6
  const rowH = (height - innerTop - innerBottom) / (hi - lo + 1)

  const midiToY = useCallback(
    (m: number): number => innerTop + (hi - m) * rowH,
    [hi, innerTop, rowH],
  )
  const timeToX = useCallback(
    (t: number): number => (dur <= 0 ? rollLeft : rollLeft + (t / dur) * rollWidth),
    [dur, rollLeft, rollWidth],
  )
  const xToTime = useCallback(
    (x: number): number => {
      if (dur <= 0) return 0
      const ratio = Math.min(1, Math.max(0, (x - rollLeft) / rollWidth))
      return ratio * dur
    },
    [dur, rollLeft, rollWidth],
  )

  // Trim-handle drag — mirrors ChordTrimTimeline's window listeners.
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: PointerEvent): void => {
      const el = wrapRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const t = xToTime(e.clientX - r.left)
      const { start, end } = trimLiveRef.current
      if (dragging === 'start') {
        onTrimChange(Math.max(0, Math.min(t, end - minGap)), end)
      } else {
        onTrimChange(start, Math.min(dur, Math.max(t, start + minGap)))
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
  }, [dragging, dur, minGap, onTrimChange, xToTime])

  // 4/4 beat grid — heavier line every 4 beats (one bar).
  const secPerBeat = 60 / Math.max(1, result.bpm)
  const beats: number[] = []
  for (let t = 0; t < dur + 1e-3; t += secPerBeat) beats.push(t)

  const isBlackKey = (m: number): boolean => {
    const pc = ((m % 12) + 12) % 12
    return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10
  }

  const notes = result.leadNotes
  const tx0 = timeToX(trimStart)
  const tx1 = timeToX(trimEnd)

  // Octave labels (C-1 through C9 — Cn where MIDI is 12*(n+1))
  const octaveLabels: Array<{ midi: number; label: string }> = []
  for (let m = lo; m <= hi; m++) {
    if (m % 12 === 0) octaveLabels.push({ midi: m, label: `C${Math.floor(m / 12) - 1}` })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-x-4">
        <span
          className="text-[10px] uppercase tracking-[0.15em]"
          style={{ color: PALETTE.textMuted }}
        >
          PIANO ROLL
        </span>
        <span
          className="text-[10px] uppercase tracking-[0.15em]"
          style={{ color: PALETTE.textMuted, fontFamily: "'DM Mono', monospace" }}
        >
          {String(notes.length).padStart(3, '0')} NOTES · DRAG BRACKETS TO TRIM
        </span>
      </div>

      <div
        ref={wrapRef}
        className="relative w-full touch-none select-none"
        style={{ height, border: `1px solid ${PALETTE.line}`, background: PALETTE.bg }}
        role="group"
        aria-describedby={trimRangeId}
      >
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${Math.max(1, width)} ${height}`}
          preserveAspectRatio="none"
          style={{ display: 'block' }}
        >
          {/* Black-key row tint (subtle, in the roll area only). */}
          {(() => {
            const rows: React.JSX.Element[] = []
            for (let m = lo; m <= hi; m++) {
              if (!isBlackKey(m)) continue
              rows.push(
                <rect
                  key={`brow-${m}`}
                  x={rollLeft}
                  y={midiToY(m)}
                  width={rollWidth}
                  height={rowH}
                  fill="rgba(255,255,255,0.022)"
                />,
              )
            }
            return rows
          })()}

          {/* Octave dividers — slightly stronger than beat lines. */}
          {octaveLabels.map(({ midi }) => (
            <line
              key={`octl-${midi}`}
              x1={rollLeft}
              y1={midiToY(midi) + rowH}
              x2={Math.max(1, width)}
              y2={midiToY(midi) + rowH}
              stroke="rgba(255,255,255,0.10)"
              strokeWidth={0.6}
            />
          ))}

          {/* Beat / bar grid (4/4 assumed). */}
          {beats.map((t, i) => {
            const x = timeToX(t)
            const isBar = i % 4 === 0
            return (
              <line
                key={`beat-${i}`}
                x1={x}
                y1={0}
                x2={x}
                y2={height}
                stroke={isBar ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.04)'}
                strokeWidth={isBar ? 1 : 0.5}
              />
            )
          })}

          {/* Notes — opacity scales with velocity so dynamics read at a glance. */}
          {notes.map((n, i) => {
            const x = timeToX(n.startSec)
            const w = Math.max(2, timeToX(n.startSec + n.durationSec) - x)
            const y = midiToY(n.midi)
            const opacity = 0.45 + Math.min(1, Math.max(0, n.velocity)) * 0.55
            return (
              <rect
                key={`n-${i}`}
                x={x}
                y={y + 1}
                width={w}
                height={Math.max(1, rowH - 2)}
                fill={PALETTE.amber}
                opacity={opacity}
                rx={1}
              />
            )
          })}

          {/* Outside-trim dim overlay. */}
          {tx0 > rollLeft && (
            <rect x={rollLeft} y={0} width={tx0 - rollLeft} height={height} fill="rgba(10,10,12,0.65)" />
          )}
          {tx1 < rollLeft + rollWidth && (
            <rect x={tx1} y={0} width={rollLeft + rollWidth - tx1} height={height} fill="rgba(10,10,12,0.65)" />
          )}

          {/* Trim brackets. */}
          <line x1={tx0} y1={0} x2={tx0} y2={height} stroke={PALETTE.amber} strokeWidth={1.5} />
          <line x1={tx1} y1={0} x2={tx1} y2={height} stroke={PALETTE.amber} strokeWidth={1.5} />

          {/* Playhead while previewing. */}
          {playheadSec != null && playheadSec >= 0 && playheadSec <= dur && (
            <line
              x1={timeToX(playheadSec)}
              y1={0}
              x2={timeToX(playheadSec)}
              y2={height}
              stroke="#ffffff"
              strokeOpacity={0.9}
              strokeWidth={1}
            />
          )}

          {/* Piano-key strip on the left. Drawn LAST so it covers notes that
              hang past the boundary on the left (none should, but defensive). */}
          <rect x={0} y={0} width={keyWidth} height={height} fill="#16161A" />
          {(() => {
            const keys: React.JSX.Element[] = []
            for (let m = lo; m <= hi; m++) {
              const y = midiToY(m)
              if (isBlackKey(m)) {
                keys.push(
                  <rect
                    key={`key-${m}`}
                    x={0}
                    y={y + 1}
                    width={keyWidth * 0.62}
                    height={Math.max(1, rowH - 2)}
                    fill="#0A0A0C"
                  />,
                )
              } else {
                keys.push(
                  <rect
                    key={`key-${m}`}
                    x={0}
                    y={y}
                    width={keyWidth}
                    height={rowH}
                    fill="#1C1C20"
                  />,
                )
                keys.push(
                  <line
                    key={`keyl-${m}`}
                    x1={0}
                    y1={y + rowH}
                    x2={keyWidth}
                    y2={y + rowH}
                    stroke="rgba(0,0,0,0.55)"
                    strokeWidth={0.4}
                  />,
                )
              }
            }
            return keys
          })()}
          <line
            x1={keyWidth}
            y1={0}
            x2={keyWidth}
            y2={height}
            stroke={PALETTE.line}
            strokeWidth={1}
          />

          {octaveLabels.map(({ midi, label }) => (
            <text
              key={`oct-${midi}`}
              x={keyWidth - 4}
              y={midiToY(midi) + rowH * 0.72}
              textAnchor="end"
              fontSize={9}
              fill={PALETTE.textMuted}
              fontFamily="'DM Mono', monospace"
            >
              {label}
            </text>
          ))}
        </svg>

        {/* DOM hit targets on top of the SVG — bigger and easier to grab than the SVG line. */}
        <button
          type="button"
          aria-label={`Trim start ${formatMmSs(trimStart)}`}
          className="absolute top-0 z-10 h-full w-3 -translate-x-1/2 cursor-ew-resize"
          style={{ left: tx0, background: 'transparent' }}
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
          className="absolute top-0 z-10 h-full w-3 -translate-x-1/2 cursor-ew-resize"
          style={{ left: tx1, background: 'transparent' }}
          onPointerDown={(e: ReactPointerEvent) => {
            e.preventDefault()
            ;(e.target as HTMLButtonElement).setPointerCapture(e.pointerId)
            setDragging('end')
          }}
        >
          <span className="sr-only">End handle</span>
        </button>
      </div>

      <div
        className="flex items-center justify-between text-[10px] uppercase tracking-[0.15em]"
        style={{ color: PALETTE.textMuted }}
      >
        <span id={trimRangeId} style={{ fontFamily: "'DM Mono', monospace" }}>
          <span style={{ color: PALETTE.textMain }}>{formatMmSs(trimStart)}</span>
          <span className="mx-1.5">→</span>
          <span style={{ color: PALETTE.textMain }}>{formatMmSs(trimEnd)}</span>
          <span className="ml-2" style={{ color: PALETTE.amber }}>
            ({(trimEnd - trimStart).toFixed(1)}s)
          </span>
        </span>
        <span style={{ fontFamily: "'DM Mono', monospace" }}>
          {result.bpm.toFixed(1)} BPM · {result.bpmSource.toUpperCase()}
        </span>
      </div>
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────────────────────── */

export default function ToolsChordDetectorPage({ onNavigate }: ToolsChordDetectorPageProps) {
  const inputId = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [result, setResult] = useState<ChordAnalysisResult | null>(null)
  /** Inbound clip relayed from another tool (Audio grabber, Recent clips tray). */
  const [inboundNotice, setInboundNotice] = useState<string | null>(null)

  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [trimCommitted, setTrimCommitted] = useState(false)

  const [dragHover, setDragHover] = useState(false)

  /** Default on: stricter BP + export path for piano / single-line lead (toggle off for denser poly). */
  const [pianoLeadFocus, setPianoLeadFocus] = useState(true)
  const skipPianoLeadReanalyzeRef = useRef(true)

  /** Last dropped file — re-run analysis when melody post knobs change (same clip). */
  const lastFileRef = useRef<File | null>(null)

  /** One localStorage read per mount — hydrates when `_v` is 1 (migrated to 2) or 2. */
  const melodyPostInitRef = useRef<MelodyPostUiState | null>(null)
  if (melodyPostInitRef.current === null) {
    melodyPostInitRef.current = loadMelodyPostUiStateFromStorage() ?? defaultMelodyPostUiState()
  }
  const mpInit = melodyPostInitRef.current

  /**
   * Melody post-processing inspired by NeuralNote (browser-only; not the C++ plugin).
   * Defaults follow `NEURALNOTE_STYLE.melodyPost` in `chord-detector-neuralnote-style.ts`.
   */
  const [nnPostEnabled, setNnPostEnabled] = useState<boolean>(mpInit.enabled)
  const [nnTimeQuantize, setNnTimeQuantize] = useState<boolean>(mpInit.timeQuantizeEnabled)
  const [nnQuantizeForcePct, setNnQuantizeForcePct] = useState<number>(mpInit.quantizeForcePct)
  const [nnTimeDivIdx, setNnTimeDivIdx] = useState<number>(mpInit.timeDivisionIndex)
  const [nnMinNoteMsPost, setNnMinNoteMsPost] = useState<number>(mpInit.minNoteDurationMs)
  const [nnVelGainPct, setNnVelGainPct] = useState<number>(mpInit.velocityGainPct)
  const [nnVelCompPct, setNnVelCompPct] = useState<number>(mpInit.velocityCompressionPct)

  const melodyPostInput = useMemo((): NeuralNoteStyleMelodyPostInput => ({
      enabled: nnPostEnabled,
      timeQuantizeEnabled: nnTimeQuantize,
      quantizeForce: nnQuantizeForcePct / 100,
      timeDivisionIndex: nnTimeDivIdx,
      minNoteDurationMs: nnMinNoteMsPost,
      velocityGain: nnVelGainPct / 100,
      velocityCompression: nnVelCompPct / 100,
    }),
    [
      nnPostEnabled,
      nnTimeQuantize,
      nnQuantizeForcePct,
      nnTimeDivIdx,
      nnMinNoteMsPost,
      nnVelGainPct,
      nnVelCompPct,
    ],
  )

  useEffect(() => {
    saveMelodyPostUiStateToStorage({
      enabled: nnPostEnabled,
      timeQuantizeEnabled: nnTimeQuantize,
      quantizeForcePct: nnQuantizeForcePct,
      timeDivisionIndex: nnTimeDivIdx,
      minNoteDurationMs: nnMinNoteMsPost,
      velocityGainPct: nnVelGainPct,
      velocityCompressionPct: nnVelCompPct,
    })
  }, [
    nnPostEnabled,
    nnTimeQuantize,
    nnQuantizeForcePct,
    nnTimeDivIdx,
    nnMinNoteMsPost,
    nnVelGainPct,
    nnVelCompPct,
  ])

  /* ── Inline MIDI preview state ── */
  const [previewing, setPreviewing] = useState(false)
  const [looping, setLooping] = useState(false)
  const [playheadSec, setPlayheadSec] = useState<number | null>(null)
  const previewStartRef = useRef<number>(0)
  const previewBaseOffsetRef = useRef<number>(0)
  const previewRafRef = useRef<number>(0)
  const previewDoneTimeoutRef = useRef<number | null>(null)
  /** Mirror of `looping` state for use in async callbacks (closures are stale). */
  const loopingRef = useRef<boolean>(false)
  /** Mirror of `previewing` state for the RAF/playback callbacks. */
  const previewingRef = useRef<boolean>(false)
  /** Tracks "are we in the middle of restarting a loop iteration?" so we don't double-fire. */
  const loopRestartingRef = useRef<boolean>(false)

  useEffect(() => {
    loopingRef.current = looping
  }, [looping])

  useEffect(() => {
    previewingRef.current = previewing
  }, [previewing])

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

  const clippedLeadNotes = useMemo(() => {
    if (!result) return []
    return clipLeadNotesForExport(result.leadNotes, trimStart, trimEnd, result.durationSec)
  }, [result, trimStart, trimEnd])

  const progressionTextFull = useMemo(() => {
    if (!result?.segments.length) return ''
    return result.segments.map(s => s.label).join(' → ')
  }, [result])

  const progressionTextExport = useMemo(() => {
    if (!clippedSegments.length) return ''
    return clippedSegments.map(s => s.label).join(' → ')
  }, [clippedSegments])

  /** Output-quality checks for the "Output check" panel — recomputed per analysis. */
  const validationReport = useMemo<ValidationReport | null>(
    () => (result ? validateChordOutput(result) : null),
    [result],
  )

  /** Loop stat readout — e.g. "4 bars ×7" or "—". */
  const loopDisplay = result?.loop.found
    ? `${result.loop.barCount} bar${result.loop.barCount > 1 ? 's' : ''} ×${result.loop.repeats}`
    : '—'

  const runFile = useCallback(async (file: File) => {
    lastFileRef.current = file
    setBusy(true)
    setError(null)
    setFileName(file.name)
    setResult(null)
    try {
      const r = await analyzeChordProgressionFromBlob(file, {
        melodyPost: melodyPostInput,
        pianoLeadFocus,
      })
      setResult(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed.')
    } finally {
      setBusy(false)
    }
  }, [melodyPostInput, pianoLeadFocus])

  useEffect(() => {
    if (skipPianoLeadReanalyzeRef.current) {
      skipPianoLeadReanalyzeRef.current = false
      return
    }
    const f = lastFileRef.current
    if (!f) return
    void runFile(f)
  }, [pianoLeadFocus, runFile])

  /** Skip the very first melodyPost effect so we don't trigger an analysis on
   * mount before the user has even dropped a file. */
  const skipMelodyPostReanalyzeRef = useRef(true)

  /**
   * Live re-run on slider changes. 400ms debounce keeps the analyzer from
   * thrashing while the user is mid-drag; the trailing edge fires once they
   * settle. No-op until a file has been loaded — the user's first analysis
   * still happens on drop, not on mount.
   */
  useEffect(() => {
    if (skipMelodyPostReanalyzeRef.current) {
      skipMelodyPostReanalyzeRef.current = false
      return
    }
    const f = lastFileRef.current
    if (!f) return
    const handle = window.setTimeout(() => {
      void runFile(f)
    }, 400)
    return () => window.clearTimeout(handle)
  }, [melodyPostInput, runFile])

  /**
   * DEV-only test hook — mirrors the latest analysis onto `window.__chordDetectorTest`
   * so the accuracy tuning harness (`scripts/chord-detector-tune.mjs`) can read full
   * results (segments, leadNotes, histogram) headlessly. `runId` bumps per published
   * result; the harness waits for `busy === false` plus a fresh `runId`.
   */
  const testRunIdRef = useRef(0)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    if (result) testRunIdRef.current += 1
    ;(window as unknown as { __chordDetectorTest?: unknown }).__chordDetectorTest = {
      result,
      busy,
      error,
      fileName,
      validationReport,
      runId: testRunIdRef.current,
      at: Date.now(),
    }
  }, [result, busy, error, fileName, validationReport])

  // Inbound clip pickup (one-shot per route entry).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      let id: string | null = null
      try {
        id = sessionStorage.getItem('inbound-clip-tools-chord-detector')
        if (id) sessionStorage.removeItem('inbound-clip-tools-chord-detector')
      } catch {
        id = null
      }
      if (!id || cancelled) return
      const stored = await getFileById(id)
      if (!stored || cancelled) return
      const f = new File([stored.blob], stored.name, { type: stored.mime || 'audio/mpeg' })
      setInboundNotice(`Loaded clip "${stored.name}" from grabber`)
      void runFile(f)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      if (f) void runFile(f)
      e.target.value = ''
    },
    [runFile],
  )

  /**
   * Accept either an OS file drop or a dock-internal drag.
   *
   * IMPORTANT: `receiveDockOrFileDrop` reads `e.dataTransfer.getData()`
   * synchronously up to its first internal await — but the DataTransfer enters
   * "protected mode" once the drop handler yields to the event loop. So we MUST
   * call `receiveDockOrFileDrop(e)` BEFORE any other await (and we must NOT use
   * a dynamic `import()` here, which would create a microtask boundary first).
   * The previous implementation did exactly that and the dock-MIME read silently
   * returned an empty string.
   */
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragHover(false)
      // Call SYNC-prelude function first; it reads dataTransfer before awaiting.
      const filePromise = receiveDockOrFileDrop(e)
      void (async () => {
        const f = await filePromise
        if (!f) return
        const asFile = f instanceof File ? f : new File([f], 'dock-clip', { type: f.type || 'audio/*' })
        await runFile(asFile)
      })()
    },
    [runFile],
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragHover(true)
  }, [])

  const onDragLeave = useCallback(() => setDragHover(false), [])

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

  /**
   * Stop any in-flight preview: release the polysynth, cancel the RAF that
   * was driving the playhead, and clear pending done-timeouts so we don't
   * race with a callback after the user has already pressed stop.
   *
   * When `loopRestartingRef.current` is true we're stopping mid-cycle in
   * preparation for a fresh loop iteration — skip the state reset so the
   * UI doesn't flicker between "playing" and "idle" on every loop wrap.
   */
  const stopPreview = useCallback(() => {
    piano.stopAll()
    if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current)
    previewRafRef.current = 0
    if (previewDoneTimeoutRef.current != null) {
      window.clearTimeout(previewDoneTimeoutRef.current)
      previewDoneTimeoutRef.current = null
    }
    if (!loopRestartingRef.current) {
      setPreviewing(false)
      previewingRef.current = false
      setPlayheadSec(null)
    }
  }, [])

  /**
   * Schedule one pass of the chord+lead preview through the piano engine.
   * Reusable so we can call it again for each loop iteration without rebuilding
   * the callback dependency graph. Returns the playback's wall-clock duration.
   */
  const schedulePreviewPass = useCallback((): number => {
    if (!result || clippedSegments.length === 0) return 0

    // Build RecordedNote[] for the chord pad…
    const notes: { midi: number; start: number; duration: number; velocity: number }[] = []
    for (const seg of clippedSegments) {
      const quality = CHORD_QUALITIES.find(q => {
        if (seg.quality === 'major') return q.id === 'maj'
        if (seg.quality === 'minor') return q.id === 'min'
        if (seg.quality === 'dim') return q.id === 'dim'
        if (seg.quality === 'aug') return q.id === 'aug'
        if (seg.quality === 'sus4') return q.id === 'sus4'
        return q.id === 'maj'
      })
      if (!quality) continue
      const midis = buildChord(seg.rootPc, 4, quality.intervals, 0)
      for (const m of midis) {
        notes.push({
          midi: m,
          start: seg.startSec,
          duration: Math.max(0.1, Math.min(seg.durationSec, 1.6)),
          velocity: 0.55, // sit chord pad below the lead so melody comes through
        })
      }
    }
    // …and stack the lead-note track on top so the preview matches what the
    // exported MIDI will sound like (chord track + lead track).
    for (const n of clippedLeadNotes) {
      notes.push({
        midi: n.midi,
        start: n.startSec,
        duration: Math.max(0.06, Math.min(n.durationSec, 2.5)),
        velocity: Math.max(0.35, Math.min(1, n.velocity * 0.9)),
      })
    }
    if (notes.length === 0) return 0

    let totalDuration = clippedSegments.reduce(
      (acc, s) => Math.max(acc, s.startSec + s.durationSec),
      0,
    )
    for (const n of clippedLeadNotes) {
      totalDuration = Math.max(totalDuration, n.startSec + n.durationSec)
    }

    previewStartRef.current = performance.now() / 1000
    previewBaseOffsetRef.current = trimStart
    setPlayheadSec(trimStart)

    // Drive the playhead via a RAF loop synced to wall-clock.
    const tick = () => {
      const elapsed = performance.now() / 1000 - previewStartRef.current
      if (elapsed > totalDuration + 0.05) {
        // Pass ended — looping is handled by the playback `onDone` below; just
        // stop advancing the playhead here.
        return
      }
      setPlayheadSec(previewBaseOffsetRef.current + elapsed)
      previewRafRef.current = requestAnimationFrame(tick)
    }
    previewRafRef.current = requestAnimationFrame(tick)

    // Schedule the actual playback through the piano engine.
    void piano.playback(notes, () => {
      // playback's `onDone` fires shortly after the last note's end.
      // If looping is on, restart the next pass; otherwise stop cleanly.
      if (loopingRef.current && previewingRef.current) {
        loopRestartingRef.current = true
        stopPreview() // suppresses state reset because loopRestarting=true
        loopRestartingRef.current = false
        // Tiny gap between iterations so the synth's release tail finishes.
        window.setTimeout(() => {
          if (previewingRef.current) schedulePreviewPass()
        }, 120)
      } else {
        stopPreview()
      }
    })

    // Safety net — if onDone is delayed/missed for any reason, force-stop.
    if (previewDoneTimeoutRef.current != null) window.clearTimeout(previewDoneTimeoutRef.current)
    previewDoneTimeoutRef.current = window.setTimeout(() => {
      if (loopingRef.current && previewingRef.current) {
        loopRestartingRef.current = true
        stopPreview()
        loopRestartingRef.current = false
        schedulePreviewPass()
      } else {
        stopPreview()
      }
    }, (totalDuration + 1.5) * 1000)

    return totalDuration
  }, [result, clippedSegments, clippedLeadNotes, stopPreview, trimStart])

  /**
   * User-facing toggle. First press: ensure audio is live, mark previewing,
   * schedule the first pass. Second press: stop. Looping is handled inside
   * `schedulePreviewPass`'s `onDone` callback.
   */
  const previewMidi = useCallback(async () => {
    if (!result || clippedSegments.length === 0) return
    if (previewingRef.current) {
      stopPreview()
      return
    }
    await piano.ensureStarted()
    setPreviewing(true)
    previewingRef.current = true
    const duration = schedulePreviewPass()
    if (duration <= 0) {
      stopPreview()
    }
  }, [result, clippedSegments, stopPreview, schedulePreviewPass])

  // Stop any preview when the trim changes (the clipped segments are different now).
  useEffect(() => {
    if (previewing) stopPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimStart, trimEnd])

  // Cleanup on unmount — release the synth & cancel RAF.
  useEffect(() => {
    return () => {
      piano.stopAll()
      if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current)
      if (previewDoneTimeoutRef.current != null) window.clearTimeout(previewDoneTimeoutRef.current)
    }
  }, [])

  const downloadMidi = useCallback(() => {
    if (!result || clippedSegments.length === 0) return
    // Pass the (trimmed) lead-note track so the exported MIDI carries melody
    // on top of the chord backbone — closer to the source audio than triads alone.
    const blob = buildChordMidiBlob(clippedSegments, result.bpm, clippedLeadNotes)
    const base = (fileName ?? 'clip').replace(/\.[^/.]+$/, '')
    const tag = isSelectionTrimmed ? '-trim' : ''
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${base}-chords${tag}.mid`
    a.click()
    URL.revokeObjectURL(url)
  }, [clippedSegments, clippedLeadNotes, fileName, isSelectionTrimmed, result])

  const copyProgression = useCallback(async () => {
    const text = progressionTextExport || progressionTextFull
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* ignore */
    }
  }, [progressionTextExport, progressionTextFull])

  const reset = useCallback(() => {
    lastFileRef.current = null
    setFileName(null)
    setResult(null)
    setError(null)
    setInboundNotice(null)
    setTrimStart(0)
    setTrimEnd(0)
    setTrimCommitted(false)
  }, [])

  /* ── Derived display values ── */
  const bpmDisplay = result ? String(result.bpm).padStart(3, '0') : '---'
  const chordCount = result?.segments.length ?? 0
  const status = busy ? 'ANALYZING' : result ? 'DECODED' : 'IDLE'
  const statusColor = busy ? PALETTE.amber : result ? PALETTE.textMain : PALETTE.textMuted

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}
    >
      <StudioToolsHeader
        toolId="tools-chord-detector"
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

      <div className="flex-1 overflow-auto" style={{ background: PALETTE.bg }}>
        <div className="mx-auto flex w-full flex-col" style={{ minHeight: 'calc(100dvh - 56px)' }}>
          <div
            className="flex w-full flex-1 flex-col"
            style={{
              gap: '1px',
              background: PALETTE.line,
            }}
          >
            {/* ── Header ── */}
            <header
              className="flex items-center justify-between px-6 py-4"
              style={{ background: PALETTE.surface }}
            >
              <PillButton label="UTIL.06" decorative />
              <div
                className="text-[10px] uppercase tracking-[0.2em]"
                style={{ color: PALETTE.textMuted, fontFamily: "'DM Mono', monospace" }}
              >
                CHORD_DET
              </div>
              <PillButton label="RESET" onClick={reset} />
            </header>

            {/* ── Hero (sidebar + BPM + status dots) ── */}
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
                  BASIC PITCH
                </span>
                <CircleNum n={2} />
              </div>

              <div
                className="relative flex min-w-0 flex-col items-center justify-center overflow-hidden px-4 py-8"
                style={{ background: PALETTE.surface }}
              >
                <span
                  className="absolute right-4 top-4 text-[10px] tracking-[0.1em]"
                  style={{ color: PALETTE.textMuted }}
                >
                  TEMPO BPM
                </span>

                <div
                  className="max-w-full select-none text-center"
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    // Cap at 9rem and use cqw (container-width) where supported, falling back to a smaller vw value.
                    fontSize: 'clamp(3.5rem, 11vw, 9rem)',
                    fontWeight: 400,
                    lineHeight: 1,
                    letterSpacing: '-0.05em',
                    color: result ? PALETTE.textMain : PALETTE.textMuted,
                    textShadow: busy ? `0 0 24px ${PALETTE.amberGlow}` : 'none',
                    transition: 'color 0.1s ease, text-shadow 0.1s ease',
                    whiteSpace: 'nowrap',
                  }}
                  aria-live="polite"
                  aria-label={result ? `Detected tempo ${result.bpm} BPM` : 'No tempo detected'}
                >
                  {bpmDisplay}
                </div>

                <span
                  className="mt-4 text-[10px] uppercase tracking-[0.2em]"
                  style={{ color: statusColor, fontFamily: "'DM Mono', monospace" }}
                >
                  {status}
                  {result?.bpmSource === 'tags'
                    ? ' · FROM TAGS'
                    : result?.bpmSource === 'bpm-prior'
                      ? ' · BPM PRIOR'
                      : result
                        ? ' · ESTIMATED'
                        : ''}
                </span>
              </div>
            </section>

            <section
              className="border-b px-6 py-2.5"
              style={{ background: PALETTE.surface, borderColor: PALETTE.line }}
            >
              <p
                className="text-center text-[10px] leading-relaxed tracking-wide"
                style={{ color: PALETTE.textMuted, fontFamily: "'DM Mono', monospace" }}
              >
                Transcription uses Spotify Basic Pitch (TensorFlow.js) with optional NeuralNote-inspired
                post-processing below — not the NeuralNote desktop plugin.
              </p>
              <p
                className="mt-2 text-center text-[10px] leading-snug tracking-wide"
                style={{ color: PALETTE.textMuted, fontFamily: "'DM Mono', monospace" }}
              >
                Tuned for piano and lead-note lines first; the chord timeline is a secondary harmonic guide.
              </p>
              <label
                className="mx-auto mt-3 flex max-w-md cursor-pointer select-none items-center justify-center gap-2.5 text-[10px] uppercase tracking-[0.12em]"
                style={{ color: PALETTE.textMain, fontFamily: "'DM Mono', monospace" }}
              >
                <input
                  type="checkbox"
                  className="size-3.5 accent-amber-500"
                  checked={pianoLeadFocus}
                  onChange={e => setPianoLeadFocus(e.target.checked)}
                  aria-label="Piano and lead focus mode"
                />
                <span style={{ color: pianoLeadFocus ? PALETTE.amber : PALETTE.textMuted }}>
                  Piano / lead focus
                </span>
                <span className="normal-case tracking-normal" style={{ color: PALETTE.textMuted }}>
                  — stricter notes & calmer poly (re-runs clip)
                </span>
              </label>
            </section>

            {/* ── Controls (moved up to where Statistics used to live) — preview / loop / trim / export ── */}
            <section
              className="grid"
              style={{
                gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr',
                gap: '1px',
                background: PALETTE.line,
              }}
            >
              <ControlButton
                active={previewing}
                disabled={!result || clippedSegments.length === 0}
                onClick={() => void previewMidi()}
                icon={
                  previewing ? (
                    // Pause glyph — two amber bars while playback is running
                    <span className="flex items-center gap-[3px]" aria-hidden>
                      <span
                        className="block"
                        style={{ width: 3, height: 9, background: PALETTE.amber }}
                      />
                      <span
                        className="block"
                        style={{ width: 3, height: 9, background: PALETTE.amber }}
                      />
                    </span>
                  ) : (
                    // Play triangle
                    <span
                      className="block"
                      style={{
                        width: 0,
                        height: 0,
                        borderTop: '4px solid transparent',
                        borderBottom: '4px solid transparent',
                        borderLeft: `6px solid ${!result || clippedSegments.length === 0 ? PALETTE.textMuted : PALETTE.textMain}`,
                      }}
                      aria-hidden
                    />
                  )
                }
                label={previewing ? 'PAUSE' : 'PREVIEW'}
              />
              <ControlButton
                active={looping}
                disabled={!result || clippedSegments.length === 0}
                onClick={() => setLooping(v => !v)}
                icon={
                  // CSS-only loop glyph: a hollow ring (open on the right) with
                  // an arrowhead at the top — needs *individual* border-side
                  // properties so React's style reconciler doesn't warn about
                  // mixing the `border` shorthand with `borderRightColor`.
                  (() => {
                    const ringColor =
                      looping
                        ? PALETTE.amber
                        : !result || clippedSegments.length === 0
                          ? PALETTE.textMuted
                          : PALETTE.textMain
                    return (
                      <span
                        className="relative block"
                        style={{
                          width: 12,
                          height: 12,
                          borderTopWidth: 2,
                          borderRightWidth: 2,
                          borderBottomWidth: 2,
                          borderLeftWidth: 2,
                          borderStyle: 'solid',
                          borderTopColor: ringColor,
                          borderBottomColor: ringColor,
                          borderLeftColor: ringColor,
                          borderRightColor: 'transparent',
                          borderRadius: '50%',
                        }}
                        aria-hidden
                      >
                        <span
                          className="absolute"
                          style={{
                            right: -2,
                            top: -1,
                            width: 0,
                            height: 0,
                            borderTop: '3px solid transparent',
                            borderBottom: '3px solid transparent',
                            borderLeft: `4px solid ${ringColor}`,
                          }}
                        />
                      </span>
                    )
                  })()
                }
                label={looping ? 'LOOP · ON' : 'LOOP'}
              />
              <ControlButton
                active={trimCommitted}
                disabled={!result || !isSelectionTrimmed}
                onClick={applyTrim}
                icon={
                  <span
                    className="block size-2"
                    style={{
                      background: trimCommitted ? PALETTE.amber : PALETTE.textMain,
                    }}
                    aria-hidden
                  />
                }
                label={trimCommitted ? 'TRIM APPLIED' : 'APPLY TRIM'}
              />
              <ControlButton
                active={false}
                disabled={!result}
                onClick={resetTrim}
                icon={
                  <span
                    className="block"
                    style={{
                      width: 8,
                      height: 8,
                      border: `1px solid ${PALETTE.textMain}`,
                    }}
                    aria-hidden
                  />
                }
                label="RESET TRIM"
              />
              <ControlButton
                active={false}
                disabled={!result || clippedSegments.length === 0}
                onClick={downloadMidi}
                icon={<DownloadGlyph color={!result || clippedSegments.length === 0 ? PALETTE.textMuted : PALETTE.textMain} />}
                label="EXPORT MIDI"
              />
            </section>

            {/* ── Copy progression (continues the controls row) ── */}
            <section
              style={{ background: PALETTE.line, padding: '1px 0 0 0' }}
            >
              <ControlButton
                active={false}
                disabled={!progressionTextExport && !progressionTextFull}
                onClick={() => void copyProgression()}
                icon={
                  <span
                    className="block"
                    style={{
                      width: 8,
                      height: 8,
                      border: `1px solid ${PALETTE.textMain}`,
                      background: 'transparent',
                    }}
                    aria-hidden
                  />
                }
                label="COPY PROGRESSION"
              />
            </section>

            {/* ── Drop zone (interaction slot). Accepts OS files AND dock items. ── */}
            <section
              className="flex items-center justify-center p-6"
              style={{ background: PALETTE.surface }}
            >
              <label
                htmlFor={inputId}
                className="block w-full cursor-pointer"
                style={{ maxWidth: 'clamp(320px, 80vw, 720px)' }}
              >
                <input
                  id={inputId}
                  data-testid="chord-detector-file-input"
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a,.flac,.aac,.mid,.midi,audio/midi,audio/x-midi"
                  className="sr-only"
                  onChange={onInputChange}
                />
                <div
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center transition-colors"
                  style={{
                    background: dragHover ? `${PALETTE.amber}10` : 'transparent',
                    border: `1px dashed ${dragHover ? PALETTE.amber : PALETTE.line}`,
                  }}
                >
                  {busy ? (
                    <Loader2 className="size-8 animate-spin" style={{ color: PALETTE.amber }} aria-hidden />
                  ) : (
                    <Upload className="size-8" style={{ color: dragHover ? PALETTE.amber : PALETTE.textMuted }} strokeWidth={1.5} aria-hidden />
                  )}
                  <div className="flex flex-col items-center gap-1">
                    <span
                      className="text-[12px] uppercase tracking-[0.2em]"
                      style={{
                        color: dragHover ? PALETTE.amber : PALETTE.textMain,
                        fontFamily: "'DM Mono', monospace",
                      }}
                    >
                      {busy ? 'ANALYZING…' : dragHover ? 'RELEASE TO LOAD' : 'DROP AUDIO HERE'}
                    </span>
                    <span
                      className="text-[10px] uppercase tracking-[0.15em]"
                      style={{ color: PALETTE.textMuted, fontFamily: "'DM Mono', monospace" }}
                    >
                      OS FILE · DOCK ITEM · CLICK TO BROWSE
                    </span>
                    <span
                      className="text-[10px] tracking-[0.1em]"
                      style={{ color: PALETTE.textMuted }}
                    >
                      ~96s analyzed in-browser — WAV / MP3 / M4A / FLAC / MID
                    </span>
                  </div>

                  {fileName ? (
                    <div
                      className="mt-2 max-w-full truncate rounded-none px-3 py-1 text-[11px]"
                      style={{
                        border: `1px solid ${PALETTE.line}`,
                        color: PALETTE.textMain,
                        fontFamily: "'DM Mono', monospace",
                      }}
                      title={fileName}
                    >
                      {fileName}
                    </div>
                  ) : null}
                </div>
              </label>
            </section>

            {/* ── Melody post (NeuralNote-style, browser-only) — moved here, directly under the drop zone ── */}
            <section className="flex flex-col" style={{ background: PALETTE.surface }}>
              <div
                className="flex flex-wrap items-center justify-between gap-2 border-b px-6 py-3 text-[11px] uppercase tracking-[0.15em]"
                style={{ borderColor: PALETTE.line, color: PALETTE.textMain }}
              >
                <span>MELODY POST</span>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="max-w-[min(420px,85vw)] text-[9px] normal-case leading-snug tracking-normal"
                    style={{ color: PALETTE.textMuted }}
                  >
                    Inspired by NeuralNote workflow (quantize / min length / levels). Not the JUCE plugin.
                  </span>
                  <button
                    type="button"
                    disabled={!lastFileRef.current || busy}
                    onClick={() => {
                      const f = lastFileRef.current
                      if (f) void runFile(f)
                    }}
                    className="rounded border px-2 py-1 text-[9px] uppercase tracking-[0.12em] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                    style={{
                      borderColor: PALETTE.amber,
                      color: PALETTE.amber,
                      fontFamily: "'DM Mono', monospace",
                      background: 'transparent',
                    }}
                  >
                    Re-run clip
                  </button>
                </div>
              </div>
              <div
                className="grid"
                style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1px', background: PALETTE.line }}
              >
                <SliderCell
                  label="ENABLE CLEANUP"
                  hint="Master switch for all the cleanup below. Off = use the detector's raw timing exactly as found."
                  value={nnPostEnabled ? 1 : 0}
                  min={0}
                  max={1}
                  step={1}
                  suffix={nnPostEnabled ? 'on' : 'off'}
                  onChange={n => setNnPostEnabled(n === 1)}
                />
                <SliderCell
                  label="SNAP TO GRID"
                  hint="Pull each note's start time onto the beat grid. Needs Grid Strength above 0% to do anything."
                  value={nnTimeQuantize ? 1 : 0}
                  min={0}
                  max={1}
                  step={1}
                  suffix={nnTimeQuantize ? 'on' : 'off'}
                  onChange={n => setNnTimeQuantize(n === 1)}
                />
                <SliderCell
                  label="GRID STRENGTH"
                  hint="How hard notes snap to the grid. 0% keeps the natural feel, 100% locks every note to the grid."
                  value={nnQuantizeForcePct}
                  min={0}
                  max={100}
                  step={1}
                  suffix="%"
                  onChange={setNnQuantizeForcePct}
                />
                <SliderCell
                  label="GRID SIZE"
                  hint="Smallest note spacing the grid snaps to — a bigger fraction means a finer grid."
                  value={nnTimeDivIdx}
                  min={0}
                  max={NEURALNOTE_TIME_DIVISION_LABELS.length - 1}
                  step={1}
                  suffix={NEURALNOTE_TIME_DIVISION_LABELS[nnTimeDivIdx] ?? ''}
                  onChange={setNnTimeDivIdx}
                />
              </div>
              <div
                className="grid border-t"
                style={{
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '1px',
                  background: PALETTE.line,
                  borderColor: PALETTE.line,
                }}
              >
                <SliderCell
                  label="SHORTEST NOTE"
                  hint="Notes shorter than this get dropped or merged. Raise it to kill tiny detection blips."
                  value={nnMinNoteMsPost}
                  min={35}
                  max={580}
                  step={5}
                  suffix="ms"
                  onChange={setNnMinNoteMsPost}
                />
                <SliderCell
                  label="LOUDNESS"
                  hint="Scales how loud every note plays. 1.00× leaves the detected levels unchanged."
                  value={nnVelGainPct}
                  min={50}
                  max={150}
                  step={5}
                  suffix={`×${(nnVelGainPct / 100).toFixed(2)}`}
                  onChange={setNnVelGainPct}
                />
                <SliderCell
                  label="EVEN LOUDNESS"
                  hint="Pulls loud and soft notes toward the average. 0% = off, 100% = every note the same volume."
                  value={nnVelCompPct}
                  min={0}
                  max={100}
                  step={5}
                  suffix="%"
                  onChange={setNnVelCompPct}
                />
              </div>
            </section>

            {/* ── Status banner ── */}
            {(inboundNotice || error) && (
              <section
                className="flex items-center gap-3 px-6 py-3"
                style={{
                  background: PALETTE.surface,
                  borderLeft: `2px solid ${error ? '#ef4444' : PALETTE.amber}`,
                }}
              >
                <span
                  className="text-[10px] uppercase tracking-[0.15em]"
                  style={{ color: error ? '#ef4444' : PALETTE.amber, fontFamily: "'DM Mono', monospace" }}
                >
                  {error ? 'ERROR' : 'INBOUND'}
                </span>
                <span className="text-[11px]" style={{ color: PALETTE.textMain }}>
                  {error ?? inboundNotice}
                </span>
              </section>
            )}

            {/* ── Timeline + progression (only when result exists) ── */}
            {result && (
              <section
                className="flex flex-col gap-5 px-6 py-5"
                style={{ background: PALETTE.surface }}
              >
                <PianoRoll
                  result={result}
                  trimStart={trimStart}
                  trimEnd={trimEnd}
                  onTrimChange={onTrimChange}
                  playheadSec={playheadSec}
                />

                {(progressionTextExport || progressionTextFull) ? (
                  <div className="flex flex-col gap-2">
                    <span
                      className="text-[10px] uppercase tracking-[0.15em]"
                      style={{ color: PALETTE.textMuted }}
                    >
                      PROGRESSION
                      {trimCommitted ? ' · TRIMMED' : ''}
                    </span>
                    <p
                      className="px-3 py-2 text-[12px] leading-relaxed"
                      style={{
                        border: `1px solid ${PALETTE.line}`,
                        background: PALETTE.bg,
                        color: PALETTE.textMain,
                        fontFamily: "'DM Mono', monospace",
                      }}
                    >
                      {progressionTextExport || progressionTextFull}
                    </p>
                  </div>
                ) : null}
              </section>
            )}

            {/* ── Pitch class histogram — moved out of STATISTICS, sits directly under the piano roll ── */}
            {result ? (
              <section
                className="flex flex-col gap-1 px-6 py-3"
                style={{ background: PALETTE.surface }}
              >
                <div
                  className="flex items-center justify-between text-[10px] uppercase tracking-[0.15em]"
                  style={{ color: PALETTE.textMuted }}
                >
                  <span>PITCH CLASS HISTOGRAM</span>
                  <span style={{ fontFamily: "'DM Mono', monospace" }}>C → B</span>
                </div>
                <PitchClassHistogram
                  values={result.pitchClassHistogram}
                  rootPc={result.estimatedKey.rootPc}
                />
              </section>
            ) : null}

            {/* ── Output check — moved out of STATISTICS, sits under the piano roll ── */}
            {result && validationReport ? <OutputCheckPanel report={validationReport} /> : null}

            {/* ── Statistics — moved to the bottom (marginTop: auto pushes it to the floor) ── */}
            <section
              className="flex flex-col"
              style={{ background: PALETTE.surface, marginTop: 'auto' }}
            >
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
                      background: busy ? PALETTE.amber : result ? PALETTE.amber : PALETTE.textMuted,
                      boxShadow: busy || result ? `0 0 6px ${PALETTE.amber}` : 'none',
                    }}
                    aria-hidden
                  />
                  {busy ? 'WORKING' : result ? 'LIVE' : 'IDLE'}
                </span>
              </div>
              <div
                className="grid"
                style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', background: PALETTE.line }}
              >
                <StatCell
                  label="DURATION"
                  value={result ? `${result.durationSec.toFixed(1)}s` : '—'}
                />
                <StatCell
                  label="CHORDS"
                  value={result ? String(chordCount).padStart(2, '0') : '—'}
                />
                <StatCell
                  label="LOOP"
                  value={result ? loopDisplay : '—'}
                  valueColor={result?.loop.found ? PALETTE.amber : PALETTE.textMain}
                  title={
                    result?.loop.found
                      ? `The piece repeats a ${result.loop.barCount}-bar pattern ${result.loop.repeats} times.`
                      : 'No clear repeating loop was found (through-composed, or the clip is too short).'
                  }
                />
              </div>
              <div
                className="grid"
                style={{ gridTemplateColumns: '1fr 1fr', gap: '1px', background: PALETTE.line, borderTop: `1px solid ${PALETTE.line}` }}
              >
                <StatCell
                  label="TRIM START"
                  value={result ? formatMmSs(trimStart) : '—'}
                />
                <StatCell
                  label="EXPORT WINDOW"
                  value={result ? `${exportDurationSec.toFixed(1)}s` : '—'}
                  valueColor={isSelectionTrimmed ? PALETTE.amber : PALETTE.textMain}
                />
              </div>
              <div
                className="grid"
                style={{
                  gridTemplateColumns: '1fr 1fr 1fr 1fr',
                  gap: '1px',
                  background: PALETTE.line,
                  borderTop: `1px solid ${PALETTE.line}`,
                }}
              >
                <StatCell
                  label="KEY (KK)"
                  value={
                    result
                      ? `${result.estimatedKey.label} · ${(result.estimatedKey.confidence * 100).toFixed(0)}%`
                      : '—'
                  }
                  valueColor={
                    result
                      ? result.estimatedKey.confidence > 0.65
                        ? PALETTE.amber
                        : PALETTE.textMain
                      : PALETTE.textMuted
                  }
                />
                <StatCell
                  label="UNIQUE CHORDS"
                  value={result ? String(result.uniqueChordCount).padStart(2, '0') : '—'}
                />
                <StatCell
                  label="LEAD NOTES"
                  value={
                    result
                      ? `${String(clippedLeadNotes.length).padStart(3, '0')}${
                          isSelectionTrimmed && result.leadNotes.length !== clippedLeadNotes.length
                            ? ` / ${result.leadNotes.length}`
                            : ''
                        }`
                      : '—'
                  }
                  valueColor={
                    result && clippedLeadNotes.length > 0 ? PALETTE.amber : PALETTE.textMain
                  }
                />
                <StatCell
                  label="INPUT TYPE"
                  value={result ? result.inputType.toUpperCase() : '—'}
                  valueColor={result?.inputType === 'midi' ? PALETTE.amber : PALETTE.textMain}
                />
              </div>
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

function StatCell({
  label,
  value,
  valueColor,
  title,
}: {
  label: string
  value: string
  valueColor?: string
  /** Optional hover hint explaining the stat in plain words. */
  title?: string
}) {
  return (
    <div
      className="flex items-center justify-between px-6 py-4"
      style={{ background: PALETTE.surface }}
      title={title}
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

/**
 * Output check panel — a pass / warn report on the exported MIDI's quality, rendered
 * after every analysis. Plain-words labels and a readable detail line (no 9px all-caps),
 * per the `clear-ui-labels` skill. A single coloured dot per row carries the status.
 */
function OutputCheckPanel({ report }: { report: ValidationReport }) {
  const allOk = report.warnCount === 0
  return (
    <div
      className="flex flex-col"
      style={{ background: PALETTE.surface }}
    >
      <div
        className="flex items-center justify-between px-6 py-3 text-[10px] uppercase tracking-[0.15em]"
        style={{ color: PALETTE.textMuted }}
      >
        <span>OUTPUT CHECK</span>
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            color: allOk ? PALETTE.green : PALETTE.amber,
          }}
        >
          {report.passCount}/{report.checks.length} OK
        </span>
      </div>
      <div className="flex flex-col px-6 pb-3">
        {report.checks.map(c => (
          <div key={c.id} className="flex items-start gap-3 py-1.5">
            <span
              aria-hidden
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: c.status === 'pass' ? PALETTE.green : PALETTE.amber,
                marginTop: 5,
                flexShrink: 0,
              }}
            />
            <div className="flex flex-col">
              <span className="text-[11px]" style={{ color: PALETTE.textMain }}>
                {c.label}
              </span>
              <span
                className="text-[10px] leading-snug tracking-normal"
                style={{ color: PALETTE.textMuted }}
              >
                {c.detail}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Slider cell in GRAY2020 style — label + live value readout above a hairline
 * range slider. The slider thumb tints amber when the value differs from the
 * column's midpoint (so it's obvious you've moved off the default).
 */
function SliderCell({
  label,
  hint,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (n: number) => void
}) {
  const mid = (min + max) / 2
  const moved = Math.abs(value - mid) > (max - min) * 0.05
  return (
    <div
      className="flex flex-col justify-between gap-2 px-6 py-4"
      style={{ background: PALETTE.surface, minHeight: 80 }}
    >
      <div className="flex items-baseline justify-between">
        <span
          className="text-[10px] uppercase tracking-[0.1em]"
          style={{ color: PALETTE.textMuted }}
        >
          {label}
        </span>
        <span
          className="text-[13px] tabular-nums"
          style={{
            fontFamily: "'DM Mono', monospace",
            color: moved ? PALETTE.amber : PALETTE.textMain,
          }}
        >
          {value}
          {suffix ? <span style={{ color: PALETTE.textMuted, marginLeft: 2 }}>{suffix}</span> : null}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={e => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
        className="h-1 w-full appearance-none"
        style={{
          background: PALETTE.line,
          accentColor: PALETTE.amber,
        }}
        aria-label={`${label} slider`}
      />
      {hint ? (
        <span
          className="text-[10px] leading-snug tracking-normal"
          style={{ color: PALETTE.textMuted, fontFamily: "'DM Mono', monospace" }}
        >
          {hint}
        </span>
      ) : null}
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

/**
 * Pretty-midi style pitch-class histogram — 12 bars labelled C → B. The
 * detected tonic (rootPc) is highlighted in amber so the key estimate is
 * cross-readable against the raw note distribution.
 */
function PitchClassHistogram({ values, rootPc }: { values: number[]; rootPc: number }) {
  const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const
  const max = Math.max(0.0001, ...values)
  return (
    <div className="flex items-end gap-1" style={{ height: 60 }}>
      {values.map((v, i) => {
        const h = Math.max(2, (v / max) * 56)
        const isTonic = i === rootPc
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full"
              style={{
                height: `${h}px`,
                background: isTonic
                  ? `linear-gradient(to top, ${PALETTE.amber}, rgba(245,166,35,0.35))`
                  : `linear-gradient(to top, ${PALETTE.line}, rgba(112,112,117,0.25))`,
                boxShadow: isTonic ? `0 0 8px ${PALETTE.amberGlow}` : 'none',
                transition: 'height 0.3s ease',
              }}
              title={`${NAMES[i]} ${(v * 100).toFixed(1)}%`}
            />
            <span
              className="text-[9px] tracking-[0.05em]"
              style={{
                color: isTonic ? PALETTE.amber : PALETTE.textMuted,
                fontFamily: "'DM Mono', monospace",
              }}
            >
              {NAMES[i]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

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
