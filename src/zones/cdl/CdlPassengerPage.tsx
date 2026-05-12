import CdlQuiz, { type CdlQuizTheme } from './CdlQuiz'
import { PASSENGER_QUESTIONS } from './cdl-questions'

/**
 * P — Passenger endorsement quiz.
 * Transit-blue palette evokes city buses and motorcoaches — distinct from
 * every other endorsement tile in the hub.
 */
const PASSENGER_THEME: CdlQuizTheme = {
  pageBg:     '#040712',
  cardBg:     '#0a1024',
  accent:     '#3b82f6',
  accentFg:   '#000000',
  accentSoft: '#0d1a3a',
  bad:        '#ff5252',
  good:       '#00e676',
  text:       '#dbe6ff',
  textDim:    '#7a8bb5',
  border:     '#16224a',
  borderHot:  '#3b82f6',
  icon:       '🚌',
  titleLetterSpacing: 7,
}

export default function CdlPassengerPage() {
  return (
    <CdlQuiz
      title="PASSENGER"
      subtitle="Passenger Vehicles — P Endorsement"
      badge="CDL ENDORSEMENT PREP"
      endorseLetter="P"
      questions={PASSENGER_QUESTIONS}
      theme={PASSENGER_THEME}
    />
  )
}
