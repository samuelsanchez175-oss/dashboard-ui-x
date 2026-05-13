/**
 * Tesla Fleet OAuth scratch keys (`TESLA_CLIENT_ID` / `TESLA_CLIENT_SECRET`)
 * — validation for "live" credentials vs demo placeholders.
 */

export const TESLA_CLIENT_ID_KEY = 'TESLA_CLIENT_ID' as const
export const TESLA_CLIENT_SECRET_KEY = 'TESLA_CLIENT_SECRET' as const

/** Persisted flag: mock was turned off due to live Tesla keys; cleared when keys no longer qualify or mock is restored. */
export const TESLA_LIVE_CREDENTIAL_SYNC_STORAGE_KEY = 'ui-dashboard-x-tesla-live-keys-sync-v1' as const

/** Doc / scaffold UUIDs — never treated as live Fleet client ids. */
export const TESLA_DEMO_CLIENT_IDS: readonly string[] = [
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  'deadbeef-dead-beef-dead-beefdeadbeef',
]

const DEMO_CLIENT_ID_SET = new Set(TESLA_DEMO_CLIENT_IDS.map(s => s.toLowerCase()))

/** Tutorial-style secrets — stripped from scratch when transitioning to live (exact match, case-insensitive). */
const DEMO_CLIENT_SECRETS = new Set(
  ['demo', 'test', 'changeme', 'placeholder', 'secret', 'password', 'your-client-secret', 'client_secret_here'].map(s =>
    s.toLowerCase(),
  ),
)

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const WEAK_SECRET_PREFIX = /^(demo|test|changeme|placeholder|password|secret)\b/i

/**
 * True when both fields look like real Tesla third-party OAuth credentials
 * (UUID client id + non-trivial secret), excluding known demo UUIDs.
 */
export function isTeslaFleetLiveCredentialPair(clientId: string, clientSecret: string): boolean {
  const id = clientId.trim()
  const secret = clientSecret.trim()
  if (!id || !secret) return false
  if (DEMO_CLIENT_ID_SET.has(id.toLowerCase())) return false
  if (!UUID_LIKE.test(id)) return false
  if (secret.length < 12) return false
  if (DEMO_CLIENT_SECRETS.has(secret.toLowerCase())) return false
  if (WEAK_SECRET_PREFIX.test(secret)) return false
  return true
}

/**
 * Clears only known demo seed values from scratch storage when entering live mode.
 * Non-matching values (real secrets) are never modified.
 */
export function stripTeslaFleetDemoSeedsIfPresent(
  clientId: string,
  clientSecret: string,
  setKey: (envKey: string, value: string) => void,
): void {
  const id = clientId.trim()
  const sec = clientSecret.trim()
  if (DEMO_CLIENT_ID_SET.has(id.toLowerCase())) setKey(TESLA_CLIENT_ID_KEY, '')
  if (DEMO_CLIENT_SECRETS.has(sec.toLowerCase())) setKey(TESLA_CLIENT_SECRET_KEY, '')
}
