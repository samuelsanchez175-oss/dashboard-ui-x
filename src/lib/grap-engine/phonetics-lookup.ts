/**
 * Lightweight CMU ARPAbet lookups for lyric / inspection tools.
 * Uses the same dictionary source as `rhyme-index` without building the rhyme index.
 */

let dictionaryPromise: Promise<Record<string, string>> | null = null

async function loadCmuDict(): Promise<Record<string, string>> {
  if (!dictionaryPromise) {
    dictionaryPromise = import('cmu-pronouncing-dictionary').then(m => m.dictionary as Record<string, string>)
  }
  return dictionaryPromise
}

function canonicalKeyFromDictEntry(dictKey: string): string {
  return dictKey.replace(/\(\d+\)$/, '').toLowerCase()
}

/**
 * CMU pronunciations for a single word spelling (ARpabet IPA-style strings).
 * Matches all dictionary headword variants such as RECORD and RECORD(2).
 */
export async function lookupWordPronunciations(word: string): Promise<string[]> {
  const trimmed = word.toLowerCase().trim().replace(/[^\w']/g, '')
  if (!trimmed.length) return []

  const dict = await loadCmuDict()
  const variants: string[] = []
  for (const k of Object.keys(dict)) {
    if (canonicalKeyFromDictEntry(k) !== trimmed) continue
    const p = dict[k]
    if (p) variants.push(p.trim())
  }
  return [...new Set(variants)]
}
