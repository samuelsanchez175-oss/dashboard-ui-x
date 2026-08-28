/**
 * Vault second-brain BFF — search / list / read / stats / ingest triggers
 * against the local Obsidian OB CLAUDE vault.
 *
 * Path resolution (first match wins):
 *   1. process.env.VAULT_DIR
 *   2. Known local locations (Pictures → Documents → legacy dev)
 */

import fs from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { resolveVaultDir, vaultCandidates } from './vault-paths'
import {
  ragChat,
  ragStatus,
  reachDraft,
  rebuildRagIndex,
} from './vault-rag'

const execAsync = promisify(exec)

export { resolveVaultDir }

const SKIP_DIR = new Set([
  '.git',
  '.obsidian',
  'node_modules',
  '.claude',
  '__pycache__',
  '.trash',
])

export type VaultNoteHit = {
  path: string
  name: string
  folder: string
  mtime: number
  size: number
  snippet?: string
  score?: number
}

function jsonRes(res: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', Buffer.byteLength(body))
  res.end(body)
}

function safeResolveUnderVault(vaultDir: string, relPath: string): string | null {
  if (!relPath || relPath.includes('\0')) return null
  const normalized = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '')
  const full = path.resolve(vaultDir, normalized)
  const base = path.resolve(vaultDir)
  const baseWithSep = base.endsWith(path.sep) ? base : `${base}${path.sep}`
  if (full !== base && !full.startsWith(baseWithSep)) return null
  return full
}

async function walkMarkdown(
  dir: string,
  vaultRoot: string,
  acc: VaultNoteHit[],
  maxFiles = 8000,
): Promise<void> {
  if (acc.length >= maxFiles) return
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (acc.length >= maxFiles) return
    if (entry.name.startsWith('.') && entry.name !== '.') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIR.has(entry.name)) continue
      // Skip nested duplicate vault copies that bloat search
      if (entry.name === 'OB CLAUDE V1') continue
      await walkMarkdown(full, vaultRoot, acc, maxFiles)
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      try {
        const st = await fs.stat(full)
        const rel = path.relative(vaultRoot, full).split(path.sep).join('/')
        const folder = path.dirname(rel) === '.' ? '' : path.dirname(rel)
        acc.push({
          path: rel,
          name: entry.name.replace(/\.md$/i, ''),
          folder,
          mtime: st.mtimeMs,
          size: st.size,
        })
      } catch {
        /* skip */
      }
    }
  }
}

function extractSnippet(text: string, query: string, radius = 90): string {
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  const idx = lower.indexOf(q)
  if (idx < 0) {
    const line = text.split('\n').find(l => l.trim() && !l.startsWith('---')) ?? ''
    return line.slice(0, radius * 2).trim()
  }
  const start = Math.max(0, idx - radius)
  const end = Math.min(text.length, idx + query.length + radius)
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '')
}

function scoreHit(name: string, folder: string, body: string, query: string): number {
  const q = query.toLowerCase()
  const n = name.toLowerCase()
  const f = folder.toLowerCase()
  const b = body.toLowerCase()
  let s = 0
  if (n === q) s += 100
  if (n.includes(q)) s += 40
  if (f.includes(q)) s += 15
  // term frequency-ish
  let from = 0
  let hits = 0
  while (hits < 20) {
    const i = b.indexOf(q, from)
    if (i < 0) break
    hits++
    from = i + q.length
  }
  s += hits * 3
  return s
}

function parseFrontmatter(raw: string): { fm: Record<string, string>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { fm: {}, body: raw }
  const fm: Record<string, string> = {}
  for (const line of (m[1] ?? '').split('\n')) {
    const km = line.match(/^([^:]+):\s*(.*)$/)
    if (km) fm[km[1].trim()] = km[2].trim().replace(/^["']|["']$/g, '')
  }
  return { fm, body: m[2] ?? '' }
}

/** Top-level folder word frequencies from titles + first headings — crude theme map. */
function buildThemeHints(notes: VaultNoteHit[]): { folder: string; count: number }[] {
  const map = new Map<string, number>()
  for (const n of notes) {
    const top = n.folder.split('/')[0] || '(root)'
    map.set(top, (map.get(top) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([folder, count]) => ({ folder, count }))
    .sort((a, b) => b.count - a.count)
}

async function runCmd(cmd: string) {
  try {
    const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 8 * 1024 * 1024 })
    return { ok: true as const, stdout, stderr }
  } catch (err: any) {
    return {
      ok: false as const,
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      error: err.message as string,
    }
  }
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', err => reject(err))
  })
}

/**
 * Handle /api/vault/* routes. Returns true if handled.
 */
export async function tryHandleVaultRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathName: string,
  method: string,
): Promise<boolean> {
  if (!pathName.startsWith('/api/vault')) return false

  const vaultDir = resolveVaultDir()
  const vaultExists = existsSync(vaultDir)

  // GET /api/vault/status
  if ((pathName === '/api/vault/status' || pathName.startsWith('/api/vault/status?')) && method === 'GET') {
    let noteCount = 0
    let handoffCount = 0
    let lastIngest: string | null = null
    let lastBrief: string | null = null
    if (vaultExists) {
      const notes: VaultNoteHit[] = []
      await walkMarkdown(vaultDir, vaultDir, notes)
      noteCount = notes.length
      handoffCount = notes.filter(n => n.folder.includes('Handoffs') || n.folder.includes('🤝')).length
      try {
        const log = path.join(vaultDir, '⚙️ automation/chat-ingest/ingest.log')
        const st = statSync(log)
        lastIngest = new Date(st.mtimeMs).toISOString()
      } catch { /* */ }
      try {
        const briefDir = path.join(vaultDir, '🌅 Daily Brief/Briefs')
        const files = await fs.readdir(briefDir)
        const md = files.filter(f => f.endsWith('.md')).sort().reverse()
        if (md[0]) {
          const st = statSync(path.join(briefDir, md[0]))
          lastBrief = new Date(st.mtimeMs).toISOString()
        }
      } catch { /* */ }
    }
    jsonRes(res, 200, {
      ok: true,
      vaultDir,
      exists: vaultExists,
      candidates: vaultCandidates(),
      noteCount,
      handoffCount,
      lastIngest,
      lastBrief,
    })
    return true
  }

  // ── RAG routes (work even if we need to build index) ───────────────────
  // GET /api/vault/rag/status
  if ((pathName === '/api/vault/rag/status' || pathName.startsWith('/api/vault/rag/status?')) && method === 'GET') {
    // repoRoot is parent of server/ — passed via global or derive from cwd
    const repoRoot = process.cwd()
    jsonRes(res, 200, ragStatus(repoRoot))
    return true
  }

  // POST /api/vault/rag/rebuild
  if (pathName === '/api/vault/rag/rebuild' && method === 'POST') {
    try {
      const idx = await rebuildRagIndex(process.cwd())
      jsonRes(res, 200, {
        ok: true,
        chunkCount: idx.chunkCount,
        builtAt: idx.builtAt,
        vaultDir: idx.vaultDir,
      })
    } catch (e: any) {
      jsonRes(res, 500, { ok: false, error: e?.message || 'rebuild failed' })
    }
    return true
  }

  // POST /api/vault/rag/chat  { question, rebuild? }
  if (pathName === '/api/vault/rag/chat' && method === 'POST') {
    try {
      const body = await readJsonBody(req)
      const question = typeof body?.question === 'string' ? body.question : ''
      const result = await ragChat(process.cwd(), question, {
        rebuild: Boolean(body?.rebuild),
        k: typeof body?.k === 'number' ? body.k : 8,
      })
      jsonRes(res, result.ok ? 200 : 500, result)
    } catch (e: any) {
      jsonRes(res, 500, { ok: false, error: e?.message || 'chat failed' })
    }
    return true
  }

  // POST /api/vault/rag/draft  { channel, project?, topic? }
  if (pathName === '/api/vault/rag/draft' && method === 'POST') {
    try {
      const body = await readJsonBody(req)
      const channel = (body?.channel || 'twitter') as 'twitter' | 'linkedin' | 'instagram' | 'seo' | 'thread'
      const result = await reachDraft(process.cwd(), {
        channel,
        project: typeof body?.project === 'string' ? body.project : undefined,
        topic: typeof body?.topic === 'string' ? body.topic : undefined,
      })
      jsonRes(res, result.ok ? 200 : 500, result)
    } catch (e: any) {
      jsonRes(res, 500, { ok: false, error: e?.message || 'draft failed' })
    }
    return true
  }

  // POST /api/vault/snapshots/refresh — full pipeline via script
  if (pathName === '/api/vault/snapshots/refresh' && method === 'POST') {
    try {
      const body = await readJsonBody(req).catch(() => ({}))
      const noGrok = Boolean(body?.noGrok)
      const skipIngest = Boolean(body?.skipIngest)
      const script = path.join(process.cwd(), 'scripts/refresh-vault-snapshots.mjs')
      const flags = [noGrok ? '--no-grok' : '', skipIngest ? '--skip-ingest' : ''].filter(Boolean).join(' ')
      const outcome = await runCmd(`node "${script}" ${flags}`.trim())
      // also ensure RAG index
      try {
        await rebuildRagIndex(process.cwd())
      } catch { /* */ }
      jsonRes(res, outcome.ok ? 200 : 500, { ...outcome })
    } catch (e: any) {
      jsonRes(res, 500, { ok: false, error: e?.message || 'refresh failed' })
    }
    return true
  }

  if (!vaultExists) {
    jsonRes(res, 503, {
      ok: false,
      error: 'VAULT_MISSING',
      message: `Vault not found. Set VAULT_DIR. Tried: ${vaultCandidates().join(' · ')}`,
      vaultDir,
    })
    return true
  }

  // GET /api/vault/themes — collection pattern map
  if ((pathName === '/api/vault/themes' || pathName.startsWith('/api/vault/themes?')) && method === 'GET') {
    const notes: VaultNoteHit[] = []
    await walkMarkdown(vaultDir, vaultDir, notes)
    const folders = buildThemeHints(notes)
    // Word-ish tokens from filenames (rough gap signal)
    const tokens = new Map<string, number>()
    for (const n of notes) {
      for (const raw of n.name.toLowerCase().split(/[^a-z0-9]+/)) {
        if (raw.length < 4 || raw.length > 24) continue
        if (['home', 'index', 'handoff', 'untitled', 'progress', 'status'].includes(raw)) continue
        tokens.set(raw, (tokens.get(raw) ?? 0) + 1)
      }
    }
    const keywords = [...tokens.entries()]
      .filter(([, c]) => c >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([word, count]) => ({ word, count }))
    jsonRes(res, 200, {
      ok: true,
      total: notes.length,
      folders: folders.slice(0, 40),
      keywords,
      insight:
        folders[0]
          ? `Heaviest collection lane: “${folders[0].folder}” (${folders[0].count} notes). Top keywords hint at recurring curiosities — not finished projects.`
          : 'No notes found.',
    })
    return true
  }

  // GET /api/vault/search?q=&limit=&folder=
  if ((pathName === '/api/vault/search' || pathName.startsWith('/api/vault/search?')) && method === 'GET') {
    const qs = new URL(req.url ?? '', 'http://localhost').searchParams
    const q = (qs.get('q') ?? '').trim()
    const folderFilter = (qs.get('folder') ?? '').trim()
    const limit = Math.min(80, Math.max(1, Number(qs.get('limit') ?? 30) || 30))

    const notes: VaultNoteHit[] = []
    await walkMarkdown(vaultDir, vaultDir, notes)
    let pool = notes
    if (folderFilter) {
      pool = pool.filter(n => n.folder === folderFilter || n.folder.startsWith(folderFilter + '/'))
    }

    if (!q) {
      // recent notes
      const recent = [...pool].sort((a, b) => b.mtime - a.mtime).slice(0, limit)
      jsonRes(res, 200, { ok: true, query: '', mode: 'recent', hits: recent, totalScanned: notes.length })
      return true
    }

    // Prefer name/folder hits first without reading every body
    const nameHits: VaultNoteHit[] = []
    const rest: VaultNoteHit[] = []
    const ql = q.toLowerCase()
    for (const n of pool) {
      if (n.name.toLowerCase().includes(ql) || n.folder.toLowerCase().includes(ql) || n.path.toLowerCase().includes(ql)) {
        nameHits.push({ ...n, score: scoreHit(n.name, n.folder, '', q) + 20 })
      } else {
        rest.push(n)
      }
    }
    nameHits.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.mtime - a.mtime)

    const bodyHits: VaultNoteHit[] = []
    // Cap body scans for responsiveness
    const scanBody = rest.sort((a, b) => b.mtime - a.mtime).slice(0, 400)
    for (const n of scanBody) {
      if (nameHits.length + bodyHits.length >= limit * 2) break
      try {
        const full = path.join(vaultDir, n.path)
        const text = await fs.readFile(full, 'utf-8')
        if (!text.toLowerCase().includes(ql)) continue
        const sc = scoreHit(n.name, n.folder, text, q)
        bodyHits.push({
          ...n,
          score: sc,
          snippet: extractSnippet(text, q),
        })
      } catch {
        /* skip */
      }
    }
    bodyHits.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

    // Enrich top name hits with snippets
    const merged = [...nameHits, ...bodyHits]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.mtime - a.mtime)
      .slice(0, limit)

    for (const hit of merged) {
      if (hit.snippet) continue
      try {
        const text = await fs.readFile(path.join(vaultDir, hit.path), 'utf-8')
        hit.snippet = extractSnippet(text, q)
      } catch {
        hit.snippet = ''
      }
    }

    jsonRes(res, 200, {
      ok: true,
      query: q,
      mode: 'search',
      hits: merged,
      totalScanned: notes.length,
    })
    return true
  }

  // GET /api/vault/list?prefix=&limit=
  if ((pathName === '/api/vault/list' || pathName.startsWith('/api/vault/list?')) && method === 'GET') {
    const qs = new URL(req.url ?? '', 'http://localhost').searchParams
    const prefix = (qs.get('prefix') ?? '').trim()
    const limit = Math.min(200, Math.max(1, Number(qs.get('limit') ?? 50) || 50))
    const notes: VaultNoteHit[] = []
    await walkMarkdown(vaultDir, vaultDir, notes)
    let pool = notes
    if (prefix) {
      pool = pool.filter(n => n.path.startsWith(prefix) || n.folder.startsWith(prefix))
    }
    pool.sort((a, b) => b.mtime - a.mtime)
    jsonRes(res, 200, { ok: true, hits: pool.slice(0, limit), total: pool.length })
    return true
  }

  // GET /api/vault/handoffs?limit=
  if ((pathName === '/api/vault/handoffs' || pathName.startsWith('/api/vault/handoffs?')) && method === 'GET') {
    const qs = new URL(req.url ?? '', 'http://localhost').searchParams
    const limit = Math.min(80, Math.max(1, Number(qs.get('limit') ?? 40) || 40))
    const notes: VaultNoteHit[] = []
    await walkMarkdown(vaultDir, vaultDir, notes)
    const handoffs = notes
      .filter(n => n.folder.includes('Handoffs') || n.path.includes('Handoff'))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit)

    const enriched = []
    for (const h of handoffs) {
      try {
        const raw = await fs.readFile(path.join(vaultDir, h.path), 'utf-8')
        const { fm, body } = parseFrontmatter(raw)
        // Prefer "Pick up" / resume sections
        const resumeMatch =
          body.match(/⏯️[^\n]*\n+([\s\S]{0,600}?)(?=\n##|\n#|$)/) ||
          body.match(/Pick up where[^\n]*\n+([\s\S]{0,600}?)(?=\n##|\n#|$)/i) ||
          body.match(/```[\s\S]{20,800}?```/)
        const resume = resumeMatch
          ? (resumeMatch[1] ?? resumeMatch[0]).trim().slice(0, 900)
          : body.split('\n').filter(l => l.trim() && !l.startsWith('#')).slice(0, 8).join('\n').slice(0, 500)
        enriched.push({
          ...h,
          project: fm.project || fm.tags || 'general',
          status: fm.status || 'open',
          source: fm.source || '',
          resume,
          created: fm.created || null,
        })
      } catch {
        enriched.push({ ...h, project: 'general', status: 'open', source: '', resume: '', created: null })
      }
    }
    jsonRes(res, 200, { ok: true, handoffs: enriched })
    return true
  }

  // GET /api/vault/projects — study mode: group notes by top-level project folder
  if ((pathName === '/api/vault/projects' || pathName.startsWith('/api/vault/projects?')) && method === 'GET') {
    const notes: VaultNoteHit[] = []
    await walkMarkdown(vaultDir, vaultDir, notes)
    const by = new Map<string, VaultNoteHit[]>()
    for (const n of notes) {
      const top = n.folder.split('/')[0] || '(root)'
      if (!by.has(top)) by.set(top, [])
      by.get(top)!.push(n)
    }
    const projects = [...by.entries()]
      .map(([name, items]) => {
        items.sort((a, b) => b.mtime - a.mtime)
        return {
          name,
          count: items.length,
          lastMtime: items[0]?.mtime ?? 0,
          recent: items.slice(0, 8),
        }
      })
      .sort((a, b) => b.lastMtime - a.lastMtime)

    // Load command center if present for jump-back prompts
    let commandCenterExcerpt: string | null = null
    try {
      const cc = await fs.readFile(path.join(vaultDir, '00_Project_Command_Center.md'), 'utf-8')
      commandCenterExcerpt = cc.slice(0, 4000)
    } catch {
      commandCenterExcerpt = null
    }

    jsonRes(res, 200, { ok: true, projects, commandCenterExcerpt })
    return true
  }

  // GET /api/vault/clippings
  if ((pathName === '/api/vault/clippings' || pathName.startsWith('/api/vault/clippings?')) && method === 'GET') {
    const notes: VaultNoteHit[] = []
    await walkMarkdown(vaultDir, vaultDir, notes)
    const clippings = notes
      .filter(
        n =>
          n.folder.includes('Clippings') ||
          n.folder.includes('AI Toolkit') ||
          n.folder.includes('Imported AI') ||
          n.path.toLowerCase().includes('clipping'),
      )
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 100)
    jsonRes(res, 200, { ok: true, clippings })
    return true
  }

  // GET /api/vault/media
  if ((pathName === '/api/vault/media' || pathName.startsWith('/api/vault/media?')) && method === 'GET') {
    const notes: VaultNoteHit[] = []
    await walkMarkdown(vaultDir, vaultDir, notes)
    const media = notes
      .filter(n => n.folder.includes('Media') || n.folder.includes('🎵'))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 100)

    const enriched = []
    for (const m of media.slice(0, 60)) {
      try {
        const raw = await fs.readFile(path.join(vaultDir, m.path), 'utf-8')
        const bpm = raw.match(/bpm[:\s*]*([0-9]{2,3})/i)?.[1] ?? null
        const key = raw.match(/key[:\s*]*([A-G][#b]?\s*(?:maj|min|major|minor)?)/i)?.[1] ?? null
        enriched.push({ ...m, bpm, key, snippet: extractSnippet(raw, bpm || key || 'track', 60) })
      } catch {
        enriched.push({ ...m, bpm: null, key: null, snippet: '' })
      }
    }
    jsonRes(res, 200, { ok: true, media: enriched })
    return true
  }

  // GET /api/vault/lyrics — Model G / Penwork / LLM Builder corpus
  if ((pathName === '/api/vault/lyrics' || pathName.startsWith('/api/vault/lyrics?')) && method === 'GET') {
    const qs = new URL(req.url ?? '', 'http://localhost').searchParams
    const q = (qs.get('q') ?? '').trim()
    const notes: VaultNoteHit[] = []
    await walkMarkdown(vaultDir, vaultDir, notes)
    let pool = notes.filter(
      n =>
        n.folder.includes('Penwork') ||
        n.folder.includes('Model G') ||
        n.folder.includes('LLM Builder') ||
        n.folder.includes('lyric') ||
        n.path.toLowerCase().includes('lyric'),
    )
    if (q) {
      const ql = q.toLowerCase()
      const hits: VaultNoteHit[] = []
      for (const n of pool.slice(0, 200)) {
        try {
          const text = await fs.readFile(path.join(vaultDir, n.path), 'utf-8')
          if (n.name.toLowerCase().includes(ql) || text.toLowerCase().includes(ql)) {
            hits.push({ ...n, snippet: extractSnippet(text, q || n.name) })
          }
        } catch { /* */ }
      }
      pool = hits
    } else {
      pool = pool.sort((a, b) => b.mtime - a.mtime).slice(0, 40)
    }
    jsonRes(res, 200, { ok: true, notes: pool.slice(0, 50) })
    return true
  }

  // GET /api/vault/file?path=
  if ((pathName === '/api/vault/file' || pathName.startsWith('/api/vault/file?')) && method === 'GET') {
    const qs = new URL(req.url ?? '', 'http://localhost').searchParams
    const rel = qs.get('path') ?? ''
    const full = safeResolveUnderVault(vaultDir, rel)
    if (!full) {
      jsonRes(res, 400, { ok: false, error: 'BAD_PATH' })
      return true
    }
    try {
      const raw = await fs.readFile(full, 'utf-8')
      const { fm, body } = parseFrontmatter(raw)
      jsonRes(res, 200, {
        ok: true,
        path: rel,
        frontmatter: fm,
        content: raw,
        body,
        mtime: (await fs.stat(full)).mtimeMs,
      })
    } catch (err: any) {
      jsonRes(res, 404, { ok: false, error: 'NOT_FOUND', message: err.message })
    }
    return true
  }

  // POST /api/vault/ingest/run — chat ingest
  if (pathName === '/api/vault/ingest/run' && method === 'POST') {
    const script = path.join(vaultDir, '⚙️ automation/chat-ingest/auto_ingest.py')
    if (!existsSync(script)) {
      jsonRes(res, 404, { ok: false, error: 'SCRIPT_MISSING', message: script })
      return true
    }
    const outcome = await runCmd(`python3 "${script}"`)
    jsonRes(res, outcome.ok ? 200 : 500, { ...outcome, vaultDir })
    return true
  }

  // POST /api/vault/brief/run
  if (pathName === '/api/vault/brief/run' && method === 'POST') {
    const script = path.join(vaultDir, '⚙️ automation/daily-brief/run_brief.sh')
    if (!existsSync(script)) {
      jsonRes(res, 404, { ok: false, error: 'SCRIPT_MISSING', message: script })
      return true
    }
    const outcome = await runCmd(`bash "${script}"`)
    jsonRes(res, outcome.ok ? 200 : 500, { ...outcome, vaultDir })
    return true
  }

  // GET /api/vault/logs?type=ingest|brief
  if ((pathName === '/api/vault/logs' || pathName.startsWith('/api/vault/logs?')) && method === 'GET') {
    const qs = new URL(req.url ?? '', 'http://localhost').searchParams
    const type = qs.get('type') === 'brief' ? 'brief' : 'ingest'
    const logFile =
      type === 'brief'
        ? path.join(vaultDir, '⚙️ automation/daily-brief/run.log')
        : path.join(vaultDir, '⚙️ automation/chat-ingest/ingest.log')
    try {
      const content = await fs.readFile(logFile, 'utf-8')
      const tail = content.split('\n').slice(-60).join('\n')
      jsonRes(res, 200, { ok: true, type, logs: tail, path: logFile })
    } catch (err: any) {
      jsonRes(res, 404, { ok: false, error: 'LOGS_NOT_FOUND', message: err.message })
    }
    return true
  }

  jsonRes(res, 404, { ok: false, error: 'NOT_FOUND', message: `Unknown vault route ${pathName}` })
  return true
}

/** Re-export for dashboard-bff legacy VAULT_DIR consumers. */
export function getVaultDirForLegacy(): string {
  return resolveVaultDir()
}
