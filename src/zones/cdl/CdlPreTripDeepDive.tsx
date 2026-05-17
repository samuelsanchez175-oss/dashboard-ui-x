/**
 * CDL Class A — Outside Pre-Trip — DEEP DIVE
 *
 * Sister tool to `CdlPreTripPartsMap`. Where the Parts Map is one photo per
 * section with multiple hotspots, the Deep Dive is ONE photo per part — 38
 * individual photos across Engine Bay (11), In-Cabin (11), and Trailer (16).
 * Each photo carries the part name in an orange tag and the verbal inspection
 * sentence rendered on top, so the screen always teaches in plain sight.
 *
 * UX (flashcard):
 *   - Section tabs at top — Engine / Cabin / Trailer.
 *   - Sidebar lists every part in the active section; click to switch.
 *   - Main pane shows the selected part's photo at full width.
 *   - Header has 🔊 SPEAK, ▶ WALK, Quiz toggle, and visited progress.
 *   - localStorage persists visited + auto-speak preference across reloads.
 *
 * Reuses the same TTS helper and visited-tracking pattern as the Parts Map
 * so they feel like one continuous study app — but the data shape is
 * different (per-part photos vs. per-section photo+hotspots).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DEEP_DIVE_SECTIONS,
  DEEP_DIVE_TOTALS,
  type DeepDiveItem,
  type DeepDiveSection,
  type DeepDiveSectionId,
} from './cdl-pretrip-deep-data'

/* Cyan/teal theme matches the existing CDL pre-trip pages. */
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
} as const

type Mode = 'study' | 'quiz'

type VisitedMap = Record<DeepDiveSectionId, number[]>

const VISITED_STORAGE_KEY = 'cdl-pretrip-deep-visited'
const AUTOSPEAK_STORAGE_KEY = 'cdl-pretrip-deep-autospeak'

const EMPTY_VISITED: VisitedMap = { engine: [], cabin: [], trailer: [] }

function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 0.95
  u.pitch = 1.0
  window.speechSynthesis.speak(u)
}

function cancelSpeech() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
}

/* ──────────────────────────────────────────────────────────────────────────── */

export default function CdlPreTripDeepDive({ onNavigate }: { onNavigate?: (routeId: string) => void } = {}) {
  const [sectionId, setSectionId] = useState<DeepDiveSectionId>('engine')
  const [itemIdx, setItemIdx] = useState(0)
  const [mode, setMode] = useState<Mode>('study')
  const [quizAnswer, setQuizAnswer] = useState<null | 'good' | 'bad'>(null)
  const [quizScore, setQuizScore] = useState({ correct: 0, total: 0 })
  const [walking, setWalking] = useState(false)

  const [visited, setVisited] = useState<VisitedMap>(() => {
    if (typeof window === 'undefined') return EMPTY_VISITED
    try {
      const raw = window.localStorage.getItem(VISITED_STORAGE_KEY)
      if (!raw) return EMPTY_VISITED
      const parsed = JSON.parse(raw) as Partial<VisitedMap>
      return {
        engine: parsed.engine ?? [],
        cabin: parsed.cabin ?? [],
        trailer: parsed.trailer ?? [],
      }
    } catch {
      return EMPTY_VISITED
    }
  })

  const [autoSpeak, setAutoSpeak] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(AUTOSPEAK_STORAGE_KEY) === '1'
  })

  const section = useMemo<DeepDiveSection>(
    () => DEEP_DIVE_SECTIONS.find(s => s.id === sectionId) ?? DEEP_DIVE_SECTIONS[0]!,
    [sectionId],
  )
  const item = section.items[itemIdx] ?? section.items[0]!

  /* When switching sections, reset item index + quiz state — but keep visited
   * tracking and the user's auto-speak preference. */
  useEffect(() => {
    setItemIdx(0)
    setQuizAnswer(null)
    setQuizScore({ correct: 0, total: 0 })
    setWalking(false)
    cancelSpeech()
  }, [sectionId, mode])

  /* Persist visited + autoSpeak. */
  useEffect(() => {
    try {
      window.localStorage.setItem(VISITED_STORAGE_KEY, JSON.stringify(visited))
    } catch {
      /* QuotaExceeded — silently no-op. */
    }
  }, [visited])
  useEffect(() => {
    try {
      window.localStorage.setItem(AUTOSPEAK_STORAGE_KEY, autoSpeak ? '1' : '0')
    } catch {
      /* QuotaExceeded — silently no-op. */
    }
  }, [autoSpeak])

  /* Mark the current item visited whenever it changes (study mode only).
   * Quiz mode marks visited only when the user gets it right (see below). */
  useEffect(() => {
    if (mode !== 'study') return
    setVisited(prev => {
      const cur = prev[sectionId]
      if (cur.includes(item.number)) return prev
      return { ...prev, [sectionId]: [...cur, item.number] }
    })
  }, [sectionId, item.number, mode])

  /* Auto-speak the selected item's sayIt whenever it changes. */
  useEffect(() => {
    if (autoSpeak) speak(item.sayIt)
  }, [autoSpeak, item])

  /* Walk-through: auto-advance through items in study mode. */
  useEffect(() => {
    if (!walking || mode !== 'study') {
      if (walking) setWalking(false)
      return
    }
    const t = window.setTimeout(() => {
      const next = itemIdx + 1
      if (next >= section.items.length) {
        setWalking(false)
        cancelSpeech()
        return
      }
      setItemIdx(next)
    }, 6000)
    return () => window.clearTimeout(t)
  }, [walking, itemIdx, section.items.length, mode])

  /* Cancel speech on unmount. */
  useEffect(() => () => cancelSpeech(), [])

  const markVisited = useCallback((sid: DeepDiveSectionId, n: number) => {
    setVisited(prev => {
      const cur = prev[sid]
      if (cur.includes(n)) return prev
      return { ...prev, [sid]: [...cur, n] }
    })
  }, [])

  const onQuizAnswer = useCallback(
    (correct: boolean) => {
      setQuizAnswer(correct ? 'good' : 'bad')
      setQuizScore(s => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }))
      if (correct) {
        markVisited(sectionId, item.number)
        window.setTimeout(() => {
          setQuizAnswer(null)
          setItemIdx(i => Math.min(i + 1, section.items.length - 1))
        }, 700)
      } else {
        window.setTimeout(() => setQuizAnswer(null), 700)
      }
    },
    [sectionId, item.number, section.items.length, markVisited],
  )

  const visitedHere = visited[sectionId]
  const allVisited = section.items.every(i => visitedHere.includes(i.number))

  return (
    <div className="min-h-dvh w-full" style={{ background: T.pageBg, color: T.text }}>
      <Header
        section={section}
        item={item}
        mode={mode}
        onModeChange={setMode}
        quizScore={quizScore}
        autoSpeak={autoSpeak}
        onAutoSpeakToggle={() => setAutoSpeak(v => !v)}
        walking={walking}
        onWalkToggle={() => {
          setWalking(v => !v)
          if (walking) cancelSpeech()
        }}
        canWalk={mode === 'study'}
        visitedCount={visitedHere.length}
        totalCount={section.items.length}
        allVisited={allVisited}
        onResetVisited={() => setVisited(prev => ({ ...prev, [sectionId]: [] }))}
      />

      <SectionTabs activeId={sectionId} onChange={setSectionId} visited={visited} />

      {onNavigate && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5"
          style={{ background: T.accentSoft, borderColor: T.border }}
        >
          <span className="text-[11px]" style={{ color: T.text }}>
            Want the section-overview walk-around with multiple hotspots per photo?
          </span>
          <button
            type="button"
            onClick={() => onNavigate('cdl-pretrip-parts-map')}
            className="rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors hover:opacity-90"
            style={{ background: T.accent, color: '#000' }}
          >
            OPEN PARTS MAP → 6 SECTIONS
          </button>
        </div>
      )}

      <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-6 lg:grid-cols-[260px_1fr]">
        <ItemSidebar
          section={section}
          activeNumber={item.number}
          onSelect={n => setItemIdx(section.items.findIndex(i => i.number === n))}
          visited={visitedHere}
          feedback={quizAnswer}
        />
        <PartCard
          item={item}
          mode={mode}
          feedback={quizAnswer}
          onSpeak={() => speak(item.sayIt)}
          onQuizGrade={onQuizAnswer}
        />
      </main>

      <Footer />
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────── */

function Header({
  section,
  item,
  mode,
  onModeChange,
  quizScore,
  autoSpeak,
  onAutoSpeakToggle,
  walking,
  onWalkToggle,
  canWalk,
  visitedCount,
  totalCount,
  allVisited,
  onResetVisited,
}: {
  section: DeepDiveSection
  item: DeepDiveItem
  mode: Mode
  onModeChange: (m: Mode) => void
  quizScore: { correct: number; total: number }
  autoSpeak: boolean
  onAutoSpeakToggle: () => void
  walking: boolean
  onWalkToggle: () => void
  canWalk: boolean
  visitedCount: number
  totalCount: number
  allVisited: boolean
  onResetVisited: () => void
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
          {section.step}
        </span>
        <h1 className="text-base font-semibold uppercase tracking-[0.18em]" style={{ color: T.text }}>
          {item.number}. {item.label}
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onResetVisited}
          disabled={visitedCount === 0}
          title={visitedCount > 0 ? 'Click to reset visited for this section' : 'Click items to mark them visited'}
          className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors disabled:cursor-not-allowed"
          style={{
            background: allVisited ? T.good : T.accentSoft,
            color: allVisited ? '#000' : T.text,
            border: `1px solid ${T.border}`,
          }}
        >
          {allVisited ? '✓ ALL VISITED' : `${visitedCount} / ${totalCount} VISITED`}
        </button>
        <button
          type="button"
          onClick={onAutoSpeakToggle}
          className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors"
          style={{
            background: autoSpeak ? T.accent : 'transparent',
            color: autoSpeak ? '#000' : T.textDim,
            border: `1px solid ${autoSpeak ? T.accent : T.border}`,
          }}
        >
          {autoSpeak ? '🔊 AUTO-SPEAK ON' : '🔈 AUTO-SPEAK'}
        </button>
        <button
          type="button"
          onClick={onWalkToggle}
          disabled={!canWalk}
          className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            background: walking ? T.bad : 'transparent',
            color: walking ? '#000' : T.textDim,
            border: `1px solid ${walking ? T.bad : T.border}`,
          }}
        >
          {walking ? '■ STOP WALK' : '▶ WALK SECTION'}
        </button>
        {mode === 'quiz' && (
          <span
            className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{ background: T.accentSoft, color: T.text }}
          >
            SCORE {quizScore.correct} / {quizScore.total}
          </span>
        )}
        <div className="flex overflow-hidden rounded-md" style={{ border: `1px solid ${T.border}` }}>
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
  activeId,
  onChange,
  visited,
}: {
  activeId: DeepDiveSectionId
  onChange: (id: DeepDiveSectionId) => void
  visited: VisitedMap
}) {
  return (
    <nav
      className="flex w-full overflow-x-auto border-b"
      style={{ background: T.cardBg, borderColor: T.border }}
    >
      {DEEP_DIVE_SECTIONS.map(s => {
        const active = s.id === activeId
        const visitedCount = visited[s.id].length
        const total = s.items.length
        const complete = visitedCount === total && total > 0
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            className="flex shrink-0 flex-col items-start gap-0.5 px-4 py-3 text-left transition-colors"
            style={{
              background: active ? T.accentSoft : 'transparent',
              borderRight: `1px solid ${T.border}`,
              color: active ? T.text : T.textDim,
              minWidth: 168,
            }}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <span
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: active ? T.accent : T.textDim }}
              >
                {s.id}
              </span>
              <span
                className="rounded-sm px-1.5 py-0.5 text-[9px] font-bold tabular-nums"
                style={{
                  background: complete ? T.good : T.accentSoft,
                  color: complete ? '#000' : T.textDim,
                }}
              >
                {complete ? '✓' : `${visitedCount}/${total}`}
              </span>
            </div>
            <span className="text-xs font-semibold uppercase tracking-wide">{s.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

/* ──────────────────────────────────────────────────────────────────────────── */

function ItemSidebar({
  section,
  activeNumber,
  onSelect,
  visited,
  feedback,
}: {
  section: DeepDiveSection
  activeNumber: number
  onSelect: (n: number) => void
  visited: readonly number[]
  feedback: null | 'good' | 'bad'
}) {
  return (
    <aside
      className="rounded-lg p-2"
      style={{ border: `1px solid ${T.border}`, background: T.cardBg }}
    >
      <p
        className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: T.accent }}
      >
        {section.items.length} ITEMS
      </p>
      <ol className="flex flex-col gap-1">
        {section.items.map(it => {
          const active = it.number === activeNumber
          const hasVisited = visited.includes(it.number)
          const ringTint =
            active && feedback === 'good'
              ? T.good
              : active && feedback === 'bad'
                ? T.bad
                : active
                  ? T.accent
                  : hasVisited
                    ? T.good
                    : T.border
          return (
            <li key={it.number}>
              <button
                type="button"
                onClick={() => onSelect(it.number)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors"
                style={{
                  background: active ? T.accentSoft : 'transparent',
                  color: active ? T.text : T.textDim,
                  border: `1px solid ${active ? ringTint : 'transparent'}`,
                }}
              >
                <span
                  className="grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                  style={{
                    background: ringTint,
                    color: active || hasVisited ? '#000' : T.text,
                  }}
                >
                  {it.number}
                </span>
                <span className="truncate font-semibold uppercase tracking-wide">{it.label}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}

/* ──────────────────────────────────────────────────────────────────────────── */

function PartCard({
  item,
  mode,
  feedback,
  onSpeak,
  onQuizGrade,
}: {
  item: DeepDiveItem
  mode: Mode
  feedback: null | 'good' | 'bad'
  onSpeak: () => void
  onQuizGrade: (correct: boolean) => void
}) {
  const [imgFailed, setImgFailed] = useState(false)
  useEffect(() => setImgFailed(false), [item.imagePath])

  /* Coloured frame for quiz feedback. */
  const frameTint = feedback === 'good' ? T.good : feedback === 'bad' ? T.bad : T.border

  return (
    <section
      className="flex flex-col gap-3 overflow-hidden rounded-lg"
      style={{ border: `2px solid ${frameTint}`, background: T.cardBg, transition: 'border-color 0.18s' }}
    >
      <div className="relative w-full" style={{ background: '#0a1518' }}>
        {!imgFailed ? (
          <img
            src={item.imagePath}
            alt={item.label}
            className="block w-full"
            style={{ maxHeight: '60vh', objectFit: 'contain' }}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div
            className="flex h-64 flex-col items-center justify-center gap-2 p-6 text-center"
            style={{ color: T.textDim }}
          >
            <span
              className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
              style={{ background: T.accentSoft, color: T.accent, border: `1px solid ${T.border}` }}
            >
              PHOTO MISSING
            </span>
            <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: T.text }}>
              {item.label}
            </p>
            <p className="text-[11px]">
              Drop the file at <code style={{ color: T.accent }}>{item.imagePath}</code>
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 px-4 pb-4">
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: T.accent }}
          >
            {mode === 'quiz' ? 'CAN YOU NAME THIS PART OUT LOUD?' : 'HOW TO SAY IT'}
          </span>
          <button
            type="button"
            onClick={onSpeak}
            className="rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors"
            style={{
              background: T.accentSoft,
              color: T.accent,
              border: `1px solid ${T.border}`,
            }}
          >
            🔊 SPEAK
          </button>
        </div>

        {mode === 'study' ? (
          <p className="text-[13px] leading-relaxed" style={{ color: T.text }}>
            "{item.sayIt}"
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[12px] leading-relaxed" style={{ color: T.textDim }}>
              Say the full inspection sentence aloud (use the photo as your cue), then mark how you did.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onQuizGrade(true)}
                className="flex-1 rounded px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors"
                style={{ background: T.good, color: '#000' }}
              >
                ✓ GOT IT
              </button>
              <button
                type="button"
                onClick={() => onQuizGrade(false)}
                className="flex-1 rounded px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors"
                style={{ background: T.bad, color: '#000' }}
              >
                ✗ MISSED
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

/* ──────────────────────────────────────────────────────────────────────────── */

function Footer() {
  return (
    <footer
      className="mx-auto max-w-6xl px-4 py-4 text-[11px]"
      style={{ color: T.textDim }}
    >
      {DEEP_DIVE_TOTALS.sectionCount} sections · {DEEP_DIVE_TOTALS.itemCount} parts · Practice key phrases:{' '}
      <em style={{ color: T.text }}>"properly mounted and secured"</em> and{' '}
      <em style={{ color: T.text }}>"not cracked, bent, broken, loose, leaking, missing, or damaged."</em>
    </footer>
  )
}
