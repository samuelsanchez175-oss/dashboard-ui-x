import { pickBestPhoneticsSeedWord, type PhoneticsRowLite } from './figurative-phrase-suggestions'
import {
  ensureRhymeIndexBuilt,
  findRhymesCmudict,
  findSharedFinalConsonantClusterCmudict,
  type RhymeSuggestion,
} from './rhyme-index'

export type PhoneticsRhymePanel = {
  seedWord: string
  seedFromManual: boolean
  featuredNearRhymes: RhymeSuggestion[]
  perfect: RhymeSuggestion[]
  near: RhymeSuggestion[]
  consonantStyle: string[]
  consonantMatchKeys: string[]
  unknownSeed: boolean
}

function rowHasPron(r: PhoneticsRowLite, w: string): boolean {
  return r.word.trim().toLowerCase() === w.trim().toLowerCase() && r.prons.length > 0 && !r.error
}

/**
 * Rhyme tiers + consonant-tail neighbors for the phonetics inspector (single seed).
 */
export async function buildPhoneticsRhymePanel(
  rows: PhoneticsRowLite[],
  opts?: { manualSeedWord?: string | null },
): Promise<PhoneticsRhymePanel> {
  await ensureRhymeIndexBuilt()

  const manual = opts?.manualSeedWord?.trim()
  const manualOk = manual && rows.some(r => rowHasPron(r, manual))
  const seedWord = (manualOk ? manual! : pickBestPhoneticsSeedWord(rows) ?? '').trim()

  if (!seedWord) {
    return {
      seedWord: '',
      seedFromManual: false,
      featuredNearRhymes: [],
      perfect: [],
      near: [],
      consonantStyle: [],
      consonantMatchKeys: [],
      unknownSeed: true,
    }
  }

  const [rhyme, cons] = await Promise.all([
    findRhymesCmudict({
      inputWord: seedWord,
      maxPerfect: 28,
      maxNear: 48,
      maxSlant: 0,
      includeSlant: false,
      excludeExact: true,
    }),
    findSharedFinalConsonantClusterCmudict({ inputWord: seedWord, max: 40, excludeExact: true }),
  ])

  const unknownSeed = rhyme.unknownWord

  const tierWords = new Set<string>([...rhyme.perfect, ...rhyme.near].map(r => r.word.toLowerCase()))
  const consonantStyle = cons.words.filter(w => !tierWords.has(w.toLowerCase()))

  return {
    seedWord,
    seedFromManual: Boolean(manualOk),
    featuredNearRhymes: rhyme.near.slice(0, 5),
    perfect: rhyme.perfect,
    near: rhyme.near,
    consonantStyle,
    consonantMatchKeys: cons.matchKeys,
    unknownSeed,
  }
}
