#!/usr/bin/env node
/**
 * Repeatable Opus re-audit of every vault project → public/data/projects.json.
 *
 * Reads each project's docs and asks Claude Opus to reconcile TRUE completion
 * (not stale checkboxes), split agent-vs-human, and draft paste-ready commands —
 * the same audit the dashboard ran via subagents, but keyed so a cron/Refresh
 * can repeat it.
 *
 * Requires ANTHROPIC_API_KEY (vite loads .env.local into the dev BFF; a cron must
 * export it). Run:  ANTHROPIC_API_KEY=sk-... VAULT_DIR="/path" node scripts/build-projects-ai.mjs
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { taskIds, readPrevSnapshot, stampNewTasks, projectIdForFolder } from './lib/projects-diff.mjs'

const VAULT = process.env.VAULT_DIR || '/Users/samuel/dev/OB CLAUDE vault'
const API_KEY = process.env.ANTHROPIC_API_KEY
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8'

// Same fan-out as build.py / build-projects-claude.mjs: the publish clone AND the local
// clone the dev server serves. Writing only one leaves localhost stale.
const OUT_DIRS = (process.env.PROJECTS_OUT_DIRS
  || '/Users/samuel/dev/UI Dashboard x:/Users/samuel/dashboard-ui-x'
).split(':').filter(Boolean)

if (!API_KEY) {
  console.error('ANTHROPIC_API_KEY not set — add it to .env.local (see .env.example). Aborting AI re-audit.')
  process.exit(1)
}

const EXCLUDE = new Set([
  '🌅 Daily Brief', '🤝 Handoffs', '⚙️ automation', '📊 dashboard-ui',
  '📚 docs', '📚 Vault Alamo', '🎵 Media',
])
const ACCENTS = [
  '#2563eb', '#7c3aed', '#d97706', '#dc2626', '#e11d48', '#f59e0b',
  '#059669', '#ea580c', '#0d9488', '#06b6d4', '#0891b2', '#db2777', '#9333ea', '#65a30d',
]
const EMOJI = /^([\p{Extended_Pictographic}☀-➿️‍]+)\s*/u
const isHidden = n => n.startsWith('.')
const stripEmoji = n => n.replace(EMOJI, '').trim()
const leadEmoji = n => { const m = n.match(EMOJI); return m ? m[1].trim() : '' }

function walkMd(dir) {
  const out = []
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    if (isHidden(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walkMd(p))
    else if (e.name.endsWith('.md')) out.push(p)
  }
  return out
}

const SYSTEM = `You audit ONE software project's Obsidian docs to determine TRUE completion. Reconcile what is ACTUALLY done vs pending from the prose/status sections — checkbox marks are stale, and "Plan" notes list steps that may already be built. Output ONLY a JSON object (no prose, no fences):
{"status":"active|blocked|shipped|planning|idle","doneSummary":"<=160 chars, what's actually built","nextUp":"<=160 chars, most important remaining work","tasks":[{"title":"<=80 chars","status":"done|pending","owner":"agent|human","command":"<if owner=agent AND pending: ONE paste-ready instruction for a coding agent referencing repo paths/files; else empty>"}]}
Rules: owner=human for deploy/sign-in/API-keys/App-Store-submit/purchase/record-audio/hardware/business-decision; owner=agent for implement/fix/refactor/add/test/wire code or UI. <=12 tasks, most meaningful, merge dupes. status=done if docs say it's built even if a checkbox is unchecked.
TITLE STABILITY (critical): if a PREVIOUS TASKS list is supplied, and a task you are emitting is the SAME work as one of them, reuse that previous title VERBATIM — character for character — even if you would phrase it better. Its completion status may change; its title must not. Write a fresh title ONLY for work that has no counterpart in the list. The dashboard diffs titles to show which tasks are new, so a gratuitous rewording is indistinguishable from new work.`

const PREV_PATH = join(OUT_DIRS.find(d => existsSync(d)) ?? '.', 'public', 'data', 'projects.json')
const prevSnapshot = readPrevSnapshot(PREV_PATH)

/** The prior titles for one project, injected so the model can reuse them verbatim. */
function previousTasksBlock(projectId) {
  const old = (prevSnapshot?.projects ?? []).find(p => p.id === projectId)
  if (!old?.tasks?.length) return ''
  return `\n\nPREVIOUS TASKS (reuse a title verbatim when it is the same work):\n${old.tasks.map(t => `- ${t.title}`).join('\n')}`
}

async function auditProject(name, docsText, prevBlock = '') {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2500,
      system: SYSTEM,
      messages: [{ role: 'user', content: `Project: ${name}\n\nDOCS:\n${docsText}${prevBlock}` }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const json = await res.json()
  const text = (json.content || []).map(c => c.text || '').join('').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error(`No JSON in response for ${name}`)
  return JSON.parse(text.slice(start, end + 1))
}

const dirs = readdirSync(VAULT, { withFileTypes: true })
const projects = []
let candidates = 0
let idx = 0
for (const d of dirs) {
  if (!d.isDirectory() || isHidden(d.name) || EXCLUDE.has(d.name)) continue
  const files = walkMd(join(VAULT, d.name))
  if (files.length === 0) continue
  candidates++
  const name = stripEmoji(d.name) || d.name
  const emoji = leadEmoji(d.name)
  const id = projectIdForFolder(d.name)   // folder-pinned: a reworded name must not orphan check-offs
  let docsText = ''
  for (const f of files) {
    try { docsText += `\n\n=== ${f.split('/').pop()} ===\n` + readFileSync(f, 'utf8') } catch { /* skip */ }
    if (docsText.length > 32000) { docsText = docsText.slice(0, 32000) + '\n…[truncated]'; break }
  }
  try {
    const a = await auditProject(name, docsText, previousTasksBlock(id))
    const raw = (a.tasks || []).slice(0, 12)
    const ids = taskIds(id, raw)
    const tasks = raw.map((t, i) => ({
      id: ids[i],
      title: String(t.title || '').slice(0, 120),
      done: t.status === 'done',
      owner: t.owner === 'human' ? 'human' : 'agent',
      command: String(t.command || ''),
    }))
    projects.push({
      id, name, emoji,
      status: ['active', 'blocked', 'shipped', 'planning', 'idle'].includes(a.status) ? a.status : 'active',
      accent: ACCENTS[idx % ACCENTS.length],
      summary: String(a.doneSummary || '').slice(0, 200),
      nextUp: String(a.nextUp || '').slice(0, 200),
      tasks,
    })
    console.log(`  ${emoji} ${name} — ${tasks.filter(t => t.done).length}/${tasks.length} [${a.status}]`)
  } catch (e) {
    console.error(`  ! ${name}: ${e.message}`)
  }
  idx++
}

// Fail safe. Every per-project error above is caught and logged, so a dead API key or an
// outage used to fall straight through to writeFileSync and replace projects.json with
// `{count: 0, projects: []}` — silently deleting the whole board. Demand 80% success.
const threshold = Math.ceil(candidates * 0.8)
if (projects.length < threshold) {
  console.error(`Only ${projects.length}/${candidates} projects audited (need ${threshold}). Keeping existing projects.json.`)
  process.exit(75) // EX_TEMPFAIL — the BFF/cron treats this as "kept the previous snapshot"
}

const generatedAt = new Date().toISOString()
const { newCount } = stampNewTasks(prevSnapshot, projects, generatedAt)
console.log(`new tasks since last audit: ${newCount}`)

const payload = JSON.stringify({
  generatedAt,
  source: 'opus-doc-audit',
  note: 'Completion reconciled by Claude reading each project\'s vault docs (not raw checkboxes). owner=agent tasks carry a paste-ready command. Task ids are title-derived and stable across re-audits; isNew marks tasks this audit surfaced for the first time.',
  model: MODEL,
  count: projects.length,
  newCount,
  projects,
}, null, 2)

let wrote = 0
for (const dir of OUT_DIRS) {
  if (!existsSync(dir)) { console.log(`  skipped (not found) -> ${dir}`); continue }
  const out = join(dir, 'public', 'data', 'projects.json')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, payload)
  console.log(`  wrote -> ${out}`)
  wrote++
}
if (!wrote) { console.error('No output clone found — nothing written.'); process.exit(1) }
console.log(`projects.json: ${projects.length} projects (Opus re-audit, ${MODEL})`)
