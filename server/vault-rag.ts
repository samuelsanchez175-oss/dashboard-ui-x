/**
 * Vault RAG — chunk index + retrieval + Grok (CLI) generation.
 * Local-first: walks the Obsidian vault, caches chunks under .cache/,
 * answers via `grok -p` with retrieved context.
 */

import fs from 'node:fs/promises'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolveVaultDir } from './vault-paths'

const execFileAsync = promisify(execFile)

const SKIP_DIR = new Set([
  '.git', '.obsidian', 'node_modules', '.claude', '__pycache__', '.trash', 'OB CLAUDE V1',
])

export type RagChunk = {
  id: string
  path: string
  title: string
  folder: string
  text: string
  mtime: number
}

export type RagHit = RagChunk & { score: number; snippet: string }

type IndexFile = {
  version: 1
  vaultDir: string
  builtAt: string
  chunkCount: number
  chunks: RagChunk[]
}

function cachePath(repoRoot: string): string {
  return path.join(repoRoot, '.cache', 'vault-rag-index.json')
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9+#./-]+/)
    .filter(t => t.length >= 2 && t.length <= 40)
}

function chunkText(text: string, maxChars = 900): string[] {
  const parts: string[] = []
  const paras = text.split(/\n{2,}/)
  let buf = ''
  for (const p of paras) {
    const piece = p.trim()
    if (!piece) continue
    if ((buf + '\n\n' + piece).length > maxChars && buf) {
      parts.push(buf.trim())
      buf = piece
    } else {
      buf = buf ? `${buf}\n\n${piece}` : piece
    }
  }
  if (buf.trim()) parts.push(buf.trim())
  if (parts.length === 0 && text.trim()) parts.push(text.trim().slice(0, maxChars))
  return parts.slice(0, 40) // cap per file
}

async function walkMd(dir: string, vaultRoot: string, out: { path: string; mtime: number }[], max = 4000) {
  if (out.length >= max) return
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (out.length >= max) return
    if (e.name.startsWith('.') && e.name !== '.') continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue
      await walkMd(full, vaultRoot, out, max)
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
      try {
        const st = await fs.stat(full)
        out.push({
          path: path.relative(vaultRoot, full).split(path.sep).join('/'),
          mtime: st.mtimeMs,
        })
      } catch { /* */ }
    }
  }
}

function stripFrontmatter(raw: string): string {
  const m = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/)
  return (m?.[1] ?? raw).trim()
}

let memIndex: IndexFile | null = null

export async function rebuildRagIndex(repoRoot: string): Promise<IndexFile> {
  const vaultDir = resolveVaultDir()
  if (!existsSync(vaultDir)) {
    throw new Error(`Vault missing: ${vaultDir}`)
  }
  const files: { path: string; mtime: number }[] = []
  await walkMd(vaultDir, vaultDir, files)

  const chunks: RagChunk[] = []
  for (const f of files) {
    try {
      const raw = await fs.readFile(path.join(vaultDir, f.path), 'utf-8')
      const body = stripFrontmatter(raw)
      const title = path.basename(f.path, '.md')
      const folder = path.dirname(f.path) === '.' ? '' : path.dirname(f.path)
      const pieces = chunkText(body)
      pieces.forEach((text, i) => {
        chunks.push({
          id: `${f.path}#${i}`,
          path: f.path,
          title,
          folder,
          text,
          mtime: f.mtime,
        })
      })
    } catch { /* skip unreadable */ }
  }

  const index: IndexFile = {
    version: 1,
    vaultDir,
    builtAt: new Date().toISOString(),
    chunkCount: chunks.length,
    chunks,
  }

  const cp = cachePath(repoRoot)
  mkdirSync(path.dirname(cp), { recursive: true })
  writeFileSync(cp, JSON.stringify(index), 'utf-8')
  memIndex = index
  return index
}

export function loadRagIndex(repoRoot: string): IndexFile | null {
  if (memIndex) return memIndex
  const cp = cachePath(repoRoot)
  if (!existsSync(cp)) return null
  try {
    const idx = JSON.parse(readFileSync(cp, 'utf-8')) as IndexFile
    memIndex = idx
    return idx
  } catch {
    return null
  }
}

export async function ensureRagIndex(repoRoot: string, maxAgeMs = 6 * 60 * 60 * 1000): Promise<IndexFile> {
  const existing = loadRagIndex(repoRoot)
  if (existing) {
    const age = Date.now() - new Date(existing.builtAt).getTime()
    if (age < maxAgeMs && existing.vaultDir === resolveVaultDir()) return existing
  }
  return rebuildRagIndex(repoRoot)
}

/** Simple TF-IDF-ish scoring over in-memory chunks. */
export function retrieveChunks(index: IndexFile, query: string, k = 8): RagHit[] {
  const qTokens = tokenize(query)
  if (qTokens.length === 0) {
    return [...index.chunks]
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, k)
      .map(c => ({ ...c, score: 0, snippet: c.text.slice(0, 200) }))
  }

  const df = new Map<string, number>()
  for (const t of qTokens) {
    let n = 0
    for (const c of index.chunks) {
      if (c.text.toLowerCase().includes(t) || c.title.toLowerCase().includes(t)) n++
    }
    df.set(t, n)
  }

  const N = Math.max(1, index.chunks.length)
  const scored: RagHit[] = []
  for (const c of index.chunks) {
    const hay = `${c.title}\n${c.folder}\n${c.text}`.toLowerCase()
    let score = 0
    for (const t of qTokens) {
      if (!hay.includes(t)) continue
      const idf = Math.log(1 + N / (1 + (df.get(t) ?? 0)))
      // count occurrences (capped)
      let from = 0
      let tf = 0
      while (tf < 8) {
        const i = hay.indexOf(t, from)
        if (i < 0) break
        tf++
        from = i + t.length
      }
      score += tf * idf
      if (c.title.toLowerCase().includes(t)) score += 2 * idf
      if (c.folder.toLowerCase().includes(t)) score += 0.8 * idf
    }
    if (score <= 0) continue
    // recency mild boost
    const days = (Date.now() - c.mtime) / 86_400_000
    if (days < 30) score *= 1.15
    else if (days < 90) score *= 1.05
    const idx = hay.indexOf(qTokens[0]!)
    const start = Math.max(0, (idx >= 0 ? idx : 0) - 80)
    const snippet = c.text.slice(start, start + 220).replace(/\s+/g, ' ')
    scored.push({ ...c, score, snippet })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, k)
}

function findGrokBin(): string {
  const candidates = [
    process.env.GROK_BIN,
    '/Users/samuel/.grok/bin/grok',
    'grok',
  ].filter(Boolean) as string[]
  for (const c of candidates) {
    if (c === 'grok') return c
    if (existsSync(c)) return c
  }
  return 'grok'
}

export async function grokComplete(opts: {
  prompt: string
  system?: string
  timeoutMs?: number
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const bin = findGrokBin()
  // Prefer system override so the model answers immediately (no tool-planning chatter).
  const args = [
    '-p', opts.prompt,
    '--disable-web-search',
    '--max-turns', '1',
    '--disallowed-tools', 'bash,run_terminal_command,web_search,web_fetch,open_page',
  ]
  if (opts.system) {
    args.push(
      '--system-prompt-override',
      `${opts.system}\n\nReply with the final answer only. Do not narrate plans, tool use, or "I'll look that up".`,
    )
  } else {
    args.push(
      '--system-prompt-override',
      'You answer directly and concisely. Final answer only — no planning preamble.',
    )
  }
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      timeout: opts.timeoutMs ?? 120_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, PATH: `${path.dirname(bin)}:${process.env.PATH ?? ''}` },
    })
    const text = (stdout || '').trim()
    if (!text) {
      return { ok: false, error: stderr?.slice(0, 400) || 'Empty response from grok' }
    }
    return { ok: true, text }
  } catch (e: any) {
    return {
      ok: false,
      error: e?.stderr?.toString?.()?.slice(0, 400) || e?.message || 'grok CLI failed',
    }
  }
}

export async function ragChat(
  repoRoot: string,
  question: string,
  opts?: { k?: number; rebuild?: boolean },
): Promise<{
  ok: boolean
  answer?: string
  sources?: { path: string; title: string; score: number; snippet: string }[]
  error?: string
  indexMeta?: { chunkCount: number; builtAt: string; vaultDir: string }
}> {
  const q = question.trim()
  if (!q) return { ok: false, error: 'Empty question' }

  const index = opts?.rebuild
    ? await rebuildRagIndex(repoRoot)
    : await ensureRagIndex(repoRoot)

  const hits = retrieveChunks(index, q, opts?.k ?? 8)
  if (hits.length === 0) {
    return {
      ok: true,
      answer: 'No matching vault notes found. Try rebuilding the index or a broader query.',
      sources: [],
      indexMeta: { chunkCount: index.chunkCount, builtAt: index.builtAt, vaultDir: index.vaultDir },
    }
  }

  const context = hits
    .map((h, i) => `[${i + 1}] ${h.path}\n${h.text.slice(0, 1200)}`)
    .join('\n\n---\n\n')

  const system = `You are Samuel's second-brain research assistant. Answer ONLY from the provided vault excerpts when possible. Cite sources as [n] with file paths. If the vault does not contain enough info, say what is missing. Be concise, practical, and action-oriented. Prefer project status, next steps, and concrete resume prompts when relevant.`

  const prompt = `VAULT EXCERPTS:\n${context}\n\nQUESTION:\n${q}\n\nWrite a clear answer with citations like [1], [2].`

  const gen = await grokComplete({ prompt, system, timeoutMs: 150_000 })
  if (!gen.ok) {
    // Fallback: extractive answer without LLM
    const extractive = hits
      .slice(0, 4)
      .map((h, i) => `[${i + 1}] ${h.title} (${h.path})\n${h.snippet}`)
      .join('\n\n')
    return {
      ok: true,
      answer: `LLM unavailable (${gen.error}). Top vault matches:\n\n${extractive}`,
      sources: hits.map(h => ({ path: h.path, title: h.title, score: h.score, snippet: h.snippet })),
      indexMeta: { chunkCount: index.chunkCount, builtAt: index.builtAt, vaultDir: index.vaultDir },
      error: gen.error,
    }
  }

  return {
    ok: true,
    answer: gen.text,
    sources: hits.map(h => ({ path: h.path, title: h.title, score: h.score, snippet: h.snippet })),
    indexMeta: { chunkCount: index.chunkCount, builtAt: index.builtAt, vaultDir: index.vaultDir },
  }
}

export function ragStatus(repoRoot: string) {
  const cp = cachePath(repoRoot)
  const exists = existsSync(cp)
  let builtAt: string | null = null
  let chunkCount = 0
  let vaultDir: string | null = null
  if (exists) {
    try {
      const idx = JSON.parse(readFileSync(cp, 'utf-8')) as IndexFile
      builtAt = idx.builtAt
      chunkCount = idx.chunkCount
      vaultDir = idx.vaultDir
    } catch { /* */ }
  }
  return {
    ok: true,
    indexPath: cp,
    exists,
    builtAt,
    chunkCount,
    vaultDir,
    grokBin: findGrokBin(),
    grokPresent: existsSync(findGrokBin()) || findGrokBin() === 'grok',
  }
}

/** Growth content draft from vault context via Grok. */
export async function reachDraft(
  repoRoot: string,
  opts: { project?: string; channel: 'twitter' | 'linkedin' | 'instagram' | 'seo' | 'thread'; topic?: string },
) {
  const q = [opts.project, opts.topic, opts.channel, 'marketing launch status'].filter(Boolean).join(' ')
  const index = await ensureRagIndex(repoRoot)
  const hits = retrieveChunks(index, q, 6)
  const context = hits.map((h, i) => `[${i + 1}] ${h.path}\n${h.text.slice(0, 800)}`).join('\n\n')

  const channelGuide: Record<string, string> = {
    twitter: 'Write 3 tweet variants (≤260 chars each), punchy, no hashtag spam.',
    linkedin: 'Write 1 LinkedIn post (120–220 words), professional, one clear CTA.',
    instagram: 'Write IG caption + 5 hashtags + carousel slide titles (5).',
    seo: 'Write SEO title, meta description (≤155 chars), H1, and 5 FAQ questions with short answers.',
    thread: 'Write a 6-tweet thread outline with a hook and close CTA.',
  }

  const system = `You are a growth editor for Samuel's apps (iOS, music tools, CDL, Harmony web, Polymarket). Use vault facts. No fake metrics.`
  const prompt = `VAULT CONTEXT:\n${context || '(sparse)'}\n\nCHANNEL: ${opts.channel}\nPROJECT: ${opts.project || 'general'}\nTOPIC: ${opts.topic || 'progress / launch update'}\n\n${channelGuide[opts.channel]}\nCite vault paths when claiming status.`

  const gen = await grokComplete({ prompt, system, timeoutMs: 150_000 })
  return {
    ok: gen.ok,
    draft: gen.ok ? gen.text : null,
    error: gen.ok ? undefined : gen.error,
    sources: hits.map(h => ({ path: h.path, title: h.title, score: h.score })),
  }
}
