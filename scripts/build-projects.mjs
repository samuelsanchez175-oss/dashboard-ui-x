#!/usr/bin/env node
/**
 * Build public/data/projects.json from the Obsidian vault.
 *
 * Convention (see the vault): every top-level emoji-prefixed folder is a project,
 * and markdown checkbox lines ("- [ ]" / "- [x]") inside its notes are its tasks.
 * Status comes from frontmatter `status:` or a "**Status:**" line in the index note.
 *
 * Run:  VAULT_DIR="/path/to/vault" node scripts/build-projects.mjs
 * Mirrors the daily-brief snapshot pipeline — the dashboard reads the committed JSON,
 * and the Projects zone's Refresh button re-runs this via the dashboard BFF.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const VAULT = process.env.VAULT_DIR || '/Users/samuel/dev/OB CLAUDE vault'
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(repoRoot, 'public', 'data', 'projects.json')

/** Top-level folders that are not projects. */
const EXCLUDE = new Set([
  '🌅 Daily Brief', '🤝 Handoffs', '⚙️ automation', '📊 dashboard-ui',
  '📚 docs', '📚 Vault Alamo', '🎵 Media',
])

const ACCENTS = [
  '#dc2626', '#7c3aed', '#059669', '#2563eb', '#d97706', '#db2777',
  '#0891b2', '#65a30d', '#9333ea', '#e11d48', '#0d9488', '#ea580c',
]

const isHidden = n => n.startsWith('.')
const EMOJI = /^([\p{Extended_Pictographic}☀-➿️‍]+)\s*/u
const stripEmoji = n => n.replace(EMOJI, '').trim()
const leadEmoji = n => { const m = n.match(EMOJI); return m ? m[1].trim() : '' }
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project'

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

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  const fm = {}
  if (!m) return fm
  for (const line of m[1].split('\n')) {
    const mm = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (mm) fm[mm[1].toLowerCase()] = mm[2].trim()
  }
  return fm
}

function normStatus(raw) {
  const s = (raw || '').toLowerCase()
  if (/ship|released|complete|launched|live(?!s)/.test(s)) return 'shipped'
  if (/block|paused|hold|stuck|stalled/.test(s)) return 'blocked'
  if (/plan|draft|idea|backlog|pre-/.test(s)) return 'planning'
  if (/active|running|building|wip|in progress|in-progress|dev/.test(s)) return 'active'
  return raw ? 'active' : 'idle'
}

const cleanTask = t => t
  .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .replace(/\s+/g, ' ')
  .trim()

let dirs
try {
  dirs = readdirSync(VAULT, { withFileTypes: true })
} catch (e) {
  console.error('Cannot read vault:', VAULT, e.message)
  process.exit(1)
}

const projects = []
let idx = 0
for (const d of dirs) {
  if (!d.isDirectory() || isHidden(d.name) || EXCLUDE.has(d.name)) continue
  const files = walkMd(join(VAULT, d.name))
  if (files.length === 0) continue

  const name = stripEmoji(d.name) || d.name
  const emoji = leadEmoji(d.name)
  const tasks = []
  const seen = new Set()
  let statusRaw = '', summary = '', deadline = null

  for (const f of files) {
    let text
    try { text = readFileSync(f, 'utf8') } catch { continue }
    const fm = frontmatter(text)
    if (!statusRaw && fm.status) statusRaw = fm.status
    if (!deadline && (fm.due || fm.deadline)) deadline = fm.due || fm.deadline
    if (!summary && fm.description) summary = fm.description
    if (!statusRaw) { const sm = text.match(/\*\*Status:\*\*\s*(.+)/i); if (sm) statusRaw = sm[1].trim() }
    if (!summary) {
      const body = text.replace(/^---\n[\s\S]*?\n---\n/, '')
      const pm = body.match(/^#\s+.+\n+([^\n#\-|].+)/m)
      if (pm) summary = pm[1].trim()
    }
    for (const line of text.split('\n')) {
      if (tasks.length >= 250) break
      const tm = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/)
      if (!tm) continue
      const title = cleanTask(tm[2])
      if (!title || seen.has(title.toLowerCase())) continue
      seen.add(title.toLowerCase())
      tasks.push({ done: tm[1] !== ' ', title })
    }
  }

  const id = slug(name)
  projects.push({
    id,
    name,
    emoji,
    summary: cleanTask(summary || '').slice(0, 200),
    status: normStatus(statusRaw),
    statusRaw: statusRaw.slice(0, 80),
    deadline,
    accent: ACCENTS[idx % ACCENTS.length],
    tasks: tasks.map((t, i) => ({ id: `${id}-${i}`, title: t.title, done: t.done })),
    doneCount: tasks.filter(t => t.done).length,
    totalCount: tasks.length,
  })
  idx++
}

// Most pending work first.
projects.sort((a, b) => (b.totalCount - b.doneCount) - (a.totalCount - a.doneCount))

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: projects.length, projects }, null, 2))

console.log(`projects.json: ${projects.length} projects, ${projects.reduce((n, p) => n + p.totalCount, 0)} tasks → ${OUT}`)
for (const p of projects) console.log(`  ${p.emoji} ${p.name} — ${p.doneCount}/${p.totalCount} [${p.status}]`)
