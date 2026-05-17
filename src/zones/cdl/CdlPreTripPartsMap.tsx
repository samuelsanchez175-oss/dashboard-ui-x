/**
 * CDL Class A — Outside Pre-Trip — INTERACTIVE PARTS MAP
 *
 * Sister test to the existing `CdlPreTrip*Page` quizzes. Instead of multiple-choice,
 * this one shows a photo of each inspection area with numbered hotspots overlaid
 * (matching the yellow circles on the user's study sheet). Clicking a hotspot
 * reveals the part name, the verbal inspection sentence ("how to say it"), and
 * the physical action ("how to act on it").
 *
 * Two modes:
 *   STUDY — click a hotspot, info appears. No score, no pressure.
 *   QUIZ  — info panel shows the part name first; user clicks the matching
 *           hotspot. Correct → green, wrong → red flash + try again. Score tracked.
 *
 * Photos live in `public/cdl-pretrip/` — the component falls back to a stylized
 * SVG placeholder when an image is missing, so this works even before the photos
 * are dropped in.
 */

import { type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  PRETRIP_INSPECTION_SECTIONS,
  PRETRIP_TOTALS,
  type InspectionSection,
  type PartHotspot,
} from './cdl-pretrip-parts-map-data'

/* Theme — matches the existing cyan/teal pre-trip aesthetic from CdlPreTripEngineBayPage. */
const T = {
  pageBg: '#04090b',
  cardBg: '#070f12',
  accent: '#22d3ee',
  accentSoft: '#0c2128',
  good: '#39ff14',
  bad: '#ff4d4d',
  text: '#c4e6ec',
  textDim: '#4a7480',
  border: '#13303a',
  borderHot: '#22d3ee',
} as const

type Mode = 'study' | 'quiz' | 'edit'

/**
 * Position override map keyed `sectionId -> hotspotNumber -> {x,y}`. Stored only
 * in component state — edits never mutate the source data file. Use the
 * "COPY JSON" button in EDIT mode to round-trip the new positions back into
 * `cdl-pretrip-parts-map-data.ts`.
 */
type EditMap = Record<string, Record<number, { x: number; y: number }>>

/* ──────────────────────────────────────────────────────────────────────────── */

export default function CdlPreTripPartsMap() {
  const [sectionIdx, setSectionIdx] = useState(0)
  const [mode, setMode] = useState<Mode>('study')
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null)
  const [quizPromptIdx, setQuizPromptIdx] = useState(0)
  const [quizScore, setQuizScore] = useState({ correct: 0, total: 0 })
  const [feedback, setFeedback] = useState<null | 'good' | 'bad'>(null)
  /* Position overrides live here so edits accumulate across section switches
   * (you can edit sections 1, 4, and 6 in one sitting and copy ONE patch out). */
  const [editMap, setEditMap] = useState<EditMap>({})

  const section = PRETRIP_INSPECTION_SECTIONS[sectionIdx]!

  /** Apply any edit-mode overrides on top of the source data. */
  const sectionWithOverrides = useMemo<InspectionSection>(() => {
    const overrides = editMap[section.id]
    if (!overrides) return section
    return {
      ...section,
      hotspots: section.hotspots.map(h => {
        const o = overrides[h.number]
        return o ? { ...h, position: o } : h
      }),
    }
  }, [section, editMap])

  const updateHotspotPosition = useCallback(
    (sectionId: string, hotspotNumber: number, position: { x: number; y: number }) => {
      setEditMap(prev => ({
        ...prev,
        [sectionId]: { ...(prev[sectionId] ?? {}), [hotspotNumber]: position },
      }))
    },
    [],
  )

  /* When switching section or mode, reset interaction state so the user starts
   * fresh — no leftover selected hotspot from the previous section. The editMap
   * is intentionally NOT reset; edits persist until the page reloads. */
  useEffect(() => {
    setSelectedNumber(null)
    setQuizPromptIdx(0)
    setQuizScore({ correct: 0, total: 0 })
    setFeedback(null)
  }, [sectionIdx, mode])

  const selectedHotspot = useMemo<PartHotspot | null>(() => {
    if (mode === 'study' || mode === 'edit') {
      return sectionWithOverrides.hotspots.find(h => h.number === selectedNumber) ?? null
    }
    return sectionWithOverrides.hotspots[quizPromptIdx] ?? null
  }, [mode, sectionWithOverrides, selectedNumber, quizPromptIdx])

  const onHotspotClick = (h: PartHotspot) => {
    if (mode === 'study' || mode === 'edit') {
      setSelectedNumber(prev => (prev === h.number ? null : h.number))
      return
    }
    /* Quiz mode: compare the click against the current prompt. */
    const target = section.hotspots[quizPromptIdx]
    if (!target) return
    const correct = h.number === target.number
    setFeedback(correct ? 'good' : 'bad')
    setQuizScore(s => ({
      correct: s.correct + (correct ? 1 : 0),
      total: s.total + 1,
    }))
    if (correct) {
      /* Advance to the next prompt (wrap at the end). */
      window.setTimeout(() => {
        setFeedback(null)
        setQuizPromptIdx(i => (i + 1) % section.hotspots.length)
      }, 700)
    } else {
      window.setTimeout(() => setFeedback(null), 700)
    }
  }

  return (
    <div className="min-h-dvh w-full" style={{ background: T.pageBg, color: T.text }}>
      <Header section={section} mode={mode} onModeChange={setMode} quizScore={quizScore} />

      <SectionTabs
        sections={PRETRIP_INSPECTION_SECTIONS}
        activeIdx={sectionIdx}
        onChange={setSectionIdx}
      />

      {mode === 'edit' && (
        <EditModeToolbar
          section={sectionWithOverrides}
          editMap={editMap}
          onReset={() => setEditMap(prev => ({ ...prev, [section.id]: {} }))}
          onResetAll={() => setEditMap({})}
        />
      )}

      <main
        className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-6 lg:grid-cols-[2fr_1fr]"
      >
        <PhotoWithHotspots
          section={sectionWithOverrides}
          mode={mode}
          selectedNumber={selectedHotspot?.number ?? null}
          feedback={feedback}
          onHotspotClick={onHotspotClick}
          onHotspotDrag={(num, pos) => updateHotspotPosition(section.id, num, pos)}
        />
        <InfoCard
          section={sectionWithOverrides}
          mode={mode}
          hotspot={selectedHotspot}
          showLabelInQuiz={mode === 'quiz'}
        />
      </main>

      <Footer />
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────── */

function Header({
  section,
  mode,
  onModeChange,
  quizScore,
}: {
  section: InspectionSection
  mode: Mode
  onModeChange: (m: Mode) => void
  quizScore: { correct: number; total: number }
}) {
  return (
    <header
      className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
      style={{ background: T.cardBg, borderColor: T.border }}
    >
      <div className="flex items-center gap-3">
        <span
          className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
          style={{ background: T.accentSoft, color: T.accent, border: `1px solid ${T.border}` }}
        >
          PARTS MAP
        </span>
        <span
          className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
          style={{ background: T.accentSoft, color: T.accent }}
        >
          STEP {section.step}
        </span>
        <h1
          className="text-base font-semibold uppercase tracking-[0.18em]"
          style={{ color: T.text }}
        >
          {section.title}
        </h1>
      </div>

      <div className="flex items-center gap-3">
        {mode === 'quiz' && (
          <span
            className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{ background: T.accentSoft, color: T.text }}
          >
            SCORE {quizScore.correct} / {quizScore.total}
          </span>
        )}
        <div
          className="flex overflow-hidden rounded-md"
          style={{ border: `1px solid ${T.border}` }}
        >
          {(['study', 'quiz', 'edit'] as const).map(m => {
            const active = m === mode
            return (
              <button
                key={m}
                type="button"
                onClick={() => onModeChange(m)}
                className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors"
                style={{
                  background: active ? T.accent : 'transparent',
                  color: active ? '#000' : T.textDim,
                }}
              >
                {m}
              </button>
            )
          })}
        </div>
      </div>
    </header>
  )
}

/* ──────────────────────────────────────────────────────────────────────────── */

function SectionTabs({
  sections,
  activeIdx,
  onChange,
}: {
  sections: readonly InspectionSection[]
  activeIdx: number
  onChange: (i: number) => void
}) {
  return (
    <nav
      className="flex w-full overflow-x-auto border-b"
      style={{ background: T.cardBg, borderColor: T.border }}
    >
      {sections.map((s, i) => {
        const active = i === activeIdx
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(i)}
            className="flex shrink-0 flex-col items-start gap-0.5 px-4 py-3 text-left transition-colors"
            style={{
              background: active ? T.accentSoft : 'transparent',
              borderRight: `1px solid ${T.border}`,
              color: active ? T.text : T.textDim,
              minWidth: 168,
            }}
          >
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: active ? T.accent : T.textDim }}
            >
              {s.step}. {s.id}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide">{s.title}</span>
          </button>
        )
      })}
    </nav>
  )
}

/* ──────────────────────────────────────────────────────────────────────────── */

function PhotoWithHotspots({
  section,
  mode,
  selectedNumber,
  feedback,
  onHotspotClick,
  onHotspotDrag,
}: {
  section: InspectionSection
  mode: Mode
  selectedNumber: number | null
  feedback: null | 'good' | 'bad'
  onHotspotClick: (h: PartHotspot) => void
  onHotspotDrag: (hotspotNumber: number, position: { x: number; y: number }) => void
}) {
  /* Track whether the photo file actually loaded — if it errors (e.g. file missing
   * before the user has dropped it in `public/cdl-pretrip/`), fall back to the
   * stylized placeholder. State is keyed on imagePath so it resets per section. */
  const [imgFailed, setImgFailed] = useState(false)
  useEffect(() => setImgFailed(false), [section.imagePath])

  const svgRef = useRef<SVGSVGElement | null>(null)
  const draggingRef = useRef<number | null>(null)

  /** Convert a pointer's client-pixel position to a 0..100 % inside the SVG box. */
  const pctFromPointer = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
    }
  }

  /* Drag wiring — only used in EDIT mode. PointerDown starts a drag for a specific
   * hotspot; PointerMove updates its position; PointerUp ends the drag. We attach
   * the move/up listeners to window so the drag survives even if the pointer
   * leaves the SVG bounds briefly. */
  useEffect(() => {
    if (mode !== 'edit') return
    const onMove = (e: PointerEvent) => {
      if (draggingRef.current == null) return
      const pos = pctFromPointer(e)
      if (pos) onHotspotDrag(draggingRef.current, pos)
    }
    const onUp = () => {
      draggingRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [mode, onHotspotDrag])

  return (
    <section
      className="relative overflow-hidden rounded-lg"
      style={{ border: `1px solid ${T.border}`, background: T.cardBg }}
    >
      {/* 3:2 aspect ratio box — keeps the photo + overlay aligned regardless of viewport. */}
      <div className="relative w-full" style={{ aspectRatio: '3 / 2' }}>
        {!imgFailed ? (
          <img
            src={section.imagePath}
            alt={section.title}
            className="absolute inset-0 size-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <PhotoPlaceholder section={section} />
        )}

        {/* SVG hotspot overlay — viewBox is 0..100 so hotspot positions are %s. */}
        <svg
          ref={svgRef}
          className="absolute inset-0 size-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-label={`${section.title} hotspots`}
          style={mode === 'edit' ? { cursor: 'crosshair' } : undefined}
        >
          {section.hotspots.map(h => (
            <Hotspot
              key={h.number}
              hotspot={h}
              selected={selectedNumber === h.number}
              feedback={selectedNumber === h.number ? feedback : null}
              draggable={mode === 'edit'}
              onClick={() => onHotspotClick(h)}
              onPointerDown={e => {
                if (mode !== 'edit') return
                draggingRef.current = h.number
                onHotspotClick(h)
                ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
              }}
            />
          ))}
        </svg>
      </div>

      {/* Caption strip — section blurb + "say opener" (study/quiz) or instructions (edit). */}
      <div
        className="border-t px-4 py-3 text-[11px] leading-relaxed"
        style={{ borderColor: T.border, color: T.textDim }}
      >
        <p style={{ color: T.text }} className="mb-1 font-semibold uppercase tracking-wide">
          {mode === 'edit'
            ? 'DRAG ANY HOTSPOT TO REPOSITION · COPY JSON ABOVE WHEN DONE'
            : mode === 'quiz'
              ? 'CLICK THE HOTSPOT THAT MATCHES THE PROMPT'
              : section.blurb}
        </p>
        <p>"{section.sayOpener}"</p>
      </div>
    </section>
  )
}

function Hotspot({
  hotspot,
  selected,
  feedback,
  draggable,
  onClick,
  onPointerDown,
}: {
  hotspot: PartHotspot
  selected: boolean
  feedback: null | 'good' | 'bad'
  draggable: boolean
  onClick: () => void
  onPointerDown: (e: ReactPointerEvent<SVGGElement>) => void
}) {
  const fill = feedback === 'good' ? T.good : feedback === 'bad' ? T.bad : selected ? T.accent : '#f5c429'
  const radius = selected ? 3.6 : 3
  return (
    <g
      style={{ cursor: draggable ? 'grab' : 'pointer' }}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      {/* Soft glow ring on selected. */}
      {selected && (
        <circle
          cx={hotspot.position.x}
          cy={hotspot.position.y}
          r={radius + 2}
          fill="none"
          stroke={fill}
          strokeWidth={0.4}
          opacity={0.4}
        />
      )}
      <circle
        cx={hotspot.position.x}
        cy={hotspot.position.y}
        r={radius}
        fill={fill}
        stroke="#000"
        strokeWidth={0.4}
      />
      <text
        x={hotspot.position.x}
        y={hotspot.position.y + 1.1}
        textAnchor="middle"
        fontSize={3.4}
        fontWeight={700}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fill="#000"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {hotspot.number}
      </text>
    </g>
  )
}

function PhotoPlaceholder({ section }: { section: InspectionSection }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center"
      style={{
        background: `radial-gradient(circle at 50% 30%, ${T.accentSoft}, ${T.cardBg} 70%)`,
        color: T.textDim,
      }}
    >
      <span
        className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
        style={{ background: T.cardBg, color: T.accent, border: `1px solid ${T.border}` }}
      >
        PHOTO PLACEHOLDER
      </span>
      <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: T.text }}>
        {section.title}
      </p>
      <p className="text-[11px]" style={{ color: T.textDim }}>
        Drop the inspection-area photo at <code style={{ color: T.accent }}>{section.imagePath}</code>
      </p>
      <p className="text-[11px] opacity-60">
        Hotspots already work — click any numbered circle.
      </p>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────── */

function InfoCard({
  section,
  mode,
  hotspot,
  showLabelInQuiz,
}: {
  section: InspectionSection
  mode: Mode
  hotspot: PartHotspot | null
  showLabelInQuiz: boolean
}) {
  if (!hotspot) {
    return (
      <aside
        className="flex flex-col gap-3 rounded-lg p-4"
        style={{ background: T.cardBg, border: `1px solid ${T.border}` }}
      >
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: T.accent }}
        >
          {mode === 'quiz' ? 'QUIZ READY' : 'PICK A NUMBER'}
        </span>
        <p className="text-sm" style={{ color: T.text }}>
          {mode === 'quiz'
            ? 'Click a hotspot to start the quiz.'
            : 'Click any numbered circle on the photo to see what to say and how to act.'}
        </p>
        <SectionActSteps section={section} />
      </aside>
    )
  }

  return (
    <aside
      className="flex flex-col gap-3 rounded-lg p-4"
      style={{ background: T.cardBg, border: `1px solid ${T.borderHot}` }}
    >
      <div className="flex items-center gap-2">
        <span
          className="grid size-7 place-items-center rounded-full text-[12px] font-bold"
          style={{ background: T.accent, color: '#000' }}
        >
          {hotspot.number}
        </span>
        <h2
          className="text-sm font-semibold uppercase tracking-wide"
          style={{ color: T.text }}
        >
          {showLabelInQuiz ? `Find: ${hotspot.label}` : hotspot.label}
        </h2>
      </div>

      {mode === 'edit' && (
        <div className="flex flex-col gap-1">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: T.accent }}
          >
            POSITION (X% / Y%)
          </span>
          <p className="font-mono text-[13px] leading-relaxed" style={{ color: T.text }}>
            x: {hotspot.position.x.toFixed(1)} · y: {hotspot.position.y.toFixed(1)}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: T.accent }}
        >
          HOW TO SAY IT
        </span>
        <p className="text-[13px] leading-relaxed" style={{ color: T.text }}>
          "{hotspot.sayIt}"
        </p>
      </div>

      {hotspot.actOn && (
        <div className="flex flex-col gap-1">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: T.accent }}
          >
            HOW TO ACT
          </span>
          <p className="text-[12px] leading-relaxed" style={{ color: T.textDim }}>
            {hotspot.actOn}
          </p>
        </div>
      )}

      <SectionActSteps section={section} />
    </aside>
  )
}

function SectionActSteps({ section }: { section: InspectionSection }) {
  return (
    <details className="rounded-md p-2" style={{ background: T.accentSoft }}>
      <summary
        className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: T.accent }}
      >
        Section walk-through ({section.actSteps.length} steps)
      </summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-[11px]" style={{ color: T.textDim }}>
        {section.actSteps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </details>
  )
}

/* ──────────────────────────────────────────────────────────────────────────── */

/* ──────────────────────────────────────────────────────────────────────────── */

function EditModeToolbar({
  section,
  editMap,
  onReset,
  onResetAll,
}: {
  section: InspectionSection
  editMap: EditMap
  onReset: () => void
  onResetAll: () => void
}) {
  const [copied, setCopied] = useState<'section' | 'all' | null>(null)
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(null), 1500)
    return () => window.clearTimeout(t)
  }, [copied])

  /** Build the JSON snippet for THIS section's hotspots in their current positions. */
  const sectionJson = useMemo(() => {
    const lines = section.hotspots.map(h => {
      const x = h.position.x.toFixed(1)
      const y = h.position.y.toFixed(1)
      return `  { number: ${h.number}, label: ${JSON.stringify(h.label)}, position: { x: ${x}, y: ${y} } },`
    })
    return `// section: ${section.id}\n[\n${lines.join('\n')}\n]`
  }, [section])

  /** Build a JSON snippet covering EVERY section that has overrides. */
  const allJson = useMemo(() => {
    const sectionsWithEdits = Object.keys(editMap).filter(id => Object.keys(editMap[id] ?? {}).length > 0)
    if (sectionsWithEdits.length === 0) return ''
    const blocks = sectionsWithEdits.map(id => {
      const overrides = editMap[id]!
      const entries = Object.entries(overrides)
        .map(
          ([num, pos]) =>
            `    ${num}: { x: ${pos.x.toFixed(1)}, y: ${pos.y.toFixed(1)} },`,
        )
        .join('\n')
      return `  ${JSON.stringify(id)}: {\n${entries}\n  },`
    })
    return `// Per-section position overrides — drop into cdl-pretrip-parts-map-data.ts\n{\n${blocks.join('\n')}\n}`
  }, [editMap])

  const sectionEditedCount = Object.keys(editMap[section.id] ?? {}).length
  const totalEditedCount = Object.values(editMap).reduce((n, m) => n + Object.keys(m).length, 0)

  const copy = async (text: string, scope: 'section' | 'all') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(scope)
    } catch {
      /* Clipboard API can fail in non-secure contexts — fall through to no-op. */
    }
  }

  return (
    <div
      className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-4 py-3"
      style={{ background: T.accentSoft, borderBottom: `1px solid ${T.border}` }}
    >
      <span
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: T.accent }}
      >
        EDIT MODE
      </span>
      <span className="text-[11px]" style={{ color: T.text }}>
        {sectionEditedCount} edits in this section · {totalEditedCount} total · drag any hotspot to reposition
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <ToolbarButton onClick={() => copy(sectionJson, 'section')}>
          {copied === 'section' ? 'COPIED' : 'COPY THIS SECTION'}
        </ToolbarButton>
        <ToolbarButton onClick={() => copy(allJson || sectionJson, 'all')} disabled={totalEditedCount === 0}>
          {copied === 'all' ? 'COPIED' : `COPY ALL EDITS (${totalEditedCount})`}
        </ToolbarButton>
        <ToolbarButton onClick={onReset} disabled={sectionEditedCount === 0}>
          RESET SECTION
        </ToolbarButton>
        <ToolbarButton onClick={onResetAll} disabled={totalEditedCount === 0}>
          RESET ALL
        </ToolbarButton>
      </div>
    </div>
  )
}

function ToolbarButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        background: T.cardBg,
        color: T.accent,
        border: `1px solid ${T.border}`,
      }}
    >
      {children}
    </button>
  )
}

/* ──────────────────────────────────────────────────────────────────────────── */

function Footer() {
  return (
    <footer
      className="mx-auto max-w-6xl px-4 py-4 text-[11px]"
      style={{ color: T.textDim }}
    >
      {PRETRIP_TOTALS.sectionCount} sections · {PRETRIP_TOTALS.hotspotCount} hotspots ·
      Practice key phrases: <em style={{ color: T.text }}>"properly mounted and secured"</em> and
      <em style={{ color: T.text }}> "not cracked, bent, broken, loose, leaking, missing, or damaged."</em>
    </footer>
  )
}
