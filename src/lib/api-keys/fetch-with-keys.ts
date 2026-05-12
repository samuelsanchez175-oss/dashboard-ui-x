/**
 * Drop-in `fetch` replacement that auto-injects API keys from the Settings
 * store. Every call to `/api/*` carries `x-user-key-<envname>` headers for
 * whatever the user has typed into the dashboard's Settings page.
 *
 * Usage:
 *   const res = await fetchWithKeys('/api/gemini/generate', { method: 'POST', body: … })
 *
 * Non-/api/ URLs (CDN assets, third-party fetches) are passed through
 * untouched — no keys are leaked off-origin.
 */

import { buildApiKeyHeaders } from './api-keys-store'

function isApiRequest(input: RequestInfo | URL): boolean {
  if (typeof input === 'string')        return input.startsWith('/api/')
  if (input instanceof URL)             return input.pathname.startsWith('/api/')
  if (typeof Request !== 'undefined' && input instanceof Request) {
    try { return new URL(input.url, 'http://localhost').pathname.startsWith('/api/') }
    catch { return false }
  }
  return false
}

export function fetchWithKeys(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!isApiRequest(input)) return fetch(input, init)

  const keyHeaders = buildApiKeyHeaders()
  // No-op when nothing is stored: skip the Headers cloning entirely.
  if (!Object.keys(keyHeaders).length) return fetch(input, init)

  const headers = new Headers(init?.headers ?? {})
  for (const [k, v] of Object.entries(keyHeaders)) {
    if (!headers.has(k)) headers.set(k, v)
  }
  return fetch(input, { ...init, headers })
}
