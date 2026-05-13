import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Keyboard from './Keyboard'
import Timeline from './Timeline'
import ChordPalette from './ChordPalette'
import ScaleSelector from './ScaleSelector'
import Transport from './Transport'
import { CHORD_QUALITIES, ROOTS, SCALES, scalePitchClasses, buildChordFromTriggerMidi } from './chords'
import { piano, type RecordedNote } from './engine'
import { exportMidi } from './midi'
import { fetchWithKeys } from '../../lib/api-keys/fetch-with-keys'
import { getApiKey } from '../../lib/api-keys/api-keys-store'

const MIDI_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function midiToName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12
  const oct = Math.floor(midi / 12) - 1
  return `${MIDI_NOTE_NAMES[pc]}${oct}`
}

type GeminiGenerateResponse =
  | { ok: true; preview: string | null; model: string }
  | { ok: false; error: string; message: string }

function parseHintsResponse(raw: string | null): string[] {
  if (!raw) return []
  // Strip ``` fences if present.
  const cleaned = raw.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim()
  // Try strict JSON first, then a relaxed brace-extract.
  const candidates: string[] = [cleaned]
  const braceMatch = cleaned.match(/\{[\s\S]*\}/)
  if (braceMatch && braceMatch[0] !== cleaned) candidates.push(braceMatch[0])
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c) as { hints?: unknown }
      if (parsed && Array.isArray(parsed.hints)) {
        const hints = parsed.hints.filter((h): h is string => typeof h === 'string' && h.trim().length > 0)
        if (hints.length) return hints.slice(0, 3)
      }
    } catch {
      /* try next candidate */
    }
  }
  return []
}

const KEYBOARD_OCTAVES = 3
const MIN_START_MIDI = 12  // C0
const MAX_START_MIDI = 84  // C6 (so highest visible = B8 with 3 octaves; clamp lower)
const DEFAULT_START_MIDI = 48 // C3

export default function PianoStudio() {
  // Theory state
  const [scaleRootId, setScaleRootId] = useState('C')
  const [scaleId, setScaleId] = useState<string>('major')
  const [chordQualityId, setChordQualityId] = useState('dom7')
  const [chordInversion, setChordInversion] = useState(0)
  /** When on, each typed key is the chord root; palette defines quality + inversion only. */
  const [chordVoicingEnabled, setChordVoicingEnabled] = useState(true)

  const chordStacksRef = useRef<Map<number, number[]>>(new Map())

  // Visible keyboard's lowest MIDI (always a C). Shifted by − / + keys.
  const [startMidi, setStartMidi] = useState(DEFAULT_START_MIDI)

  // Transport state
  const [bpm, setBpm] = useState(120)
  const [metronomeOn, setMetronomeOn] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [recorded, setRecorded] = useState<RecordedNote[]>([])
  const [held, setHeld] = useState<Set<number>>(new Set())
  const [playheadSec, setPlayheadSec] = useState<number | null>(null)

  const playheadRef = useRef<number | null>(null)

  // ── AI hint state (Item 10) ──────────────────────────────────────────────
  /** Last few user-played notes (MIDI), most recent last. Capped to 8. */
  const lastNotesRef = useRef<number[]>([])
  const [hintLoading, setHintLoading] = useState(false)
  const [hintError, setHintError] = useState<string | null>(null)
  const [hintItems, setHintItems] = useState<string[] | null>(null)
  const [hintOpen, setHintOpen] = useState(false)

  // Derived: which pitch classes belong to the active scale
  const scaleRoot = useMemo(
    () => ROOTS.find(r => r.id === scaleRootId) ?? ROOTS[0],
    [scaleRootId],
  )
  const scale = useMemo(
    () => SCALES.find(s => s.id === scaleId) ?? SCALES[0],
    [scaleId],
  )
  const scalePcs = useMemo(
    () => scalePitchClasses(scaleRoot.semis, scale),
    [scaleRoot, scale],
  )
  const rootPc = scale.intervals.length ? scaleRoot.semis : null

  const chordQuality = useMemo(
    () => CHORD_QUALITIES.find(q => q.id === chordQualityId) ?? CHORD_QUALITIES[0],
    [chordQualityId],
  )

  /* ── Note input ── */

  const press = useCallback(
    (midi: number) => {
      // Track recent triggers (root keys, not chord stacks) for AI hint context.
      const recent = lastNotesRef.current
      recent.push(midi)
      if (recent.length > 8) recent.splice(0, recent.length - 8)

      if (chordVoicingEnabled) {
        if (chordStacksRef.current.has(midi)) return
        const midis = buildChordFromTriggerMidi(midi, chordQuality.intervals, chordInversion)
        const before = new Set<number>()
        for (const ms of chordStacksRef.current.values()) {
          for (const x of ms) before.add(x)
        }
        chordStacksRef.current.set(midi, midis)
        for (const m of midis) {
          if (!before.has(m)) void piano.noteOn(m)
        }
        setHeld(prev => {
          const next = new Set(prev)
          for (const x of midis) next.add(x)
          return next
        })
        return
      }

      piano.noteOn(midi)
      setHeld(prev => {
        if (prev.has(midi)) return prev
        const next = new Set(prev)
        next.add(midi)
        return next
      })
    },
    [chordVoicingEnabled, chordQuality, chordInversion],
  )

  const release = useCallback(
    (midi: number) => {
      if (chordVoicingEnabled) {
        const removed = chordStacksRef.current.get(midi)
        if (!removed) return
        chordStacksRef.current.delete(midi)
        const stillHeld = new Set<number>()
        for (const ms of chordStacksRef.current.values()) {
          for (const x of ms) stillHeld.add(x)
        }
        for (const m of removed) {
          if (!stillHeld.has(m)) piano.noteOff(m)
        }
        setHeld(stillHeld)
        return
      }

      piano.noteOff(midi)
      setHeld(prev => {
        if (!prev.has(midi)) return prev
        const next = new Set(prev)
        next.delete(midi)
        return next
      })
    },
    [chordVoicingEnabled],
  )

  useEffect(() => {
    if (chordVoicingEnabled) return
    if (chordStacksRef.current.size === 0) return
    for (const midis of chordStacksRef.current.values()) {
      for (const m of midis) piano.noteOff(m)
    }
    chordStacksRef.current.clear()
    setHeld(new Set())
  }, [chordVoicingEnabled])

  /* ── Transport ── */

  const startRecord = useCallback(() => {
    piano.startRecording()
    setIsRecording(true)
    setRecorded([])
  }, [])

  const stopAll = useCallback(() => {
    if (isRecording) {
      const final = piano.stopRecording()
      setIsRecording(false)
      setRecorded(final)
    }
    if (isPlaying) {
      // Cancel ongoing scheduled playback by stopping the synth's transport-less
      // approach: we just unset isPlaying; Tone schedules are already in the
      // future and will fire — for a true stop we'd need Tone.Transport.
      setIsPlaying(false)
      if (playheadRef.current !== null) {
        cancelAnimationFrame(playheadRef.current)
        playheadRef.current = null
      }
      setPlayheadSec(null)
    }
  }, [isRecording, isPlaying])

  const startPlayback = useCallback(async () => {
    if (!recorded.length) return
    setIsPlaying(true)
    setPlayheadSec(0)
    const t0 = performance.now()
    const totalSec = await piano.playback(recorded, () => {
      setIsPlaying(false)
      setPlayheadSec(null)
      if (playheadRef.current !== null) {
        cancelAnimationFrame(playheadRef.current)
        playheadRef.current = null
      }
    })
    const tick = () => {
      const elapsed = (performance.now() - t0) / 1000
      if (elapsed >= totalSec + 0.2) return
      setPlayheadSec(elapsed)
      playheadRef.current = requestAnimationFrame(tick)
    }
    playheadRef.current = requestAnimationFrame(tick)
  }, [recorded])

  const clearAll = useCallback(() => {
    setRecorded([])
    piano.setRecorded([])
  }, [])

  const onExport = useCallback(() => {
    exportMidi(recorded, bpm, `piano-${Date.now()}.mid`)
  }, [recorded, bpm])

  /* ── Metronome wiring ── */
  useEffect(() => {
    if (metronomeOn) piano.startMetronome(bpm)
    else piano.stopMetronome()
  }, [metronomeOn, bpm])

  /* ── Recording playhead ── */
  useEffect(() => {
    if (!isRecording) return
    const t0 = performance.now()
    let raf = 0
    const tick = () => {
      setPlayheadSec((performance.now() - t0) / 1000)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isRecording])

  useEffect(() => () => piano.stopMetronome(), [])

  /* ── AI hint handler (Item 10) ── */
  const requestAiHint = useCallback(async () => {
    if (hintLoading) return
    setHintOpen(true)

    if (!getApiKey('GEMINI_API_KEY')) {
      setHintError(
        'No GEMINI_API_KEY configured. Add it in Settings → API keys to enable AI hints.',
      )
      setHintItems(null)
      return
    }

    setHintLoading(true)
    setHintError(null)
    setHintItems(null)

    const recentNames = lastNotesRef.current.map(midiToName)
    const recentLabel = recentNames.length ? recentNames.join(', ') : '(none played yet)'
    const scaleLabel = `${scaleRoot.label} ${scale.label}`
    const chordLabel = `${chordQuality.label} (inversion ${chordInversion})`

    const system =
      'You are a concise music-theory assistant for a piano UI. ' +
      'Always reply with ONLY valid JSON of the shape {"hints": string[]}. ' +
      'Each hint must be a short, actionable suggestion (under 100 chars).'
    const prompt =
      `Current key/scale: ${scaleLabel}\n` +
      `Active chord voicing: ${chordLabel}\n` +
      `Last notes played: ${recentLabel}\n\n` +
      'Suggest 3 short progression options or theory hints for this context. ' +
      'Return JSON: { "hints": string[] } with exactly 3 entries.'

    try {
      const res = await fetchWithKeys('/api/gemini/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, system, maxOutputTokens: 256 }),
      })
      const payload = (await res.json().catch(() => null)) as GeminiGenerateResponse | null
      if (!payload) {
        setHintError('Could not parse response from /api/gemini/generate.')
        return
      }
      if (!payload.ok) {
        setHintError(payload.message || payload.error || 'Unknown error.')
        return
      }
      const hints = parseHintsResponse(payload.preview)
      if (!hints.length) {
        setHintError('Model did not return parseable hints. Try again.')
        return
      }
      setHintItems(hints)
    } catch (e) {
      setHintError(e instanceof Error ? e.message : 'Network error.')
    } finally {
      setHintLoading(false)
    }
  }, [hintLoading, scaleRoot, scale, chordQuality, chordInversion])

  /* ── Octave shift: − / + (also Shift+= and numpad − / +) ── */
  useEffect(() => {
    const octaveDown = (e: KeyboardEvent) =>
      e.key === '-' || e.code === 'Minus' || e.code === 'NumpadSubtract'

    const octaveUp = (e: KeyboardEvent) =>
      e.key === '+' ||
      e.code === 'NumpadAdd' ||
      (e.code === 'Equal' && e.shiftKey)

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return
      if (octaveDown(e)) {
        e.preventDefault()
        setStartMidi(m => Math.max(MIN_START_MIDI, m - 12))
      } else if (octaveUp(e)) {
        e.preventDefault()
        setStartMidi(m => Math.min(MAX_START_MIDI, m + 12))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-canvas)' }}>
      <div className="max-w-[1200px] mx-auto p-6 space-y-4">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-[22px] font-semibold text-[var(--text-1)] tracking-tight">
              Piano Studio
            </h1>
            <p className="text-[12px] text-[var(--text-3)] mt-0.5">
              Play with mouse or Logic-style Musical Typing (<span className="font-mono text-[var(--text-2)]">ASDF</span> row = naturals,
              <span className="font-mono text-[var(--text-2)]">QWER</span> row = sharps).
              Use <span className="font-mono text-[var(--text-2)]">-</span> / <span className="font-mono text-[var(--text-2)]">+</span>{' '}
              (<span className="font-mono text-[var(--text-2)]">Shift</span>+<span className="font-mono text-[var(--text-2)]">=</span> on US layouts) or numpad +/- to shift down / up an octave.
              With <strong className="text-[var(--text-2)]">Chord shapes on keyboard</strong>, the chord palette follows each key you press as the root.
              Record, then export as a .mid file.
            </p>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-mono text-[var(--text-4)] uppercase tracking-wider">
              {recorded.length
                ? `${recorded.length} notes captured`
                : 'No recording yet'}
            </div>
            <div className="text-[10px] font-mono text-[var(--accent)] mt-0.5">
              keyboard: {Math.floor(startMidi / 12) - 1} → {Math.floor(startMidi / 12) + KEYBOARD_OCTAVES - 1}
            </div>
          </div>
        </div>

        {/* Transport */}
        <Transport
          isRecording={isRecording}
          isPlaying={isPlaying}
          hasNotes={recorded.length > 0}
          bpm={bpm}
          metronomeOn={metronomeOn}
          onRecord={startRecord}
          onStop={stopAll}
          onPlay={startPlayback}
          onClear={clearAll}
          onExport={onExport}
          onBpmChange={setBpm}
          onToggleMetronome={() => setMetronomeOn(v => !v)}
        />

        {/* Keyboard */}
        <div
          className="rounded-xl border p-4 shadow-inner"
          style={{
            background: 'linear-gradient(to bottom, var(--bg-hover), var(--bg-muted))',
            borderColor: 'var(--border-strong)',
          }}
        >
          <Keyboard
            startMidi={startMidi}
            octaves={KEYBOARD_OCTAVES}
            scalePitchClasses={scalePcs}
            rootPc={rootPc}
            highlight={held}
            onPress={press}
            onRelease={release}
          />
        </div>

        {/* Theory controls */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ScaleSelector
            rootId={scaleRootId}
            onRootChange={setScaleRootId}
            scaleId={scaleId}
            onScaleChange={setScaleId}
          />
          <ChordPalette
            chordVoicingEnabled={chordVoicingEnabled}
            onChordVoicingEnabledChange={setChordVoicingEnabled}
            qualityId={chordQualityId}
            onQualityChange={setChordQualityId}
            inversion={chordInversion}
            onInversionChange={setChordInversion}
          />
        </div>

        {/* AI hint affordance (Item 10) — uses Gemini via /api/gemini/generate */}
        <div
          className="rounded-xl border p-3"
          style={{ background: 'var(--bg-muted)', borderColor: 'var(--border-strong)' }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[12px] font-semibold text-[var(--text-1)]">Theory hint</div>
              <div className="text-[10px] text-[var(--text-3)] mt-0.5">
                Ask Gemini for 3 progression suggestions based on your current scale, chord voicing,
                and last notes played.
              </div>
            </div>
            <button
              type="button"
              onClick={requestAiHint}
              disabled={hintLoading}
              className="text-[11px] font-mono uppercase tracking-wider px-3 py-1.5 rounded-md border disabled:opacity-50"
              style={{
                background: 'var(--bg-canvas)',
                color: 'var(--text-1)',
                borderColor: 'var(--border-strong)',
              }}
            >
              {hintLoading ? 'Thinking…' : 'AI hint'}
            </button>
          </div>

          {hintOpen && (
            <div className="mt-3 text-[12px]">
              {hintError && (
                <div className="text-[var(--text-2)]" style={{ color: 'var(--danger, #c33)' }}>
                  {hintError}
                </div>
              )}
              {!hintError && hintLoading && (
                <div className="text-[var(--text-3)]">Asking Gemini…</div>
              )}
              {!hintError && !hintLoading && hintItems && hintItems.length > 0 && (
                <ul className="space-y-1 list-disc pl-5 text-[var(--text-2)]">
                  {hintItems.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Timeline */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[13px] font-semibold text-[var(--text-1)]">Timeline</h3>
            <span className="text-[10px] font-mono text-[var(--text-4)] uppercase tracking-wider">
              piano roll
            </span>
          </div>
          <Timeline notes={recorded} bpm={bpm} playheadSec={playheadSec} />
        </div>
      </div>
    </div>
  )
}
