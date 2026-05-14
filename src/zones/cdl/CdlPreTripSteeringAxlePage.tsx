import CdlQuiz, { type CdlQuizTheme } from './CdlQuiz'
import { PRETRIP_STEERING_AXLE_QUESTIONS } from './cdl-questions'

const PRETRIP_STEERING_AXLE_THEME: CdlQuizTheme = {
  pageBg:     '#04090a',
  cardBg:     '#071210',
  accent:     '#2dd4bf',
  accentFg:   '#000000',
  accentSoft: '#0c2420',
  bad:        '#ff4d4d',
  good:       '#39ff14',
  text:       '#c2e8e2',
  textDim:    '#4a7d76',
  border:     '#143430',
  borderHot:  '#2dd4bf',
  icon:       '🛞',
  titleLetterSpacing: 2,
}

export default function CdlPreTripSteeringAxlePage() {
  return (
    <CdlQuiz
      title="STEERING AXLE"
      subtitle="Step 3 of 5 · Steering Axle & Side of Vehicle"
      badge="PRE-TRIP INSPECTION"
      endorseLetter="CLASS A"
      questions={PRETRIP_STEERING_AXLE_QUESTIONS}
      theme={PRETRIP_STEERING_AXLE_THEME}
      sequential
      combinedNotice="Sequential walkthrough — questions run in real inspection order, start to finish."
    />
  )
}
