/** Shared with the BFF — keep this file browser-safe (no node: imports). */
export const CDL_APP_STORE_URL =
  'https://apps.apple.com/us/app/cdl-test-prep-2027/id6782784591'

export const PENWORK_APP_STORE_URL =
  'https://apps.apple.com/us/app/penwork-studio/id6757620114'

/** http(s) only. Adds https:// when the scheme is missing. */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null
  const t = raw.trim()
  if (!t) return null
  try {
    const withProto = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t) ? t : `https://${t}`
    const u = new URL(withProto)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (u.username || u.password) return null
    return u.toString()
  } catch {
    return null
  }
}
