import CdlQuiz, { type CdlQuizTheme } from './CdlQuiz'
import { DOUBLES_TRIPLES_QUESTIONS } from './cdl-questions'

/**
 * Doubles / Triples (T) — pulling more than one trailer.
 * Industrial copper / orange palette evokes coupling hardware and trailer
 * linkage, clearly distinct from the green Hazmat, amber Air Brakes, and
 * cyan Tanker palettes.
 */
const DOUBLES_TRIPLES_THEME: CdlQuizTheme = {
  pageBg:     '#0d0703',
  cardBg:     '#160c06',
  accent:     '#ff7b29',
  accentFg:   '#000000',
  accentSoft: '#28150a',
  bad:        '#ff5252',
  good:       '#00e676',
  text:       '#f4dccb',
  textDim:    '#a07258',
  border:     '#3a2114',
  borderHot:  '#ff7b29',
  icon:       '⛓',
  titleLetterSpacing: 8,
}

export default function CdlDoublesTriplesPage() {
  return (
    <CdlQuiz
      title="DOUBLES / TRIPLES"
      subtitle="Doubles & Triples — T Endorsement"
      badge="CDL ENDORSEMENT PREP"
      endorseLetter="T"
      questions={DOUBLES_TRIPLES_QUESTIONS}
      theme={DOUBLES_TRIPLES_THEME}
    />
  )
}
