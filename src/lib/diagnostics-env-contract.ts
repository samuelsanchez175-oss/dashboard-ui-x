/**
 * Single source of truth for diagnostics env probes (names, labels, optional vs warn-on-missing).
 * Never export secret values — only presence classification for UI / BFF JSON.
 */

export type EnvPresence = 'missing' | 'placeholder' | 'present'

export type EnvMissingSeverity = 'ok' | 'warn' | 'critical'

export type ServerEnvDiagEntry = {
  envKey: string
  label: string
  /** When the effective value is empty. */
  missingSeverity: EnvMissingSeverity
  /** When value looks like a dummy / unfinished secret. */
  placeholderSeverity: EnvMissingSeverity
}

export type ClientViteDiagEntry = {
  envKey: string
  label: string
  missingSeverity: EnvMissingSeverity
  placeholderSeverity: EnvMissingSeverity
}

const PLACEHOLDER_SNIPPETS = /placeholder|changeme|your[_-]?api|your[_-]?key|xxx{3,}|^x+$/i

/** Classify a trimmed env value for diagnostics (no logging of raw secrets). */
export function classifyEnvPresence(raw: string | undefined | null): EnvPresence {
  const s = (raw ?? '').trim()
  if (!s) return 'missing'
  const lower = s.toLowerCase()
  if (lower === '""' || lower === "''") return 'missing'
  if (s.length <= 4 && PLACEHOLDER_SNIPPETS.test(s)) return 'placeholder'
  if (s.length <= 12 && PLACEHOLDER_SNIPPETS.test(s)) return 'placeholder'
  if (/^<.*>$/.test(s)) return 'placeholder'
  return 'present'
}

export function severityFromPresence(
  p: EnvPresence,
  missingSeverity: EnvMissingSeverity,
  placeholderSeverity: EnvMissingSeverity,
): 'ok' | 'warn' | 'critical' {
  if (p === 'present') return 'ok'
  if (p === 'placeholder') {
    return placeholderSeverity === 'critical' ? 'critical' : placeholderSeverity === 'warn' ? 'warn' : 'ok'
  }
  return missingSeverity === 'critical' ? 'critical' : missingSeverity === 'warn' ? 'warn' : 'ok'
}

export function detailFromPresence(p: EnvPresence, envKey: string): string {
  if (p === 'present') return `${envKey} has a non-empty value (not evaluated as a placeholder).`
  if (p === 'placeholder') return `${envKey} is set but looks like a placeholder or dummy value — replace with a real credential or clear it.`
  return `${envKey} is not set (empty after trim).`
}

export function fixHintFromPresence(p: EnvPresence, scope: 'server' | 'client'): string | undefined {
  if (p === 'present') return undefined
  if (scope === 'server') {
    return p === 'missing'
      ? 'Add the variable to `.env` or `.env.local`, or enter it under Settings & API keys (sent as `x-user-key-*` headers to the dev BFF only).'
      : 'Remove placeholder text or paste a real key from the provider console.'
  }
  return p === 'missing'
    ? 'Add the variable to `.env.local` with the `VITE_` prefix and restart `npm run dev` so Vite inlines it into the client bundle.'
    : 'Replace placeholder text with a real value or remove the key from env.'
}

/** Allowlisted server keys — BFF GET `/api/diagnostics/env-keys` returns only these names. */
export const SERVER_DIAGNOSTIC_ENV_ENTRIES: readonly ServerEnvDiagEntry[] = [
  {
    envKey: 'YOUTUBE_API_KEY',
    label: 'YouTube (dedicated key)',
    missingSeverity: 'ok',
    placeholderSeverity: 'warn',
  },
  {
    envKey: 'GOOGLE_API_KEY',
    label: 'Google Cloud / generic API key',
    missingSeverity: 'ok',
    placeholderSeverity: 'warn',
  },
  {
    envKey: 'GEMINI_API_KEY',
    label: 'Gemini (Google AI Studio)',
    missingSeverity: 'warn',
    placeholderSeverity: 'warn',
  },
  {
    envKey: 'HARMONY_CLIENT_PROJECTS_AI_KEY',
    label: 'Harmony Client Projects (Gemini override)',
    missingSeverity: 'ok',
    placeholderSeverity: 'warn',
  },
  {
    envKey: 'RSS_FEED_URLS',
    label: 'RSS feed URLs',
    missingSeverity: 'ok',
    placeholderSeverity: 'warn',
  },
  {
    envKey: 'AGENT_FARM_YOUTUBE_CHANNEL_ID',
    label: 'Default YouTube channel id',
    missingSeverity: 'ok',
    placeholderSeverity: 'warn',
  },
  {
    envKey: 'OPENAI_API_KEY',
    label: 'OpenAI (or compatible) API key',
    missingSeverity: 'ok',
    placeholderSeverity: 'warn',
  },
  {
    envKey: 'OPENAI_BASE_URL',
    label: 'OpenAI-compatible base URL',
    missingSeverity: 'ok',
    placeholderSeverity: 'warn',
  },
  {
    envKey: 'TESLA_CLIENT_ID',
    label: 'Tesla Fleet OAuth client ID',
    missingSeverity: 'ok',
    placeholderSeverity: 'warn',
  },
  {
    envKey: 'TESLA_CLIENT_SECRET',
    label: 'Tesla Fleet OAuth client secret',
    missingSeverity: 'ok',
    placeholderSeverity: 'warn',
  },
  {
    envKey: 'FFMPEG_PATH',
    label: 'FFmpeg binary path (mixing / audio)',
    missingSeverity: 'ok',
    placeholderSeverity: 'warn',
  },
  {
    envKey: 'YT_DLP_PATH',
    label: 'yt-dlp binary path (mixing / audio)',
    missingSeverity: 'ok',
    placeholderSeverity: 'warn',
  },
] as const

/** Client-only Vite-inlined keys referenced in source (import.meta.env). */
export const CLIENT_VITE_DIAG_ENTRIES: readonly ClientViteDiagEntry[] = [
  {
    envKey: 'VITE_GOOGLE_MAPS_EMBED_API_KEY',
    label: 'Google Maps Embed (Tesla trips)',
    missingSeverity: 'ok',
    placeholderSeverity: 'warn',
  },
  {
    envKey: 'VITE_STEM_SERVICE_URL',
    label: 'Stem splitter service URL',
    missingSeverity: 'ok',
    placeholderSeverity: 'warn',
  },
  {
    envKey: 'VITE_LOCAL_LLM_BASE_URL',
    label: 'Local LLM base URL (Ollama, etc.)',
    missingSeverity: 'ok',
    placeholderSeverity: 'warn',
  },
  {
    envKey: 'VITE_LOCAL_LLM_MODEL',
    label: 'Local LLM model id',
    missingSeverity: 'ok',
    placeholderSeverity: 'warn',
  },
  {
    envKey: 'VITE_RAG_MANIFEST_URL',
    label: 'RAG manifest URL (local LLM)',
    missingSeverity: 'ok',
    placeholderSeverity: 'warn',
  },
] as const
