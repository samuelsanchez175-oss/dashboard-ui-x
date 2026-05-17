/**
 * LLM-driven post-analysis polish (Phase 2 of the v2 pipeline brief).
 *
 * The chord detector's local pipeline (Basic Pitch + cleanup + key-aware
 * Viterbi + audit) is structurally sound but lacks musical reasoning. Send
 * the detected progression + key estimate + audit findings to Gemini and
 * ask it to act as a session musician — flag structurally suspicious chord
 * choices, propose stylistic corrections, infer the song's likely key/mode
 * if our estimate is shaky, and call out chord-tones that are probably
 * present in the source but missing from the export.
 *
 * Boundaries:
 *   - LLM is post-processing, NEVER core transcription. It works from our
 *     pipeline's symbolic output (chord labels + key), not raw audio.
 *   - Opt-in. The user clicks AI POLISH; nothing fires automatically.
 *   - Cost / latency exposed to the user. One Gemini call per click.
 *
 * Wire-through: the page component calls `polishChordResult(result)`. The
 * Gemini BFF route (`/api/gemini/generate`) handles the API key + network.
 */

import type { ChordAnalysisResult } from './chord-detector-engine'

/** Structured assessment returned by the LLM. Optional fields when not applicable. */
export interface LlmPolishResult {
  ok: true
  /** Concise human-readable summary — 2-4 sentences, shown in the AI POLISH panel. */
  summary: string
  /** Best-guess key from the LLM. May agree with our estimate or contradict it. */
  suggestedKey: string | null
  /** Likely genre / style the LLM inferred from the progression. */
  inferredStyle: string | null
  /**
   * Per-segment suggested corrections — only segments the LLM flagged as
   * structurally suspicious. May be empty when the progression looks clean.
   */
  chordCorrections: ChordCorrection[]
  /**
   * Pitch classes the LLM thinks are present in the source but missing from
   * the export. Names ('F#', 'D#', etc), not midi numbers.
   */
  missingPCs: string[]
}

export interface ChordCorrection {
  /** Index into `result.segments` (0-based). */
  segmentIndex: number
  /** Current label from our detector. */
  currentLabel: string
  /** What the LLM thinks it should be. */
  suggestedLabel: string
  /** Short reason — why the LLM thinks the swap fits. */
  rationale: string
}

export interface LlmPolishError {
  ok: false
  message: string
}

/* ──────────────────────────────────────────────────────────────────────────── */

/**
 * Build the prompt sent to Gemini. Includes only symbolic data (no audio),
 * keeps the token count low, and asks for a strict JSON response so we can
 * parse it cleanly.
 */
function buildPolishPrompt(result: ChordAnalysisResult): string {
  const progression = result.segments
    .map(s => `${s.label} (${s.startSec.toFixed(2)}s, ${s.durationSec.toFixed(2)}s)`)
    .join(' → ')
  const auditMissing = result.audit?.missingNotes
    ?.map(m => `${m.pc} (source ${(m.sourceShare * 100).toFixed(1)}%, output 0%, @${m.peakSec.toFixed(1)}s)`)
    .join('; ') ?? 'none flagged'
  const auditLoop = result.audit?.loopOverall ?? 'unknown'
  const keyConfPct = Math.round((result.estimatedKey.confidence ?? 0) * 100)

  return `You are a session musician + music-theory tutor reviewing the output of an
automatic chord-detection algorithm. Your job is to flag mistakes and suggest
corrections — NOT to invent musical content from scratch.

DETECTED ANALYSIS:
  Tempo:           ${result.bpm} BPM (${result.bpmSource})
  Detected key:    ${result.estimatedKey.label} (${keyConfPct}% confidence)
  Duration:        ${result.durationSec.toFixed(1)} s
  Unique chords:   ${result.uniqueChordCount}
  Progression:
    ${progression || '(no segments)'}

AUDIT FINDINGS (from local pipeline):
  Missing pitch classes (source-energy without note coverage):
    ${auditMissing}
  Per-period loop quality verdict: ${auditLoop}

TASK:
  Respond in STRICT JSON only, no prose, no markdown, this exact shape:

  {
    "summary":         "2-4 sentence assessment in plain English",
    "suggestedKey":    "F# major" | null,
    "inferredStyle":   "trap / R&B / etc" | null,
    "chordCorrections": [
      { "segmentIndex": 3, "currentLabel": "F#", "suggestedLabel": "F#m", "rationale": "..." }
    ],
    "missingPCs":      ["G", "A", "F"]
  }

Rules:
  - chordCorrections: only include segments you are CONFIDENT about. Empty array if
    the progression looks musically coherent.
  - suggestedKey: null if our estimate is fine. Provide a string ONLY if you think
    we got it wrong.
  - missingPCs: names not midi numbers. Empty array if everything looks accounted for.
  - summary: focus on the user's PRACTICAL question — "is this output worth keeping
    or do I need to re-record?"`
}

/* ──────────────────────────────────────────────────────────────────────────── */

/**
 * Call the local Gemini BFF route with the polish prompt and parse the JSON
 * response. Catches network / parse / shape errors and converts them into a
 * structured failure so callers don't need to wrap in try/catch.
 */
export async function polishChordResult(
  result: ChordAnalysisResult,
): Promise<LlmPolishResult | LlmPolishError> {
  if (!result || result.segments.length === 0) {
    return {
      ok: false,
      message: 'No analysis result to polish. Drop an audio file first.',
    }
  }

  try {
    const { fetchWithKeys } = await import('../../lib/api-keys')
    const res = await fetchWithKeys('/api/gemini/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: buildPolishPrompt(result),
        maxOutputTokens: 700,
      }),
    })
    const json = (await res.json()) as
      | { ok: true; preview: string | null }
      | { ok?: false; message?: string }

    if (!res.ok || !json || !('ok' in json) || json.ok !== true) {
      const bffMessage =
        typeof json === 'object' && 'message' in json && typeof json.message === 'string'
          ? json.message
          : null
      /* The dev BFF returns "Set GEMINI_API_KEY." when neither the
       * `x-user-key-gemini-api-key` header (from Settings → Google AI Studio)
       * nor `process.env.GEMINI_API_KEY` is set. Surface a friendlier message
       * that points the user at the single shared key field. */
      if (bffMessage && /GEMINI_API_KEY/i.test(bffMessage)) {
        return {
          ok: false,
          message:
            'No Gemini API key found. Open Settings → "Google AI Studio (Gemini)" and paste your Google AI Studio key — one key powers AI POLISH plus every other Gemini feature in the dashboard.',
        }
      }
      return {
        ok: false,
        message: bffMessage ?? `Gemini request failed (HTTP ${res.status}).`,
      }
    }
    const text = ((json as { ok: true; preview: string | null }).preview ?? '').trim()
    if (!text) {
      return { ok: false, message: 'Gemini returned an empty response.' }
    }

    /* The model sometimes wraps JSON in ```json fences despite our prompt.
     * Strip those before parsing. */
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    let parsed: Partial<LlmPolishResult>
    try {
      parsed = JSON.parse(cleaned) as Partial<LlmPolishResult>
    } catch {
      return {
        ok: false,
        message: `Gemini did not return valid JSON. Raw response: ${text.slice(0, 200)}…`,
      }
    }

    return {
      ok: true,
      summary: typeof parsed.summary === 'string' ? parsed.summary : '(no summary returned)',
      suggestedKey:
        typeof parsed.suggestedKey === 'string' && parsed.suggestedKey.length > 0
          ? parsed.suggestedKey
          : null,
      inferredStyle:
        typeof parsed.inferredStyle === 'string' && parsed.inferredStyle.length > 0
          ? parsed.inferredStyle
          : null,
      chordCorrections: Array.isArray(parsed.chordCorrections)
        ? parsed.chordCorrections.filter(
            (c): c is ChordCorrection =>
              !!c &&
              typeof c.segmentIndex === 'number' &&
              typeof c.currentLabel === 'string' &&
              typeof c.suggestedLabel === 'string' &&
              typeof c.rationale === 'string',
          )
        : [],
      missingPCs: Array.isArray(parsed.missingPCs)
        ? parsed.missingPCs.filter((pc): pc is string => typeof pc === 'string')
        : [],
    }
  } catch (err) {
    return {
      ok: false,
      message: `Could not reach /api/gemini/generate. Is the dev server running? Settings → "Google AI Studio (Gemini)" is where the API key lives. (${
        err instanceof Error ? err.message : String(err)
      })`,
    }
  }
}
