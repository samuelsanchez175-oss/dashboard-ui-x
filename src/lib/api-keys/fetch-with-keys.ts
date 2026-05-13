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
 * Structured 501 used when a provider has no route configured (no gateway URL,
 * and no built-in BFF route exists yet). The BFF agent should match this shape
 * if/when it wires real Anthropic / OpenAI generation routes.
 */
type NotConfiguredReason = 'no-gateway' | 'no-bff-route'

function notConfiguredResponse(provider: FetchAiProvider, reason: NotConfiguredReason): Response {
  const body = {
    ok: false,
    error: 'provider-not-configured',
    provider,
    reason,
    fix:
      reason === 'no-gateway'
        ? `Set VITE_AI_GATEWAY_URL in .env.local to route ${provider} through Vercel AI Gateway, or add a /api/${provider}/generate route to the dev BFF.`
        : `No BFF route registered for /api/${provider}/generate yet. Add the route or set VITE_AI_GATEWAY_URL.`,
  } as const
  return new Response(JSON.stringify(body), {
    status: 501,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Canonical AI call. Tools should prefer this over
 * `fetchWithKeys('/api/gemini/generate', ...)` so a single switch (the
 * `VITE_AI_GATEWAY_URL` env var) can flip the whole app between the local dev
 * BFF and the Vercel AI Gateway without touching call sites. Migration is
 * gradual — existing `fetchWithKeys` callers keep working.
 *
 * Behavior:
 *  - If `VITE_AI_GATEWAY_URL` is set, POSTs to `${VITE_AI_GATEWAY_URL}/<provider>`
 *    with the same JSON body and forwards every `x-user-key-*` header that
 *    `fetchWithKeys` would attach.
 *  - Otherwise falls back to the existing dev BFF: `gemini` → `/api/gemini/generate`.
 *  - `openai` / `anthropic` without a gateway return a structured 501 response
 *    (see `notConfiguredResponse`) so the BFF agent can wire actual routes later.
 *
 * Prompt caching (Item 9): when `body.cache === true` and `provider === 'anthropic'`,
 * the backend is expected to enable Anthropic prompt caching on the system prompt.
 * The frontend doesn't validate — the server (gateway or future BFF route) decides
 * whether the flag is honored.
 */
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

  // No gateway → fall back to dev BFF, but only where a route exists today.
  if (provider === 'gemini') {
    return fetchWithKeys('/api/gemini/generate', baseInit)
  }

  // openai / anthropic: no built-in BFF generation route yet. Return a
  // structured 501 so callers can branch cleanly until the BFF lands.
  return Promise.resolve(notConfiguredResponse(provider, 'no-gateway'))
}
