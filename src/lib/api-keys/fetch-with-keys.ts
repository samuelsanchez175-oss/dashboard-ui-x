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

/* ── AI provider wrapper (Items 5 + 9) ──────────────────────────────────── */

export type FetchAiProvider = 'gemini' | 'openai' | 'anthropic'

export type FetchAiBody = {
  /** User-facing prompt text. */
  prompt: string
  /** Optional system instruction. */
  system?: string
  /**
   * Hint to the backend that prompt caching should be enabled (currently
   * meaningful for Anthropic — backend toggles `cache_control` on the system
   * prompt). Frontend does not validate; the server is the source of truth.
   */
  cache?: boolean
}

/** Read the optional Vercel AI Gateway URL (Vite-inlined; trimmed). */
function aiGatewayUrl(): string {
  // `import.meta.env` is Vite-native; cast to satisfy strict TS without adding deps.
  const raw = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_AI_GATEWAY_URL
  return typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : ''
}

/**
 * Canonical AI call. Tools should prefer this over
 * `fetchWithKeys('/api/<provider>/generate', ...)` so a single switch (the
 * `VITE_AI_GATEWAY_URL` env var) can flip the whole app between the local dev
 * BFF and the Vercel AI Gateway without touching call sites.
 *
 * Behavior:
 *  - If `VITE_AI_GATEWAY_URL` is set, POSTs to `${VITE_AI_GATEWAY_URL}/<provider>`
 *    with the same JSON body and forwards every `x-user-key-*` header that
 *    `fetchWithKeys` would attach.
 *  - Otherwise posts to the local dev BFF generate route for the provider:
 *      gemini    → POST /api/gemini/generate
 *      openai    → POST /api/openai/generate
 *      anthropic → POST /api/anthropic/generate
 *    Each forwards the user's `x-user-key-*` header (Settings) which the BFF
 *    prefers over the matching `.env.local` value.
 *
 * Prompt caching: when `body.cache === true` and `provider === 'anthropic'`,
 * the backend enables Anthropic prompt caching on the system prompt. The
 * frontend doesn't validate — the server decides whether the flag is honored.
 */
const PROVIDER_ROUTES: Record<FetchAiProvider, string> = {
  gemini:    '/api/gemini/generate',
  openai:    '/api/openai/generate',
  anthropic: '/api/anthropic/generate',
}

export function fetchAi(provider: FetchAiProvider, body: FetchAiBody): Promise<Response> {
  const json = JSON.stringify(body)
  const baseInit: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: json,
  }

  const gateway = aiGatewayUrl()
  if (gateway) {
    // Gateway path: same body, same key-forwarding pattern as fetchWithKeys.
    // We can't reuse fetchWithKeys directly because the URL is absolute (off-origin),
    // and fetchWithKeys deliberately skips header injection for non-/api/ requests
    // to avoid leaking keys. The gateway is trusted by configuration, so we
    // attach the headers explicitly here.
    const keyHeaders = buildApiKeyHeaders()
    const headers = new Headers(baseInit.headers)
    for (const [k, v] of Object.entries(keyHeaders)) {
      if (!headers.has(k)) headers.set(k, v)
    }
    return fetch(`${gateway}/${provider}`, { ...baseInit, headers })
  }

  // No gateway → local dev BFF. fetchWithKeys attaches the x-user-key-* headers.
  return fetchWithKeys(PROVIDER_ROUTES[provider], baseInit)
}
