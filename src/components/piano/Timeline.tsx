import { useEffect, useMemo, useRef, useState } from 'react'
import type { RecordedNote } from './engine'
import { midiToName } from './chords'

interface TimelineProps {
  notes: RecordedNote[]
  bpm: number
  playheadSec: number | null
  /** Called when the user clicks empty timeline space → add a note. */
  onAddNote?: (n: RecordedNote) => void
  /** Called when the user clicks an existing note → remove it. */
  onRemoveNote?: (index: number) => void
  /** Lock editing while recording / playing. */
  editingDisabled?: boolean
  height?: number
}

/**
 * Editable piano-roll timeline.
 *  - Click on empty space to write a note (1-beat default duration).
 *  - Click on an existing note to delete it.
 */
export default function Timeline({
  notes, bpm, playheadSec, onAddNote, onRemoveNote, editingDisabled, height = 140,
}: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)

  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const { lowMidi, highMidi, totalSec } = useMemo(() => {
    if (!notes.length) {
      return { lowMidi: 48, highMidi: 72, totalSec: 8 }
    }
    let lo = Infinity, hi = -Infinity, end = 0
    for (const n of notes) {
      lo = Math.min(lo, n.midi)
      hi = Math.max(hi, n.midi)
      end = Math.max(end, n.start + n.duration)
    }
    return {
      lowMidi: Math.max(0, lo - 2),
      highMidi: Math.min(127, hi + 2),
      totalSec: Math.max(8, end + 2),
    }
  }, [notes])

  const pitchSpan = highMidi - lowMidi + 1
  const rulerH = 18
  const gutterW = 36
  const rowHeight = (height - rulerH) / pitchSpan
  const pxPerSec = (width - gutterW) / totalSec

  const beatSec = 60 / bpm

  /* Click → add new note (or delete existing) */
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (editingDisabled || !onAddNote) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const time = Math.max(0, x / pxPerSec)
    const midi = highMidi - Math.floor(y / rowHeight)
    if (midi < lowMidi || midi > highMidi) return

    // Snap start time to 1/4 beat for a cleaner grid feel
    const snap = beatSec / 4
    const snapped = Math.round(time / snap) * snap

    onAddNote({
      midi,
      start: snapped,
      duration: beatSec,
      velocity: 0.8,
    })
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-gray-50 rounded-lg border border-gray-200 overflow-hidden"
      style={{ height }}
    >
      {/* Time ruler */}
      <div
        className="absolute top-0 left-9 right-0 border-b border-gray-200 bg-white"
        style={{ height: rulerH }}
      >
        {Array.from({ length: Math.ceil(totalSec / beatSec) + 1 }).map((_, i) => {
          const x = i * beatSec * pxPerSec
          const isBar = i % 4 === 0
          return (
            <div
              key={i}
              className="absolute top-0 bottom-0 flex items-end pb-0.5"
              style={{ left: x }}
            >
              <span
                className={`text-[9px] font-mono ${isBar ? 'text-gray-500' : 'text-gray-300'}`}
              >
                {isBar ? `${i / 4 + 1}` : ''}
              </span>
            </div>
          )
        })}
      </div>

      {/* Pitch label gutter */}
      <div
        className="absolute left-0 bottom-0 border-r border-gray-200 bg-white"
        style={{ top: rulerH, width: gutterW }}
      >
        {Array.from({ length: pitchSpan }).map((_, i) => {
          const midi = highMidi - i
          const showLabel = midi % 12 === 0
          return showLabel ? (
            <div
              key={midi}
              className="absolute right-1 text-[9px] font-mono text-gray-400"
              style={{ top: i * rowHeight, lineHeight: `${rowHeight}px` }}
            >
              {midiToName(midi)}
            </div>
          ) : null
        })}
      </div>

      {/* Note canvas */}
      <div
        ref={canvasRef}
        className={`absolute right-0 bottom-0 ${onAddNote && !editingDisabled ? 'cursor-crosshair' : ''}`}
        style={{ top: rulerH, left: gutterW }}
        onClick={handleCanvasClick}
      >
        {/* Horizontal pitch grid (subtle stripes for sharps) */}
        {Array.from({ length: pitchSpan }).map((_, i) => {
          const midi = highMidi - i
          const isBlack = [1, 3, 6, 8, 10].includes(midi % 12)
          return (
            <div
              key={midi}
              className={`absolute left-0 right-0 ${isBlack ? 'bg-gray-100/60' : ''}`}
              style={{ top: i * rowHeight, height: rowHeight }}
            />
          )
        })}

        {/* Vertical beat grid */}
        {Array.from({ length: Math.ceil(totalSec / beatSec) + 1 }).map((_, i) => {
          const x = i * beatSec * pxPerSec
          const isBar = i % 4 === 0
          return (
            <div
              key={i}
              className={`absolute top-0 bottom-0 ${isBar ? 'bg-gray-300' : 'bg-gray-200/70'}`}
              style={{ left: x, width: 1 }}
            />
          )
        })}

        {/* Notes */}
        {notes.map((n, i) => {
          const top = (highMidi - n.midi) * rowHeight
          const left = n.start * pxPerSec
          const w = Math.max(3, n.duration * pxPerSec)
          return (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation()
                if (!editingDisabled) onRemoveNote?.(i)
              }}
              className={`
                absolute rounded-sm
                bg-gradient-to-b from-amber-300 to-orange-500
                border-l-2 border-orange-600/60
                shadow-[0_1px_2px_rgba(0,0,0,0.15)]
                hover:from-rose-300 hover:to-rose-500 hover:border-rose-700
                transition-colors duration-100
              `}
              style={{
                top: top + 1,
                left,
                width: w,
                height: Math.max(3, rowHeight - 2),
              }}
              title={`${midiToName(n.midi)}  •  ${n.start.toFixed(2)}s  ·  ${n.duration.toFixed(2)}s — click to delete`}
            />
          )
        })}

        {/* Playhead */}
        {playheadSec !== null && (
          <div
            className="absolute top-0 bottom-0 bg-purple-600/90 pointer-events-none"
            style={{ left: playheadSec * pxPerSec, width: 2 }}
          />
        )}

        {/* Empty hint */}
        {!notes.length && (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-gray-300 pointer-events-none">
            Click anywhere to write a note · or hit Record + play the keyboard
          </div>
        )}
      </div>
    </div>
  )
}
