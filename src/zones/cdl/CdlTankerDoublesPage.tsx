import CdlQuiz, { type CdlQuizTheme } from './CdlQuiz'
import { TANKER_DOUBLES_QUESTIONS } from './cdl-questions'

/**
 * Tanker Doubles / Triples — combined Tank Vehicle + Doubles/Triples.
 * Violet palette signals "combination" — bridging the cyan Tanker and the
 * copper Doubles/Triples themes. The compound case where liquid surge and
 * rearward amplification stack on top of each other.
 */
const TANKER_DOUBLES_THEME: CdlQuizTheme = {
  pageBg:     '#0a0612',
  cardBg:     '#130c1f',
  accent:     '#a855f7',
  accentFg:   '#000000',
  accentSoft: '#1f1133',
  bad:        '#ff5252',
  good:       '#00e676',
  text:       '#ebdcff',
  textDim:    '#8e7aaf',
  border:     '#2a1b3f',
  borderHot:  '#a855f7',
  icon:       '🌊',
  titleLetterSpacing: 6,
}

export default function CdlTankerDoublesPage() {
  return (
    <CdlQuiz
      title="TANKER DOUBLES"
      subtitle="Tank Doubles & Triples — N + T Combination"
      badge="CDL COMBINATION PREP"
      endorseLetter="N+T"
      questions={TANKER_DOUBLES_QUESTIONS}
      theme={TANKER_DOUBLES_THEME}
    />
  )
}
