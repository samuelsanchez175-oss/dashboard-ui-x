/**
 * Generic CDL practice-test surface. Same flow for every endorsement quiz:
 * menu → quiz → review missed → results. Accent color and badge text are
 * parameterized so HAZMAT (toxic-green) and AIR BRAKES (caution-amber) can
 * share one implementation.
 */
import { useState } from 'react'

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
}

export default function CdlQuiz({ title, subtitle, badge, endorseLetter, questions, theme }: CdlQuizProps) {
  const [mode,        setMode]        = useState<Mode>('menu')
  const [current,     setCurrent]     = useState(0)
  const [answers,     setAnswers]     = useState<Record<number, boolean>>({})
  const [selected,    setSelected]    = useState<number | null>(null)
  const [confirmed,   setConfirmed]   = useState(false)
  const [reviewIdx,   setReviewIdx]   = useState(0)

  const q       = questions[current]!
  const total   = questions.length
  const answered = Object.keys(answers).length
  const score    = Object.values(answers).filter(Boolean).length
  const pct      = Math.round((score / total) * 100)
  const pass     = pct >= 80
  const wrong    = questions.filter(qq => answers[qq.id] === false)

  const startQuiz = () => {
    setAnswers({}); setSelected(null); setConfirmed(false); setCurrent(0); setMode('quiz')
  }

  const selectAnswer = (i: number) => { if (!confirmed) setSelected(i) }

  const confirm = () => {
    if (selected === null) return
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
          <div style={statRow(theme)}>
            <Stat theme={theme} num={String(total)} label="Questions" />
            <span style={statDiv(theme)} />
            <Stat theme={theme} num="80%" label="To Pass" />
            <span style={statDiv(theme)} />
            <Stat theme={theme} num={endorseLetter} label="Endorsement" />
          </div>
          <button style={startBtn(theme)} onClick={startQuiz}>START TEST</button>
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
            {pass ? '✓ PASSED' : '✗ FAILED'}
          </p>
          <p style={{ ...subtitleStyle(theme), marginBottom: 28 }}>{score} / {total} correct</p>
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
  display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: 36,
  border: `1px solid ${t.border}`, borderRadius: 3, overflow: 'hidden',
})

const statDiv = (t: CdlQuizTheme): React.CSSProperties => ({ width: 1, height: 40, background: t.border })

const startBtn = (t: CdlQuizTheme): React.CSSProperties => ({
  width: '100%', padding: 15, background: t.accent, color: t.accentFg, border: 'none',
  fontSize: 15, fontWeight: 900, letterSpacing: 4, cursor: 'pointer',
  fontFamily: "'Courier New', monospace", borderRadius: 2,
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
