/**
 * Probe error → actionable guidance.
 *
 * The dev BFF "Test" probes return raw error strings from the upstream API
 * (Google, OpenAI, Tesla, …). Those messages are technical and don't tell
 * the user *what to do next*. This helper takes the raw error string and
 * the env-key it came from, and returns a small structured hint:
 *
 *   { headline, body, links: [{ label, href }] }
 *
 * Each link is a deep link straight to the page where the user can fix the
 * problem (enable the API, add a key restriction, top up billing, etc.).
 *
 * No JSX, no React — pure data so it can be used from any renderer.
 */

export type ProbeFixLink = { label: string; href: string }
export type ProbeGuidance = { headline: string; body: string; links: ProbeFixLink[] }

/* ── Canonical landing pages per provider ──────────────────────────────── */

const LINK_GOOGLE_CREDENTIALS: ProbeFixLink = {
  label: 'Google Cloud — API key restrictions',
  href: 'https://console.cloud.google.com/apis/credentials',
}
const LINK_GEMINI_KEYS: ProbeFixLink = {
  label: 'Google AI Studio — Gemini API keys',
  href: 'https://aistudio.google.com/api-keys',
}
const LINK_OPENAI_KEYS: ProbeFixLink = {
  label: 'OpenAI — API keys',
  href: 'https://platform.openai.com/api-keys',
}
const LINK_ANTHROPIC_KEYS: ProbeFixLink = {
  label: 'Anthropic — API keys',
  href: 'https://console.anthropic.com/settings/keys',
}
const LINK_TESLA_DEV: ProbeFixLink = {
  label: 'Tesla — developer dashboard',
  href: 'https://developer.tesla.com/dashboard',
}

/** Deep links that enable a specific Google API on a Cloud project. */
const ENABLE_GEMINI: ProbeFixLink = {
  label: 'Enable Generative Language API',
  href: 'https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com',
}
const ENABLE_MAPS_EMBED: ProbeFixLink = {
  label: 'Enable Maps Embed API',
  href: 'https://console.cloud.google.com/apis/library/maps-embed-backend.googleapis.com',
}
const ENABLE_YOUTUBE: ProbeFixLink = {
  label: 'Enable YouTube Data API v3',
  href: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
}

/* ── Per-storage-key default fix links ─────────────────────────────────── */

const KEY_LANDING: Record<string, ProbeFixLink[]> = {
  GEMINI_API_KEY: [LINK_GEMINI_KEYS, ENABLE_GEMINI],
  HARMONY_CLIENT_PROJECTS_AI_KEY: [LINK_GEMINI_KEYS, ENABLE_GEMINI],
  GOOGLE_API_KEY: [LINK_GOOGLE_CREDENTIALS],
  GOOGLE_MAPS_API_KEY: [LINK_GOOGLE_CREDENTIALS, ENABLE_MAPS_EMBED],
  YOUTUBE_API_KEY: [LINK_GOOGLE_CREDENTIALS, ENABLE_YOUTUBE],
  OPENAI_API_KEY: [LINK_OPENAI_KEYS],
  ANTHROPIC_API_KEY: [LINK_ANTHROPIC_KEYS],
  TESLA_CLIENT_ID: [LINK_TESLA_DEV],
  TESLA_CLIENT_SECRET: [LINK_TESLA_DEV],
  TESLA_REFRESH_TOKEN: [LINK_TESLA_DEV],
}

/* ── Pattern detection ─────────────────────────────────────────────────── */

type DetectedKind =
  | 'api-blocked'
  | 'api-not-enabled'
  | 'key-invalid'
  | 'referrer-restricted'
  | 'quota-exceeded'
  | 'billing-disabled'
  | 'unauthorized'
  | 'forbidden'
  | 'rate-limit'
  | 'not-found'
  | 'unknown'

function classify(message: string): DetectedKind {
  const m = message.toLowerCase()
  if (/requests to this api .* are blocked|api .* is blocked/.test(m)) return 'api-blocked'
  if (/has not been used in project|api .* (?:is|has been) disabled|enable it before using/.test(m)) return 'api-not-enabled'
  if (/api key not valid|invalid api key|invalid_argument:.*api key|api_key_invalid/.test(m)) return 'key-invalid'
  if (/http referer|referer restriction|referrer/.test(m)) return 'referrer-restricted'
  if (/quota .*(exceeded|exhausted)/.test(m)) return 'quota-exceeded'
  if (/billing/.test(m)) return 'billing-disabled'
  if (/^401\b|unauthorized|missing.*authorization|invalid.*token|expired/.test(m)) return 'unauthorized'
  if (/^403\b|forbidden|permission_denied/.test(m)) return 'forbidden'
  if (/^429\b|rate.?limit|too many requests/.test(m)) return 'rate-limit'
  if (/^404\b|not found|method not allowed/.test(m)) return 'not-found'
  return 'unknown'
}

/** Pull a possibly-mentioned Google API name out of the message ("generativelanguage.googleapis.com"). */
function extractGoogleApiHost(message: string): string | null {
  const m = message.match(/([a-z0-9-]+\.googleapis\.com)/i)
  return m ? m[1]!.toLowerCase() : null
}

function googleApiSpecificEnableLink(host: string | null): ProbeFixLink | null {
  if (!host) return null
  if (host.includes('generativelanguage')) return ENABLE_GEMINI
  if (host.includes('maps')) return ENABLE_MAPS_EMBED
  if (host.includes('youtube')) return ENABLE_YOUTUBE
  // Generic Cloud library search for any other Google API.
  return {
    label: `Enable ${host} in Cloud Console`,
    href: `https://console.cloud.google.com/apis/library/${encodeURIComponent(host)}`,
  }
}

/* ── Main entrypoint ───────────────────────────────────────────────────── */

export function explainProbeError(message: string, storageKey: string): ProbeGuidance | null {
  if (!message) return null
  const kind = classify(message)
  const baseLinks = KEY_LANDING[storageKey] ?? []
  const googleHost = extractGoogleApiHost(message)
  const apiEnableLink = googleApiSpecificEnableLink(googleHost)

  switch (kind) {
    case 'api-blocked':
      return {
        headline: googleHost
          ? `${googleHost} is blocked on this key`
          : 'API blocked on this key',
        body:
          'Your Google API key has "API restrictions" set and this specific API isn\'t in the allowed list. Open Cloud Console → Credentials → this key → API restrictions → either set to "Don\'t restrict key" or check the API in the list, then Save.',
        links: dedupeLinks([
          LINK_GOOGLE_CREDENTIALS,
          apiEnableLink,
          ...baseLinks,
        ]),
      }

    case 'api-not-enabled':
      return {
        headline: googleHost ? `${googleHost} is not enabled on this project` : 'API not enabled',
        body:
          'The API needs to be enabled on the Google Cloud project this key belongs to. Click "Enable API" below, pick the same project as the key, then click Enable. Wait ~30 seconds for propagation and re-test.',
        links: dedupeLinks([apiEnableLink, LINK_GOOGLE_CREDENTIALS, ...baseLinks]),
      }

    case 'key-invalid':
      return {
        headline: 'API key not recognized',
        body:
          'The provider says this key string is malformed or revoked. Confirm you copied the whole key (no trailing spaces), or generate a fresh one.',
        links: dedupeLinks(baseLinks),
      }

    case 'referrer-restricted':
      return {
        headline: 'HTTP referrer restriction blocks this origin',
        body:
          'Your key only allows specific HTTP referrers (websites). Either add the current origin to the allowed referrers list, or relax the restriction for development.',
        links: dedupeLinks([LINK_GOOGLE_CREDENTIALS, ...baseLinks]),
      }

    case 'quota-exceeded':
      return {
        headline: 'Quota exceeded',
        body:
          'You have hit the daily or per-minute quota. Wait until the quota resets, or request a higher quota in the provider console.',
        links: dedupeLinks(baseLinks),
      }

    case 'billing-disabled':
      return {
        headline: 'Billing not enabled',
        body:
          'This API requires a billing account attached to the project. Open the provider console and enable billing on the project the key belongs to.',
        links: dedupeLinks([LINK_GOOGLE_CREDENTIALS, ...baseLinks]),
      }

    case 'unauthorized':
      return {
        headline: 'Unauthorized — auth header rejected',
        body:
          'The provider received the request but rejected the auth header. Confirm the key/refresh token is current; OAuth refresh tokens can expire after revocation or password resets.',
        links: dedupeLinks(baseLinks),
      }

    case 'forbidden':
      return {
        headline: 'Forbidden — key lacks permission for this call',
        body:
          'The key authenticated, but the caller (project, account, or scope) is not permitted to make this specific call. Confirm scopes/roles in the provider console.',
        links: dedupeLinks([LINK_GOOGLE_CREDENTIALS, ...baseLinks]),
      }

    case 'rate-limit':
      return {
        headline: 'Rate limited',
        body:
          'Too many requests in a short window. Back off for a minute then retry. If this happens often, request a higher per-minute quota.',
        links: dedupeLinks(baseLinks),
      }

    case 'not-found':
      return {
        headline: 'Endpoint not found',
        body:
          'The provider returned 404. Often a stale API version or wrong base URL; less commonly the resource ID is wrong. Try the provider docs link for the current endpoint.',
        links: dedupeLinks(baseLinks),
      }

    default:
      // Unknown — still surface the provider landing page if we know one.
      if (baseLinks.length === 0) return null
      return {
        headline: 'Provider returned an error',
        body:
          'The provider responded with an error the dashboard doesn\'t recognize. Open the provider console to inspect the key state, restrictions, and usage.',
        links: dedupeLinks(baseLinks),
      }
  }
}

function dedupeLinks(links: (ProbeFixLink | null | undefined)[]): ProbeFixLink[] {
  const seen = new Set<string>()
  const out: ProbeFixLink[] = []
  for (const l of links) {
    if (!l) continue
    if (seen.has(l.href)) continue
    seen.add(l.href)
    out.push(l)
  }
  return out
}
