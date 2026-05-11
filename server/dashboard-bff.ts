/**
 * Dev-only BFF: Reddit RSS proxy (avoids browser CORS) and safe reads from repo `content/`.
 * Registered before other /api handlers in Vite.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { handleMixingYoutubeAudioPost } from './mixing-youtube-audio'

type Next = () => void

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
