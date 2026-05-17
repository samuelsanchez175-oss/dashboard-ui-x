/**
 * CDL Class A — Outside Pre-Trip — DEEP DIVE
 *
 * Image-first multiple-choice quiz. Each of the 38 questions shows a
 * ChatGPT-rendered close-up of one inspection part (Engine Bay ×11,
 * In-Cabin ×11, Trailer ×16) and asks "what does the inspector say about
 * the highlighted part?" — pick the correct verbal statement from three
 * options. Distractors are real statements from other parts in the SAME
 * inspection section so picking right requires actually recognising the part.
 *
 * Built on the shared `CdlQuiz` engine so the layout, menu, scoring, review,
 * and pass-fail logic exactly match the rest of the CDL practice tests.
 * `sequential` mode runs the bank in fixed order (engine → cabin → trailer)
 * so the test mirrors a real pre-trip walk-around top to bottom.
 */

import CdlQuiz, { type CdlQuizTheme } from './CdlQuiz'
import { PRETRIP_DEEP_DIVE_QUESTIONS } from './cdl-pretrip-deep-questions'

/* Cyan theme matches the other pre-trip pages so the Deep Dive feels like
 * a natural extension of the existing study tools. */
const PRETRIP_DEEP_DIVE_THEME: CdlQuizTheme = {
  pageBg:     '#04090b',
  cardBg:     '#070f12',
  accent:     '#22d3ee',
  accentFg:   '#000000',
  accentSoft: '#0c2128',
  bad:        '#ff4d4d',
  good:       '#39ff14',
  text:       '#c4e6ec',
  textDim:    '#4a7480',
  border:     '#13303a',
  borderHot:  '#22d3ee',
  icon:       '📸',
  titleLetterSpacing: 4,
}

interface Props {
  /**
   * Optional router callback (passed by MainContent). Not used by CdlQuiz
   * directly but kept on the page component for parity with the Parts Map's
   * sibling-link banner if we re-enable cross-linking later.
   */
  onNavigate?: (routeId: string) => void
}

export default function CdlPreTripDeepDive(_props: Props = {}) {
  return (
    <CdlQuiz
      title="PRE-TRIP · DEEP DIVE"
      subtitle="38 image-first questions · Engine Bay (11) → In-Cabin (11) → Trailer (16)"
      badge="DEEP DIVE"
      endorseLetter="CLASS A"
      questions={PRETRIP_DEEP_DIVE_QUESTIONS}
      theme={PRETRIP_DEEP_DIVE_THEME}
      sequential
      combinedNotice="Sequential walk-through — questions run in real pre-trip inspection order, engine to trailer."
    />
  )
}
