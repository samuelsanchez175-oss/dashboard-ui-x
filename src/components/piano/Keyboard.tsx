import { useEffect, useMemo, useRef, useState } from 'react'
import { midiToName } from './chords'

interface KeyboardProps {
  /** Lowest MIDI to render (inclusive). C3 = 48. */
  startMidi: number
  /** Number of octaves to render. */
  octaves: number
  /** Pitch classes (0–11) belonging to the active scale; tinted on the keys. */
  scalePitchClasses: Set<number>
  /** Root pitch class (0–11) — gets a stronger tint. */
  rootPc: number | null
  /** Currently held MIDI numbers (from any source) — for highlight feedback. */
  highlight: Set<number>
  onPress: (midi: number) => void
  onRelease: (midi: number) => void
}

/**
 * Logic Pro / GarageBand **Musical Typing** (US QWERTY), semitone offset from the
 * window’s reference **C** (same as `startMidi`, a C). ~1.5 chromatic octaves (18 keys).
 *
 * - **Middle row** (`ASDF…`) = white keys; **top letter row** (`QWER…`) = black keys —
 *   same staggered layout as Logic’s Musical Typing window (Window → Show Musical Typing).
 * - **Octave down / up**: **− / +** (handled in `PianoStudio`, not here).
 * - **C / V** = velocity (not implemented here; keys are left unmapped so they do not play).
 */
const LOGIC_MUSICAL_TYPING_KEY_TO_SEMITONE: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
  o: 13,
  l: 14,
  p: 15,
  ';': 16,
  "'": 17,
}

function musicalTypingLabel(key: string): string {
  if (key === ';') return ';'
  if (key === "'") return "'"
  return key.toUpperCase()
}

type LayoutSlot =
  | { kind: 'spacer' }
  | { kind: 'white' | 'black'; lowerKey: string }

/** US QWERTY — top letter row mirrors a real keyboard above the home row for alignment. */
const TOP_ROW_SLOTS: LayoutSlot[] = [
  { kind: 'spacer' },
  { kind: 'black', lowerKey: 'q' }, // spacer cap (dead)
  { kind: 'black', lowerKey: 'w' },
  { kind: 'black', lowerKey: 'e' },
  { kind: 'black', lowerKey: 'r' }, // dead
  { kind: 'black', lowerKey: 't' },
  { kind: 'black', lowerKey: 'y' },
  { kind: 'black', lowerKey: 'u' },
  { kind: 'black', lowerKey: 'i' }, // dead
  { kind: 'black', lowerKey: 'o' },
  { kind: 'black', lowerKey: 'p' },
]

/** Home row — naturals (`ASDF…`) plus `;` and `'`. */
const HOME_ROW_SLOTS: LayoutSlot[] = [
  { kind: 'white', lowerKey: 'a' },
  { kind: 'white', lowerKey: 's' },
  { kind: 'white', lowerKey: 'd' },
  { kind: 'white', lowerKey: 'f' },
  { kind: 'white', lowerKey: 'g' },
  { kind: 'white', lowerKey: 'h' },
  { kind: 'white', lowerKey: 'j' },
  { kind: 'white', lowerKey: 'k' },
  { kind: 'white', lowerKey: 'l' },
  { kind: 'white', lowerKey: ';' },
  { kind: 'white', lowerKey: "'" },
]

export default function Keyboard({
  startMidi,
  octaves: _visibleOctaves,
  scalePitchClasses,
  rootPc,
  highlight,
  onPress,
  onRelease,
}: KeyboardProps) {
  void _visibleOctaves // Musical typing span is fixed (~18 semitones); full strip removed

  const [mouseHeld, setMouseHeld] = useState<number | null>(null)
  const heldRef = useRef<Set<number>>(new Set())

  const midiForQwertyLower = useMemo(() => {
    const m = new Map<string, number>()
    for (const [k, semis] of Object.entries(LOGIC_MUSICAL_TYPING_KEY_TO_SEMITONE)) {
      m.set(k, startMidi + semis)
    }
    return m
  }, [startMidi])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      let k = e.key.toLowerCase()
      if (e.key === ';') k = ';'
      else if (e.key === "'" || e.key === '’') k = "'"
      const off = LOGIC_MUSICAL_TYPING_KEY_TO_SEMITONE[k]
      if (off === undefined) return
      const midi = startMidi + off
      if (heldRef.current.has(midi)) return
      heldRef.current.add(midi)
      onPress(midi)
    }
    const up = (e: KeyboardEvent) => {
      let k = e.key.toLowerCase()
      if (e.key === ';') k = ';'
      else if (e.key === "'" || e.key === '’') k = "'"
      const off = LOGIC_MUSICAL_TYPING_KEY_TO_SEMITONE[k]
      if (off === undefined) return
      const midi = startMidi + off
      if (!heldRef.current.has(midi)) return
      heldRef.current.delete(midi)
      onRelease(midi)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [startMidi, onPress, onRelease])

  useEffect(() => {
    const up = () => {
      if (mouseHeld !== null) {
        onRelease(mouseHeld)
        setMouseHeld(null)
      }
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [mouseHeld, onRelease])

  const tintWhite = (midi: number) => {
    if (highlight.has(midi)) return 'bg-purple-300'
    const pc = midi % 12
    if (rootPc !== null && pc === rootPc) return 'bg-purple-50'
    if (scalePitchClasses.has(pc)) return 'bg-purple-50/50'
    return 'bg-gradient-to-b from-white to-gray-100'
  }

  const tintBlack = (midi: number) => {
    if (highlight.has(midi)) return 'bg-purple-500'
    const pc = midi % 12
    if (rootPc !== null && pc === rootPc) return 'bg-purple-700'
    if (scalePitchClasses.has(pc)) return 'bg-gray-700'
    return 'bg-gradient-to-b from-gray-800 to-gray-950'
  }

  const renderSpacer = (row: 'top' | 'home', i: number) => (
    <div
      key={`spacer-${row}-${i}`}
      className={row === 'top' ? 'w-[2.5%] min-w-[4px] shrink-0' : 'hidden'}
      aria-hidden
    />
  )

  const renderKeycap = (slot: Extract<LayoutSlot, { lowerKey: string }>, row: 'top' | 'home') => {
    const mapped = LOGIC_MUSICAL_TYPING_KEY_TO_SEMITONE[slot.lowerKey]
    const isPlayable = mapped !== undefined
    const midi = isPlayable ? midiForQwertyLower.get(slot.lowerKey)! : null
    const label = musicalTypingLabel(slot.lowerKey)
    const isBlackRow = row === 'top'

    if (!isPlayable) {
      return (
        <div
          key={`dead-${row}-${slot.lowerKey}`}
          className={`
            flex flex-col items-center justify-end shrink-0 rounded-md border border-gray-300/80
            bg-gradient-to-b from-gray-200 to-gray-300 text-gray-400 shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)]
            ${isBlackRow ? 'h-10 w-9 text-[10px]' : 'h-14 w-9 text-[11px]'}
          `}
          aria-hidden
        >
          <span className="font-mono font-semibold pb-1 opacity-40">{label}</span>
        </div>
      )
    }

    const pc = midi! % 12
    const showNote = pc === 0

    const pianoShell = isBlackRow
      ? `
        h-11 w-9 flex flex-col items-center justify-end pb-1
        rounded-b-md border border-black/50
        shadow-[0_3px_0_rgba(0,0,0,0.35),inset_0_-2px_0_rgba(255,255,255,0.06)]
        ${tintBlack(midi!)}
      `
      : `
        h-[3.25rem] w-9 flex flex-col items-center justify-end pb-1.5 gap-0.5
        rounded-b-lg border border-gray-400/90
        shadow-[0_4px_0_rgba(0,0,0,0.12),inset_0_-3px_0_rgba(0,0,0,0.05)]
        ${tintWhite(midi!)}
      `

    return (
      <button
        key={`play-${row}-${slot.lowerKey}`}
        type="button"
        aria-label={`${midiToName(midi!)} keyboard ${label}`}
        onMouseDown={() => { onPress(midi!); setMouseHeld(midi!) }}
        onMouseEnter={(e) => {
          if (e.buttons === 1 && mouseHeld !== midi) {
            if (mouseHeld !== null) onRelease(mouseHeld)
            onPress(midi!); setMouseHeld(midi!)
          }
        }}
        className={`
          relative shrink-0 select-none transition-colors duration-75
          hover:brightness-105 active:brightness-95 active:translate-y-px
          ${pianoShell}
        `}
      >
        <span
          className={`
            font-mono font-bold leading-none
            ${isBlackRow ? 'text-[11px] text-purple-200' : 'text-[12px] text-purple-600'}
          `}
        >
          {label}
        </span>
        {showNote && (
          <span className={`text-[9px] font-mono ${isBlackRow ? 'text-gray-300' : 'text-gray-500'}`}>
            {midiToName(midi!)}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="w-full select-none space-y-2">
      <p className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
        Musical typing — piano keys on QWERTY caps (- / + = octave)
      </p>

      <div className="rounded-xl border border-gray-300 bg-gradient-to-b from-gray-200 to-gray-300 p-3 shadow-inner">
        {/* Top row — black keys; dead caps (Q R I) for physical alignment */}
        <div className="flex flex-nowrap justify-center gap-1 pl-6 sm:pl-10">
          {TOP_ROW_SLOTS.map((slot, i) => {
            if (slot.kind === 'spacer') return renderSpacer('top', i)
            return renderKeycap(slot, 'top')
          })}
        </div>

        {/* Home row — white keys */}
        <div className="mt-2 flex flex-nowrap justify-center gap-1">
          {HOME_ROW_SLOTS.map((slot) => {
            if (slot.kind === 'spacer') return null
            return renderKeycap(slot, 'home')
          })}
        </div>
      </div>
    </div>
  )
}
