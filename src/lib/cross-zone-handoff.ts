/**
 * Cross-zone handoff bus.
 *
 * A tiny typed publish/subscribe channel for passing structured payloads
 * between dashboard zones without coupling them. Two delivery modes:
 *
 *   • live  — `window` CustomEvent fires immediately for any subscriber that
 *             happens to be mounted right now.
 *   • last  — the most recent payload per `kind` is mirrored into
 *             `sessionStorage` so a zone that mounts *after* the publish can
 *             still consume it on mount.
 *
 * `sessionStorage` (not `localStorage`) keeps the handoff per-tab, matching
 * the user's mental model: data follows the workspace, not the browser
 * profile.
 *
 * The union is open for future kinds — add a variant when you need a new
 * cross-zone route. Consumers narrow by `kind`.
 */

export type HandoffPayload =
  | { kind: 'phonetics-to-rhyme'; seedWord: string; perfect: string[]; near: string[] }
  | { kind: 'chord-to-piano';     progression: string[] }

type HandoffKind = HandoffPayload['kind']

const EVENT_KEY = 'dashboard:cross-zone-handoff'
const STORAGE_KEY_PREFIX = 'dashboard:cross-zone-handoff:last:'

function storageKeyFor(kind: HandoffKind): string {
  return `${STORAGE_KEY_PREFIX}${kind}`
}

/** Persist the most recent payload for this `kind` so a late-mounting zone can consume it. */
export function setLastHandoff(p: HandoffPayload): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(storageKeyFor(p.kind), JSON.stringify(p))
  } catch {
    /* sessionStorage may be unavailable (private mode, quota) — non-fatal */
  }
}

/**
 * Read and clear the last payload for `kind`. Returns null when nothing was
 * stored, or when the stored blob is malformed.
 */
export function consumeLastHandoff(kind: HandoffKind): HandoffPayload | null {
  if (typeof window === 'undefined') return null
  let raw: string | null
  try {
    raw = window.sessionStorage.getItem(storageKeyFor(kind))
  } catch {
    return null
  }
  if (!raw) return null
  try {
    window.sessionStorage.removeItem(storageKeyFor(kind))
  } catch {
    /* removal best-effort */
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && 'kind' in parsed && (parsed as { kind: unknown }).kind === kind) {
      return parsed as HandoffPayload
    }
  } catch {
    /* malformed — fall through */
  }
  return null
}

/** Fire a live handoff to whoever is currently subscribed. */
export function publishHandoff(p: HandoffPayload): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<HandoffPayload>(EVENT_KEY, { detail: p }))
}

/**
 * Subscribe to live handoffs. Returns an unsubscribe function.
 * The handler is called with the payload as-is — narrow by `kind` inside.
 */
export function subscribeHandoff(handler: (p: HandoffPayload) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onEvent = (e: Event) => {
    const detail = (e as CustomEvent<HandoffPayload>).detail
    if (detail && typeof detail === 'object' && 'kind' in detail) handler(detail)
  }
  window.addEventListener(EVENT_KEY, onEvent as EventListener)
  return () => window.removeEventListener(EVENT_KEY, onEvent as EventListener)
}
