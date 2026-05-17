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

import { useEffect, useMemo, useState } from 'react'
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

type Mode = 'study' | 'quiz'

/* ──────────────────────────────────────────────────────────────────────────── */

export default function CdlPreTripPartsMap() {
  const [sectionIdx, setSectionIdx] = useState(0)
  const [mode, setMode] = useState<Mode>('study')
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null)
  const [quizPromptIdx, setQuizPromptIdx] = useState(0)
  const [quizScore, setQuizScore] = useState({ correct: 0, total: 0 })
  const [feedback, setFeedback] = useState<null | 'good' | 'bad'>(null)

  const section = PRETRIP_INSPECTION_SECTIONS[sectionIdx]!

  /* When switching section or mode, reset interaction state so the user starts
   * fresh — no leftover selected hotspot from the previous section. */
  useEffect(() => {
    setSelectedNumber(null)
    setQuizPromptIdx(0)
    setQuizScore({ correct: 0, total: 0 })
    setFeedback(null)
  }, [sectionIdx, mode])

  const selectedHotspot = useMemo<PartHotspot | null>(() => {
    if (mode === 'study') {
      return section.hotspots.find(h => h.number === selectedNumber) ?? null
    }
    return section.hotspots[quizPromptIdx] ?? null
  }, [mode, section, selectedNumber, quizPromptIdx])

  const onHotspotClick = (h: PartHotspot) => {
    if (mode === 'study') {
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

      <main
        className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-6 lg:grid-cols-[2fr_1fr]"
      >
        <PhotoWithHotspots
          section={section}
          mode={mode}
          selectedNumber={selectedHotspot?.number ?? null}
          feedback={feedback}
          onHotspotClick={onHotspotClick}
        />
        <InfoCard
          section={section}
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
          {(['study', 'quiz'] as const).map(m => {
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
}: {
  section: InspectionSection
  mode: Mode
  selectedNumber: number | null
  feedback: null | 'good' | 'bad'
  onHotspotClick: (h: PartHotspot) => void
}) {
  /* Track whether the photo file actually loaded — if it errors (e.g. file missing
   * before the user has dropped it in `public/cdl-pretrip/`), fall back to the
   * stylized placeholder. State is keyed on imagePath so it resets per section. */
  const [imgFailed, setImgFailed] = useState(false)
  useEffect(() => setImgFailed(false), [section.imagePath])

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
          className="absolute inset-0 size-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-label={`${section.title} hotspots`}
        >
          {section.hotspots.map(h => (
            <Hotspot
              key={h.number}
              hotspot={h}
              selected={selectedNumber === h.number}
              feedback={selectedNumber === h.number ? feedback : null}
              onClick={() => onHotspotClick(h)}
            />
          ))}
        </svg>
      </div>

      {/* Caption strip — section blurb + "say opener". */}
      <div
        className="border-t px-4 py-3 text-[11px] leading-relaxed"
        style={{ borderColor: T.border, color: T.textDim }}
      >
        <p style={{ color: T.text }} className="mb-1 font-semibold uppercase tracking-wide">
          {mode === 'quiz' ? 'CLICK THE HOTSPOT THAT MATCHES THE PROMPT' : section.blurb}
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
  onClick,
}: {
  hotspot: PartHotspot
  selected: boolean
  feedback: null | 'good' | 'bad'
  onClick: () => void
}) {
  const fill = feedback === 'good' ? T.good : feedback === 'bad' ? T.bad : selected ? T.accent : '#f5c429'
  const radius = selected ? 3.6 : 3
  return (
    <g style={{ cursor: 'pointer' }} onClick={onClick}>
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
