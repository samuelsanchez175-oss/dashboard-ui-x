/**
 * Per-browser custom order for the Projects Overview cards (CpwZone).
 *
 * Order is stored as an array of project ids in localStorage. Pure helpers
 * (`mergeProjectOrder`, `moveIdBefore`) hold the logic and are unit-tested via
 * scripts/test-project-order.ts; load/save/clear are thin localStorage wrappers
 * following the app's try/catch + JSON idiom (see CustomZonesContext).
 */
export const PROJECT_ORDER_KEY = 'ui-cpw-project-order-v1'

/**
 * Reorder `ids`: move `dragId` to just before `beforeId`. When `beforeId` is
 * null, move `dragId` to the end. No-op when dragId === beforeId or when
 * beforeId is not present. Pure.
 */
export function moveIdBefore(ids: string[], dragId: string, beforeId: string | null): string[] {
  if (dragId === beforeId) return ids
  const without = ids.filter(id => id !== dragId)
  if (beforeId === null) return [...without, dragId]
  const idx = without.indexOf(beforeId)
  if (idx === -1) return ids
  return [...without.slice(0, idx), dragId, ...without.slice(idx)]
}

/**
 * Order `items` by `orderIds` (saved order first), then append any item whose
 * id is not in `orderIds` in original (file) order. Saved ids with no matching
 * item are dropped; duplicate saved ids are ignored. Pure.
 */
export function mergeProjectOrder<T extends { id: string }>(items: T[], orderIds: string[]): T[] {
  const byId = new Map(items.map(it => [it.id, it]))
  const seen = new Set<string>()
  const out: T[] = []
  for (const id of orderIds) {
    const it = byId.get(id)
    if (it && !seen.has(id)) {
      out.push(it)
      seen.add(id)
    }
  }
  for (const it of items) {
    if (!seen.has(it.id)) {
      out.push(it)
      seen.add(it.id)
    }
  }
  return out
}

/** Load the saved id order; `[]` (no custom order) on any failure. */
export function loadProjectOrder(): string[] {
  try {
    const raw = localStorage.getItem(PROJECT_ORDER_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** Persist the id order. Failures are swallowed so the UI never blocks. */
export function saveProjectOrder(ids: string[]): void {
  try {
    localStorage.setItem(PROJECT_ORDER_KEY, JSON.stringify(ids))
  } catch {
    /* ignore */
  }
}

/** Forget the custom order (revert to file order). */
export function clearProjectOrder(): void {
  try {
    localStorage.removeItem(PROJECT_ORDER_KEY)
  } catch {
    /* ignore */
  }
}
