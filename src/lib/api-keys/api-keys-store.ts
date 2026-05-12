/**
 * Centralized API-key bridge for the dashboard.
 *
 * The Settings page (DevSettings) is the single source of truth for keys the
 * user types into the dashboard. Those values are persisted in localStorage
 * using the existing `dev-documented-env-keys` prefix; this module exposes a
 * typed API for *consumers* of those keys (the fetch wrapper, the UI, etc).
 *
 * Architecture:
 *   • The user types YOUTUBE_API_KEY into Settings → stored in localStorage.
 *   • Any client `fetch('/api/...')` is wrapped by `fetchWithKeys()` which
 *     reads every stored key and sends it as `x-user-key-<envname>` headers.
 *   • The dev BFF prefers those headers over `process.env` so the user's
 *     pasted key is what actually gets used to call Google / Gemini / etc.
 *   • Storage stays where it already is — `dev-settings-env-scratch:<NAME>`.
 *     No competing schema; this module is a thin typed shell.
 */

import {
  DEV_SETTINGS_SCRATCH_PREFIX,
  loadCustomDocRows,
  mergeDocumentedEnvRows,
  readDevSettingsScratch,
  writeDevSettingsScratch,
  type MergedDocRow,
} from '../dev-documented-env-keys'

/* ── Storage event channel ───────────────────────────────────────────────── */

const CHANGE_EVENT = 'dashboard:api-keys-changed' as const

/** Build the header name a BFF should look for: `x-user-key-youtube-api-key`. */
export function headerNameForEnvKey(envKey: string): string {
  return `x-user-key-${envKey.toLowerCase().replace(/_/g, '-')}`
}

/* ── Read API ────────────────────────────────────────────────────────────── */

/** Read a single stored key (returns '' when unset). */
export function getApiKey(envKey: string): string {
  return readDevSettingsScratch(envKey)
}

/** True if the user has typed a non-empty value for this key. */
export function hasApiKey(envKey: string): boolean {
  return readDevSettingsScratch(envKey).trim().length > 0
}

/** Snapshot every stored key — `{ ENV_KEY: 'value' }`. Used by fetch wrapper. */
export function getAllStoredApiKeys(): Record<string, string> {
  const out: Record<string, string> = {}
  // Built-in + custom rows tell us which names are *managed* by Settings.
  // The localStorage prefix also picks up any orphan keys (e.g. removed rows
  // with leftover values) so the user is never surprised by stale data.
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith(DEV_SETTINGS_SCRATCH_PREFIX)) continue
      const envKey = k.slice(DEV_SETTINGS_SCRATCH_PREFIX.length)
      const v = localStorage.getItem(k) ?? ''
      if (v.trim()) out[envKey] = v.trim()
    }
  } catch {
    /* localStorage unavailable */
  }
  return out
}

/**
 * Build the request headers a `fetch('/api/...')` should attach.
 * Returns `{}` when nothing is stored — caller can spread safely.
 */
export function buildApiKeyHeaders(): Record<string, string> {
  const stored = getAllStoredApiKeys()
  const headers: Record<string, string> = {}
  for (const [envKey, value] of Object.entries(stored)) {
    headers[headerNameForEnvKey(envKey)] = value
  }
  return headers
}

/* ── Write API ───────────────────────────────────────────────────────────── */

/** Persist a key. Pass '' to clear. Notifies subscribers. */
export function setApiKey(envKey: string, value: string): void {
  writeDevSettingsScratch(envKey, value)
  emitChange()
}

/** Clear a single key. */
export function clearApiKey(envKey: string): void {
  writeDevSettingsScratch(envKey, '')
  emitChange()
}

/* ── Pub/sub ─────────────────────────────────────────────────────────────── */

function emitChange(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

/**
 * React to any key change in this tab (DevSettings edits, programmatic
 * `setApiKey` calls, etc). Returns an unsubscribe function.
 */
export function subscribeApiKeys(cb: (snapshot: Record<string, string>) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onChange = () => cb(getAllStoredApiKeys())
  // Cross-tab: storage event fires for other tabs' writes too.
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key.startsWith(DEV_SETTINGS_SCRATCH_PREFIX)) onChange()
  }
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  // Fire once on subscribe so callers can sync immediately.
  cb(getAllStoredApiKeys())
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

/* ── Manifest helper ─────────────────────────────────────────────────────── */

/** Documented manifest (built-in + custom rows) for UI rendering. */
export function getDocumentedRows(): MergedDocRow[] {
  return mergeDocumentedEnvRows(loadCustomDocRows())
}
