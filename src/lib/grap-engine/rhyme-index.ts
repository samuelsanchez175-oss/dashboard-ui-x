import getRhymingPart from 'rhyming-part'
import { arpabetRhymeKey } from './rhyme-key'

/** Aligned with Journal AI tiers: perfect end-rhyme, shared nucleus (near), shared vowel base (slant). */
export type RhymeTier = 'perfect' | 'near' | 'slant'

/** In-memory inverted index: ARPAbet rhyme key → canonical words. */

let built = false
let dictionary: Record<string, string> | null = null
const keyToCanon = new Map<string, Set<string>>()

function canonicalFromDictKey(dictKey: string): string {
  return dictKey.replace(/\(\d+\)$/, '').toLowerCase()
}

/** All CMU headword variants for a canonical spelling (e.g. record, record(2)). */
function dictKeysForWord(dict: Record<string, string>, word: string): string[] {
  const w = word.toLowerCase()
  const keys: string[] = []
  for (const k of Object.keys(dict)) {
    if (canonicalFromDictKey(k) === w) keys.push(k)
  }
  return keys
}

function splitPronTokens(pronunciation: string): string[] {
  return pronunciation.trim().split(/\s+/).filter(Boolean)
}

/** Last stressed ARPAbet nucleus index, or -1. */
function lastStressedVowelIndex(tokens: string[]): number {
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (/\d/.test(tokens[i] ?? '')) return i
  }
  return -1
}

interface RhymeSignature {
  stressedVowel: string
  /** ARPAbet phones after the stressed vowel (coda / off-glide). */
  coda: string[]
}

function extractSignature(pronunciation: string): RhymeSignature | null {
  const tokens = splitPronTokens(pronunciation)
  const idx = lastStressedVowelIndex(tokens)
  if (idx < 0) return null
  const stressedVowel = tokens[idx] ?? ''
  const coda = tokens.slice(idx + 1)
  return { stressedVowel, coda }
}

function sameTokens(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function tierForPair(a: RhymeSignature, b: RhymeSignature): RhymeTier | null {
  if (a.stressedVowel === b.stressedVowel && sameTokens(a.coda, b.coda)) return 'perfect'
  if (a.stressedVowel === b.stressedVowel) return 'near'
  const baseA = a.stressedVowel.replace(/\d/g, '')
  const baseB = b.stressedVowel.replace(/\d/g, '')
  if (baseA === baseB && baseA.length > 0) return 'slant'
  return null
}

/**
 * Best tier when the input word has multiple pronunciations.
 */
function classifyAgainstTarget(
  targetSigs: RhymeSignature[],
  candPron: string,
): RhymeTier | null {
  const candSig = extractSignature(candPron)
  if (!candSig) return null
  let best: RhymeTier | null = null
  const rank: Record<RhymeTier, number> = { perfect: 3, near: 2, slant: 1 }
  for (const t of targetSigs) {
    const tier = tierForPair(t, candSig)
    if (!tier) continue
    if (!best || rank[tier] > rank[best]) best = tier
  }
  return best
}

async function loadDictionary(): Promise<Record<string, string>> {
  if (dictionary) return dictionary
  const mod = await import('cmu-pronouncing-dictionary')
  dictionary = mod.dictionary as Record<string, string>
  return dictionary
}

export async function ensureRhymeIndexBuilt(): Promise<void> {
  if (built) return

  const dict = await loadDictionary()

  for (const [dictKey, pronunciation] of Object.entries(dict)) {
    const key = arpabetRhymeKey(pronunciation)
    if (!key) continue
    let set = keyToCanon.get(key)
    if (!set) {
      set = new Set()
      keyToCanon.set(key, set)
    }
    set.add(canonicalFromDictKey(dictKey))
  }
  built = true
}

/** Strip stress digits for softer “slant” clustering (cheap phonetic cousin). */

function rhymeKeyStressless(fullKey: string): string {
  return fullKey.replace(/\d/g, '')
}

/** Slant index built lazily on first near-rhyme request. */

let slantBuilt = false
const slantToCanon = new Map<string, Set<string>>()

function ensureSlantIndex(): void {
  if (slantBuilt) return
  for (const [fullKey, words] of keyToCanon.entries()) {
    const sk = rhymeKeyStressless(fullKey)
    let set = slantToCanon.get(sk)
    if (!set) {
      set = new Set()
      slantToCanon.set(sk, set)
    }
    for (const w of words)
      set.add(w)
  }
  slantBuilt = true
}

export interface RhymeSuggestion {
  word: string
  tier: RhymeTier
}

/**
 * Lookup rhymes using CMU + `rhyming-part` keys, then **re-score** candidates with
 * ARPAbet nucleus/coda tiers (perfect / near / slant) to match Journal AI behavior.
 *
 * @param includeSlant When true, expands the candidate pool via stress-stripped keys so
 *        near/slant neighbors are discoverable; when false, only rhyme-key neighbors are scanned.
 */

export async function findRhymesCmudict(opts: {
  inputWord: string
  maxPerfect?: number
  maxNear?: number
  maxSlant?: number
  includeSlant?: boolean
  excludeExact?: boolean
}): Promise<{
  perfect: RhymeSuggestion[]
  near: RhymeSuggestion[]
  slant: RhymeSuggestion[]
  unknownWord: boolean
  rhymeKeys: string[]
}> {
  await ensureRhymeIndexBuilt()
  const dict = await loadDictionary()

  const normalized = opts.inputWord.toLowerCase().trim().replace(/[^\w']/g, '')

  if (!normalized.length)
    return { perfect: [], near: [], slant: [], unknownWord: false, rhymeKeys: [] }

  const part = getRhymingPart(normalized, { multiple: true })
  const rhymeKeysRaw = typeof part === 'string' ? (part ? [part] : []) : part.filter(Boolean)
  const rhymeKeys = [...new Set(rhymeKeysRaw)]

  if (!rhymeKeys.length)
    return { perfect: [], near: [], slant: [], unknownWord: true, rhymeKeys: [] }

  const canonicalInput = canonicalFromDictKey(normalized)
  const inputDictKeys = dictKeysForWord(dict, normalized)
  const targetSigs: RhymeSignature[] = []
  for (const k of inputDictKeys) {
    const pronunciation = dict[k]
    if (!pronunciation) continue
    const sig = extractSignature(pronunciation)
    if (sig) targetSigs.push(sig)
  }
  if (!targetSigs.length)
    return { perfect: [], near: [], slant: [], unknownWord: true, rhymeKeys }

  const maxP = opts.maxPerfect ?? 60
  const maxN = opts.maxNear ?? 50
  const maxS = opts.maxSlant ?? 50

  const candidateWords = new Set<string>()
  for (const rk of rhymeKeys) {
    const group = keyToCanon.get(rk)
    if (!group) continue
    for (const w of group) candidateWords.add(w)
  }

  if (opts.includeSlant !== false) {
    ensureSlantIndex()
    const slBuckets = new Set<string>()
    for (const rk of rhymeKeys)
      slBuckets.add(rhymeKeyStressless(rk))
    for (const bucket of slBuckets) {
      const grp = slantToCanon.get(bucket)
      if (!grp) continue
      for (const w of grp) candidateWords.add(w)
    }
  }

  if (opts.excludeExact !== false) candidateWords.delete(canonicalInput)

  const bestTier = new Map<string, RhymeTier>()
  const rank: Record<RhymeTier, number> = { perfect: 3, near: 2, slant: 1 }

  for (const cand of candidateWords) {
    let best: RhymeTier | null = null
    for (const dk of dictKeysForWord(dict, cand)) {
      const pronunciation = dict[dk]
      if (!pronunciation) continue
      const tier = classifyAgainstTarget(targetSigs, pronunciation)
      if (!tier) continue
      if (!best || rank[tier] > rank[best]) best = tier
    }
    if (best) bestTier.set(cand, best)
  }

  const perfect: RhymeSuggestion[] = []
  const near: RhymeSuggestion[] = []
  const slant: RhymeSuggestion[] = []

  for (const [w, tier] of bestTier) {
    const row: RhymeSuggestion = { word: w, tier }
    if (tier === 'perfect') perfect.push(row)
    else if (tier === 'near') near.push(row)
    else slant.push(row)
  }

  const byWord = (a: RhymeSuggestion, b: RhymeSuggestion) => a.word.localeCompare(b.word)
  perfect.sort(byWord)
  near.sort(byWord)
  slant.sort(byWord)

  return {
    perfect: perfect.slice(0, maxP),
    near: near.slice(0, maxN),
    slant: slant.slice(0, maxS),
    unknownWord: false,
    rhymeKeys,
  }
}
