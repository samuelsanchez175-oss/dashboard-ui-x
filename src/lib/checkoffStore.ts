/**
 * Cross-environment task check-off store (Supabase REST).
 *
 * Lets you tick a task on the Vercel site OR localhost and have it reach the same
 * place; the local launchd cron (scripts/sync-checkoffs.mjs) then mirrors it into
 * the vault note. The publishable key is public by design — RLS scopes the anon
 * role to the `checkoffs` table (just task booleans), nothing else.
 *
 * Project: ui-dashboard-checkoffs (suyjphvmurihtpriovnv).
 */
const SUPABASE_URL = 'https://suyjphvmurihtpriovnv.supabase.co'
const SUPABASE_KEY = 'sb_publishable_aIiylimy7JjPz1Wkq5xXAg_AZoBnQSd'
const REST = `${SUPABASE_URL}/rest/v1/checkoffs`
const HEADERS: Record<string, string> = {
  apikey:          SUPABASE_KEY,
  authorization:   `Bearer ${SUPABASE_KEY}`,
  'content-type':  'application/json',
}

/** All stored check-offs as { taskId: done }. Empty object on any failure (offline-safe). */
export async function fetchCheckoffs(): Promise<Record<string, boolean>> {
  try {
    const r = await fetch(`${REST}?select=task_id,done`, { headers: HEADERS })
    if (!r.ok) return {}
    const rows = (await r.json()) as { task_id: string; done: boolean }[]
    const map: Record<string, boolean> = {}
    for (const row of rows) map[row.task_id] = row.done
    return map
  } catch {
    return {}
  }
}

/** Upsert one check-off (fire-and-forget; failures are swallowed so the UI never blocks). */
export async function upsertCheckoff(taskId: string, done: boolean): Promise<void> {
  try {
    await fetch(REST, {
      method:  'POST',
      headers: { ...HEADERS, prefer: 'resolution=merge-duplicates,return=minimal' },
      body:    JSON.stringify([{ task_id: taskId, done, updated_at: new Date().toISOString() }]),
    })
  } catch {
    /* offline — localStorage still holds the change for the next sync */
  }
}
