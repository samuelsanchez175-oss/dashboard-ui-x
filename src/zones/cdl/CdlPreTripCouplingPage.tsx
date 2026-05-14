import CdlQuiz, { type CdlQuizTheme } from './CdlQuiz'
import { PRETRIP_COUPLING_QUESTIONS } from './cdl-questions'

const PRETRIP_COUPLING_THEME: CdlQuizTheme = {
  pageBg:     '#070a04',
  cardBg:     '#0c1207',
  accent:     '#a3e635',
  accentFg:   '#000000',
  accentSoft: '#1b260c',
  bad:        '#ff4d4d',
  good:       '#39ff14',
  text:       '#dbe9c4',
  textDim:    '#6e7d4a',
  border:     '#2a3414',
  borderHot:  '#a3e635',
  icon:       '🔗',
  titleLetterSpacing: 8,
}

export default function CdlPreTripCouplingPage() {
  return (
    <CdlQuiz
      title="COUPLING"
      subtitle="Step 4 of 5 · Coupling System (Combination Vehicles)"
      badge="PRE-TRIP INSPECTION"
      endorseLetter="CLASS A"
      questions={PRETRIP_COUPLING_QUESTIONS}
      theme={PRETRIP_COUPLING_THEME}
      sequential
      combinedNotice="Sequential walkthrough — questions run in real inspection order, start to finish."
    />
  )
}
