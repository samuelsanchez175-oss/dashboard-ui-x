/**
 * Shared manifest for Settings → Documented keys (built-ins + user-added rows).
 * Scratch values use localStorage prefix — never ship values to diagnostics.
 */

export type DocRowScope = 'server' | 'client'

export type DocInputKind = 'secret' | 'text' | 'none'

export type BuiltInDocRow = {
  builtIn: true
  envKey: string
  scope: DocRowScope
  description: string
  inputKind: DocInputKind
}

export type CustomDocRow = {
  builtIn: false
  id: string
  envKey: string
  scope: DocRowScope
  description: string
  inputKind: 'secret' | 'text'
}

export type MergedDocRow = BuiltInDocRow | CustomDocRow

export const DEV_SETTINGS_SCRATCH_PREFIX = 'dev-settings-env-scratch:' as const

export const DEV_SETTINGS_CUSTOM_ROWS_STORAGE_KEY = 'dev-settings-custom-doc-rows' as const

export const MAX_CUSTOM_DOC_ROWS = 48

/** Known keys — extend here when the app gains new first-party env vars. */
export const BUILT_IN_DOCUMENTED_ENV_ROWS: readonly BuiltInDocRow[] = [
  {
    builtIn: true,
    envKey: 'YOUTUBE_API_KEY',
    scope: 'server',
    description: 'YouTube Data API v3 — used by `/api/youtube/search` (see also GOOGLE_API_KEY fallback).',
    inputKind: 'secret',
  },
  {
    builtIn: true,
    envKey: 'GOOGLE_API_KEY',
    scope: 'server',
    description: 'Generic Google key — `GET /api/google/health`; BFF falls back here when YOUTUBE_API_KEY is unset.',
    inputKind: 'secret',
  },
  {
    builtIn: true,
    envKey: 'GEMINI_API_KEY',
    scope: 'server',
    description: 'Google AI (Gemini) — `GET /api/gemini/health`, `POST /api/gemini/generate`, `POST /api/gemini/ping`.',
    inputKind: 'secret',
  },
  {
    builtIn: true,
    envKey: 'RSS_FEED_URLS',
    scope: 'server',
    description: 'Comma-separated feed URLs for `GET /api/rss` (optional `?url=` must match an entry).',
    inputKind: 'text',
  },
  {
    builtIn: true,
    envKey: 'AGENT_FARM_YOUTUBE_CHANNEL_ID',
    scope: 'server',
    description: 'Channel id (UC…) when calling `GET /api/youtube/channel` without `?handle=`.',
    inputKind: 'text',
  },
  {
    builtIn: true,
    envKey: 'OPENAI_API_KEY',
    scope: 'server',
    description: 'OpenAI or compatible key for `GET /api/openai/ping`.',
    inputKind: 'secret',
  },
  {
    builtIn: true,
    envKey: 'OPENAI_BASE_URL',
    scope: 'server',
    description: 'Optional OpenAI-compatible API base (defaults to api.openai.com/v1).',
    inputKind: 'text',
  },
  {
    builtIn: true,
    envKey: 'VITE_*',
    scope: 'client',
    description: 'Only variables prefixed with VITE_ are visible to the browser via import.meta.env.',
    inputKind: 'none',
  },
  {
    builtIn: true,
    envKey: 'VITE_GOOGLE_MAPS_EMBED_API_KEY',
    scope: 'client',
    description:
      'Google Maps Embed API — Tesla trip route iframe (`src/lib/google-maps-trips.ts`). Restrict key by HTTP referrer.',
    inputKind: 'secret',
  },
] as const

const RESERVED_KEYS = new Set(BUILT_IN_DOCUMENTED_ENV_ROWS.map(r => r.envKey))

function newCustomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `env-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Upper snake case: letters, digits, underscores; must start with letter or underscore. */
export function normalizeEnvKeyName(raw: string): string | null {
  const s = raw.trim().toUpperCase().replace(/\s+/g, '_')
  if (!s || s.length > 128) return null
  if (!/^[A-Z_][A-Z0-9_]*$/.test(s)) return null
  return s
}

export function readDevSettingsScratch(envKey: string): string {
  try {
    return localStorage.getItem(DEV_SETTINGS_SCRATCH_PREFIX + envKey) ?? ''
  } catch {
    return ''
  }
}

export function writeDevSettingsScratch(envKey: string, value: string): void {
  try {
    const k = DEV_SETTINGS_SCRATCH_PREFIX + envKey
    if (value.trim()) localStorage.setItem(k, value)
    else localStorage.removeItem(k)
  } catch {
    /* quota / private mode */
  }
}

export function loadCustomDocRows(): CustomDocRow[] {
  try {
    const raw = localStorage.getItem(DEV_SETTINGS_CUSTOM_ROWS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const out: CustomDocRow[] = []
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue
      const o = row as Record<string, unknown>
      if (
        typeof o.id === 'string' &&
        typeof o.envKey === 'string' &&
        (o.scope === 'server' || o.scope === 'client') &&
        typeof o.description === 'string' &&
        (o.inputKind === 'secret' || o.inputKind === 'text')
      ) {
        out.push({
          builtIn: false,
          id: o.id,
          envKey: o.envKey,
          scope: o.scope,
          description: o.description.slice(0, 500),
          inputKind: o.inputKind,
        })
      }
    }
    return out.slice(-MAX_CUSTOM_DOC_ROWS)
  } catch {
    return []
  }
}

export function saveCustomDocRows(rows: CustomDocRow[]): void {
  try {
    const next = rows.slice(-MAX_CUSTOM_DOC_ROWS)
    localStorage.setItem(DEV_SETTINGS_CUSTOM_ROWS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* quota */
  }
}

export function mergeDocumentedEnvRows(custom: CustomDocRow[]): MergedDocRow[] {
  return [...BUILT_IN_DOCUMENTED_ENV_ROWS, ...custom]
}

export function createCustomDocRow(input: {
  envKey: string
  scope: DocRowScope
  description: string
  inputKind: 'secret' | 'text'
}): CustomDocRow | null {
  const envKey = normalizeEnvKeyName(input.envKey)
  if (!envKey || RESERVED_KEYS.has(envKey)) return null
  return {
    builtIn: false,
    id: newCustomId(),
    envKey,
    scope: input.scope,
    description: input.description.trim().slice(0, 500) || 'User-defined variable.',
    inputKind: input.inputKind,
  }
}

/** Keys that already exist (built-in or custom). */
export function existingEnvKeyNames(custom: CustomDocRow[]): Set<string> {
  const s = new Set<string>(RESERVED_KEYS)
  for (const c of custom) s.add(c.envKey)
  return s
}

export type DevSettingsScratchSummary = {
  builtInRows: number
  customRows: number
  totalDocRows: number
  scratchFilledKeys: string[]
}

/** For Diagnostics — names only, never values. */
export function summarizeDevSettingsScratch(): DevSettingsScratchSummary {
  const custom = loadCustomDocRows()
  const merged = mergeDocumentedEnvRows(custom)
  const scratchFilledKeys: string[] = []
  for (const row of merged) {
    if (row.inputKind === 'none') continue
    const v = readDevSettingsScratch(row.envKey).trim()
    if (v) scratchFilledKeys.push(row.envKey)
  }
  scratchFilledKeys.sort()
  return {
    builtInRows: BUILT_IN_DOCUMENTED_ENV_ROWS.length,
    customRows: custom.length,
    totalDocRows: merged.length,
    scratchFilledKeys,
  }
}

export function buildEnvSnippetFromScratch(
  rows: MergedDocRow[],
  scratch: Record<string, string>,
): string {
  const lines: string[] = []
  for (const row of rows) {
    if (row.inputKind === 'none') continue
    const v = scratch[row.envKey]?.trim()
    if (v) lines.push(`${row.envKey}=${v}`)
  }
  return lines.join('\n')
}
