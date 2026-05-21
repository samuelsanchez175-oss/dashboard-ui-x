import { ArrowLeft, Bell, Loader2, Upload } from 'lucide-react'
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
  applyChordCorrections,
  buildChordMidiBlob,
  clipChordSegmentsForExport,
  clipLeadNotesForExport,
  consolidateToLoop,
  NEURALNOTE_STYLE,
  NEURALNOTE_TIME_DIVISION_LABELS,
  parseKeyLabel,
  validateChordOutput,
  type AuditReport,
  type ChordAnalysisResult,
  type NeuralNoteStyleMelodyPostInput,
  type ValidationReport,
} from './chord-detector-engine'
/* StudioToolsHeader removed — its back button / Local-Connected pill / bell
 * are now baked into the page's primary header below so we don't have two
 * stacked nav strips doing the same job. */

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
/**
 * Bump when persisted shape or baseline defaults change; older versions get
 * dropped on read and re-initialised from the current `NEURALNOTE_STYLE`
 * defaults. v3: relaxed quantizeForce 1.0 → 0.3 and minNoteDurationMs 120 → 50
 * to fix over-quantization that was preventing organic timing in exports.
 */
const MELODY_POST_UI_SCHEMA_V = 3 as const

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
  /* Phase 2 — AI Polish (Gemini). State for the on-demand LLM assessment.
   * `aiBusy` blocks repeat clicks while a request is in flight. `aiResult`
   * is either the parsed Gemini response or an error message. Both reset
   * on every fresh analysis (file drop / RE-RUN CLIP).
   *
   * `aiAppliedSnapshot` is the pre-polish `result` snapshot, kept around so
   * REVERT can restore it after APPLY has rewritten segment labels / the
   * estimated key. `null` when polish hasn't been applied yet. */
  const [aiBusy, setAiBusy] = useState(false)
  const [aiResult, setAiResult] = useState<
    | { ok: true; summary: string; suggestedKey: string | null; inferredStyle: string | null; chordCorrections: Array<{ segmentIndex: number; currentLabel: string; suggestedLabel: string; rationale: string }>; missingPCs: string[] }
    | { ok: false; message: string }
    | null
  >(null)
  const [aiAppliedSnapshot, setAiAppliedSnapshot] = useState<
    { before: ChordAnalysisResult; afterApply: ChordAnalysisResult } | null
  >(null)

  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [trimCommitted, setTrimCommitted] = useState(false)

  const [dragHover, setDragHover] = useState(false)

  /** Default on: stricter BP + export path for piano / single-line lead (toggle off for denser poly). */
  const [pianoLeadFocus, setPianoLeadFocus] = useState(true)

  /**
   * RAW MODE — bypass every post-processing stage (HPSS, register-stratified
   * BP, export cleanup chain, CQT validation, structure quantization,
   * chord-implied notes). When ON the export is whatever Basic Pitch
   * produced with only the bare same-pitch merge. Used to A/B the
   * full pipeline against the unfiltered baseline; see
   * `docs/chord-detector-test-ledger.md` for the methodology.
   */
  const [rawMode, setRawMode] = useState(false)

  /**
   * BASS SOURCE — which transcriber owns the bass register (midi < 48).
   *   'bp'  → Basic Pitch's polyphonic output (the default; what every prior
   *           commit shipped). Known weak on dense bass material.
   *   'yin' → YIN monophonic pitch tracker on a low-pass-filtered harmonic
   *           stem. Phase 3 of the test-ledger roadmap — see
   *           `docs/chord-detector-phase-3-crepe-plan.md`.
   */
  const [bassSource, setBassSource] = useState<'bp' | 'yin'>('bp')

  /** Last dropped file — kept so the RE-RUN CLIP button can re-process the
   * same clip with updated settings without the user re-dropping it. */
  const lastFileRef = useRef<File | null>(null)

  /** One localStorage read per mount. Returns null for any schema version
   *  other than 1 (migrated forward) or the current `MELODY_POST_UI_SCHEMA_V`,
   *  so persisted state from prior "full quantize" defaults gets re-initialised
   *  from the relaxed defaults. */
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
  /**
   * EXTRACT LOOP toggle. Default off — the export shows the full pipeline output.
   * When on AND a loop was detected, `effectiveLeadNotes` swaps in the canonical
   * P-bar window produced by `consolidateToLoop`, and the rest of the page (preview,
   * piano roll, MIDI export, copy progression) follows along.
   */
  const [extractLoopActive, setExtractLoopActive] = useState(false)
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

  /* When EXTRACT LOOP toggles, reset the trim to match the new effective duration —
   * trimEnd from the full track is meaningless inside a 2-bar loop window and vice
   * versa. Without this the user would see a confusingly truncated piano roll. */
  useEffect(() => {
    if (!result) return
    setTrimStart(0)
    setTrimEnd(extractLoopActive && result.loop.found ? result.loop.barCount * result.loop.barSec : result.durationSec)
    setTrimCommitted(false)
  }, [extractLoopActive, result])

  /**
   * Effective lead notes — what the export, preview, piano roll and copy-progression
   * all use. Default: the full pipeline output. When EXTRACT LOOP is active AND the
   * analysis found a loop, swap in the canonical P-bar window (stage 15 on demand).
   */
  const effectiveLeadNotes = useMemo(() => {
    if (!result) return []
    if (extractLoopActive && result.loop.found) {
      return consolidateToLoop(result.leadNotes, result.loop, result.bpm)
    }
    return result.leadNotes
  }, [result, extractLoopActive])

  /** Effective duration mirrors `effectiveLeadNotes`: full track or one canonical loop. */
  const effectiveDurationSec = useMemo(() => {
    if (!result) return 0
    if (extractLoopActive && result.loop.found) {
      return result.loop.barCount * result.loop.barSec
    }
    return result.durationSec
  }, [result, extractLoopActive])

  const exportDurationSec = result ? Math.max(0, trimEnd - trimStart) : 0
  const isSelectionTrimmed = result ? exportDurationSec < effectiveDurationSec - 0.08 : false

  const clippedSegments = useMemo(() => {
    if (!result) return []
    return clipChordSegmentsForExport(result.segments, trimStart, trimEnd, effectiveDurationSec)
  }, [result, effectiveDurationSec, trimStart, trimEnd])

  const clippedLeadNotes = useMemo(() => {
    if (!result) return []
    return clipLeadNotesForExport(effectiveLeadNotes, trimStart, trimEnd, effectiveDurationSec)
  }, [result, effectiveLeadNotes, effectiveDurationSec, trimStart, trimEnd])

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

  const runFile = useCallback(async (file: File) => {
    lastFileRef.current = file
    setBusy(true)
    setError(null)
    setFileName(file.name)
    setResult(null)
    /* Fresh analysis — drop any prior AI POLISH response + applied snapshot
     * so the panel disappears until the user clicks AI POLISH again. */
    setAiResult(null)
    setAiAppliedSnapshot(null)
    try {
      const r = await analyzeChordProgressionFromBlob(file, {
        melodyPost: melodyPostInput,
        pianoLeadFocus,
        /* RAW MODE pipes through to the engine's analysisMode flag — when on,
         * every post-processing stage is skipped and BP's native output is
         * returned with only the bare same-pitch merge. */
        analysisMode: rawMode ? 'raw' : 'full',
        /* BASS SOURCE — when 'yin', the engine swaps BP's bass output for
         * a YIN monophonic pitch tracker (Phase 3). RAW mode forces BP. */
        bassSource: rawMode ? 'bp' : bassSource,
      })
      setResult(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed.')
    } finally {
      setBusy(false)
    }
  }, [melodyPostInput, pianoLeadFocus, rawMode, bassSource])

  /* DEV-only benchmark hook — exposes a direct call into the engine that
   * bypasses the React UI so the phase-test harness in
   * `scripts/chord-detector-bench.mjs` can A/B configurations without having
   * to drive toggles + file drops through the browser. Accepts a `Blob`
   * (audio or MIDI) + the same `ChordDetectorAnalyzeOptions` shape the page
   * uses, returns the full `ChordAnalysisResult` (plus a serialized MIDI
   * buffer so the harness can save the export to disk). No-op in production
   * builds; the function is removed from `window` on unmount. */
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const benchKey = '__chordDetectorBench' as const
    type BenchInput = Blob & { size: number }
    type BenchResponse =
      | {
          ok: true
          /** Full pipeline result for inspection. */
          result: ChordAnalysisResult
          /**
           * Notes-only single-track MIDI rendered from `result.leadNotes`.
           * Serialized as a base64 string so the harness can write to disk
           * without needing transferable types over playwright's CDP bridge.
           */
          midiBase64: string
          /** Wall-clock duration of the analyze call in ms. */
          elapsedMs: number
        }
      | { ok: false; message: string }
    const fn = async (
      blob: BenchInput,
      options?: ChordDetectorAnalyzeOptions,
    ): Promise<BenchResponse> => {
      try {
        const t0 = performance.now()
        const r = await analyzeChordProgressionFromBlob(blob, options)
        const elapsedMs = performance.now() - t0
        const midiBlob = buildChordMidiBlob(r.segments, r.bpm, r.leadNotes)
        const midiBuf = new Uint8Array(await midiBlob.arrayBuffer())
        let midiBase64 = ''
        const chunkSize = 0x8000
        for (let i = 0; i < midiBuf.length; i += chunkSize) {
          midiBase64 += String.fromCharCode(...midiBuf.subarray(i, i + chunkSize))
        }
        midiBase64 = btoa(midiBase64)
        return { ok: true, result: r, midiBase64, elapsedMs }
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        }
      }
    }
    ;(globalThis as unknown as Record<string, unknown>)[benchKey] = fn
    return () => {
      delete (globalThis as unknown as Record<string, unknown>)[benchKey]
    }
  }, [])

  /* Auto-rerun on setting changes removed by user request — pianoLeadFocus
   * toggle and the (now-hidden) MELODY POST sliders no longer trigger a new
   * analysis on change. The RE-RUN CLIP button in the controls row is the
   * only path to re-analyze with updated settings. The first analysis still
   * happens on file drop / dock import, as before.
   *
   * Skip refs that gated the old auto-rerun (`skipPianoLeadReanalyzeRef`,
   * `skipMelodyPostReanalyzeRef`) are no longer referenced — they can be
   * deleted alongside this comment if a cleanup pass wants them gone, but
   * leaving them in keeps the diff minimal. */

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
    setTrimEnd(effectiveDurationSec)
    setTrimCommitted(false)
  }, [result, effectiveDurationSec])

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
   * Schedule one pass of the preview through the piano engine. The preview must match
   * what `buildChordMidiBlob` actually exports: when lead notes exist (the preferred
   * branch), play ONLY the lead-note track; otherwise fall back to chord triads built
   * from the segments (the legacy branch). No more chord pad stacked on top of the
   * lead — that double-play was producing two sounds at once.
   */
  const schedulePreviewPass = useCallback((): number => {
    if (!result) return 0

    const notes: { midi: number; start: number; duration: number; velocity: number }[] = []
    let totalDuration = 0

    if (clippedLeadNotes.length > 0) {
      // Preferred branch: play only the lead-note track — the exact notes the export writes.
      for (const n of clippedLeadNotes) {
        notes.push({
          midi: n.midi,
          start: n.startSec,
          duration: Math.max(0.06, Math.min(n.durationSec, 2.5)),
          velocity: Math.max(0.35, Math.min(1, n.velocity * 0.9)),
        })
        totalDuration = Math.max(totalDuration, n.startSec + n.durationSec)
      }
    } else if (clippedSegments.length > 0) {
      // Legacy fallback: no lead notes (very short clip / MIDI-only path) — match the
      // export's segment-triad branch by synthesising the same triads here.
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
            velocity: 0.7,
          })
        }
        totalDuration = Math.max(totalDuration, seg.startSec + seg.durationSec)
      }
    }

    if (notes.length === 0) return 0

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
    if (!result || (clippedLeadNotes.length === 0 && clippedSegments.length === 0)) return
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
    if (!result || (clippedLeadNotes.length === 0 && clippedSegments.length === 0)) return
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

  /**
   * Per-track MIDI export — Lead / Harmony / Bass. The v2 register-stratified
   * BP path splits final notes into three midi-range buckets (≥60 / 48-59 / <48);
   * each track exports as a standalone .mid so the user can drop just the bass
   * line, just the melody, etc. into their DAW. When the legacy single-pass
   * path runs (e.g. MIDI input), only the lead track will have notes.
   */
  const downloadTrack = useCallback(
    (track: 'lead' | 'harmony' | 'bass') => {
      if (!result) return
      const source =
        track === 'lead' ? result.leadTrack : track === 'harmony' ? result.harmonyTrack : result.bassTrack
      if (source.length === 0) return
      const clipped = clipLeadNotesForExport(source, trimStart, trimEnd, effectiveDurationSec)
      if (clipped.length === 0) return
      /* No chord-segment track on per-register exports — those are pure note
       * streams for the user to layer in whatever DAW pattern they want. */
      const blob = buildChordMidiBlob([], result.bpm, clipped)
      const base = (fileName ?? 'clip').replace(/\.[^/.]+$/, '')
      const tag = isSelectionTrimmed ? '-trim' : ''
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${base}-${track}${tag}.mid`
      a.click()
      URL.revokeObjectURL(url)
    },
    [result, trimStart, trimEnd, effectiveDurationSec, fileName, isSelectionTrimmed],
  )

  /**
   * Phase 2 — AI POLISH. Send the analysis to Gemini for a session-musician
   * style assessment + chord corrections. One call per click; result lands in
   * a new panel below AUDIT. Async-imported so the LLM module's network code
   * isn't pulled into the initial bundle.
   */
  const runAiPolish = useCallback(async () => {
    if (!result || aiBusy) return
    setAiBusy(true)
    setAiResult(null)
    try {
      const { polishChordResult } = await import('./chord-detector-llm-polish')
      const out = await polishChordResult(result)
      setAiResult(out)
    } catch (err) {
      setAiResult({
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setAiBusy(false)
    }
  }, [result, aiBusy])

  /* Why no useEffect-on-result here: APPLY and REVERT both mutate `result`
   * intentionally, and any effect watching `result` would wrongly clear
   * polish state on those code paths. Polish reset is therefore done
   * explicitly at the two real "fresh analysis" sites: `runFile` (file drop
   * / RE-RUN CLIP) and `reset` (RESET button). */

  /**
   * APPLY the polish suggestions to the displayed analysis. Mutates
   * `result.segments` (per-chord label corrections) and `result.estimatedKey`
   * (when the LLM gave a non-null `suggestedKey`). Stashes the pre-apply
   * result so REVERT can restore it. The piano-roll component renders
   * `leadNotes` (the recorded melody) — those don't change here, but the
   * progression text, KEY hero stat, chord-MIDI export, and AUDIT panel all
   * re-derive from segments / estimatedKey, so the user sees the polish
   * propagate everywhere it should.
   */
  const applyAiPolish = useCallback(() => {
    if (!result || !aiResult || !aiResult.ok) return
    if (aiAppliedSnapshot) return // already applied — nothing to do until REVERT
    const nextSegments = applyChordCorrections(result.segments, aiResult.chordCorrections)
    const nextKey =
      (aiResult.suggestedKey && parseKeyLabel(aiResult.suggestedKey)) || result.estimatedKey
    const nextResult: ChordAnalysisResult = {
      ...result,
      segments: nextSegments,
      estimatedKey: nextKey,
    }
    setAiAppliedSnapshot({ before: result, afterApply: nextResult })
    setResult(nextResult)
  }, [result, aiResult, aiAppliedSnapshot])

  /** REVERT to the pre-polish snapshot. No-op if APPLY was never clicked. */
  const revertAiPolish = useCallback(() => {
    if (!aiAppliedSnapshot) return
    setResult(aiAppliedSnapshot.before)
    setAiAppliedSnapshot(null)
  }, [aiAppliedSnapshot])

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
    /* RESET also drops the polish state — no analysis means no panel. */
    setAiResult(null)
    setAiAppliedSnapshot(null)
  }, [])

  /* ── Derived display values ── */
  const bpmDisplay = result ? String(result.bpm).padStart(3, '0') : '---'
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}
    >
      <div className="flex-1 overflow-auto" style={{ background: PALETTE.bg }}>
        <div className="mx-auto flex w-full flex-col">
          <div
            className="flex w-full flex-1 flex-col"
            style={{
              gap: '1px',
              background: PALETTE.line,
            }}
          >
            {/* ── Header ── merged from the previous double-bar setup.
                 Left: back arrow.
                 Center: tool title — flips to the uploaded file name when one is loaded.
                 Right: LOCAL · CONNECTED pill, notification bell, RESET. */}
            <header
              className="flex items-center justify-between gap-3 px-6 py-3"
              style={{ background: PALETTE.surface }}
            >
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate('tools-hub')}
                  aria-label="Back to Tools Hub"
                  className="rounded-md p-1.5 transition-colors"
                  style={{
                    border: `1px solid ${PALETTE.line}`,
                    color: PALETTE.textMain,
                    background: 'transparent',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = PALETTE.bg)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <ArrowLeft className="size-4" strokeWidth={2} />
                </button>
                <span
                  className="truncate text-[13px] uppercase tracking-[0.18em]"
                  style={{
                    color: fileName ? PALETTE.textMain : PALETTE.textMuted,
                    fontFamily: "'DM Mono', monospace",
                  }}
                  title={fileName ?? 'Chord Detector'}
                >
                  {fileName ?? 'Chord Detector'}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.15em]"
                  style={{
                    background: 'color-mix(in oklab, #54C98E 16%, transparent)',
                    color: PALETTE.green,
                    border: `1px solid color-mix(in oklab, ${PALETTE.green} 35%, transparent)`,
                    fontFamily: "'DM Mono', monospace",
                  }}
                >
                  <span
                    className="inline-block size-1.5 animate-pulse rounded-full"
                    style={{ background: PALETTE.green }}
                    aria-hidden
                  />
                  Local · connected
                </span>
                <button
                  type="button"
                  aria-label="Notifications (placeholder)"
                  className="rounded-md p-1.5 transition-colors"
                  style={{
                    border: `1px solid ${PALETTE.line}`,
                    color: PALETTE.textMain,
                    background: 'transparent',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = PALETTE.bg)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <Bell className="size-[14px]" strokeWidth={1.8} />
                </button>
                <PillButton label="RESET" onClick={reset} />
              </div>
            </header>

            {/* ── Hero — 3-stat strip (BPM / KEY / SCALE) replaces the old big-BPM
                 display. Each cell is a labeled stat. The BASIC PITCH vertical
                 column is gone; status text moves under the stats. ── */}
            <section
              className="grid"
              style={{
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '1px',
                background: PALETTE.line,
              }}
            >
              <HeroStat
                label="TEMPO · BPM"
                value={result ? String(result.bpm) : '—'}
                detail={
                  result?.bpmSource === 'tags'
                    ? 'from tags'
                    : result?.bpmSource === 'bpm-prior'
                      ? 'bpm prior'
                      : result
                        ? 'estimated'
                        : busy
                          ? 'reading…'
                          : 'idle'
                }
                busy={busy}
              />
              <HeroStat
                label="KEY"
                value={
                  result?.estimatedKey.confidence && result.estimatedKey.confidence > 0.3
                    ? result.estimatedKey.label
                    : '—'
                }
                detail={
                  result?.estimatedKey.confidence
                    ? `${Math.round(result.estimatedKey.confidence * 100)}% conf`
                    : busy
                      ? 'reading…'
                      : 'idle'
                }
                busy={busy}
              />
              <HeroStat
                label="SCALE · MODE"
                value={
                  result?.estimatedKey.mode && result.estimatedKey.mode !== 'unknown'
                    ? result.estimatedKey.mode.toUpperCase()
                    : '—'
                }
                detail={
                  result?.uniqueChordCount
                    ? `${result.uniqueChordCount} chord${result.uniqueChordCount === 1 ? '' : 's'}`
                    : busy
                      ? 'reading…'
                      : 'idle'
                }
                busy={busy}
              />
            </section>

            {/* Transcription passage + piano-lead-focus checkbox removed —
                the toggle is now a button in the controls row below. */}

            {/* ── Controls — 4-column × 2-row grid (8 cells) so labels never wrap.
                 Row 1 (playback + trim group):
                   PREVIEW · LOOP · APPLY TRIM · RESET TRIM
                 Row 2 (output group):
                   EXPORT MIDI · EXTRACT LOOP · COPY PROGRESSION · spacer
                 EXTRACT LOOP is opt-in stage-15 consolidation — pulls a 2-bar
                 canonical window out of the full-track output. ── */}
            <section
              className="grid"
              style={{
                /* 4 cols × 4 rows = 16 cells. Layout:
                 *   Row 1 (playback + trim):  PREVIEW · LOOP · APPLY TRIM · RESET TRIM
                 *   Row 2 (per-track export): EXPORT LEAD · EXPORT HARMONY · EXPORT BASS · EXPORT ALL
                 *   Row 3 (extras):           EXTRACT LOOP · COPY PROG. · PIANO/LEAD · RE-RUN CLIP
                 *   Row 4 (experimental):     AI POLISH + 3 spacers (LLM post-pass via Gemini) */
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                gap: '1px',
                background: PALETTE.line,
              }}
            >
              <ControlButton
                active={previewing}
                disabled={!result || (clippedLeadNotes.length === 0 && clippedSegments.length === 0)}
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
                        borderLeft: `6px solid ${!result || (clippedLeadNotes.length === 0 && clippedSegments.length === 0) ? PALETTE.textMuted : PALETTE.textMain}`,
                      }}
                      aria-hidden
                    />
                  )
                }
                label={previewing ? 'PAUSE' : 'PREVIEW'}
              />
              <ControlButton
                active={looping}
                disabled={!result || (clippedLeadNotes.length === 0 && clippedSegments.length === 0)}
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
                        : !result || (clippedLeadNotes.length === 0 && clippedSegments.length === 0)
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
                /* RESET TRIM sits next to APPLY TRIM — they're a pair. */
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
              {/* ── Row 2: per-track + combined MIDI exports ──
                   The v2 multi-pass BP splits final notes into 3 tracks (Lead /
                   Harmony / Bass) by midi register; each gets its own export
                   button so the user can drop just the melody or just the bass
                   line into their DAW. EXPORT ALL is the legacy single-file
                   export (lead + harmony + bass + chord segments merged). */}
              <ControlButton
                active={false}
                disabled={!result || (result.leadTrack?.length ?? 0) === 0}
                onClick={() => downloadTrack('lead')}
                icon={<DownloadGlyph color={!result || (result.leadTrack?.length ?? 0) === 0 ? PALETTE.textMuted : PALETTE.textMain} />}
                label={`EXPORT LEAD${result?.leadTrack?.length ? ` · ${result.leadTrack.length}` : ''}`}
              />
              <ControlButton
                active={false}
                disabled={!result || (result.harmonyTrack?.length ?? 0) === 0}
                onClick={() => downloadTrack('harmony')}
                icon={<DownloadGlyph color={!result || (result.harmonyTrack?.length ?? 0) === 0 ? PALETTE.textMuted : PALETTE.textMain} />}
                label={`EXPORT HARMONY${result?.harmonyTrack?.length ? ` · ${result.harmonyTrack.length}` : ''}`}
              />
              <ControlButton
                active={false}
                disabled={!result || (result.bassTrack?.length ?? 0) === 0}
                onClick={() => downloadTrack('bass')}
                icon={<DownloadGlyph color={!result || (result.bassTrack?.length ?? 0) === 0 ? PALETTE.textMuted : PALETTE.textMain} />}
                label={`EXPORT BASS${result?.bassTrack?.length ? ` · ${result.bassTrack.length}` : ''}`}
              />
              <ControlButton
                active={false}
                disabled={!result || (clippedLeadNotes.length === 0 && clippedSegments.length === 0)}
                onClick={downloadMidi}
                icon={<DownloadGlyph color={!result || (clippedLeadNotes.length === 0 && clippedSegments.length === 0) ? PALETTE.textMuted : PALETTE.textMain} />}
                label="EXPORT ALL"
              />
              {/* EXTRACT LOOP — applies stage-15 consolidation on demand. Disabled when
                  no loop was detected. Active state shows amber to mirror LOOP playback's
                  "engaged" look. Clicking again returns the export to the full track. */}
              <ControlButton
                active={extractLoopActive}
                disabled={!result || !result.loop.found}
                onClick={() => setExtractLoopActive(v => !v)}
                icon={
                  (() => {
                    const tint =
                      extractLoopActive
                        ? PALETTE.amber
                        : !result || !result.loop.found
                          ? PALETTE.textMuted
                          : PALETTE.textMain
                    return (
                      <span
                        className="block"
                        style={{
                          width: 12,
                          height: 7,
                          borderTop: `2px solid ${tint}`,
                          borderBottom: `2px solid ${tint}`,
                          borderLeft: `1px solid ${tint}`,
                          borderRight: `1px solid ${tint}`,
                        }}
                        aria-hidden
                      />
                    )
                  })()
                }
                label={extractLoopActive ? 'LOOP · ACTIVE' : 'EXTRACT LOOP'}
              />
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
              {/* Piano / lead focus — toggle that lives next to COPY PROGRESSION.
                  Active state amber-on-dark, inactive muted. The label intentionally
                  spells out the trade-off because users will see this button often. */}
              <ControlButton
                active={pianoLeadFocus}
                disabled={false}
                onClick={() => setPianoLeadFocus(v => !v)}
                icon={
                  <span
                    className="block size-2"
                    style={{
                      background: pianoLeadFocus ? PALETTE.amber : PALETTE.textMuted,
                      borderRadius: '50%',
                    }}
                    aria-hidden
                  />
                }
                label={pianoLeadFocus ? 'PIANO / LEAD · ON' : 'PIANO / LEAD'}
              />
              {/* Re-run clip — green-on-dark so it stands out as the "redo with
                  changed settings" action. Disabled until a clip has been run. */}
              <button
                type="button"
                disabled={!lastFileRef.current || busy}
                onClick={() => {
                  const f = lastFileRef.current
                  if (f) void runFile(f)
                }}
                className="flex items-center justify-center gap-2 py-5 text-[11px] uppercase tracking-[0.2em] transition-colors disabled:cursor-not-allowed"
                style={{
                  background: PALETTE.surface,
                  color: !lastFileRef.current || busy ? PALETTE.textMuted : PALETTE.green,
                  border: `1px solid ${
                    !lastFileRef.current || busy ? PALETTE.line : PALETTE.green
                  }`,
                  opacity: !lastFileRef.current || busy ? 0.5 : 1,
                }}
              >
                <span
                  className="block size-2"
                  style={{
                    background: !lastFileRef.current || busy ? PALETTE.textMuted : PALETTE.green,
                    borderRadius: '50%',
                  }}
                  aria-hidden
                />
                RE-RUN CLIP
              </button>
              {/* ── Row 4 (experimental): AI POLISH · RAW MODE · 2 spacers ── */}
              <button
                type="button"
                disabled={!result || aiBusy}
                onClick={() => void runAiPolish()}
                title="Send the detected progression to Gemini for a session-musician-style assessment + chord corrections."
                className="flex items-center justify-center gap-2 py-5 text-[11px] uppercase tracking-[0.2em] transition-colors disabled:cursor-not-allowed"
                style={{
                  background: PALETTE.surface,
                  color: !result || aiBusy ? PALETTE.textMuted : PALETTE.amber,
                  border: `1px solid ${!result || aiBusy ? PALETTE.line : PALETTE.amber}`,
                  opacity: !result ? 0.5 : 1,
                }}
              >
                <span
                  className="block size-2"
                  style={{
                    background: !result || aiBusy ? PALETTE.textMuted : PALETTE.amber,
                    borderRadius: '50%',
                  }}
                  aria-hidden
                />
                {aiBusy ? 'AI POLISHING…' : '🤖 AI POLISH'}
              </button>
              {/* RAW MODE — bypass every post-processing stage. When on, the
                  next analysis returns BP's native output (only same-pitch
                  merge applied). Toggle, then RE-RUN CLIP (or drop a fresh
                  file) to see the effect. */}
              <button
                type="button"
                onClick={() => setRawMode(v => !v)}
                title={
                  rawMode
                    ? 'RAW MODE is ON — next analysis bypasses HPSS, register passes, CQT, structure, chord-imply. Click to disable.'
                    : 'RAW MODE is OFF — full pipeline is running. Click to enable raw (BP-only) output for the next analysis.'
                }
                aria-pressed={rawMode}
                className="flex items-center justify-center gap-2 py-5 text-[11px] uppercase tracking-[0.2em] transition-colors"
                style={{
                  background: rawMode ? PALETTE.amberGlow : PALETTE.surface,
                  color: rawMode ? PALETTE.amber : PALETTE.textMain,
                  border: `1px solid ${rawMode ? PALETTE.amber : PALETTE.line}`,
                }}
              >
                <span
                  className="block size-2"
                  style={{
                    background: rawMode ? PALETTE.amber : 'transparent',
                    borderRadius: '50%',
                    border: rawMode ? 'none' : `1px solid ${PALETTE.textMain}`,
                  }}
                  aria-hidden
                />
                RAW MODE · {rawMode ? 'ON' : 'OFF'}
              </button>
              {/* BASS SOURCE — toggle the bass register transcriber.
                  BP (default) keeps Basic Pitch's polyphonic output on
                  midi < 48. YIN runs a dedicated monophonic pitch tracker
                  on a low-pass-filtered version of the harmonic stem and
                  replaces the bass slice with its output. Phase 3 of the
                  pipeline roadmap. Disabled when RAW MODE is on (raw
                  forces BP-only). */}
              <button
                type="button"
                disabled={rawMode}
                onClick={() => setBassSource(v => v === 'bp' ? 'yin' : 'bp')}
                title={
                  rawMode
                    ? 'BASS SOURCE is locked to BP while RAW MODE is on.'
                    : bassSource === 'yin'
                      ? 'BASS is using YIN (monophonic tracker on low-passed harmonic stem). Click to switch back to BP.'
                      : 'BASS is using Basic Pitch (polyphonic). Click to switch to YIN — a monophonic tracker that often beats BP on bass lines.'
                }
                aria-pressed={bassSource === 'yin'}
                className="flex items-center justify-center gap-2 py-5 text-[11px] uppercase tracking-[0.2em] transition-colors disabled:cursor-not-allowed"
                style={{
                  background: bassSource === 'yin' && !rawMode ? PALETTE.amberGlow : PALETTE.surface,
                  color: rawMode ? PALETTE.textMuted : (bassSource === 'yin' ? PALETTE.amber : PALETTE.textMain),
                  border: `1px solid ${rawMode ? PALETTE.line : (bassSource === 'yin' ? PALETTE.amber : PALETTE.line)}`,
                  opacity: rawMode ? 0.5 : 1,
                }}
              >
                <span
                  className="block size-2"
                  style={{
                    background: bassSource === 'yin' && !rawMode ? PALETTE.amber : 'transparent',
                    borderRadius: '50%',
                    border: bassSource === 'yin' && !rawMode ? 'none' : `1px solid ${rawMode ? PALETTE.textMuted : PALETTE.textMain}`,
                  }}
                  aria-hidden
                />
                BASS · {bassSource === 'yin' ? 'YIN' : 'BP'}
              </button>
              <div aria-hidden style={{ background: PALETTE.surface }} />
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

            {/* MELODY POST removed — its Re-run clip button is now in the
                controls row, and the slider knobs are intentionally hidden
                in this build (defaults are tuned). Re-add as an Advanced
                drawer later if needed. */}
            {false && (
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
                      borderColor: PALETTE.green,
                      color: PALETTE.green,
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
            )}

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
                  /* When EXTRACT LOOP is active, hand the piano roll an "as-if loop"
                   * view of the analysis: same chord segments + key + bpm, but the
                   * lead notes and duration come from the consolidated P-bar window
                   * so what the user sees matches what gets exported. */
                  result={
                    extractLoopActive && result.loop.found
                      ? { ...result, leadNotes: effectiveLeadNotes, durationSec: effectiveDurationSec }
                      : result
                  }
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

            {/* ── Audit — checks the output against the source: missing notes, loop quality, key/BPM/scale ── */}
            {result ? <AuditPanel report={result.audit} /> : null}

            {/* ── AI POLISH — Gemini's structured assessment of the progression.
                 Only rendered after the user clicks AI POLISH (aiResult lands
                 in state). Shows the summary + suggested key + style hint +
                 per-chord corrections + LLM-inferred missing PCs. APPLY
                 rewrites segment labels + the estimated key in-place; REVERT
                 restores the pre-apply snapshot. ── */}
            {aiResult ? (
              <AiPolishPanel
                result={aiResult}
                applied={!!aiAppliedSnapshot}
                onApply={applyAiPolish}
                onRevert={revertAiPolish}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── GRAY2020 sub-components ─────────────────────────────────────────────────── */

/**
 * Hero stat cell — one of three columns in the top stat strip. Shows a labelled
 * value (BPM / KEY / SCALE) and a small detail line under it (confidence,
 * source, chord count, etc). The whole cell pulses amber while a clip is being
 * processed so the user gets visual feedback that work is happening.
 */
function HeroStat({
  label,
  value,
  detail,
  busy,
}: {
  label: string
  value: string
  detail: string
  busy: boolean
}) {
  return (
    <div
      className="relative flex min-w-0 flex-col items-center justify-center overflow-hidden px-4 py-7"
      style={{
        background: PALETTE.surface,
        transition: 'box-shadow 0.2s ease',
        boxShadow: busy ? `inset 0 0 24px ${PALETTE.amberGlow}` : 'none',
      }}
    >
      <span
        className="absolute left-4 top-3 text-[9px] tracking-[0.15em]"
        style={{ color: PALETTE.textMuted, fontFamily: "'DM Mono', monospace" }}
      >
        {label}
      </span>
      <div
        className="mt-3 max-w-full select-none text-center"
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 'clamp(2rem, 5.5vw, 3.4rem)',
          fontWeight: 400,
          lineHeight: 1.05,
          letterSpacing: '-0.03em',
          color: value === '—' ? PALETTE.textMuted : PALETTE.textMain,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        aria-live="polite"
      >
        {value}
      </div>
      <span
        className="mt-2 text-[9px] uppercase tracking-[0.18em]"
        style={{ color: PALETTE.textMuted, fontFamily: "'DM Mono', monospace" }}
      >
        {detail}
      </span>
    </div>
  )
}

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

/**
 * Output check panel — a pass / warn report on the exported MIDI's quality, rendered
 * after every analysis. Plain-words labels and a readable detail line (no 9px all-caps),
 * per the `clear-ui-labels` skill. A single coloured dot per row carries the status.
 */
/**
 * AI POLISH panel — renders the structured Gemini response and exposes
 * APPLY / REVERT for the suggestion set. The narrative summary, inferred
 * style, suggested key, per-chord corrections, and missing-PC list are all
 * surfaced; APPLY rewrites `result.segments` (each correction's label,
 * rootPc, quality) and `result.estimatedKey` in-place. REVERT swaps the
 * pre-apply snapshot back.
 *
 * Important UX note: the piano roll shows lead notes (the recorded melody),
 * which APPLY does NOT change — polish is symbolic-only and operates on
 * chord labels / key. The progression text, KEY hero stat, and exported
 * chord-track MIDI all re-derive from segments, so those DO update. The
 * banner at the bottom of the panel spells this out so users don't expect
 * notes to move in the roll.
 */
function AiPolishPanel({
  result,
  applied,
  onApply,
  onRevert,
}: {
  result:
    | { ok: true; summary: string; suggestedKey: string | null; inferredStyle: string | null; chordCorrections: Array<{ segmentIndex: number; currentLabel: string; suggestedLabel: string; rationale: string }>; missingPCs: string[] }
    | { ok: false; message: string }
  applied: boolean
  onApply: () => void
  onRevert: () => void
}) {
  const canApply =
    result.ok && (result.chordCorrections.length > 0 || !!result.suggestedKey)
  return (
    <section className="flex flex-col" style={{ background: PALETTE.surface }}>
      <div
        className="flex items-center justify-between gap-3 border-b px-6 py-3 text-[11px] uppercase tracking-[0.15em]"
        style={{ borderColor: PALETTE.line, color: PALETTE.amber }}
      >
        <span className="shrink-0">🤖 AI POLISH (GEMINI)</span>
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[9px] normal-case tracking-normal"
            style={{
              background: applied
                ? 'color-mix(in oklab, #F5A623 18%, transparent)'
                : result.ok
                  ? 'color-mix(in oklab, #54C98E 14%, transparent)'
                  : 'color-mix(in oklab, #ef4444 18%, transparent)',
              color: applied ? PALETTE.amber : result.ok ? PALETTE.green : '#ef4444',
              border: `1px solid ${applied ? PALETTE.amber : result.ok ? PALETTE.green : '#ef4444'}`,
            }}
          >
            {applied ? 'applied' : result.ok ? 'response received' : 'request failed'}
          </span>
          {result.ok && (applied ? (
            <button
              type="button"
              onClick={onRevert}
              className="rounded-md px-3 py-1 text-[10px] uppercase tracking-[0.12em] transition-colors"
              style={{
                background: 'transparent',
                color: PALETTE.textMain,
                border: `1px solid ${PALETTE.line}`,
                fontFamily: "'DM Mono', monospace",
              }}
            >
              ↺ REVERT
            </button>
          ) : (
            <button
              type="button"
              onClick={onApply}
              disabled={!canApply}
              title={canApply ? 'Apply suggested chord-label + key corrections to the displayed analysis.' : 'Nothing to apply — Gemini had no corrections.'}
              className="rounded-md px-3 py-1 text-[10px] uppercase tracking-[0.12em] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: canApply ? PALETTE.amberGlow : 'transparent',
                color: canApply ? PALETTE.amber : PALETTE.textMuted,
                border: `1px solid ${canApply ? PALETTE.amber : PALETTE.line}`,
                fontFamily: "'DM Mono', monospace",
              }}
            >
              ✓ APPLY
            </button>
          ))}
        </div>
      </div>

      {!result.ok ? (
        <div
          className="px-6 py-4 text-[12px] leading-relaxed"
          style={{ color: '#ef4444', fontFamily: "'DM Mono', monospace" }}
        >
          {result.message}
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-6 py-4">
          {/* Narrative summary */}
          <p
            className="text-[12px] leading-relaxed"
            style={{ color: PALETTE.textMain, fontFamily: "'DM Mono', monospace" }}
          >
            {result.summary}
          </p>

          {/* Pills row: inferred style + suggested key */}
          {(result.inferredStyle || result.suggestedKey) && (
            <div className="flex flex-wrap items-center gap-2">
              {result.inferredStyle && (
                <span
                  className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.12em]"
                  style={{ background: PALETTE.bg, color: PALETTE.textMain, border: `1px solid ${PALETTE.line}` }}
                >
                  STYLE · {result.inferredStyle}
                </span>
              )}
              {result.suggestedKey && (
                <span
                  className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.12em]"
                  style={{ background: PALETTE.bg, color: PALETTE.amber, border: `1px solid ${PALETTE.amber}` }}
                >
                  SUGGESTED KEY · {result.suggestedKey}
                </span>
              )}
            </div>
          )}

          {/* Chord corrections — only when the LLM flagged at least one */}
          {result.chordCorrections.length > 0 && (
            <div className="flex flex-col gap-1">
              <span
                className="text-[10px] uppercase tracking-[0.15em]"
                style={{ color: PALETTE.textMuted, fontFamily: "'DM Mono', monospace" }}
              >
                CHORD CORRECTIONS · {result.chordCorrections.length}
              </span>
              <ul className="flex flex-col gap-1.5">
                {result.chordCorrections.map((c, i) => (
                  <li
                    key={i}
                    className="px-3 py-2 text-[11px] leading-relaxed"
                    style={{
                      background: PALETTE.bg,
                      color: PALETTE.textMain,
                      border: `1px solid ${PALETTE.line}`,
                      fontFamily: "'DM Mono', monospace",
                    }}
                  >
                    <span style={{ color: PALETTE.textMuted }}>seg {c.segmentIndex}:</span>{' '}
                    <span style={{ color: '#ef4444', textDecoration: 'line-through' }}>{c.currentLabel}</span>
                    {' → '}
                    <span style={{ color: PALETTE.green }}>{c.suggestedLabel}</span>
                    <span className="normal-case" style={{ color: PALETTE.textMuted }}>
                      {' '}— {c.rationale}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Missing PCs */}
          {result.missingPCs.length > 0 && (
            <div className="flex flex-col gap-1">
              <span
                className="text-[10px] uppercase tracking-[0.15em]"
                style={{ color: PALETTE.textMuted, fontFamily: "'DM Mono', monospace" }}
              >
                LIKELY MISSING PITCH CLASSES
              </span>
              <div className="flex flex-wrap gap-1.5">
                {result.missingPCs.map(pc => (
                  <span
                    key={pc}
                    className="rounded px-2 py-0.5 text-[10px] uppercase"
                    style={{
                      background: PALETTE.bg,
                      color: PALETTE.amber,
                      border: `1px solid ${PALETTE.amber}`,
                      fontFamily: "'DM Mono', monospace",
                    }}
                  >
                    {pc}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Scope explainer — sets expectations about what APPLY actually changes
              so users don't expect notes to move in the piano roll. */}
          <p
            className="border-t pt-3 text-[10px] leading-relaxed"
            style={{
              borderColor: PALETTE.line,
              color: PALETTE.textMuted,
              fontFamily: "'DM Mono', monospace",
            }}
          >
            {applied ? (
              <>
                <strong style={{ color: PALETTE.amber }}>APPLIED.</strong>{' '}
                Chord labels in the progression text + KEY hero stat now reflect
                Gemini&apos;s suggestions. The exported chord-track MIDI uses
                the corrected (root, quality) per segment. Melody notes in the
                piano roll are unchanged — polish only edits symbols, never the
                recorded notes. Hit <strong>REVERT</strong> to go back.
              </>
            ) : (
              <>
                <strong style={{ color: PALETTE.textMain }}>What APPLY changes:</strong>{' '}
                chord-label corrections rewrite the matching segment&apos;s label
                + (root, quality); the exported chord-track MIDI re-derives from
                those. Suggested key replaces the KEY hero stat. Melody notes in
                the piano roll <strong>do not move</strong> — polish is
                symbolic-only. REVERT restores everything in one click.
              </>
            )}
          </p>
        </div>
      )}
    </section>
  )
}

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
 * Audit panel — checks the output against the source. Three sub-sections, plain labels
 * + readable detail rows (per the `clear-ui-labels` skill):
 *   • Key · BPM · scale, with a chord-progression cross-check
 *   • Loop quality at each candidate period (1 / 2 / 4 / 8 / 16 bars)
 *   • Possible missing notes — pitch classes the source's chroma carries but the
 *     output's lead notes barely cover
 */
function AuditPanel({ report }: { report: AuditReport }) {
  const kbs = report.keyBpmScale
  return (
    <div className="flex flex-col" style={{ background: PALETTE.surface }}>
      <div
        className="flex items-center justify-between border-b px-6 py-3 text-[10px] uppercase tracking-[0.15em]"
        style={{ borderColor: PALETTE.line, color: PALETTE.textMuted }}
      >
        <span>AUDIT</span>
        <span style={{ fontFamily: "'DM Mono', monospace" }}>
          {report.missingNoteCandidates.length === 0 ? 'COVERAGE OK' : `${report.missingNoteCandidates.length} GAP${report.missingNoteCandidates.length === 1 ? '' : 'S'}`}
        </span>
      </div>

      {/* Key · BPM · scale */}
      <div className="flex flex-col gap-1 px-6 py-3">
        <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: PALETTE.textMuted }}>
          Key · BPM · scale
        </span>
        <div className="flex flex-col gap-1 text-[11px] leading-snug" style={{ color: PALETTE.textMain }}>
          <span style={{ fontFamily: "'DM Mono', monospace" }}>
            {kbs.keyLabel} · {Math.round(kbs.keyConfidence * 100)}% confidence · {kbs.scale} scale
          </span>
          <span style={{ fontFamily: "'DM Mono', monospace" }}>
            {kbs.bpm} BPM ({kbs.bpmSource})
          </span>
          <span style={{ color: kbs.chordAgreesWithKey ? PALETTE.green : PALETTE.amber }}>
            {kbs.chordAgreesWithKey
              ? `Chord progression sits inside ${kbs.keyLabel} — the histogram and the chords agree.`
              : `Chords lean ${kbs.chordImpliedKeys[0]?.keyLabel ?? '—'} (${kbs.chordImpliedKeys[0]?.diatonicCount ?? 0}/${kbs.chordImpliedKeys[0]?.total ?? 0} diatonic) — possible key disagreement.`}
          </span>
        </div>
      </div>

      {/* Loop quality */}
      <div
        className="flex flex-col gap-1 border-t px-6 py-3"
        style={{ borderColor: PALETTE.line }}
      >
        <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: PALETTE.textMuted }}>
          Loop quality
        </span>
        {report.loopAudit.perPeriod.length === 0 ? (
          <span className="text-[11px] leading-snug" style={{ color: PALETTE.textMuted }}>
            Clip is too short to measure looping (need at least two bars of the same period).
          </span>
        ) : (
          <div className="flex flex-col gap-0.5 text-[11px]" style={{ fontFamily: "'DM Mono', monospace" }}>
            {report.loopAudit.perPeriod.map(p => {
              const ratingColor =
                p.rating === 'clean' ? PALETTE.green : p.rating === 'partial' ? PALETTE.amber : PALETTE.textMuted
              return (
                <div key={p.period} className="flex items-center gap-3">
                  <span style={{ minWidth: 52, color: PALETTE.textMain }}>
                    {p.period} bar{p.period > 1 ? 's' : ''}
                  </span>
                  <span style={{ minWidth: 88, color: PALETTE.textMuted }}>
                    mean {(p.meanSimilarity * 100).toFixed(0)}%
                  </span>
                  <span style={{ minWidth: 84, color: PALETTE.textMuted }}>
                    best {(p.cleanest * 100).toFixed(0)}%
                  </span>
                  <span style={{ color: ratingColor }}>{p.rating}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Possible missing notes */}
      <div
        className="flex flex-col gap-1 border-t px-6 py-3"
        style={{ borderColor: PALETTE.line }}
      >
        <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: PALETTE.textMuted }}>
          Possible missing notes
        </span>
        {report.missingNoteCandidates.length === 0 ? (
          <span className="text-[11px] leading-snug" style={{ color: PALETTE.green }}>
            Lead-note coverage tracks the source chroma — no pitch class is conspicuously under-represented.
          </span>
        ) : (
          <div className="flex flex-col gap-0.5 text-[11px]" style={{ color: PALETTE.textMain, fontFamily: "'DM Mono', monospace" }}>
            {report.missingNoteCandidates.map(m => (
              <div key={m.pc} className="flex items-baseline gap-2">
                <span style={{ color: PALETTE.amber, minWidth: 30 }}>{m.pc}</span>
                <span style={{ color: PALETTE.textMuted }}>
                  source {(m.chromaShare * 100).toFixed(0)}% vs output {(m.noteShare * 100).toFixed(0)}%
                  {m.atSec != null ? ` — listen around ${m.atSec.toFixed(1)}s` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
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
