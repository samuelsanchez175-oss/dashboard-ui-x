import { findRhymesCmudict, ensureRhymeIndexBuilt, type RhymeSuggestion, type RhymeTier } from './rhyme-index'

export type PhoneticsRowLite = {
  word: string
  prons: string[]
  error?: string
}

export type FigurativePhraseCue = {
  seed: string
  rhyme: string
  tier: RhymeTier
  line: string
}

export const PHONETICS_STOPWORDS = new Set(
  [
    'a',
    'an',
    'and',
    'are',
    'as',
    'at',
    'be',
    'but',
    'by',
    'for',
    'from',
    'had',
    'has',
    'have',
    'he',
    'her',
    'him',
    'his',
    'i',
    'if',
    'in',
    'into',
    'is',
    'it',
    'its',
    'me',
    'my',
    'no',
    'not',
    'of',
    'on',
    'or',
    'our',
    'she',
    'so',
    'than',
    'that',
    'the',
    'their',
    'them',
    'then',
    'there',
    'these',
    'they',
    'this',
    'to',
    'too',
    'up',
    'was',
    'we',
    'were',
    'what',
    'when',
    'where',
    'which',
    'who',
    'will',
    'with',
    'you',
    'your',
    'ya',
    'yo',
    'uh',
    'oh',
    'yeah',
    'na',
  ].map(w => w.toLowerCase()),
)

/** Longest CMU-known content token (skips stopwords); drives rhyme + figurative seeds. */
export function pickBestPhoneticsSeedWord(rows: PhoneticsRowLite[]): string | null {
  const seeds = rows
    .filter(r => r.prons.length > 0 && !r.error)
    .map(r => r.word.trim())
    .filter(w => w.length > 1 && !PHONETICS_STOPWORDS.has(w.toLowerCase()))
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .filter((w, i, arr) => arr.indexOf(w) === i)
  return seeds[0] ?? null
}

function djb2(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i)!
  }
  return h >>> 0
}

function pickRhyme(rhymes: RhymeSuggestion[], seed: string, salt: number): RhymeSuggestion | null {
  if (!rhymes.length) return null
  const idx = djb2(`${seed}:${salt}`) % rhymes.length
  return rhymes[idx] ?? null
}

function firstAvailableRhyme(
  perfect: RhymeSuggestion[],
  near: RhymeSuggestion[],
  slant: RhymeSuggestion[],
  seed: string,
  salt: number,
): RhymeSuggestion | null {
  return pickRhyme(perfect, seed, salt) ?? pickRhyme(near, seed, salt + 1) ?? pickRhyme(slant, seed, salt + 2)
}

type TemplateFn = (seed: string, rhyme: string, tier: RhymeTier) => string

const TEMPLATES: TemplateFn[] = [
  (seed, rhyme, tier) =>
    `Simile scaffold: “harder than ${rhyme}” — park it after “${seed}” so the vowel stack (${tier}) carries the turn.`,
  (seed, rhyme) =>
    `Metaphor hinge: stack imagery on “${seed}”, then snap the scene shut with “${rhyme}” echoing the same stressed nucleus.`,
  (seed, rhyme) =>
    `Punchline rack: land “${seed}” as setup bar, tag “${rhyme}” on the exhale for a clean couplet bounce.`,
  (seed, rhyme) =>
    `Internal color: weave “${rhyme}” mid-line while “${seed}” stays the anchor keyword listeners already caught.`,
  (seed, rhyme) =>
    `Contrast bar: let “${seed}” read literal, flip figurative with a “like ${rhyme}” bridge on the shared rhyme body.`,
  (seed, rhyme) =>
    `Double-meaning tease: phonetic neighbor “${rhyme}” lets you pun off “${seed}” without drifting from the dictionary vowel frame.`,
]

/**
 * Deterministic “phrase / figurative” prompts from CMU pronunciations + rhyme tiers.
 * Cheap batch: one `findRhymesCmudict` per seed word (bounded seeds).
 */
export async function buildFigurativePhraseCues(
  rows: PhoneticsRowLite[],
  opts?: { maxSeeds?: number },
): Promise<FigurativePhraseCue[]> {
  await ensureRhymeIndexBuilt()

  const maxSeeds = opts?.maxSeeds ?? 5
  const seeds = rows
    .filter(r => r.prons.length > 0 && !r.error)
    .map(r => r.word.trim())
    .filter(w => w.length > 1 && !PHONETICS_STOPWORDS.has(w.toLowerCase()))
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .filter((w, i, arr) => arr.indexOf(w) === i)
    .slice(0, maxSeeds)

  const cues: FigurativePhraseCue[] = []
  let t = 0
  for (const seed of seeds) {
    const { perfect, near, slant } = await findRhymesCmudict({
      inputWord: seed,
      maxPerfect: 14,
      maxNear: 14,
      maxSlant: 12,
      includeSlant: true,
      excludeExact: true,
    })
    const picked = firstAvailableRhyme(perfect, near, slant, seed, t)
    if (!picked) continue
    const template = TEMPLATES[t % TEMPLATES.length]!
    const line = template(seed, picked.word, picked.tier)
    cues.push({ seed, rhyme: picked.word, tier: picked.tier, line })
    t++
  }

  return cues
}
