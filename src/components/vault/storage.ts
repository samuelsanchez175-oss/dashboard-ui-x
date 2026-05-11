import type { VaultEntry } from './types'

export const VAULT_STORAGE_KEY = 'ui-dashboard-vault-v1'

export function loadVaultEntries(): VaultEntry[] {
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw) as unknown
    if (!Array.isArray(data)) return []
    return data.filter(isVaultEntry)
  } catch {
    return []
  }
}

export function saveVaultEntries(entries: VaultEntry[]): void {
  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(entries))
}

function isVaultEntry(x: unknown): x is VaultEntry {
  if (x === null || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.envKey === 'string' &&
    typeof o.keyTypeId === 'string' &&
    typeof o.value === 'string' &&
    typeof o.note === 'string'
  )
}

/** Read a single value by env key name (for future in-app wiring). */
export function readVaultValue(envKey: string): string | null {
  const key = envKey.trim()
  if (!key) return null
  const hit = loadVaultEntries().find(e => e.envKey.trim() === key)
  return hit?.value ?? null
}
