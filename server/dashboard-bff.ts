/**
 * Dev-only BFF: Reddit RSS proxy, safe reads from repo `content/`, Tesla Fleet
 * proxy (OAuth + vehicle reads), and mixing routes. Registered before other /api
 * handlers in Vite.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { handleMixingYoutubeAudioPost } from './mixing-youtube-audio'
import { tryHandleTeslaFleetRoutes } from './tesla-fleet-bff'
import { tryHandlePolymarketRoutes } from './polymarket-bff'
import { exec, spawn } from 'node:child_process'
import { promisify } from 'node:util'

type Next = () => void

const execAsync = promisify(exec)
const VAULT_DIR = process.env.VAULT_DIR || '/Users/samuel/dev/OB CLAUDE vault'

/* ── Long-running vault jobs: fire-and-forget + polled ───────────────────────────
 * Both the Opus projects audit (one LLM call per project) and the daily-brief synthesis
 * run for minutes. Awaiting either inside its POST blows past any sane HTTP timeout and
 * leaves the zone's Refresh button spinning, so each POST *starts* the job and returns,
 * and the zone polls a /status route until it settles. */
type JobState = {
  running: boolean
  startedAt: string | null
  finishedAt: string | null
  ok: boolean | null
  error: string | null
  tail: string
}
const newJob = (): JobState => ({
  running: false, startedAt: null, finishedAt: null, ok: null, error: null, tail: '',
})
const projectsAudit = newJob()
const briefRun = newJob()
const JOB_MAX_MS = 15 * 60_000

/**
 * Is the Claude Code CLI login still valid?
 *
 * The audit shells out to `claude -p`, which authenticates from the Keychain. That
 * token can expire with no refresh token, and every call then returns 401 — so check
 * the expiry offline and tell the user plainly instead of spawning a doomed run.
 *
 * FAIL-SAFE: an unreadable/absent/unparseable credential returns ok — we must never
 * block a run we cannot prove would fail.
 */
async function claudeLoginState(): Promise<{ ok: boolean; message?: string }> {
  try {
    const { stdout } = await execAsync('security find-generic-password -s "Claude Code-credentials" -w')
    const parsed = JSON.parse(stdout.trim())
    const oauth = parsed.claudeAiOauth ?? parsed
    const expiresAt = oauth?.expiresAt
    if (typeof expiresAt !== 'number') return { ok: true }
    if (expiresAt <= Date.now()) {
      const hrs = ((Date.now() - expiresAt) / 3_600_000).toFixed(1)
      return {
        ok: false,
        message: `Claude Code login expired ${hrs}h ago. Run \`claude\` in a terminal and complete /login, then hit Refresh again.`,
      }
    }
    return { ok: true }
  } catch {
    return { ok: true }
  }
}

/**
 * Spawn a vault job in the background, recording its outcome in `job`.
 * `describeExit` turns a non-zero exit code into something a human can act on.
 */
function startJob(
  job: JobState,
  file: string,
  args: string[],
  opts: { cwd: string; env?: NodeJS.ProcessEnv; label: string; describeExit?: (code: number, tail: string) => string },
) {
  job.running = true
  job.startedAt = new Date().toISOString()
  job.finishedAt = null
  job.ok = null
  job.error = null
  job.tail = ''

  const child = spawn(file, args, { cwd: opts.cwd, env: { ...process.env, VAULT_DIR, ...opts.env } })
  const append = (chunk: unknown) => { job.tail = (job.tail + String(chunk)).slice(-8000) }
  child.stdout.on('data', append)
  child.stderr.on('data', append)

  const killer = setTimeout(() => {
    child.kill('SIGKILL')
    job.error = `${opts.label} exceeded ${JOB_MAX_MS / 60_000} min and was killed`
  }, JOB_MAX_MS)

  const settle = (ok: boolean, error: string | null) => {
    clearTimeout(killer)
    job.running = false
    job.ok = ok
    job.finishedAt = new Date().toISOString()
    if (error && !job.error) job.error = error
  }
  child.on('error', err => settle(false, err.message))
  child.on('close', code => {
    if (code === 0) return settle(true, null)
    const described = opts.describeExit?.(code ?? -1, job.tail)
    settle(false, described ?? `${opts.label} exited ${code}: ${job.tail.slice(-400)}`)
  })
}

/** Shared exit-code vocabulary with the vault scripts: 78 = needs a human, 75 = transient. */
const describeVaultExit = (what: string) => (code: number, tail: string) => {
  if (code === 78) return 'Claude Code login expired. Run `claude` in a terminal and complete /login, then hit Refresh again.'
  if (code === 75) return `${what} could not finish (offline or a partial run) — the previous snapshot was kept.`
  return `${what} exited ${code}: ${tail.slice(-400)}`
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

async function runCommand(cmd: string): Promise<{ ok: boolean; stdout: string; stderr: string; error?: string }> {
  try {
    // Vault scripts are chatty and slow. Node's defaults (no timeout, 1 MB stdout) turn a
    // long run into either a hung request or an ERR_CHILD_PROCESS_STDIO_MAXBUFFER throw.
    const { stdout, stderr } = await execAsync(cmd, { timeout: 600_000, maxBuffer: 20 * 1024 * 1024 })
    return { ok: true, stdout, stderr }
  } catch (err: any) {
    return { ok: false, stdout: err.stdout || '', stderr: err.stderr || '', error: err.message }
  }
}

const REDDIT_CLAUDESKILLS_RSS = 'https://www.reddit.com/r/claudeskills/.rss'

export type DigestItem = {
  title: string
  link: string
  publishedAt: string | null
}

export type DigestJson =
  | { ok: true; source: string; items: DigestItem[] }
  | { ok: false; error: string; message: string }

function jsonRes(res: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', Buffer.byteLength(body))
  res.end(body)
}

function pathnameOnly(url: string | undefined): string {
  if (!url) return '/'
  try {
    return new URL(url, 'http://localhost').pathname
  } catch {
    return '/'
  }
}

function stripCdata(s: string): string {
  return s.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '').trim()
}

function decodeXmlish(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}

/**
 * Lightweight RSS item parse — sufficient for Reddit `.rss` feeds.
 */
function parseRssItems(xml: string, maxItems = 25): DigestItem[] {
  const items: DigestItem[] = []
  const re = /<item\b[^>]*>([\s\S]*?)<\/item>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) && items.length < maxItems) {
    const block = m[1] ?? ''
    const titleRaw =
      block.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '(untitled)'
    const linkRaw = block.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i)?.[1]?.trim() ?? ''
    const pub =
      block.match(/<pubDate\b[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim() ?? null

    const title = decodeXmlish(stripCdata(titleRaw))
    const link = decodeXmlish(stripCdata(linkRaw))
    if (link) {
      items.push({
        title: title || '(untitled)',
        link,
        publishedAt: pub ? decodeXmlish(stripCdata(pub)) : null,
      })
    }
  }
  return items
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h === '127.0.0.1' || h === '0.0.0.0' || h === '::1') return true
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const parts = h.split('.').map(Number)
    const [a, b] = parts
    if (a === 127 || a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true
  }
  return false
}

/** Dev BFF: only https, blocks hosts that look local/private (SSRF guardrail). */
function isAllowedDigestUrl(feedUrl: string): boolean {
  try {
    const u = new URL(feedUrl)
    if (u.protocol !== 'https:') return false
    if (isPrivateOrLocalHost(u.hostname)) return false
    return true
  } catch {
    return false
  }
}

/**
 * Resolve optional `feed` query: full RSS URL (https) or bare subreddit name / `r/name`.
 */
function normalizeDigestFeed(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
      if (u.protocol === 'http:') u.protocol = 'https:'
      return u.toString()
    } catch {
      return null
    }
  }

  const sub = trimmed.replace(/^r\//i, '').replace(/^\/?/, '').trim()
  const slug = (sub.split(/[/\s#?]/)[0] ?? '').trim()
  if (!slug || !/^[\w]+$/.test(slug)) return null
  return `https://www.reddit.com/r/${slug}/.rss`
}

async function fetchDigest(feedQuery: string | null): Promise<DigestJson> {
  let sourceUrl: string
  if (feedQuery && feedQuery.trim()) {
    const normalized = normalizeDigestFeed(feedQuery.trim())
    if (!normalized) {
      return {
        ok: false,
        error: 'BAD_FEED',
        message:
          'Could not interpret feed — use a subreddit name (e.g. claudeskills), r/name, or a full https RSS URL.',
      }
    }
    if (!isAllowedDigestUrl(normalized)) {
      return {
        ok: false,
        error: 'FORBIDDEN',
        message: 'Only https feeds are allowed; local or private hosts are blocked.',
      }
    }
    sourceUrl = normalized
  } else {
    sourceUrl = REDDIT_CLAUDESKILLS_RSS
  }

  try {
    const res = await fetch(sourceUrl, {
      headers: {
        'User-Agent': 'UI-Dashboard-X/0.1 (local dev; RSS digest)',
        Accept: 'application/rss+xml, application/xml, text/xml;q=0.9,*/*;q=0.8',
      },
    })
    if (!res.ok) {
      return {
        ok: false,
        error: 'UPSTREAM',
        message: `RSS HTTP ${res.status}`,
      }
    }
    const xml = await res.text()
    const items = parseRssItems(xml)
    if (items.length === 0) {
      return {
        ok: false,
        error: 'PARSE',
        message: 'No items parsed from RSS (feed layout may have changed).',
      }
    }
    return { ok: true, source: sourceUrl, items }
  } catch {
    return {
      ok: false,
      error: 'NETWORK',
      message: 'Could not fetch RSS. Check network or try again later.',
    }
  }
}

function resolveContentPath(repoRoot: string, relParam: string | null): string | null {
  if (!relParam || relParam.includes('\0')) return null
  const normalized = path.normalize(relParam).replace(/^(\.\.(\/|\\|$))+/, '')
  const base = path.resolve(repoRoot, 'content')
  const full = path.resolve(base, normalized)
  const baseWithSep = base.endsWith(path.sep) ? base : `${base}${path.sep}`
  if (full !== base && !full.startsWith(baseWithSep)) return null
  return full
}

async function readLocalContent(repoRoot: string, rel: string | null): Promise<{ mime: string; body: Buffer } | null> {
  const full = resolveContentPath(repoRoot, rel)
  if (!full) return null
  if (!full.endsWith('.md') && !full.endsWith('.json') && !full.endsWith('.txt')) return null
  try {
    const body = await fs.readFile(full)
    const mime = full.endsWith('.json')
      ? 'application/json; charset=utf-8'
      : full.endsWith('.md')
        ? 'text/markdown; charset=utf-8'
        : 'text/plain; charset=utf-8'
    return { mime, body }
  } catch {
    return null
  }
}

function updateFrontmatter(content: string, updates: Record<string, any>): string {
  const match = content.match(/^---([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (match) {
    const rawFm = match[1]
    const body = match[2]
    const lines = rawFm.split('\n')
    const updatedKeys = new Set<string>()
    const newLines = lines.map(line => {
      const keyMatch = line.match(/^([^:]+):(.*)$/)
      if (keyMatch) {
        const key = keyMatch[1].trim()
        if (updates[key] !== undefined) {
          updatedKeys.add(key)
          return `${key}: ${updates[key]}`
        }
      }
      return line
    })
    for (const [k, v] of Object.entries(updates)) {
      if (!updatedKeys.has(k)) {
        newLines.push(`${k}: ${v}`)
      }
    }
    return `---${newLines.join('\n')}\n---\n${body}`
  } else {
    // No frontmatter, prepend it
    const fmLines = ['---']
    for (const [k, v] of Object.entries(updates)) {
      fmLines.push(`${k}: ${v}`)
    }
    fmLines.push('---', '')
    return fmLines.join('\n') + content
  }
}

async function findFileRecursively(dir: string, filename: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        const found = await findFileRecursively(fullPath, filename)
        if (found) return found
      } else if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) {
        return fullPath
      }
    }
  } catch {
    // Ignore errors
  }
  return null
}


/**
 * Attach dashboard routes: GET /api/digest/reddit, GET /api/local/file?path=
 */
export function attachDashboardBff(
  middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: Next) => void) => void },
  repoRoot: string,
) {
  middlewares.use(async (req, res, next_): Promise<void> => {
    const pathName = pathnameOnly(req.url ?? '')
    const method = (req.method ?? 'GET').toUpperCase()
    const next: Next = () => {
      next_()
    }

    if (tryHandleTeslaFleetRoutes(req, res)) {
      return
    }

    if (tryHandlePolymarketRoutes(req, res)) {
      return
    }

    if (pathName.startsWith('/api/mixing/')) {
      if (pathName === '/api/mixing/youtube-audio' && method === 'POST') {
        await handleMixingYoutubeAudioPost(req, res)
        return
      }
      jsonRes(res, 405, {
        ok: false,
        error: 'METHOD_NOT_ALLOWED',
        message: 'Unsupported mixing API route or method.',
      })
      return
    }

    if (!pathName.startsWith('/api/digest/') && !pathName.startsWith('/api/local/')) {
      next()
      return
    }

    // POST /api/local/brief/generate — kick off the vault brief synthesis.
    //
    // Returns immediately; poll GET /api/local/brief/status. Awaiting it used to hold the
    // request open for the whole `claude -p` run, which is why Refresh sat spinning.
    if (pathName === '/api/local/brief/generate' && method === 'POST') {
      if (briefRun.running) {
        jsonRes(res, 200, { status: 'already_running', startedAt: briefRun.startedAt })
        return
      }
      const auth = await claudeLoginState()
      if (!auth.ok) {
        jsonRes(res, 200, { status: 'blocked', reason: 'login_expired', message: auth.message })
        return
      }
      // PUBLISH=0: a dashboard click must only rewrite the LOCAL snapshot. Without it
      // run_brief.sh defaults to PUBLISH=1 and would git commit + push main from a button
      // press, deploying to Vercel. Only the 07:00 launchd cron is allowed to publish.
      startJob(briefRun, 'bash', [`${VAULT_DIR}/⚙️ automation/daily-brief/run_brief.sh`], {
        cwd: VAULT_DIR,
        env: { PUBLISH: '0' },
        label: 'daily brief',
        describeExit: describeVaultExit('The daily brief'),
      })
      jsonRes(res, 202, { status: 'started', startedAt: briefRun.startedAt })
      return
    }

    // GET /api/local/brief/status — progress of the synthesis started above.
    if (pathName === '/api/local/brief/status' && method === 'GET') {
      let briefDate: string | null = null
      try {
        const raw = await fs.readFile(path.join(repoRoot, 'public', 'data', 'daily-brief.json'), 'utf-8')
        briefDate = JSON.parse(raw).date ?? null
      } catch { /* no snapshot yet */ }
      jsonRes(res, 200, {
        running: briefRun.running,
        ok: briefRun.ok,
        error: briefRun.error,
        startedAt: briefRun.startedAt,
        finishedAt: briefRun.finishedAt,
        tail: briefRun.tail.slice(-600),
        briefDate,
      })
      return
    }

    // POST /api/local/chat-ingest/run
    if (pathName === '/api/local/chat-ingest/run' && method === 'POST') {
      const cmd = `python3 "${VAULT_DIR}/⚙️ automation/chat-ingest/auto_ingest.py"`
      const outcome = await runCommand(cmd)
      jsonRes(res, outcome.ok ? 200 : 500, outcome)
      return
    }

    // POST /api/local/brief/build
    if (pathName === '/api/local/brief/build' && method === 'POST') {
      const cmd = `python3 "${VAULT_DIR}/📊 dashboard-ui/build.py"`
      const outcome = await runCommand(cmd)
      jsonRes(res, outcome.ok ? 200 : 500, outcome)
      return
    }

    // POST /api/local/projects/build — kick off a re-audit of projects.json from the vault.
    //
    // Returns immediately; poll GET /api/local/projects/status for completion. The raw
    // checkbox builder is deliberately NOT used: it bails out the moment projects.json is
    // an AI audit, which is why Refresh used to be a silent no-op.
    if (pathName === '/api/local/projects/build' && method === 'POST') {
      if (projectsAudit.running) {
        jsonRes(res, 200, { status: 'already_running', startedAt: projectsAudit.startedAt })
        return
      }
      // build-projects-ai.mjs talks to the API directly; build-projects-claude.mjs shells
      // out to `claude`, so only the latter depends on an unexpired CLI login.
      const keyed = Boolean(process.env.ANTHROPIC_API_KEY)
      if (!keyed) {
        const auth = await claudeLoginState()
        if (!auth.ok) {
          jsonRes(res, 200, { status: 'blocked', reason: 'login_expired', message: auth.message })
          return
        }
      }
      const script = keyed
        ? `${repoRoot}/scripts/build-projects-ai.mjs`
        : `${repoRoot}/scripts/build-projects-claude.mjs`
      startJob(projectsAudit, 'node', [script], {
        cwd: repoRoot,
        label: 'projects audit',
        describeExit: describeVaultExit('The projects audit'),
      })
      jsonRes(res, 202, { status: 'started', script: path.basename(script), startedAt: projectsAudit.startedAt })
      return
    }

    // GET /api/local/projects/status — progress of the re-audit started above.
    if (pathName === '/api/local/projects/status' && method === 'GET') {
      let generatedAt: string | null = null
      try {
        const raw = await fs.readFile(path.join(repoRoot, 'public', 'data', 'projects.json'), 'utf-8')
        generatedAt = JSON.parse(raw).generatedAt ?? null
      } catch { /* no snapshot yet */ }
      jsonRes(res, 200, {
        running: projectsAudit.running,
        ok: projectsAudit.ok,
        error: projectsAudit.error,
        startedAt: projectsAudit.startedAt,
        finishedAt: projectsAudit.finishedAt,
        tail: projectsAudit.tail.slice(-600),
        generatedAt,
      })
      return
    }

    // POST /api/local/projects/checkoff — mirror dashboard task state into a vault note
    if (pathName === '/api/local/projects/checkoff' && method === 'POST') {
      try {
        const body = await readJsonBody(req)
        const projects: any[] = Array.isArray(body?.projects) ? body.projects : []
        const now = new Date().toISOString()
        const lines: string[] = [
          '---', 'type: dashboard-tasks', 'source: ui-dashboard-x',
          `updated: ${now.slice(0, 10)}`, '---', '',
          '# 📊 Project Tasks (synced from the dashboard)', '',
          '> Auto-generated by the Projects dashboard — edits here are overwritten on each sync.',
          `> Last synced: ${now}`, '',
        ]
        for (const p of projects) {
          const tasks: any[] = Array.isArray(p?.tasks) ? p.tasks : []
          const done = tasks.filter(t => t?.done).length
          lines.push(`## ${p?.emoji ?? ''} ${p?.name ?? 'Project'} — ${done}/${tasks.length}`, '')
          for (const t of tasks) {
            const who = t?.owner === 'human' ? '🙋' : '🤖'
            lines.push(`- [${t?.done ? 'x' : ' '}] ${who} ${String(t?.title ?? '').replace(/\n/g, ' ')}`)
          }
          lines.push('')
        }
        const dir = path.join(VAULT_DIR, '📊 dashboard-ui')
        await fs.mkdir(dir, { recursive: true })
        await fs.writeFile(path.join(dir, 'Project Tasks.md'), lines.join('\n'), 'utf-8')
        jsonRes(res, 200, { ok: true, count: projects.length })
      } catch (err: any) {
        jsonRes(res, 500, { ok: false, error: 'WRITE_FAILED', message: err?.message ?? String(err) })
      }
      return
    }

    // POST /api/local/projects/sync — pull check-offs from the cloud store → vault note (what the cron does)
    if (pathName === '/api/local/projects/sync' && method === 'POST') {
      const url = 'https://suyjphvmurihtpriovnv.supabase.co/rest/v1/checkoffs?select=task_id,done'
      const token = 'sb_publishable_aIiylimy7JjPz1Wkq5xXAg_AZoBnQSd'
      const cmd = `CHECKOFF_STORE_URL="${url}" CHECKOFF_STORE_TOKEN="${token}" VAULT_DIR="${VAULT_DIR}" node "${repoRoot}/scripts/sync-checkoffs.mjs"`
      const outcome = await runCommand(cmd)
      jsonRes(res, outcome.ok ? 200 : 500, outcome)
      return
    }

    // GET /api/local/vault/logs?type=brief|ingest
    if ((pathName === '/api/local/vault/logs' || pathName.startsWith('/api/local/vault/logs?')) && method === 'GET') {
      const qs = new URL(req.url ?? '', 'http://localhost').searchParams
      const type = qs.get('type')
      const logFile = type === 'ingest'
        ? path.join(VAULT_DIR, '⚙️ automation/chat-ingest/ingest.log')
        : path.join(VAULT_DIR, '⚙️ automation/daily-brief/run.log')
      try {
        const content = await fs.readFile(logFile, 'utf-8')
        const lines = content.split('\n')
        const tail = lines.slice(-50).join('\n')
        jsonRes(res, 200, { ok: true, logs: tail })
      } catch (err: any) {
        jsonRes(res, 404, { ok: false, error: 'LOGS_NOT_FOUND', message: err.message })
      }
      return
    }

    // GET /api/local/vault/file?path=...
    if ((pathName === '/api/local/vault/file' || pathName.startsWith('/api/local/vault/file?')) && method === 'GET') {
      const qs = new URL(req.url ?? '', 'http://localhost').searchParams
      const relPath = qs.get('path')
      if (!relPath || relPath.includes('\0')) {
        jsonRes(res, 400, { ok: false, error: 'BAD_REQUEST', message: 'Invalid file path.' })
        return
      }
      const normalized = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '')
      const fullPath = path.resolve(VAULT_DIR, normalized)
      if (!fullPath.startsWith(VAULT_DIR)) {
        jsonRes(res, 403, { ok: false, error: 'FORBIDDEN', message: 'Path traversal blocked.' })
        return
      }
      try {
        const body = await fs.readFile(fullPath)
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
        res.end(body)
      } catch (err: any) {
        jsonRes(res, 404, { ok: false, error: 'FILE_NOT_FOUND', message: err.message })
      }
      return
    }

    // POST /api/local/vault/write-handoff
    if (pathName === '/api/local/vault/write-handoff' && method === 'POST') {
      try {
        const body = await readJsonBody(req)
        const { project, source, content } = body
        if (!project || !content) {
          jsonRes(res, 400, { ok: false, error: 'BAD_REQUEST', message: 'Project and content are required.' })
          return
        }

        const dateStr = new Date().toISOString().slice(0, 10)
        const filename = `Handoff — ${project} (${dateStr}).md`
        const fullPath = path.join(VAULT_DIR, '🤝 Handoffs', filename)

        // Generate frontmatter
        const frontmatter = [
          '---',
          'type: handoff',
          `project: "${project}"`,
          'status: open',
          `source: ${source || 'manual'}`,
          `created: ${dateStr}`,
          `updated: ${dateStr}`,
          `tags: ["handoff", "${source || 'manual'}"]`,
          '---',
          '',
          `# Handoff — ${project} (${dateStr})`,
          '',
          content
        ].join('\n')

        await fs.writeFile(fullPath, frontmatter, 'utf-8')
        jsonRes(res, 200, { ok: true, filename })
      } catch (err: any) {
        jsonRes(res, 500, { ok: false, error: 'WRITE_FAILED', message: err.message })
      }
      return
    }

    // POST /api/local/vault/resolve-handoff
    if (pathName === '/api/local/vault/resolve-handoff' && method === 'POST') {
      try {
        const body = await readJsonBody(req)
        const { path: relPath } = body
        if (!relPath) {
          jsonRes(res, 400, { ok: false, error: 'BAD_REQUEST', message: 'Handoff file path is required.' })
          return
        }

        const normalized = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '')
        const fullPath = path.resolve(VAULT_DIR, normalized)
        if (!fullPath.startsWith(VAULT_DIR)) {
          jsonRes(res, 403, { ok: false, error: 'FORBIDDEN', message: 'Path traversal blocked.' })
          return
        }

        const content = await fs.readFile(fullPath, 'utf-8')
        const updatedContent = updateFrontmatter(content, { status: 'resolved' })
        await fs.writeFile(fullPath, updatedContent, 'utf-8')

        // Trigger chat-ingest + build run to sync dashboard state
        const ingestCmd = `python3 "${VAULT_DIR}/⚙️ automation/chat-ingest/auto_ingest.py"`
        const buildCmd = `python3 "${VAULT_DIR}/📊 dashboard-ui/build.py"`
        const ingestOutcome = await runCommand(ingestCmd)
        const buildOutcome = await runCommand(buildCmd)

        jsonRes(res, 200, {
          ok: true,
          message: 'Handoff resolved and snapshot rebuilt.',
          ingest: ingestOutcome,
          build: buildOutcome
        })
      } catch (err: any) {
        jsonRes(res, 500, { ok: false, error: 'RESOLVE_FAILED', message: err.message })
      }
      return
    }

    // POST /api/local/vault/dismiss-tool
    if (pathName === '/api/local/vault/dismiss-tool' && method === 'POST') {
      try {
        const body = await readJsonBody(req)
        const { path: relPath, familiar } = body
        if (!relPath) {
          jsonRes(res, 400, { ok: false, error: 'BAD_REQUEST', message: 'Tool file path is required.' })
          return
        }

        let fullPath = ''
        if (relPath.endsWith('.md')) {
          const normalized = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '')
          fullPath = path.resolve(VAULT_DIR, normalized)
        } else {
          const filename = `${relPath}.md`
          const searchDir = path.join(VAULT_DIR, '🧰 AI Toolkit')
          const found = await findFileRecursively(searchDir, filename)
          if (!found) {
            jsonRes(res, 404, { ok: false, error: 'FILE_NOT_FOUND', message: `Could not find tool file for name: ${relPath}` })
            return
          }
          fullPath = found
        }

        if (!fullPath.startsWith(VAULT_DIR)) {
          jsonRes(res, 403, { ok: false, error: 'FORBIDDEN', message: 'Path traversal blocked.' })
          return
        }

        const content = await fs.readFile(fullPath, 'utf-8')
        const updates: Record<string, any> = familiar
          ? { familiar: true }
          : { status: 'dismissed' }
        const updatedContent = updateFrontmatter(content, updates)
        await fs.writeFile(fullPath, updatedContent, 'utf-8')

        // Re-sync the snapshot from the vault so the dismissed tool disappears.
        //
        // This used to run the full run_brief.sh: a multi-minute `claude -p` synthesis that
        // also git-pushed main (PUBLISH defaults to 1), from a "dismiss tool" click. The
        // frontmatter write above IS the state change; build.py just re-reads the vault.
        const outcome = await runCommand(`python3 "${VAULT_DIR}/📊 dashboard-ui/build.py"`)

        jsonRes(res, 200, {
          ok: true,
          message: 'Tool dismissed and dashboard snapshot rebuilt.',
          brief: outcome
        })
      } catch (err: any) {
        jsonRes(res, 500, { ok: false, error: 'DISMISS_FAILED', message: err.message })
      }
      return
    }

    if (method !== 'GET') {
      jsonRes(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED', message: 'Only GET is supported.' })
      return
    }

    if (pathName === '/api/digest/reddit' || pathName.startsWith('/api/digest/reddit?')) {
      const qs = new URL(req.url ?? '', 'http://localhost').searchParams
      const feed = qs.get('feed')
      const result = await fetchDigest(feed)
      jsonRes(res, 200, result)
      return
    }

    if (pathName === '/api/local/file' || pathName.startsWith('/api/local/file?')) {
      const qs = new URL(req.url ?? '', 'http://localhost').searchParams
      const rel = qs.get('path')
      const file = await readLocalContent(repoRoot, rel)
      if (!file) {
        jsonRes(res, 404, { ok: false, error: 'NOT_FOUND', message: 'File not found or not allowed.' })
        return
      }
      res.statusCode = 200
      res.setHeader('Content-Type', file.mime)
      res.setHeader('Content-Length', file.body.length)
      res.end(file.body)
      return
    }

    jsonRes(res, 404, { ok: false, error: 'NOT_FOUND', message: 'Unknown dashboard API route.' })
  })
}
