/**
 * CDL Class A — Outside Pre-Trip — DEEP DIVE
 *
 * Image-first photo drill with multiple-choice questions. 38 items across
 * three sections (Engine Bay 11, In-Cabin 11, Trailer 16). Each item has:
 *   - Two photo phases: NORMAL (yellow numbered circle only) and HIGHLIGHT
 *     (same plus a yellow oval outlining the part). Toggle between them.
 *   - A "say-it" inspection sentence (overlaid on the photo).
 *   - A multiple-choice question asking the user to pick the correct
 *     inspection statement from three options (two distractors are real
 *     statements from other parts in the same section).
 *
 * Layout (matches the user's spec — image first, navigation under, MC below):
 *
 *   ┌──────────────────────────────┐
 *   │  [ photo with overlay ]      │
 *   │ [NORMAL][HIGHLIGHT]          │
 *   ├──────────────────────────────┤
 *   │ ◀ PREV   5 of 11 · HORN   NEXT ▶ │
 *   ├──────────────────────────────┤
 *   │ Q5  What does the inspector say..│
 *   │  A  …                            │
 *   │  B  …  (correct)                 │
 *   │  C  …                            │
 *   │         [ CONFIRM ]              │
 *   └──────────────────────────────┘
 *
 * Section selector lives in the header (Engine / Cabin / Trailer).
 * Visited + correct items are tracked in localStorage so progress survives
 * reloads. Standalone — does NOT use CdlQuiz so the layout is fully ours.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DEEP_DIVE_SECTIONS,
  DEEP_DIVE_TOTALS,
  type DeepDiveItem,
  type DeepDiveSectionId,
} from './cdl-pretrip-deep-data'

const T = {
  pageBg: '#04090b',
  cardBg: '#070f12',
  accent: '#22d3ee',
  accentFg: '#000',
  accentSoft: '#0c2128',
  good: '#39ff14',
  bad: '#ff4d4d',
  text: '#c4e6ec',
  textDim: '#4a7480',
  border: '#13303a',
} as const

const VISITED_KEY = 'cdl-pretrip-deep-visited'
const CORRECT_KEY = 'cdl-pretrip-deep-correct'

type VisitedMap = Record<DeepDiveSectionId, number[]>
type Phase = 'normal' | 'highlight'

const EMPTY_VISITED: VisitedMap = { engine: [], cabin: [], trailer: [] }

/** Derive the highlight-phase image path from the normal path. */
function highlightPathFor(imagePath: string): string {
  return imagePath.replace(/\.(jpg|jpeg|png|webp)$/i, '-highlight.$1')
}

/* Short one-line summaries of each part's say-it sentence, used as quiz
 * option text. Keys are the slug from the imagePath. Keeps the key facts
 * + numeric thresholds the examiner listens for (e.g. "≤3 cracks per inch"
 * for belts, "no more than 10°" for steering free play). */
const SHORT: Record<string, string> = {
  '1-oil-dipstick': 'Oil level — between ADD and FULL on the dipstick, oil clean and not low.',
  '2-coolant-reservoir': 'Coolant level — between MIN and MAX on the reservoir, cap on tight.',
  '3-power-steering-fluid': 'Power steering fluid — reservoir at the proper level, cap secure.',
  '4-windshield-washer-fluid': 'Windshield washer fluid — reservoir full, cap on tight.',
  '5-alternator': 'Alternator — properly mounted, wiring not loose/damaged, drive belt tight (≤3 cracks/inch, no frays).',
  '6-water-pump': 'Water pump — properly mounted and secured, no leaks at housing or hose connections.',
  '7-drive-belts': 'Drive belts — tight, ≤3 cracks per inch, no frays, less than ¾" of play.',
  '8-radiator-hoses': 'Radiator hoses — properly mounted, no leaks, cracks, bulges, or chafing.',
  '9-air-compressor': 'Air compressor — properly mounted, drive belt tight, no air leaks at fittings.',
  '10-steering-box': 'Steering box — properly mounted, no leaks, no loose nuts/bolts, pitman arm + drag link tight.',
  '11-battery': 'Battery — properly mounted, cables tight, no corrosion, case not cracked or leaking.',
  '1-three-point-contact': 'Three-point contact entering the cab — two hands and one foot (or two feet and one hand).',
  '2-seat-belt': 'Seat belt — properly mounted, not ripped or frayed, latches and releases properly.',
  '3-mirrors': 'Mirrors — properly mounted, adjusted, not cracked or broken, full coverage.',
  '4-steering-wheel': 'Steering wheel — free play no more than 10° (about 2" on a 20" wheel).',
  '5-horn': 'Horn — press the city horn and pull the air horn to confirm both work.',
  '6-wipers-windshield': "Wipers + windshield — blades not torn, arms tight, windshield not cracked in driver's view.",
  '7-heater-defroster': 'Heater + defroster — working, air flows through the defroster vents.',
  '8-dashboard-gauges': 'Gauges — oil pressure, coolant temp, voltmeter, air pressure all in the normal range.',
  '9-lights-dash-indicators': 'Lights + indicators — headlights, 4-ways, turn signals on; dash indicators light at key-on.',
  '10-emergency-equipment': 'Emergency equipment — 3 reflective triangles, charged fire extinguisher, spare fuses.',
  '11-parking-brake': 'Parking brake tug test — set brake, release service brake, pull against in low gear — truck should NOT move.',
  '1-brake-lights': 'Brake lights — apply the brake; both rear lamps come on bright.',
  '2-turn-signals': 'Turn signals + 4-way flashers — left, right, and four-ways all working.',
  '3-clearance-marker-lights': 'Clearance + marker lights — all on and working.',
  '4-reflective-tape': 'Reflective tape — installed and in good condition (full length of side + across rear).',
  '5-wheels-tires': 'Wheels + tires — properly inflated, no cuts/bulges, rims not cracked, all lug nuts present and tight.',
  '6-suspension': 'Suspension — springs, axle, air bags free of cracks/damage/leaks; mounting bolts secure.',
  '7-landing-gear': 'Landing gear — securely mounted, not bent, crank + foot in good condition.',
  '8-coupling-devices': 'Coupling devices — pintle hook / fifth wheel secure, not cracked, locking mechanism working.',
  '9-electrical-connections': 'Electrical connections — plug secure, pins not bent or corroded, cable not cut or frayed.',
  '10-air-lines': 'Air lines — not cut/worn/leaking, properly connected and secured.',
  '11-doors-latches': 'Doors + latches — open/close properly, latches + hinges secure, door seals intact.',
  '12-undercarriage': 'Undercarriage — frame and crossmembers free of cracks/damage; mounting bolts secure.',
  '13-light-operation': 'Light operation — every light operates properly (brake, turn, marker).',
  '14-abs-light': 'ABS light — comes on with the key, goes off after the truck starts moving.',
  '15-brake-chambers': 'Brake chambers — not leaking, properly mounted, push rods move freely.',
  '16-slack-adjusters': 'Slack adjusters — properly positioned, not damaged, move freely.',
}

function slugFor(item: DeepDiveItem): string {
  return item.imagePath.split('/').pop()!.replace(/\.jpg$/, '')
}

function shortFor(item: DeepDiveItem): string {
  return SHORT[slugFor(item)] ?? item.sayIt
}

/* ──────────────────────────────────────────────────────────────────────────── */

interface Props {
  onNavigate?: (routeId: string) => void
}

export default function CdlPreTripDeepDive(_props: Props = {}) {
  const [sectionId, setSectionId] = useState<DeepDiveSectionId>('engine')
  const [itemIdx, setItemIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>('normal')
  const [selected, setSelected] = useState<number | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  /* Per-section visited + correct tracking, persisted in localStorage. */
  const [visited, setVisited] = useState<VisitedMap>(() => {
    if (typeof window === 'undefined') return EMPTY_VISITED
    try {
      const raw = window.localStorage.getItem(VISITED_KEY)
      const parsed = raw ? (JSON.parse(raw) as Partial<VisitedMap>) : null
      return {
        engine: parsed?.engine ?? [],
        cabin: parsed?.cabin ?? [],
        trailer: parsed?.trailer ?? [],
      }
    } catch {
      return EMPTY_VISITED
    }
  })
  const [correct, setCorrect] = useState<VisitedMap>(() => {
    if (typeof window === 'undefined') return EMPTY_VISITED
    try {
      const raw = window.localStorage.getItem(CORRECT_KEY)
      const parsed = raw ? (JSON.parse(raw) as Partial<VisitedMap>) : null
      return {
        engine: parsed?.engine ?? [],
        cabin: parsed?.cabin ?? [],
        trailer: parsed?.trailer ?? [],
      }
    } catch {
      return EMPTY_VISITED
    }
  })

  const section = useMemo(
    () => DEEP_DIVE_SECTIONS.find(s => s.id === sectionId) ?? DEEP_DIVE_SECTIONS[0]!,
    [sectionId],
  )
  const item = section.items[itemIdx] ?? section.items[0]!

  /* When section / item changes, reset transient quiz state and start in
   * normal phase. Visited + correct maps persist (that's the point). */
  useEffect(() => {
    setSelected(null)
    setConfirmed(false)
    setPhase('normal')
  }, [sectionId, itemIdx])

  /* Mark visited as soon as the user lands on an item. */
  useEffect(() => {
    setVisited(prev => {
      const cur = prev[sectionId]
      if (cur.includes(item.number)) return prev
      return { ...prev, [sectionId]: [...cur, item.number] }
    })
  }, [sectionId, item.number])

  /* Persist on change. */
  useEffect(() => {
    try {
      window.localStorage.setItem(VISITED_KEY, JSON.stringify(visited))
    } catch {
      /* storage full / disabled — silently no-op */
    }
  }, [visited])
  useEffect(() => {
    try {
      window.localStorage.setItem(CORRECT_KEY, JSON.stringify(correct))
    } catch {
      /* storage full / disabled — silently no-op */
    }
  }, [correct])

  /* Build the 3 multiple-choice options for the current item. Distractors
   * come from the SAME section so picking right requires recognising the
   * part, not just elimination. Correct slot rotates A → B → C by item
   * number so the user can't pattern-match by position. */
  const { opts, correctIdx } = useMemo(() => {
    const correctText = shortFor(item)
    const others = section.items.filter((_, i) => i !== itemIdx)
    const d1 = others[itemIdx % others.length]!
    const d2 = others[(itemIdx + 1) % others.length]!
    const ansSlot = (item.number - 1) % 3 as 0 | 1 | 2
    const triple: [string, string, string] = ['', '', '']
    triple[ansSlot] = correctText
    let cur = 0
    for (let s = 0; s < 3; s++) {
      if (s === ansSlot) continue
      triple[s] = cur === 0 ? shortFor(d1) : shortFor(d2)
      cur++
    }
    return { opts: triple, correctIdx: ansSlot }
  }, [section, item, itemIdx])

  const onConfirm = useCallback(() => {
    if (selected == null) return
    setConfirmed(true)
    if (selected === correctIdx) {
      setCorrect(prev => {
        const cur = prev[sectionId]
        if (cur.includes(item.number)) return prev
        return { ...prev, [sectionId]: [...cur, item.number] }
      })
    }
  }, [selected, correctIdx, sectionId, item.number])

  const goPrev = () => setItemIdx(i => Math.max(0, i - 1))
  const goNext = () => setItemIdx(i => Math.min(section.items.length - 1, i + 1))

  const visitedHere = visited[sectionId]
  const correctHere = correct[sectionId]
  const currentImage = phase === 'highlight' ? highlightPathFor(item.imagePath) : item.imagePath

  return (
    <div
      className="flex-1 overflow-auto"
      style={{
        background: T.pageBg,
        color: T.text,
        fontFamily: "'Courier New', Courier, monospace",
      }}
    >
      <div style={{ minHeight: '100%', padding: 24 }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <PageHeader
            section={section.label}
            step={section.step}
            sectionId={sectionId}
            onSectionChange={(id: DeepDiveSectionId) => {
              setSectionId(id)
              setItemIdx(0)
            }}
            visited={visited}
            correct={correct}
          />

          <Card>
            {/* Image first — toggleable between normal and highlight phase. */}
            <ImagePane item={item} src={currentImage} phase={phase} onPhaseChange={setPhase} />

            {/* Navigation under the image — current item + prev/next. */}
            <NavStrip
              itemIdx={itemIdx}
              total={section.items.length}
              label={item.label}
              number={item.number}
              visited={visitedHere.includes(item.number)}
              correct={correctHere.includes(item.number)}
              onPrev={goPrev}
              onNext={goNext}
            />

            {/* Multiple-choice question. */}
            <QuestionPane
              questionNumber={item.number}
              sectionLabel={section.label}
              opts={opts}
              selected={selected}
              confirmed={confirmed}
              correctIdx={correctIdx}
              onSelect={i => !confirmed && setSelected(i)}
              onConfirm={onConfirm}
              onNext={goNext}
              isLast={itemIdx === section.items.length - 1}
            />
          </Card>

          <ProgressFooter section={section.label} visited={visitedHere.length} correct={correctHere.length} total={section.items.length} />
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────── */

function PageHeader({
  step,
  sectionId,
  onSectionChange,
  visited,
  correct,
}: {
  section: string
  step: string
  sectionId: DeepDiveSectionId
  onSectionChange: (id: DeepDiveSectionId) => void
  visited: VisitedMap
  correct: VisitedMap
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span
          style={{
            display: 'inline-block',
            padding: '4px 10px',
            border: `1px solid ${T.accent}`,
            color: T.accent,
            background: T.accentSoft,
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 2,
          }}
        >
          {step}
        </span>
        <span style={{ fontSize: 11, color: T.textDim, letterSpacing: 1 }}>
          {DEEP_DIVE_TOTALS.itemCount} total items · pick the correct inspection statement
        </span>
      </div>
      {/* Section selector — three tabs (Engine / Cabin / Trailer). */}
      <div style={{ display: 'flex', gap: 4, border: `1px solid ${T.border}`, borderRadius: 6, overflow: 'hidden' }}>
        {DEEP_DIVE_SECTIONS.map(s => {
          const active = s.id === sectionId
          const v = visited[s.id].length
          const c = correct[s.id].length
          const total = s.items.length
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSectionChange(s.id)}
              style={{
                flex: 1,
                padding: '10px 12px',
                background: active ? T.accent : 'transparent',
                color: active ? T.accentFg : T.textDim,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 2,
                textTransform: 'uppercase',
                textAlign: 'left',
              }}
            >
              <div>{s.label}</div>
              <div style={{ fontSize: 9, opacity: 0.7, marginTop: 2 }}>
                {v}/{total} seen · {c}/{total} ✓
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────── */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: T.cardBg,
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────── */

function ImagePane({
  item,
  src,
  phase,
  onPhaseChange,
}: {
  item: DeepDiveItem
  src: string
  phase: Phase
  onPhaseChange: (p: Phase) => void
}) {
  const [imgFailed, setImgFailed] = useState(false)
  useEffect(() => setImgFailed(false), [src])

  return (
    <div style={{ position: 'relative', background: '#0a1518' }}>
      {!imgFailed ? (
        <img
          src={src}
          alt={item.label}
          style={{ display: 'block', width: '100%', maxHeight: 420, objectFit: 'contain' }}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div style={{ padding: 48, textAlign: 'center', color: T.textDim }}>
          <p style={{ fontSize: 12, marginBottom: 6 }}>Image not found:</p>
          <code style={{ color: T.accent, fontSize: 11 }}>{src}</code>
        </div>
      )}

      {/* Phase toggle in the bottom-left corner of the image. */}
      <div
        style={{
          position: 'absolute',
          left: 12,
          bottom: 12,
          display: 'flex',
          gap: 4,
          border: `1px solid ${T.border}`,
          borderRadius: 4,
          overflow: 'hidden',
          background: T.cardBg,
        }}
      >
        {(['normal', 'highlight'] as const).map(p => {
          const active = p === phase
          return (
            <button
              key={p}
              type="button"
              onClick={() => onPhaseChange(p)}
              style={{
                padding: '6px 12px',
                background: active ? T.accent : 'transparent',
                color: active ? T.accentFg : T.textDim,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 2,
                textTransform: 'uppercase',
              }}
            >
              {p}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────── */

function NavStrip({
  itemIdx,
  total,
  label,
  number,
  visited,
  correct,
  onPrev,
  onNext,
}: {
  itemIdx: number
  total: number
  label: string
  number: number
  visited: boolean
  correct: boolean
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderTop: `1px solid ${T.border}`,
        borderBottom: `1px solid ${T.border}`,
        background: T.accentSoft,
      }}
    >
      <button
        type="button"
        onClick={onPrev}
        disabled={itemIdx === 0}
        style={navBtnStyle(itemIdx === 0)}
      >
        ◀ PREV
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            display: 'inline-grid',
            placeItems: 'center',
            width: 24,
            height: 24,
            borderRadius: '50%',
            fontSize: 12,
            fontWeight: 900,
            background: correct ? T.good : visited ? T.accent : T.border,
            color: correct || visited ? '#000' : T.text,
          }}
        >
          {number}
        </span>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, letterSpacing: 1, textTransform: 'uppercase' }}>
            {label}
          </div>
          <div style={{ fontSize: 9, color: T.textDim, marginTop: 2, letterSpacing: 2 }}>
            {itemIdx + 1} OF {total}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={itemIdx === total - 1}
        style={navBtnStyle(itemIdx === total - 1)}
      >
        NEXT ▶
      </button>
    </div>
  )
}

function navBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '8px 14px',
    background: 'transparent',
    color: disabled ? T.textDim : T.accent,
    border: `1px solid ${disabled ? T.border : T.accent}`,
    borderRadius: 4,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: 'uppercase',
    opacity: disabled ? 0.4 : 1,
  }
}

/* ──────────────────────────────────────────────────────────────────────────── */

function QuestionPane({
  questionNumber,
  sectionLabel,
  opts,
  selected,
  confirmed,
  correctIdx,
  onSelect,
  onConfirm,
  onNext,
  isLast,
}: {
  questionNumber: number
  sectionLabel: string
  opts: [string, string, string]
  selected: number | null
  confirmed: boolean
  correctIdx: number
  onSelect: (i: number) => void
  onConfirm: () => void
  onNext: () => void
  isLast: boolean
}) {
  return (
    <div style={{ padding: 20 }}>
      <div
        style={{
          color: T.accent,
          fontSize: 11,
          fontWeight: 900,
          letterSpacing: 2,
          marginBottom: 6,
        }}
      >
        Q{questionNumber}
      </div>
      <p style={{ fontSize: 14, color: T.text, marginBottom: 18, lineHeight: 1.45 }}>
        What does the inspector say about the highlighted part of the {sectionLabel.toLowerCase()}?
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {opts.map((opt, i) => {
          const label = ['A', 'B', 'C'][i]
          const isPickedRight = confirmed && selected === i && i === correctIdx
          const isPickedWrong = confirmed && selected === i && i !== correctIdx
          const isCorrect = confirmed && i === correctIdx
          const bg = isPickedRight || isCorrect
            ? `color-mix(in oklab, ${T.good} 18%, ${T.cardBg})`
            : isPickedWrong
              ? `color-mix(in oklab, ${T.bad} 18%, ${T.cardBg})`
              : selected === i
                ? T.accentSoft
                : 'transparent'
          const border = isPickedRight || isCorrect
            ? T.good
            : isPickedWrong
              ? T.bad
              : selected === i
                ? T.accent
                : T.border
          return (
            <div
              key={i}
              onClick={() => onSelect(i)}
              role="button"
              tabIndex={0}
              style={{
                padding: '10px 12px',
                background: bg,
                border: `1px solid ${border}`,
                borderRadius: 6,
                cursor: confirmed ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <span
                style={{
                  display: 'inline-grid',
                  placeItems: 'center',
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: T.accentSoft,
                  color: T.accent,
                  fontWeight: 900,
                  fontSize: 12,
                  flexShrink: 0,
                }}
              >
                {label}
              </span>
              <span style={{ flex: 1, fontSize: 12, lineHeight: 1.45, color: T.text }}>
                {opt}
              </span>
              {isPickedRight || (isCorrect && confirmed) ? (
                <span style={{ color: T.good, fontWeight: 900 }}>✓</span>
              ) : isPickedWrong ? (
                <span style={{ color: T.bad, fontWeight: 900 }}>✗</span>
              ) : null}
            </div>
          )
        })}
      </div>

      {!confirmed ? (
        <button
          type="button"
          onClick={onConfirm}
          disabled={selected == null}
          style={{
            width: '100%',
            padding: '12px 0',
            background: selected == null ? T.border : T.accent,
            color: selected == null ? T.textDim : T.accentFg,
            border: 'none',
            borderRadius: 6,
            cursor: selected == null ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 900,
            letterSpacing: 3,
          }}
        >
          CONFIRM
        </button>
      ) : (
        <button
          type="button"
          onClick={onNext}
          disabled={isLast}
          style={{
            width: '100%',
            padding: '12px 0',
            background: T.cardBg,
            color: isLast ? T.textDim : T.good,
            border: `2px solid ${isLast ? T.border : T.good}`,
            borderRadius: 6,
            cursor: isLast ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 900,
            letterSpacing: 3,
          }}
        >
          {isLast ? 'END OF SECTION' : 'NEXT ▶'}
        </button>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────── */

function ProgressFooter({
  section,
  visited,
  correct,
  total,
}: {
  section: string
  visited: number
  correct: number
  total: number
}) {
  return (
    <div
      style={{
        marginTop: 16,
        padding: '10px 12px',
        fontSize: 10,
        color: T.textDim,
        letterSpacing: 2,
        textTransform: 'uppercase',
        textAlign: 'center',
      }}
    >
      {section} · {visited}/{total} seen · <span style={{ color: T.good }}>{correct}/{total} correct</span>
    </div>
  )
}
