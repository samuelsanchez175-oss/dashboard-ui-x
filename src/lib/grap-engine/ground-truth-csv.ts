/**
 * Loaders for the AI-Journal ground-truth assets.
 *
 *   • ground_truth_rap_bars_MODEL_G.csv  → real Gunna / Young Thug / Future bars
 *                                          annotated with rhyme word, phonetic
 *                                          ending, stress pattern, syllable
 *                                          count, primary tone, authority class.
 *   • jargon_authority_lexicon.csv      → brand / motif / phrase lexicon with
 *                                          category, theme, register, scene
 *                                          weight and era.
 *
 * Files are served as static assets from /grap-data/*.csv and parsed in the
 * browser exactly once per session.
 */
/* eslint react-hooks/purity: "off" -- module-scoped lazy cache, not a hook */

const BARS_URL    = '/grap-data/ground_truth_rap_bars_MODEL_G.csv'
const LEXICON_URL = '/grap-data/jargon_authority_lexicon.csv'

export interface GroundTruthBar {
  textId:          string
  artist:          string
  song:            string
  album:           string
  text:            string
  rhymeWord:       string
  rhymeSuggestions: string[]
  rhymeClass:      string
  primaryTone:     string
  secondaryTone:   string
  year:            number | null
  syllableCount:   number | null
  phoneticEnding:  string
  phoneticRhyme:   string
  stressPattern:   string
  rhymeDensity:    number | null
  authorityClass:  string
}

export interface LexiconTerm {
  term:           string
  definition:     string
  notes:          string
  category:       string
  themePrimary:   string
  register:       string
  authorityRequirement: string
  proofType:      string
  exposureCost:   number | null
  overusePenalty: number | null
  culturalSpecificity: string
  sceneWeight:    number | null
  eraScene:       string
  usageMode:      string
}

let barsCache:    Promise<GroundTruthBar[]>    | null = null
let lexiconCache: Promise<LexiconTerm[]>       | null = null

/* ── CSV parser — RFC 4180 enough for these files ────────────────────────── */

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell  = ''
  let i     = 0
  let inQuotes = false

  while (i < text.length) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 2; continue }
      if (c === '"')                         { inQuotes = false; i++; continue }
      cell += c
      i++
      continue
    }
    if (c === '"')   { inQuotes = true;  i++; continue }
    if (c === ',')   { row.push(cell);   cell = ''; i++; continue }
    if (c === '\n')  { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue }
    if (c === '\r')  { i++; continue }
    cell += c
    i++
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0]?.trim()))
}

function toNum(v: string | undefined): number | null {
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/* ── Ground-truth bars ───────────────────────────────────────────────────── */

async function loadBarsInternal(): Promise<GroundTruthBar[]> {
  const res = await fetch(BARS_URL)
  if (!res.ok) throw new Error(`Bars CSV unavailable (${res.status})`)
  const text = await res.text()
  const rows = parseCsv(text)
  if (rows.length < 2) return []

  const header = rows[0]!.map(h => h.trim())
  const idx    = (name: string) => header.indexOf(name)
  const iText  = idx('text_bar_line') >= 0 ? idx('text_bar_line') : idx('text')

  const bars: GroundTruthBar[] = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.length < 5) continue
    const text = (row[iText] ?? '').trim()
    if (!text || text.length < 2) continue
    bars.push({
      textId:               (row[idx('REAL LYRICS 2026 NEW JAN 24')] ?? '').trim(),
      artist:               (row[idx('artist')] ?? '').trim(),
      song:                 (row[idx('song')]   ?? '').trim(),
      album:                (row[idx('album')]  ?? '').trim(),
      text,
      rhymeWord:            (row[idx('rhyme_word')]         ?? '').trim(),
      rhymeSuggestions:     (row[idx('rhyme_suggestions')]  ?? '').split('|').map(s => s.trim()).filter(Boolean),
      rhymeClass:           (row[idx('rhyme_class')]        ?? '').trim(),
      primaryTone:          (row[idx('primary_tone')]       ?? '').trim(),
      secondaryTone:        (row[idx('secondary_tone')]     ?? '').trim(),
      year:                 toNum(row[idx('year')]),
      syllableCount:        toNum(row[idx('syllable_count')]),
      phoneticEnding:       (row[idx('phonetic_ending')]    ?? '').trim(),
      phoneticRhyme:        (row[idx('phonetic_rhyme_class')] ?? '').trim(),
      stressPattern:        (row[idx('stress_pattern')]     ?? '').trim(),
      rhymeDensity:         toNum(row[idx('rhyme_density')]),
      authorityClass:       (row[idx('AuthorityClass')]     ?? '').trim(),
    })
  }
  return bars
}

export function loadGroundTruthBars(): Promise<GroundTruthBar[]> {
  if (!barsCache) barsCache = loadBarsInternal()
  return barsCache
}

/* ── Lexicon terms (brands, motifs, phrases) ─────────────────────────────── */

async function loadLexiconInternal(): Promise<LexiconTerm[]> {
  const res = await fetch(LEXICON_URL)
  if (!res.ok) throw new Error(`Lexicon CSV unavailable (${res.status})`)
  const text = await res.text()
  const rows = parseCsv(text)
  if (rows.length < 2) return []

  const header = rows[0]!.map(h => h.trim())
  const idx    = (name: string) => header.indexOf(name)
  const terms: LexiconTerm[] = []

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row) continue
    const term = (row[idx('term')] ?? '').trim()
    if (!term || term.startsWith('Common Themes')) continue
    terms.push({
      term,
      definition:           (row[idx('definition')] ?? '').trim(),
      notes:                (row[idx('notes')]      ?? '').trim(),
      category:             (row[idx('category')]   ?? '').trim(),
      themePrimary:         (row[idx('theme_primary')] ?? '').trim(),
      register:             (row[idx('register')]   ?? '').trim(),
      authorityRequirement: (row[idx('authority_requirement')] ?? '').trim(),
      proofType:            (row[idx('proof_type')] ?? '').trim(),
      exposureCost:         toNum(row[idx('exposure_cost')]),
      overusePenalty:       toNum(row[idx('overuse_penalty')]),
      culturalSpecificity:  (row[idx('cultural_specificity')] ?? '').trim(),
      sceneWeight:          toNum(row[idx('scene_weight')]),
      eraScene:             (row[idx('era_scene')]  ?? '').trim(),
      usageMode:            (row[idx('usage_mode')] ?? '').trim(),
    })
  }
  return terms
}

export function loadLexiconTerms(): Promise<LexiconTerm[]> {
  if (!lexiconCache) lexiconCache = loadLexiconInternal()
  return lexiconCache
}

/* ── Retrieval helpers ───────────────────────────────────────────────────── */

/**
 * Best-effort phonetic match — compares the last two ARPAbet tokens (vowel +
 * coda) of the user's pronunciation against each bar's `phonetic_ending`.
 * Returns highest-similarity bars first.
 */
export function findBarsByPhonetic(
  bars: GroundTruthBar[],
  userPronunciation: string,
  limit = 8,
): GroundTruthBar[] {
  const userTokens = userPronunciation.trim().split(/\s+/).filter(Boolean)
  if (!userTokens.length) return []
  const userTail2 = userTokens.slice(-2).join(' ').toUpperCase()
  const userTail1 = userTokens.slice(-1).join(' ').toUpperCase()

  const scored: { bar: GroundTruthBar; score: number }[] = []
  for (const bar of bars) {
    const e = bar.phoneticEnding.toUpperCase()
    if (!e) continue
    let score: number
    if (e.endsWith(userTail2) && userTail2.length > 2) score = 3
    else if (e.endsWith(userTail1)) score = 2
    else continue
    scored.push({ bar, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map(s => s.bar)
}

/** Pick lexicon terms whose theme/category roughly matches a free-text hint. */
export function findLexiconByTheme(
  terms: LexiconTerm[],
  hint: string,
  limit = 6,
): LexiconTerm[] {
  const q = hint.toLowerCase().trim()
  if (!q) return terms.slice(0, limit)
  const hits = terms.filter(t =>
    t.themePrimary.toLowerCase().includes(q) ||
    t.category.toLowerCase().includes(q) ||
    t.notes.toLowerCase().includes(q),
  )
  return hits.slice(0, limit)
}
