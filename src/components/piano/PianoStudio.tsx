import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Keyboard from './Keyboard'
import Timeline from './Timeline'
import ChordPalette from './ChordPalette'
import ScaleSelector from './ScaleSelector'
import Transport from './Transport'
import { CHORD_QUALITIES, ROOTS, SCALES, scalePitchClasses, buildChordFromTriggerMidi } from './chords'
import { piano, type RecordedNote } from './engine'
import { exportMidi } from './midi'

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
            <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">
              Piano Studio
            </h1>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Play with mouse or Logic-style Musical Typing (<span className="font-mono text-gray-700">ASDF</span> row = naturals,
              <span className="font-mono text-gray-700">QWER</span> row = sharps).
              Use <span className="font-mono text-gray-700">-</span> / <span className="font-mono text-gray-700">+</span>{' '}
              (<span className="font-mono text-gray-700">Shift</span>+<span className="font-mono text-gray-700">=</span> on US layouts) or numpad +/- to shift down / up an octave.
              With <strong className="text-gray-700">Chord shapes on keyboard</strong>, the chord palette follows each key you press as the root.
              Record, then export as a .mid file.
            </p>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">
              {recorded.length
                ? `${recorded.length} notes captured`
                : 'No recording yet'}
            </div>
            <div className="text-[10px] font-mono text-purple-500 mt-0.5">
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
        <div className="bg-gradient-to-b from-gray-200 to-gray-100 rounded-xl border border-gray-300 p-4 shadow-inner">
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

        {/* Timeline */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[13px] font-semibold text-gray-800">Timeline</h3>
            <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">
              piano roll
            </span>
          </div>
          <Timeline notes={recorded} bpm={bpm} playheadSec={playheadSec} />
        </div>
      </div>
    </div>
  )
}
