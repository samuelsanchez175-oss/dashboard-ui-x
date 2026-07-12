/**
 * Shared task-identity + new-task-diff logic for projects.json producers.
 *
 * Both the cron audit (build-projects-claude.mjs) and any one-off re-audit must agree
 * on how a task is identified and what counts as "new", or the dashboard's NEW badges
 * would flicker on tasks that merely moved.
 */
import { readFileSync } from 'node:fs'

export const slug = s =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x'

const EMOJI_PREFIX = /^([\p{Extended_Pictographic}☀-➿️‍]+)\s*/u
export const stripEmoji = n => String(n).replace(EMOJI_PREFIX, '').trim()
export const leadEmoji = n => { const m = String(n).match(EMOJI_PREFIX); return m ? m[1].trim() : '' }

/**
 * Vault folder → canonical project id.
 *
 * Ids must be pinned to the FOLDER, never to the audit's display name: the model
 * rewords names between runs ("Polymarket Bot" → "Polymarket CLI"), and a changed
 * project id orphans every check-off stored against it.
 *
 * These aliases preserve the ids minted by the 2026-06-28 audit, whose ids were
 * hand-curated rather than derived. Anything not listed falls back to the slugged
 * folder name.
 */
const PROJECT_ID_ALIASES = {
  'XJournal AI - App': 'xjournal-ai',
  'XJournal AI - Model G': 'xjournal-model-g',
  'CDL PRAC one - Index': 'cdl-prac-one',
  'Polymarket Bot': 'polymarket-bot',
  'AI Toolkit': 'ai-toolkit',
}

export function projectIdForFolder(folder) {
  const bare = stripEmoji(folder)
  return PROJECT_ID_ALIASES[bare] ?? slug(bare)
}

/**
 * Content-derived task id, stable across re-audits.
 *
 * The old scheme was the array index (`${project}-${i}`). That only held because the
 * audit never re-ran; a weekly cron reorders and re-words tasks, so an index key would
 * silently move every check-off onto a different row.
 */
export function taskIds(projectId, tasks) {
  const seen = new Map()
  return tasks.map(t => {
    const base = `${projectId}-${slug(t.title).slice(0, 48)}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base}-${n}`
  })
}

/* ── Deciding whether a task already existed ────────────────────────────────────────
 * A re-audit REWORDS titles ("Landing page (x.html)" → "Landing / hero page (x.html)"),
 * so exact-title equality flags ~95% of tasks as new — pure noise. We instead match on
 * token similarity, one-to-one.
 *
 * One-to-one matters: containment alone lets a single short old task absorb several new
 * ones (old "Landing page" scores 0.80 against BOTH "Landing / hero page" and "Full
 * services + pricing page"). Greedy best-first matching lets the true pair claim each
 * other, leaving the genuinely-new task unmatched. */
const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'for', 'of', 'in', 'on', 'with', 'into', 'from', 'via', 'add', 'new'])
const tokens = t => new Set(
  (String(t).toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(w => w.length > 2 && !STOP.has(w)),
)

function similarity(a, b) {
  if (!a.size || !b.size) return 0
  const inter = [...a].filter(x => b.has(x)).length
  const jaccard = inter / new Set([...a, ...b]).size
  const containment = inter / Math.min(a.size, b.size)   // tolerates a longer, more detailed rewrite
  return 0.5 * jaccard + 0.5 * containment
}

/** Tuned against the 2026-06-28 → 2026-07-10 re-audit; see scratchpad probe. */
export const SAME_TASK = 0.55

/** 0..1 similarity between two task titles. Exported for check-off migrations. */
export const titleSimilarity = (a, b) => similarity(tokens(a), tokens(b))

/**
 * Indices of `next` tasks that have no counterpart in `prev`.
 * Greedy: score every pair, take the best pairs first, each task matched at most once.
 */
export function newTaskIndices(prevTasks, nextTasks) {
  const prevTok = prevTasks.map(t => tokens(t.title))
  const nextTok = nextTasks.map(t => tokens(t.title))

  const pairs = []
  for (let i = 0; i < nextTok.length; i++) {
    for (let j = 0; j < prevTok.length; j++) {
      const s = similarity(nextTok[i], prevTok[j])
      if (s >= SAME_TASK) pairs.push([s, i, j])
    }
  }
  pairs.sort((x, y) => y[0] - x[0])

  const usedNext = new Set(), usedPrev = new Set()
  for (const [, i, j] of pairs) {
    if (usedNext.has(i) || usedPrev.has(j)) continue
    usedNext.add(i); usedPrev.add(j)
  }
  return nextTasks.map((_, i) => i).filter(i => !usedNext.has(i))
}

/** Read a previous snapshot, tolerating a missing/corrupt file. */
export function readPrevSnapshot(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return Array.isArray(parsed.projects) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Stamp `isNew`/`addedAt` on tasks whose title did not exist in the previous snapshot.
 *
 * Why in the data rather than a client-side before/after diff: the weekly cron writes
 * this file while nobody is looking. If "new" only meant "changed since you clicked
 * Refresh", overnight additions would render unmarked and the whole signal would be
 * lost. Stamping it here means the badge survives a reload and shows up whenever the
 * page is next opened.
 *
 * A first-ever build (no previous snapshot) stamps nothing — marking all 150 tasks
 * "new" is noise, not signal. The same applies when the previous snapshot is empty.
 */
export function stampNewTasks(prev, projects, stampedAt) {
  const prevById = new Map((prev?.projects ?? []).map(p => [p.id, p]))
  if (prevById.size === 0) return { projects, newCount: 0 }

  let newCount = 0
  for (const p of projects) {
    const old = prevById.get(p.id)
    // A project absent from the previous snapshot is brand new. Marking all of its
    // tasks "new" is correct — but marking every task of every project new (which is
    // what a first-ever build would do) is noise, hence the guard above.
    const prevTasks = old?.tasks ?? []
    const idxs = prevTasks.length === 0
      ? p.tasks.map((_, i) => i)
      : newTaskIndices(prevTasks, p.tasks)
    for (const i of idxs) {
      p.tasks[i].isNew = true
      p.tasks[i].addedAt = stampedAt
      newCount++
    }
  }
  return { projects, newCount }
}
