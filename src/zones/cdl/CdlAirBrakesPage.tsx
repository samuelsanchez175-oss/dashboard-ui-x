import CdlQuiz, { type CdlQuizTheme } from './CdlQuiz'
import { AIR_BRAKES_QUESTIONS } from './cdl-questions'

const AIR_BRAKES_THEME: CdlQuizTheme = {
  pageBg:     '#0a0a0f',
  cardBg:     '#111118',
  accent:     '#f0c040',
  accentFg:   '#000000',
  accentSoft: '#1e1a0a',
  bad:        '#ff5252',
  good:       '#00e676',
  text:       '#e0e0e0',
  textDim:    '#888888',
  border:     '#2a2a2a',
  borderHot:  '#f0c040',
  titleLetterSpacing: 6,
}

export default function CdlAirBrakesPage() {
  return (
    <CdlQuiz
      title="AIR BRAKES"
      subtitle="66 Questions · E-Z Wheels Driving School"
      badge="E-Z WHEELS CDL PREP"
      endorseLetter="CDL"
      questions={AIR_BRAKES_QUESTIONS}
      theme={AIR_BRAKES_THEME}
    />
  )
}
