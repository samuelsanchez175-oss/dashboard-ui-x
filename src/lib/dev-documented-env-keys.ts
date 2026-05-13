/**
 * Shared manifest for Settings → Documented keys (built-ins + user-added rows).
 * Scratch values use localStorage prefix — never ship values to diagnostics.
 *
 * Built-in rows are derived from `dev-settings-env-model.ts` (single data model)
 * plus the informational `VITE_*` placeholder row.
 */

import { DEV_SETTINGS_ENV_MODEL } from './dev-settings-env-model'

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
  /** Rows created as a Client ID + Client Secret pair share this id */
  oauthPairId?: string
  oauthPairPart?: 'client_id' | 'client_secret'
  /** Shown above the paired rows in Settings / Diagnostics */
  oauthPairLabel?: string
}

export type MergedDocRow = BuiltInDocRow | CustomDocRow

export const DEV_SETTINGS_SCRATCH_PREFIX = 'dev-settings-env-scratch:' as const

export const DEV_SETTINGS_CUSTOM_ROWS_STORAGE_KEY = 'dev-settings-custom-doc-rows' as const

export const MAX_CUSTOM_DOC_ROWS = 48

/** Known keys — built-ins come from `DEV_SETTINGS_ENV_MODEL` + `VITE_*` info row. */
export const BUILT_IN_DOCUMENTED_ENV_ROWS: readonly BuiltInDocRow[] = [
  ...DEV_SETTINGS_ENV_MODEL.map(
    (r): BuiltInDocRow => ({
      builtIn: true,
      envKey: r.storageKey,
      scope: r.scope,
      description: r.oneLinePurpose,
      inputKind: r.inputKind,
    }),
  ),
  // ── AI plumbing (Item 5 / Item 9): opt-in gateway + optional Anthropic key ──
  // VITE_AI_GATEWAY_URL is Vite-inlined at build time; surfacing it here lets the
  // Settings UI advertise the key, but the actual value must live in `.env.local`
  // (a restart is required for Vite to pick it up). When unset, `fetchAi()` falls
  // back to the existing BFF routes (no behavior change).
  {
    builtIn: true,
    envKey: 'VITE_AI_GATEWAY_URL',
    scope: 'client',
    description: 'Optional Vercel AI Gateway base URL. When set, fetchAi() routes provider calls to ${url}/<provider>; otherwise the existing BFF routes are used.',
    inputKind: 'text',
  },
  {
    builtIn: true,
    envKey: 'ANTHROPIC_API_KEY',
    scope: 'server',
    description: 'Optional Anthropic API key. Forwarded as x-user-key-anthropic-api-key by fetchAi() so a future BFF / gateway can pick it up. Not consumed by any built-in route yet.',
    inputKind: 'secret',
  },
  {
    builtIn: true,
    envKey: 'VITE_*',
    scope: 'client',
    description: 'Only names prefixed with VITE_ are exposed to the browser via import.meta.env (see Client section above).',
    inputKind: 'none',
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
        const pairPart = o.oauthPairPart
        if (pairPart != null && pairPart !== 'client_id' && pairPart !== 'client_secret') continue
        out.push({
          builtIn: false,
          id: o.id,
          envKey: o.envKey,
          scope: o.scope,
          description: o.description.slice(0, 500),
          inputKind: o.inputKind,
          oauthPairId: typeof o.oauthPairId === 'string' ? o.oauthPairId : undefined,
          oauthPairPart: pairPart === 'client_id' || pairPart === 'client_secret' ? pairPart : undefined,
          oauthPairLabel: typeof o.oauthPairLabel === 'string' ? o.oauthPairLabel.slice(0, 120) : undefined,
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
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dev-custom-doc-rows-changed'))
    }
  } catch {
    /* quota */
  }
}

export function mergeDocumentedEnvRows(custom: CustomDocRow[]): MergedDocRow[] {
  return [...BUILT_IN_DOCUMENTED_ENV_ROWS, ...custom]
}

export type DisplayDocGroup =
  | { kind: 'single'; row: MergedDocRow }
  | { kind: 'oauth'; pairId: string; label: string; clientId: CustomDocRow; clientSecret: CustomDocRow }

/** Groups OAuth client_id + client_secret pairs for table display (built-ins stay single rows). */
export function buildDisplayDocGroups(merged: MergedDocRow[]): DisplayDocGroup[] {
  const customs = merged.filter((r): r is CustomDocRow => !r.builtIn)
  const byPair = new Map<string, CustomDocRow[]>()
  for (const c of customs) {
    if (c.oauthPairId) {
      const arr = byPair.get(c.oauthPairId) ?? []
      arr.push(c)
      byPair.set(c.oauthPairId, arr)
    }
  }
  const emittedPair = new Set<string>()
  const out: DisplayDocGroup[] = []

  for (const row of merged) {
    if (row.builtIn) {
      out.push({ kind: 'single', row })
      continue
    }
    const c = row
    if (!c.oauthPairId) {
      out.push({ kind: 'single', row: c })
      continue
    }
    if (emittedPair.has(c.oauthPairId)) continue
    const g = byPair.get(c.oauthPairId) ?? []
    const cid = g.find(x => x.oauthPairPart === 'client_id')
    const csec = g.find(x => x.oauthPairPart === 'client_secret')
    if (cid && csec && g.length === 2) {
      emittedPair.add(c.oauthPairId)
      const label = cid.oauthPairLabel ?? csec.oauthPairLabel ?? 'OAuth client'
      out.push({ kind: 'oauth', pairId: c.oauthPairId, label, clientId: cid, clientSecret: csec })
    } else {
      emittedPair.add(c.oauthPairId)
      for (const x of g) out.push({ kind: 'single', row: x })
    }
  }
  return out
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

/**
 * Normalizes a short API name for env prefixes, e.g. "Tesla Fleet" → "TESLA_FLEET".
 * Result is used as `{PREFIX}_CLIENT_ID` and `{PREFIX}_CLIENT_SECRET`.
 */
export function normalizeApiPrefixForOAuth(raw: string): string | null {
  const s = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
  if (!s || s.length > 56) return null
  if (!/^[A-Z][A-Z0-9_]*$/.test(s)) return null
  const idKey = `${s}_CLIENT_ID`
  const secKey = `${s}_CLIENT_SECRET`
  if (!normalizeEnvKeyName(idKey) || !normalizeEnvKeyName(secKey)) return null
  if (RESERVED_KEYS.has(idKey) || RESERVED_KEYS.has(secKey)) return null
  return s
}

/** Two documented rows: `{prefix}_CLIENT_ID` (text) and `{prefix}_CLIENT_SECRET` (secret). */
export function createOAuthClientPairRows(input: {
  prefix: string
  scope: DocRowScope
  /** Shown in UI grouping; falls back to prefix */
  pairLabel: string
  /** Optional longer notes; row descriptions reference exact env key names */
  notes?: string
  /** Built-in + existing custom env key names */
  takenKeys: Set<string>
}): CustomDocRow[] | null {
  const prefix = normalizeApiPrefixForOAuth(input.prefix)
  if (!prefix) return null
  const idKey = `${prefix}_CLIENT_ID`
  const secKey = `${prefix}_CLIENT_SECRET`
  if (RESERVED_KEYS.has(idKey) || RESERVED_KEYS.has(secKey)) return null
  if (input.takenKeys.has(idKey) || input.takenKeys.has(secKey)) return null
  const pairId = newCustomId()
  const label = input.pairLabel.trim().slice(0, 120) || prefix
  const note = input.notes?.trim().slice(0, 400)
  const baseDesc = note ? `${note} ` : ''
  return [
    {
      builtIn: false,
      id: newCustomId(),
      envKey: idKey,
      scope: input.scope,
      description:
        `${baseDesc}OAuth client identifier — the variable name must be exactly \`${idKey}\` for headers and server code to match.`.trim(),
      inputKind: 'text',
      oauthPairId: pairId,
      oauthPairPart: 'client_id',
      oauthPairLabel: label,
    },
    {
      builtIn: false,
      id: newCustomId(),
      envKey: secKey,
      scope: input.scope,
      description:
        `${baseDesc}OAuth client secret — the variable name must be exactly \`${secKey}\`; never commit real values to git.`.trim(),
      inputKind: 'secret',
      oauthPairId: pairId,
      oauthPairPart: 'client_secret',
      oauthPairLabel: label,
    },
  ]
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
