import CdlQuiz, { type CdlQuizTheme } from './CdlQuiz'
import { SCHOOL_BUS_QUESTIONS } from './cdl-questions'

/**
 * S — School Bus endorsement quiz.
 * Iconic school-bus yellow — close to amber but pure-yellow saturated, the
 * universal color of the American school bus. Requires the P endorsement.
 */
const SCHOOL_BUS_THEME: CdlQuizTheme = {
  pageBg:     '#0e0a02',
  cardBg:     '#1c1404',
  accent:     '#facc15',
  accentFg:   '#000000',
  accentSoft: '#2a1f04',
  bad:        '#ff5252',
  good:       '#00e676',
  text:       '#fff4cc',
  textDim:    '#b09858',
  border:     '#3a2a06',
  borderHot:  '#facc15',
  icon:       '🚸',
  titleLetterSpacing: 7,
}

export default function CdlSchoolBusPage() {
  return (
    <CdlQuiz
      title="SCHOOL BUS"
      subtitle="School Bus — S Endorsement (requires P)"
      badge="CDL ENDORSEMENT PREP"
      endorseLetter="S"
      questions={SCHOOL_BUS_QUESTIONS}
      theme={SCHOOL_BUS_THEME}
      officialCount={20}
    />
  )
}
