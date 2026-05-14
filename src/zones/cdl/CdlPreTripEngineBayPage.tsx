import CdlQuiz, { type CdlQuizTheme } from './CdlQuiz'
import { PRETRIP_ENGINE_BAY_QUESTIONS } from './cdl-questions'

const PRETRIP_ENGINE_BAY_THEME: CdlQuizTheme = {
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
  icon:       '🔧',
  titleLetterSpacing: 4,
}

export default function CdlPreTripEngineBayPage() {
  return (
    <CdlQuiz
      title="ENGINE BAY"
      subtitle="Step 2 of 5 · Front of Vehicle / Engine Area"
      badge="PRE-TRIP INSPECTION"
      endorseLetter="CLASS A"
      questions={PRETRIP_ENGINE_BAY_QUESTIONS}
      theme={PRETRIP_ENGINE_BAY_THEME}
      sequential
      combinedNotice="Sequential walkthrough — questions run in real inspection order, start to finish."
    />
  )
}
