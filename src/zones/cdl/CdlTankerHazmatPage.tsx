import CdlQuiz, { type CdlQuizTheme } from './CdlQuiz'
import { TANKER_HAZMAT_QUESTIONS } from './cdl-questions'

/**
 * X — Combination Tanker / HazMat endorsement quiz.
 * "Fuel-pump red" palette evokes the placarded fuel-hauling tanker — the
 * classic visual for the N+H combination on the road. Stands apart from
 * Hazmat green, Tanker cyan and Tanker Doubles violet.
 */
const TANKER_HAZMAT_THEME: CdlQuizTheme = {
  pageBg:     '#0d0405',
  cardBg:     '#1a0608',
  accent:     '#ef4444',
  accentFg:   '#000000',
  accentSoft: '#2a0a0e',
  bad:        '#fb7185',
  good:       '#00e676',
  text:       '#f6dadd',
  textDim:    '#a07078',
  border:     '#3a1418',
  borderHot:  '#ef4444',
  icon:       '⛽',
  titleLetterSpacing: 6,
}

export default function CdlTankerHazmatPage() {
  return (
    <CdlQuiz
      title="TANKER + HAZMAT"
      subtitle="Combination — X Endorsement (N + H)"
      badge="CDL COMBINATION PREP"
      endorseLetter="X"
      questions={TANKER_HAZMAT_QUESTIONS}
      theme={TANKER_HAZMAT_THEME}
      // 50 = Tanker (20) + Hazmat (30); pass at 80% = 40 correct.
      // NJ MVC issues N and H separately — this is combined practice only.
      officialCount={50}
      combinedNotice="Combined practice — not an official NJ MVC exam. The state issues Tanker (N) and Hazmat (H) as two separate tests."
    />
  )
}
