import CdlQuiz, { type CdlQuizTheme } from './CdlQuiz'
import { HAZMAT_QUESTIONS } from './cdl-questions'

const HAZMAT_THEME: CdlQuizTheme = {
  pageBg:     '#050a05',
  cardBg:     '#080f08',
  accent:     '#39ff14',
  accentFg:   '#000000',
  accentSoft: '#0d200d',
  bad:        '#ff3131',
  good:       '#39ff14',
  text:       '#d0e8d0',
  textDim:    '#4a7a4a',
  border:     '#1a2e1a',
  borderHot:  '#39ff14',
  icon:       '☣',
  titleLetterSpacing: 8,
}

export default function CdlHazmatPage() {
  return (
    <CdlQuiz
      title="HAZMAT"
      subtitle="Hazardous Materials — H Endorsement"
      badge="CDL ENDORSEMENT PREP"
      endorseLetter="H"
      questions={HAZMAT_QUESTIONS}
      theme={HAZMAT_THEME}
      officialCount={30}
    />
  )
}
