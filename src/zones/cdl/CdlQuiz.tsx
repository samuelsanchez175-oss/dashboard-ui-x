/**
 * Generic CDL practice-test surface. Same flow for every endorsement quiz:
 * menu → quiz → review missed → results. Accent color and badge text are
 * parameterized so HAZMAT (toxic-green) and AIR BRAKES (caution-amber) can
 * share one implementation.
 *
 * Question-count behavior:
 *   • `officialCount` is the NJ MVC question count for the matching real test
 *     (e.g. Hazmat = 30, Air Brakes = 25). Default mode samples that many
 *     questions from the bank so the menu/results numbers match what the
 *     state actually administers.
 *   • Banks ship with extra material so the user can also opt into an
 *     "Extended (all N questions)" run via a toggle on the menu screen.
 *   • Pass threshold scales with the active count: ceil(count * 0.8) = the
 *     number of correct answers required at the 80% NJ MVC bar.
 *
 * Pre-trip mode:
 *   • `sequential` runs the full bank in fixed `id` order — no shuffle, no
 *     sampling — so the test walks through the inspection step by step. It
 *     also hides the "Extended practice" toggle.
 *   • A question flagged `autoFail` forces an "AUTOMATIC FAILURE" verdict if
 *     missed, regardless of score — mirrors the air brake check on the real
 *     road skills test (pass/fail, no reset).
 */
import { useMemo, useState } from 'react'

import { ANSWER_LABELS, type CdlQuestion } from './cdl-questions'

type Mode = 'menu' | 'quiz' | 'review' | 'results'

export interface CdlQuizTheme {
  /** Background hex for the whole screen (dark terminal vibe). */
  pageBg:    string
  /** Card / panel background (slightly lifted from `pageBg`). */
  cardBg:    string
  /** Accent — the neon hazard color. */
  accent:    string
  /** Text on the accent (usually `#000` for high contrast). */
  accentFg:  string
  /** Soft accent for selected-state backgrounds. */
  accentSoft: string
  /** Failure / wrong-answer color. */
  bad:       string
  /** Pass / correct-answer color. */
  good:      string
  /** Primary text. */
  text:      string
  /** Muted secondary text. */
  textDim:   string
  /** Quiet hairline border. */
  border:    string
  /** Loud hazard border (used on menu card). */
  borderHot: string
  /** Header icon (e.g. ☣ or ⚙). Optional. */
  icon?:     string
  /** Letter-spacing for the big title. */
  titleLetterSpacing: number
}

export interface CdlQuizProps {
  title:     string
  subtitle:  string
  badge:     string
  endorseLetter: string
  questions: CdlQuestion[]
  theme:     CdlQuizTheme
  /**
   * Default question count for this test — the official NJ MVC count for the
   * real exam (e.g. Hazmat 30, Air Brakes 25, Tanker 20). The quiz randomly
   * samples this many questions from `questions` when the user starts the
   * default test. If the bank is smaller than `officialCount`, the bank size
   * is used and the toggle is hidden. Optional — omit it on `sequential`
   * tests, where the whole bank always runs.
   */
  officialCount?: number
  /**
   * Pre-trip mode. When true the quiz runs the entire bank in fixed `id`
   * order — no shuffle, no sampling — so the test walks through the
   * inspection step by step. Also hides the "Extended practice" toggle.
   */
  sequential?: boolean
  /**
   * Optional one-line clarifier shown under the stats row (used by the
   * combo-prep screens — Tanker+Hazmat, Tanker+Doubles — to make clear that
   * they are not real MVC exams, and by the pre-trip tests to note the
   * sequential walkthrough).
   */
  combinedNotice?: string
}

/* ── helpers ────────────────────────────────────────────────────────────── */

/**
 * Fisher–Yates shuffle, then take the first `n`. Used to sample a fresh
 * subset of the bank each time the user starts a test so retakes don't keep
 * hitting the same 30 questions.
 */
function sampleQuestions(qs: CdlQuestion[], n: number): CdlQuestion[] {
  const shuffled = qs.slice()
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = shuffled[i]!
    shuffled[i] = shuffled[j]!
    shuffled[j] = tmp
  }
  return shuffled.slice(0, Math.max(0, Math.min(n, shuffled.length)))
}

export default function CdlQuiz({
  title,
  subtitle,
  badge,
  endorseLetter,
  questions,
  theme,
  officialCount,
  sequential,
  combinedNotice,
}: CdlQuizProps) {
  const [mode,        setMode]        = useState<Mode>('menu')
  const [current,     setCurrent]     = useState(0)
  const [answers,     setAnswers]     = useState<Record<number, boolean>>({})
  const [selected,    setSelected]    = useState<number | null>(null)
  const [confirmed,   setConfirmed]   = useState(false)
  const [reviewIdx,   setReviewIdx]   = useState(0)
  const [extended,    setExtended]    = useState(false)
  /**
   * The questions for the current attempt. Empty until START is pressed.
   * On start we sample once and lock the slice for this run; the menu count
   * is computed from `defaultCount` / `extended` instead of this array.
   */
  const [activeQuestions, setActiveQuestions] = useState<CdlQuestion[]>([])

  const bankSize        = questions.length
  const cappedOfficial  = Math.min(officialCount ?? bankSize, bankSize)
  const hasExtendedMode = !sequential && bankSize > cappedOfficial
  const menuCount       = sequential ? bankSize : extended ? bankSize : cappedOfficial
  const menuPassNeeded  = Math.ceil(menuCount * 0.8)

  const total           = activeQuestions.length
  const passNeeded      = Math.ceil(total * 0.8)
  const q               = activeQuestions[current]
  const answered        = Object.keys(answers).length
  const score           = Object.values(answers).filter(Boolean).length
  const pct             = total > 0 ? Math.round((score / total) * 100) : 0
  const wrong           = useMemo(
    () => activeQuestions.filter(qq => answers[qq.id] === false),
    [activeQuestions, answers],
  )
  /**
   * A missed question flagged `autoFail` forces a failing verdict no matter
   * the percentage — the air brake check on the real road test is pass/fail.
   */
  const autoFailed      = useMemo(
    () => activeQuestions.some(qq => qq.autoFail && answers[qq.id] === false),
    [activeQuestions, answers],
  )
  const pass            = score >= passNeeded && total > 0 && !autoFailed

  const startQuiz = () => {
    const next = sequential
      ? [...questions].sort((a, b) => a.id - b.id)
      : sampleQuestions(questions, menuCount)
    setActiveQuestions(next)
    setAnswers({}); setSelected(null); setConfirmed(false); setCurrent(0); setMode('quiz')
  }

  const selectAnswer = (i: number) => { if (!confirmed) setSelected(i) }

  const confirm = () => {
    if (selected === null || !q) return
    setAnswers(prev => ({ ...prev, [q.id]: selected === q.ans }))
    setConfirmed(true)
  }

  const next = () => {
    if (current < total - 1) {
      setCurrent(c => c + 1)
      setSelected(null)
      setConfirmed(false)
    } else {
      setMode('results')
    }
  }

  /* ── menu screen ───────────────────────────────────────────────────────── */
  if (mode === 'menu') {
    return (
      <Shell theme={theme}>
        <div style={menuCard(theme)}>
          <div style={badgeStyle(theme)}>{badge}</div>
          {theme.icon && (
            <div style={{ fontSize: 44, marginBottom: 8, filter: `drop-shadow(0 0 12px ${theme.accent})` }}>
              {theme.icon}
            </div>
          )}
          <h1 style={titleStyle(theme)}>{title}</h1>
          <p style={subtitleStyle(theme)}>{subtitle}</p>
          <div style={{ ...statRow(theme), marginBottom: 14 }}>
            <Stat theme={theme} num={String(menuCount)} label="Questions" />
            <span style={statDiv(theme)} />
            <Stat theme={theme} num="80%" label="To Pass" />
            <span style={statDiv(theme)} />
            <Stat theme={theme} num={endorseLetter} label="Endorsement" />
          </div>
          <div style={passingNote(theme)}>
            Need <strong style={{ color: theme.accent }}>{menuPassNeeded}</strong> of{' '}
            <strong style={{ color: theme.accent }}>{menuCount}</strong> correct to pass
          </div>
          {combinedNotice && (
            <div style={comboNotice(theme)}>{combinedNotice}</div>
          )}
          <button style={{ ...startBtn(theme), marginBottom: hasExtendedMode ? 10 : 0 }} onClick={startQuiz}>
            START TEST
          </button>
          {hasExtendedMode && (
            <button
              type="button"
              style={extendedToggle(theme, extended)}
              onClick={() => setExtended(v => !v)}
              aria-pressed={extended}
            >
              <span style={{ display: 'inline-block', width: 14, height: 14, marginRight: 10, border: `1px solid ${theme.accent}`, background: extended ? theme.accent : 'transparent', verticalAlign: '-2px' }} />
              {extended
                ? `Extended ON · all ${bankSize} questions`
                : `Extended practice (all ${bankSize} questions)`}
            </button>
          )}
        </div>
      </Shell>
    )
  }

  /* ── results screen ────────────────────────────────────────────────────── */
  if (mode === 'results') {
    const verdictColor = pass ? theme.good : theme.bad
    return (
      <Shell theme={theme}>
        <div style={menuCard(theme)}>
          <div style={badgeStyle(theme)}>RESULTS</div>
          <h1 style={{ ...titleStyle(theme), fontSize: 52, color: verdictColor }}>{pct}%</h1>
          <p style={{ ...subtitleStyle(theme), color: verdictColor, fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
            {autoFailed ? '✗ AUTOMATIC FAILURE' : pass ? '✓ PASSED' : '✗ FAILED'}
          </p>
          <p style={{ ...subtitleStyle(theme), marginBottom: 6 }}>{score} / {total} correct</p>
          {autoFailed && (
            <p style={{ ...subtitleStyle(theme), color: theme.bad, fontWeight: 700, fontSize: 11, marginBottom: 6 }}>
              Missed a critical auto-fail item — the air brake check is pass/fail with no reset on the real exam.
            </p>
          )}
          <p style={{ ...subtitleStyle(theme), marginBottom: 28, fontSize: 11 }}>
            ({passNeeded} required to pass at 80%)
          </p>
          {wrong.length > 0 && (
            <button
              style={{ ...startBtn(theme), background: theme.cardBg, border: `2px solid ${theme.accent}`, color: theme.accent, marginBottom: 10 }}
              onClick={() => { setReviewIdx(0); setMode('review') }}
            >
              REVIEW {wrong.length} MISSED
            </button>
          )}
          <button style={startBtn(theme)} onClick={startQuiz}>RETAKE TEST</button>
          <button
            style={{ ...startBtn(theme), background: 'transparent', border: `2px solid ${theme.border}`, color: theme.textDim, marginTop: 8 }}
            onClick={() => setMode('menu')}
          >
            MAIN MENU
          </button>
        </div>
      </Shell>
    )
  }

  /* ── review missed screen ──────────────────────────────────────────────── */
  if (mode === 'review') {
    const rq = wrong[reviewIdx]
    if (!rq) {
      return (
        <Shell theme={theme}>
          <div style={menuCard(theme)}>
            <p style={subtitleStyle(theme)}>No missed questions to review.</p>
            <button style={startBtn(theme)} onClick={() => setMode('results')}>BACK</button>
          </div>
        </Shell>
      )
    }
    return (
      <Shell theme={theme}>
        <div style={quizWrap(theme)}>
          <div style={topBar()}>
            <span style={topBadge(theme)}>REVIEW</span>
            <span style={counter(theme)}>{reviewIdx + 1} / {wrong.length}</span>
          </div>
          {rq.image && (
            <div
              style={{
                borderRadius: 8,
                overflow: 'hidden',
                border: `1px solid ${theme.border}`,
                marginBottom: 16,
                background: theme.cardBg,
              }}
            >
              <img
                src={rq.image}
                alt=""
                style={{ display: 'block', width: '100%', maxHeight: 360, objectFit: 'contain', background: '#0a1518' }}
              />
            </div>
          )}
          <div style={qNum(theme)}>Q{rq.id}</div>
          <p style={qText(theme)}>{rq.q}</p>
          <div style={optsList()}>
            {rq.opts.map((opt, i) => (
              <div key={i} style={i === rq.ans ? optCorrect(theme) : optDim(theme)}>
                <span style={optLabel(theme)}>{ANSWER_LABELS[i]}</span>
                <span style={optText(theme)}>{opt}</span>
                {i === rq.ans && <span style={{ color: theme.good, fontWeight: 900 }}>✓</span>}
              </div>
            ))}
          </div>
          <div style={navRow()}>
            {reviewIdx > 0 && (
              <button style={navBtn(theme)} onClick={() => setReviewIdx(i => i - 1)}>← PREV</button>
            )}
            {reviewIdx < wrong.length - 1 ? (
              <button style={{ ...navBtn(theme), ...navPrimary(theme) }} onClick={() => setReviewIdx(i => i + 1)}>NEXT →</button>
            ) : (
              <button style={{ ...navBtn(theme), ...navPrimary(theme) }} onClick={() => setMode('results')}>DONE</button>
            )}
          </div>
        </div>
      </Shell>
    )
  }

  /* ── quiz screen ───────────────────────────────────────────────────────── */
  if (!q) {
    // Defensive: should never happen, but if `activeQuestions` is empty bail
    // back to the menu instead of crashing on `q.q`.
    return (
      <Shell theme={theme}>
        <div style={menuCard(theme)}>
          <p style={subtitleStyle(theme)}>No questions available.</p>
          <button style={startBtn(theme)} onClick={() => setMode('menu')}>BACK TO MENU</button>
        </div>
      </Shell>
    )
  }

  const progress = (current / total) * 100

  return (
    <Shell theme={theme}>
      <div style={quizWrap(theme)}>
        <div style={topBar()}>
          <span style={topBadge(theme)}>{badge}</span>
          <span style={counter(theme)}>{current + 1} / {total}</span>
        </div>
        <div style={progressBar(theme)}>
          <div style={{ ...progressFill(theme), width: `${progress}%` }} />
        </div>
        {q.image && (
          /* Image-first layout for the pre-trip Deep Dive bank — photo sits
           * directly above the question text so the user sees the part before
           * reading the prompt. Bordered, rounded, capped at 360 px tall so
           * the question + options stay visible without scrolling. */
          <div
            style={{
              borderRadius: 8,
              overflow: 'hidden',
              border: `1px solid ${theme.border}`,
              marginBottom: 16,
              background: theme.cardBg,
            }}
          >
            <img
              src={q.image}
              alt=""
              style={{ display: 'block', width: '100%', maxHeight: 360, objectFit: 'contain', background: '#0a1518' }}
            />
          </div>
        )}
        <div style={qNum(theme)}>Q{q.id}</div>
        <p style={qText(theme)}>{q.q}</p>
        <div style={optsList()}>
          {q.opts.map((opt, i) => {
            let style = optBase(theme)
            if (confirmed) {
              if (i === q.ans)                          style = optCorrect(theme)
              else if (i === selected && i !== q.ans)   style = optWrong(theme)
            } else if (i === selected) {
              style = optSelected(theme)
            }
            return (
              <div key={i} style={style} onClick={() => selectAnswer(i)}>
                <span style={optLabel(theme)}>{ANSWER_LABELS[i]}</span>
                <span style={optText(theme)}>{opt}</span>
                {confirmed && i === q.ans                    && <span style={{ color: theme.good, fontWeight: 900 }}>✓</span>}
                {confirmed && i === selected && i !== q.ans  && <span style={{ color: theme.bad,  fontWeight: 900 }}>✗</span>}
              </div>
            )
          })}
        </div>
        <div style={navRow()}>
          {!confirmed ? (
            <button
              style={{ ...confirmBtn(theme), opacity: selected === null ? 0.4 : 1 }}
              onClick={confirm}
              disabled={selected === null}
            >
              CONFIRM
            </button>
          ) : (
            <button
              style={{ ...confirmBtn(theme), background: theme.cardBg, border: `2px solid ${theme.good}`, color: theme.good }}
              onClick={next}
            >
              {current < total - 1 ? 'NEXT →' : 'FINISH'}
            </button>
          )}
        </div>
        <div style={scoreRow(theme)}>
          <span style={{ color: theme.good }}>✓ {score}</span>
          <span style={{ color: theme.bad,     marginLeft: 16 }}>✗ {answered - score}</span>
          <span style={{ color: theme.textDim, marginLeft: 16 }}>{total - answered} left</span>
          <span style={{ color: theme.textDim, marginLeft: 16 }}>· need {passNeeded} to pass</span>
        </div>
      </div>
    </Shell>
  )
}

/* ── shared small components ───────────────────────────────────────────── */

function Shell({ theme, children }: { theme: CdlQuizTheme; children: React.ReactNode }) {
  return (
    <div
      className="flex-1 overflow-auto"
      style={{
        background: theme.pageBg,
        color:      theme.text,
        fontFamily: "'Courier New', Courier, monospace",
      }}
    >
      <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        {children}
      </div>
    </div>
  )
}

function Stat({ theme, num, label }: { theme: CdlQuizTheme; num: string; label: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 8px' }}>
      <span style={{ color: theme.accent, fontSize: 22, fontWeight: 900, letterSpacing: 2 }}>{num}</span>
      <span style={{ color: theme.textDim, fontSize: 10, letterSpacing: 2, marginTop: 4, textTransform: 'uppercase' }}>{label}</span>
    </div>
  )
}

/* ── style factories ──────────────────────────────────────────────────── */

const menuCard = (t: CdlQuizTheme): React.CSSProperties => ({
  background: t.cardBg,
  border:     `2px solid ${t.borderHot}`,
  borderRadius: 4,
  padding:    '44px 40px',
  maxWidth:   480,
  width:      '100%',
  textAlign:  'center',
  boxShadow:  `0 0 60px ${t.accent}20`,
})

const badgeStyle = (t: CdlQuizTheme): React.CSSProperties => ({
  display:       'inline-block',
  background:    t.accent,
  color:         t.accentFg,
  fontSize:      10,
  fontWeight:    900,
  letterSpacing: 3,
  padding:       '4px 12px',
  marginBottom:  16,
})

const titleStyle = (t: CdlQuizTheme): React.CSSProperties => ({
  color: t.text, fontSize: 56, fontWeight: 900, letterSpacing: t.titleLetterSpacing, margin: '0 0 8px',
})

const subtitleStyle = (t: CdlQuizTheme): React.CSSProperties => ({
  color: t.textDim, fontSize: 13, marginBottom: 32, letterSpacing: 1,
})

const statRow = (t: CdlQuizTheme): React.CSSProperties => ({
  display: 'flex', justifyContent: 'center', alignItems: 'center',
  border: `1px solid ${t.border}`, borderRadius: 3, overflow: 'hidden',
})

const statDiv = (t: CdlQuizTheme): React.CSSProperties => ({ width: 1, height: 40, background: t.border })

const passingNote = (t: CdlQuizTheme): React.CSSProperties => ({
  color:         t.textDim,
  fontSize:      12,
  letterSpacing: 1,
  marginBottom:  20,
})

const comboNotice = (t: CdlQuizTheme): React.CSSProperties => ({
  color:         t.textDim,
  fontSize:      11,
  fontStyle:     'italic',
  marginBottom:  18,
  paddingTop:    10,
  borderTop:     `1px dashed ${t.border}`,
  letterSpacing: 0.4,
  lineHeight:    1.5,
})

const startBtn = (t: CdlQuizTheme): React.CSSProperties => ({
  width: '100%', padding: 15, background: t.accent, color: t.accentFg, border: 'none',
  fontSize: 15, fontWeight: 900, letterSpacing: 4, cursor: 'pointer',
  fontFamily: "'Courier New', monospace", borderRadius: 2,
})

const extendedToggle = (t: CdlQuizTheme, on: boolean): React.CSSProperties => ({
  width:         '100%',
  padding:       '10px 12px',
  background:    on ? t.accentSoft : 'transparent',
  color:         on ? t.accent : t.textDim,
  border:        `1px solid ${on ? t.accent : t.border}`,
  fontSize:      11,
  fontWeight:    700,
  letterSpacing: 2,
  cursor:        'pointer',
  fontFamily:    "'Courier New', monospace",
  borderRadius:  2,
  textTransform: 'uppercase',
  textAlign:     'left',
})

const quizWrap = (t: CdlQuizTheme): React.CSSProperties => ({
  background: t.cardBg, border: `2px solid ${t.border}`, borderRadius: 4,
  padding: '24px 24px 20px', maxWidth: 620, width: '100%',
  boxShadow: '0 0 40px rgba(0,0,0,0.7)',
})

const topBar = (): React.CSSProperties => ({
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
})

const topBadge = (t: CdlQuizTheme): React.CSSProperties => ({
  background: t.accent, color: t.accentFg, fontSize: 10, fontWeight: 900, letterSpacing: 3, padding: '3px 8px',
})

const counter = (t: CdlQuizTheme): React.CSSProperties => ({ color: t.textDim, fontSize: 13, letterSpacing: 2 })

const progressBar = (t: CdlQuizTheme): React.CSSProperties => ({
  height: 3, background: t.border, marginBottom: 24, borderRadius: 2,
})

const progressFill = (t: CdlQuizTheme): React.CSSProperties => ({
  height: '100%', background: t.accent, borderRadius: 2, transition: 'width 0.3s ease',
})

const qNum  = (t: CdlQuizTheme): React.CSSProperties => ({ color: t.accent, fontSize: 11, letterSpacing: 3, marginBottom: 8, fontWeight: 700 })
const qText = (t: CdlQuizTheme): React.CSSProperties => ({ color: t.text,   fontSize: 15, lineHeight: 1.6, marginBottom: 20 })

const optsList = (): React.CSSProperties => ({ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 })

const optBase = (t: CdlQuizTheme): React.CSSProperties => ({
  display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px',
  border: `1px solid ${t.border}`, borderRadius: 3, cursor: 'pointer',
  background: t.cardBg, transition: 'border-color 0.15s, background 0.15s',
})

const optSelected = (t: CdlQuizTheme): React.CSSProperties =>
  ({ ...optBase(t), border: `1px solid ${t.accent}`, background: t.accentSoft, cursor: 'pointer' })

const optCorrect = (t: CdlQuizTheme): React.CSSProperties =>
  ({ ...optBase(t), border: `1px solid ${t.good}`, background: t.cardBg, cursor: 'default' })

const optWrong = (t: CdlQuizTheme): React.CSSProperties =>
  ({ ...optBase(t), border: `1px solid ${t.bad}`,  background: t.cardBg, cursor: 'default' })

const optDim = (t: CdlQuizTheme): React.CSSProperties =>
  ({ ...optBase(t), border: `1px solid ${t.border}`, background: t.pageBg, cursor: 'default', opacity: 0.5 })

const optLabel = (t: CdlQuizTheme): React.CSSProperties =>
  ({ color: t.accent, fontWeight: 900, fontSize: 13, minWidth: 20, letterSpacing: 1, marginTop: 1 })

const optText = (t: CdlQuizTheme): React.CSSProperties =>
  ({ color: t.text, fontSize: 14, lineHeight: 1.5, flex: 1 })

const navRow = (): React.CSSProperties =>
  ({ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 12 })

const confirmBtn = (t: CdlQuizTheme): React.CSSProperties => ({
  padding: '12px 32px', background: t.accent, color: t.accentFg, border: 'none',
  fontSize: 13, fontWeight: 900, letterSpacing: 3, cursor: 'pointer',
  fontFamily: "'Courier New', monospace", borderRadius: 2,
})

const navBtn = (t: CdlQuizTheme): React.CSSProperties => ({
  padding: '10px 20px', background: t.cardBg, color: t.textDim, border: `1px solid ${t.border}`,
  fontSize: 12, fontWeight: 700, letterSpacing: 2, cursor: 'pointer',
  fontFamily: "'Courier New', monospace", borderRadius: 2,
})

const navPrimary = (t: CdlQuizTheme): React.CSSProperties =>
  ({ background: t.accent, color: t.accentFg, border: 'none' })

const scoreRow = (t: CdlQuizTheme): React.CSSProperties => ({
  fontSize: 12, letterSpacing: 2, textAlign: 'center',
  borderTop: `1px solid ${t.border}`, paddingTop: 12,
})
