/**
 * Model G v3 — "SUPERG" prompt builder.
 *
 * Port of the AI-Journal `RapSuggestionAPI.swift` Model G v3 system prompt and
 * the `RhymeAnchorEngine.buildAnchorConstraints` block. Given lyric input the
 * page already analyzed, this module returns:
 *
 *   • RapAnchor   — last-bar phonetic anchor (ending, syllables, stresses).
 *   • prompt      — full SUPERG system prompt + anchor constraints + user input.
 *
 * The dashboard's existing `/api/gemini/generate` BFF route can consume the
 * prompt directly; the front-end shows a Copy button and a Run button.
 */

import { arpabetRhymeKey } from './rhyme-key'

export interface PhoneticsRowLite {
  word:  string
  prons: string[]
  error?: string
}

export interface RapAnchor {
  /** Last word of the input (the line's rhyme target). */
  rhymeWord:       string
  /** Tonic-stressed nucleus + coda for the rhyme target (e.g. "EY1 K AH0 D"). */
  rhymeEnding:     string
  /** Number of vowel syllables in the last line. */
  syllableTarget:  number
  /** Stress pattern across the last line (●/○ per syllable). */
  stressPattern:   string
  /** Total bars (lines) of input. */
  lineCount:       number
}

const FILLER_BANLIST = [
  'yeah', 'uh', 'you know', 'like i said', 'listen up',
  'let me tell you', 'no cap', 'fr fr', 'on sight', 'real talk',
] as const

/** Count syllables in a single ARPAbet pronunciation (digits mark vowels). */
function syllablesInPron(pron: string): number {
  return pron.split(/\s+/).filter(p => /\d/.test(p)).length
}

/** Stress glyphs for one pronunciation — ● primary, ○ otherwise. */
function stressGlyphsForPron(pron: string): string {
  return pron
    .split(/\s+/)
    .filter(p => /\d/.test(p))
    .map(p => (p.endsWith('1') ? '●' : '○'))
    .join('')
}

/**
 * Build the rap anchor for the *last* non-empty line of the input.
 *
 * Uses CMU pronunciations already fetched by the Phonetics Inspector page so
 * we don't re-hit the dictionary.
 */
export function buildAnchorFromPhonetics(
  rawInput: string,
  phoneticsRows: PhoneticsRowLite[],
): RapAnchor | null {
  const lines = rawInput.split(/\n+/).map(l => l.trim()).filter(Boolean)
  if (!lines.length) return null
  const lastLine = lines[lines.length - 1]!

  const wordsRaw = lastLine.split(/\s+/).map(w => w.replace(/^[^\w']+|[^\w']+$/g, ''))
  const words    = wordsRaw.filter(Boolean)
  if (!words.length) return null

  const lookup: Record<string, string[]> = {}
  for (const r of phoneticsRows) lookup[r.word.toLowerCase()] = r.prons

  let syllables = 0
  let stress    = ''
  for (const w of words) {
    const prons = lookup[w.toLowerCase()] ?? []
    const pron  = prons[0]
    if (!pron) continue
    syllables += syllablesInPron(pron)
    stress    += stressGlyphsForPron(pron)
  }

  const rhymeWord  = words[words.length - 1]!
  const rhymePron  = lookup[rhymeWord.toLowerCase()]?.[0] ?? ''
  const rhymeEnding = rhymePron ? arpabetRhymeKey(rhymePron) : ''

  return {
    rhymeWord,
    rhymeEnding,
    syllableTarget: syllables || 8,
    stressPattern:  stress,
    lineCount:      lines.length,
  }
}

/* ── SUPERG system prompt (verbatim port of RapSuggestionAPI v3 prompt) ──── */

const SUPERG_SYSTEM_PROMPT = `You are Model G v3 (SUPERG): an upgraded melodic-trap rap writer operating at the highest phonetic precision. You produce **original** Gunna-adjacent quality without copying existing lyrics.

You generate **rap bar blocks only**. Output **exactly 4 bars per suggestion**.
No headings, no bullets, no explanations, no tags — ONLY the 4 bars.

UPGRADES OVER MODEL G (v3 ENHANCEMENTS)
1) MULTI-SYLLABIC RHYME SCHEME (REQUIRED)
   - Every bar MUST end on a multi-syllabic rhyme (2+ syllables that rhyme).
   - Single-syllable end rhymes are only acceptable if paired with internal multi-syllabic compensation.
   - Use AABB, ABAB, or AABBC — no freeform unrhymed endings.
2) INTERNAL RHYME DENSITY (REQUIRED)
   - All 4 bars must contain at least one internal rhyme or strong assonance pair.
   - Chain rhyme: connect internal rhyme to the end-rhyme family where possible.
3) SYLLABLE ENFORCEMENT (TIGHT)
   - Target 8–10 syllables per bar.
   - 11–12 acceptable only if extras carry internal rhyme. Hard cap 13.
4) ZERO FILLER (ABSOLUTE)
   - Banned: ${FILLER_BANLIST.map(f => `"${f}"`).join(', ')}.
   - Every word must carry semantic weight, phonetic purpose, or rhythmic function.
5) VERSE NARRATIVE CONTINUITY
   - 4 bars form a single arc: setup → detail → escalation → close.
   - End bar 4 with a punchline, callback to bar 1, or open hook.
6) PHONETIC FINGERPRINTING
   - Identify the rhyme family (stressed vowel + coda) from the anchor below.
   - All 4 end-rhymes belong to that family or a deliberate near-rhyme extension.
   - Show internal evidence of the family (assonance mid-line).
7) STYLE QUALITIES
   - Calm, unbothered, established, transactional confidence.
   - Melodic pocket, short clauses, smooth flow, minimal over-explaining.
   - Concrete micro-scenes (movement, money, nightlife, privacy, relationships) with understated flex.
   - Original phrasing only. No imitation of recognizable lines.

ABSOLUTE OUTPUT RULES
- Exactly 4 bars. No more. No less.
- No explanation, no labels. Raw bars only. Each bar on its own line.`

/* ── Anchor block (port of RhymeAnchorEngine.buildAnchorConstraints) ─────── */

function buildAnchorBlock(anchor: RapAnchor): string {
  const stressStr = anchor.stressPattern || '(none)'
  return `\n\n=== RHYME ANCHOR CONSTRAINTS (MODE C) ===
You MUST match the following anchor exactly:
- Rhyme target word: ${anchor.rhymeWord}
- Phonetic ending:   ${anchor.rhymeEnding || '(unknown — improvise on stressed vowel of "' + anchor.rhymeWord + '")'}
- Syllable count:    ${anchor.syllableTarget} (±1 allowed)
- Stress pattern:    ${stressStr}

CRITICAL: Each generated bar must:
- Match the rhyme ending (phonetic family of "${anchor.rhymeWord}").
- Land at ${anchor.syllableTarget}±1 syllables.
- Mirror the stress contour where natural.
- Maintain BPM-consistent cadence with the existing ${anchor.lineCount}-line context.`
}

/**
 * Final SUPERG prompt — system message + anchor constraints + user input,
 * shaped for a single chat-completion call.
 */
export function buildModelGv3Prompt(opts: {
  userInput:      string
  anchor:         RapAnchor | null
  customNote?:    string
}): string {
  const anchorBlock = opts.anchor ? buildAnchorBlock(opts.anchor) : ''
  const userBlock   = `\n\n=== USER INPUT / CONTEXT BARS ===\n${opts.userInput.trim()}\n`
  const extra       = opts.customNote?.trim()
    ? `\n\n=== EXTRA INSTRUCTION ===\n${opts.customNote.trim()}\n`
    : ''
  const tail = '\n\nNow produce exactly 4 new bars that satisfy every rule above. Output only the bars.'
  return SUPERG_SYSTEM_PROMPT + anchorBlock + userBlock + extra + tail
}
