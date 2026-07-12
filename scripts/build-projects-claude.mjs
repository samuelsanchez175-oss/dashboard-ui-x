#!/usr/bin/env node
/**
 * Repeatable Opus re-audit of every vault project → public/data/projects.json.
 *
 * Same audit as build-projects-ai.mjs, but driven through the `claude` CLI instead
 * of a raw API call, so it runs on the Claude Code (Pro) login with NO api key.
 * That's what makes it cron-able: .env.local has no ANTHROPIC_API_KEY.
 *
 *   node scripts/build-projects-claude.mjs [--dry-run] [--only <slug>]
 *
 * Env:
 *   VAULT_DIR          vault root (default: ~/dev/OB CLAUDE vault)
 *   PROJECTS_MODEL     model (default: claude-opus-4-8)
 *   PROJECTS_OUT_DIRS  ':'-separated app clones to write into (default: both)
 *   AUDIT_CONCURRENCY  parallel claude calls (default: 3)
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { taskIds, readPrevSnapshot, stampNewTasks, projectIdForFolder } from './lib/projects-diff.mjs'

const execFileAsync = promisify(execFile)

const VAULT = process.env.VAULT_DIR || '/Users/samuel/dev/OB CLAUDE vault'
const MODEL = process.env.PROJECTS_MODEL || 'claude-opus-4-8'
const CONCURRENCY = Number(process.env.AUDIT_CONCURRENCY || 3)
const DRY_RUN = process.argv.includes('--dry-run')
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > -1 ? process.argv[i + 1] : null })()

// Write into every dashboard clone, same rationale as build.py: the publish clone
// (tracks main → Vercel) and the local clone that launch.json serves on :5175.
const OUT_DIRS = (process.env.PROJECTS_OUT_DIRS
  || '/Users/samuel/dev/UI Dashboard x:/Users/samuel/dashboard-ui-x'
).split(':').filter(Boolean)

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

/** The prior titles for one project, injected so the model can reuse them verbatim. */
function previousTasksBlock(prev, projectId) {
  const old = (prev?.projects ?? []).find(p => p.id === projectId)
  if (!old?.tasks?.length) return ''
  const lines = old.tasks.map(t => `- ${t.title}`).join('\n')
  return `\n\nPREVIOUS TASKS (reuse a title verbatim when it is the same work):\n${lines}`
}

/**
 * Env for the nested `claude` process.
 *
 * When this script is itself launched from inside Claude Code, the parent injects
 * ANTHROPIC_BASE_URL (a proxy) whose token we don't carry — an inherited value makes
 * every nested call 401. Delete the keys outright rather than assigning `undefined`,
 * which would otherwise be stringified to "undefined" by some spawn paths.
 */
function childEnv() {
  const env = { ...process.env }
  for (const k of ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT']) delete env[k]
  return env
}

/**
 * One `claude -p` call per project.
 *
 * cwd is /tmp and no --add-dir is passed: the model gets the docs inline and has no
 * filesystem to wander into. --strict-mcp-config loads zero MCP servers (the global
 * fleet is ~45KB of schemas and one stray surrogate pair 400s the whole request).
 */
async function auditProject(name, docsText, prevBlock = '') {
  const { stdout } = await execFileAsync('claude', [
    '-p', `Project: ${name}\n\nDOCS:\n${docsText}${prevBlock}`,
    '--append-system-prompt', SYSTEM,
    '--strict-mcp-config',
    // The docs are inline, so no tool call is needed — but a headless run that decides
    // to Read something would block on a permission prompt until the timeout below.
    // bypassPermissions makes a prompt impossible, so the cron can never hang on one.
    '--permission-mode', 'bypassPermissions',
    '--model', MODEL,
    '--output-format', 'text',
  ], {
    cwd: '/tmp',
    maxBuffer: 20 * 1024 * 1024,
    timeout: 5 * 60_000,
    env: childEnv(),
  })
  const text = String(stdout).trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error(`no JSON in response (got ${text.slice(0, 120)}…)`)
  return JSON.parse(text.slice(start, end + 1))
}

// Read the snapshot we're about to replace ONCE: it supplies both the previous titles
// injected into each prompt and the baseline for the isNew diff.
const PREV_PATH = join(OUT_DIRS.find(d => existsSync(d)) ?? '.', 'public', 'data', 'projects.json')
const prevSnapshot = readPrevSnapshot(PREV_PATH)

const candidates = readdirSync(VAULT, { withFileTypes: true })
  .filter(d => d.isDirectory() && !isHidden(d.name) && !EXCLUDE.has(d.name))
  .map(d => ({ dir: d.name, files: walkMd(join(VAULT, d.name)) }))
  .filter(c => c.files.length > 0)
  .filter(c => !ONLY || projectIdForFolder(c.dir) === ONLY)

if (candidates.length === 0) {
  console.error(`No project folders found under ${VAULT}. Aborting (refusing to write an empty projects.json).`)
  process.exit(1)
}
console.log(`Auditing ${candidates.length} projects with ${MODEL} (concurrency ${CONCURRENCY})${DRY_RUN ? ' [DRY RUN]' : ''}`)

function docsFor(c) {
  let docsText = ''
  for (const f of c.files) {
    try { docsText += `\n\n=== ${f.split('/').pop()} ===\n` + readFileSync(f, 'utf8') } catch { /* skip */ }
    if (docsText.length > 32000) { docsText = docsText.slice(0, 32000) + '\n…[truncated]'; break }
  }
  return docsText
}

async function runOne(c, idx) {
  const name = stripEmoji(c.dir) || c.dir
  const emoji = leadEmoji(c.dir)
  const id = projectIdForFolder(c.dir)   // folder-pinned: a reworded name must not orphan check-offs
  if (DRY_RUN) {
    console.log(`  ${emoji} ${name} — ${c.files.length} docs, ${docsFor(c).length} chars (not calling claude)`)
    return null
  }
  const a = await auditProject(name, docsFor(c), previousTasksBlock(prevSnapshot, id))
  const raw = (a.tasks || []).slice(0, 12)
  const ids = taskIds(id, raw)
  const tasks = raw.map((t, i) => ({
    id: ids[i],
    title: String(t.title || '').slice(0, 120),
    done: t.status === 'done',
    owner: t.owner === 'human' ? 'human' : 'agent',
    command: String(t.command || ''),
  }))
  console.log(`  ${emoji} ${name} — ${tasks.filter(t => t.done).length}/${tasks.length} [${a.status}]`)
  return {
    id, name, emoji,
    status: ['active', 'blocked', 'shipped', 'planning', 'idle'].includes(a.status) ? a.status : 'active',
    accent: ACCENTS[idx % ACCENTS.length],
    summary: String(a.doneSummary || '').slice(0, 200),
    nextUp: String(a.nextUp || '').slice(0, 200),
    tasks,
  }
}

// Bounded parallelism — 14 sequential Opus calls is ~10min of wall clock.
const projects = []
let failures = 0
const queue = candidates.map((c, i) => [c, i])
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
  while (queue.length) {
    const [c, i] = queue.shift()
    try {
      const p = await runOne(c, i)
      if (p) projects.push(p)
    } catch (e) {
      failures++
      console.error(`  ! ${c.dir}: ${String(e.message).slice(0, 200)}`)
    }
  }
}))

if (DRY_RUN) { console.log('Dry run complete — nothing written.'); process.exit(0) }

// Fail safe. A partial audit that overwrites a good projects.json is worse than no
// audit at all: the dashboard would silently lose whole projects. Demand 80%.
const threshold = Math.ceil(candidates.length * 0.8)
if (projects.length < threshold) {
  console.error(`Only ${projects.length}/${candidates.length} projects audited (need ${threshold}). Keeping existing projects.json.`)
  process.exit(75) // EX_TEMPFAIL — the cron wrapper treats this as retry-next-cycle
}

projects.sort((a, b) => candidates.findIndex(c => projectIdForFolder(c.dir) === a.id)
                      - candidates.findIndex(c => projectIdForFolder(c.dir) === b.id))

// Mark tasks this audit surfaced for the first time, against the snapshot we're about
// to replace. Stamped into the file so the dashboard's NEW badges survive a reload and
// still appear for tasks the weekly cron added while nobody was watching.
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
console.log(`projects.json: ${projects.length} projects, ${failures} failed (${MODEL})`)
