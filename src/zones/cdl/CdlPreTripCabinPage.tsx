import CdlQuiz, { type CdlQuizTheme } from './CdlQuiz'
import { PRETRIP_CABIN_QUESTIONS } from './cdl-questions'

const PRETRIP_CABIN_THEME: CdlQuizTheme = {
  pageBg:     '#05070d',
  cardBg:     '#080c15',
  accent:     '#5b9dff',
  accentFg:   '#000000',
  accentSoft: '#0e1830',
  bad:        '#ff4d4d',
  good:       '#39ff14',
  text:       '#cdd9ee',
  textDim:    '#5a6a88',
  border:     '#1a2438',
  borderHot:  '#5b9dff',
  icon:       '📋',
  titleLetterSpacing: 8,
}

export default function CdlPreTripCabinPage() {
  return (
    <CdlQuiz
      title="IN-CABIN"
      subtitle="Step 1 of 5 · In-Cabin Inspection (Automatic Transmission)"
      badge="PRE-TRIP INSPECTION"
      endorseLetter="CLASS A"
      questions={PRETRIP_CABIN_QUESTIONS}
      theme={PRETRIP_CABIN_THEME}
      sequential
      combinedNotice="Sequential walkthrough — questions run in real inspection order, start to finish. The air brake test section is auto-fail: miss one and the run is an automatic failure."
    />
  )
}
