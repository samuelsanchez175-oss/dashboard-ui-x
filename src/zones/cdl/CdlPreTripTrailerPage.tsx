import CdlQuiz, { type CdlQuizTheme } from './CdlQuiz'
import { PRETRIP_TRAILER_QUESTIONS } from './cdl-questions'

const PRETRIP_TRAILER_THEME: CdlQuizTheme = {
  pageBg:     '#0a0703',
  cardBg:     '#120d05',
  accent:     '#fbbf24',
  accentFg:   '#000000',
  accentSoft: '#2a1f08',
  bad:        '#ff4d4d',
  good:       '#39ff14',
  text:       '#ece0c6',
  textDim:    '#867142',
  border:     '#352a12',
  borderHot:  '#fbbf24',
  icon:       '🚛',
  titleLetterSpacing: 8,
}

export default function CdlPreTripTrailerPage() {
  return (
    <CdlQuiz
      title="TRAILER"
      subtitle="Step 5 of 5 · Trailer & Rear of Trailer"
      badge="PRE-TRIP INSPECTION"
      endorseLetter="CLASS A"
      questions={PRETRIP_TRAILER_QUESTIONS}
      theme={PRETRIP_TRAILER_THEME}
      sequential
      combinedNotice="Sequential walkthrough — questions run in real inspection order, start to finish."
    />
  )
}
