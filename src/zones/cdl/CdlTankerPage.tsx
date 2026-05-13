import CdlQuiz, { type CdlQuizTheme } from './CdlQuiz'
import { TANKER_QUESTIONS } from './cdl-questions'

/**
 * Tanker (N) — Tank Vehicle endorsement quiz.
 * Cyan / deep-water palette to set it apart from the green Hazmat and amber
 * Air Brakes pages — evokes liquid bulk hauling.
 */
const TANKER_THEME: CdlQuizTheme = {
  pageBg:     '#050a0d',
  cardBg:     '#08111a',
  accent:     '#00b8d4',
  accentFg:   '#000000',
  accentSoft: '#08222a',
  bad:        '#ff5252',
  good:       '#00e676',
  text:       '#d6f1f7',
  textDim:    '#6488a0',
  border:     '#102230',
  borderHot:  '#00b8d4',
  icon:       '💧',
  titleLetterSpacing: 8,
}

export default function CdlTankerPage() {
  return (
    <CdlQuiz
      title="TANKER"
      subtitle="Tank Vehicle — N Endorsement"
      badge="CDL ENDORSEMENT PREP"
      endorseLetter="N"
      questions={TANKER_QUESTIONS}
      theme={TANKER_THEME}
      officialCount={20}
    />
  )
}
