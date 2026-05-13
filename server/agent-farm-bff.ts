/**
 * Agent Farm BFF: Vite dev/preview middleware for `/api/*`.
 * Secrets stay in process.env (loaded via dotenv in vite.config). Never sent to the client bundle.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

import { XMLParser } from 'fast-xml-parser'

import {
  SERVER_DIAGNOSTIC_ENV_ENTRIES,
  classifyEnvPresence,
  type EnvPresence,
} from '../src/lib/diagnostics-env-contract'
import { handleMixingYoutubeAudioPost } from './mixing-youtube-audio'

type Next = () => void

const integrationLastError = {
  google: null as string | null,
  gemini: null as string | null,
  youtube: null as string | null,
  rss: null as string | null,
}

/**
 * Read an API key with user-supplied header precedence.
 *
 * Order:
 *   1. `x-user-key-<envname>` request header (what the user typed into the
 *      dashboard's Settings page, sent via `fetchWithKeys`)
 *   2. `process.env.<envname>` (the traditional `.env.local` value)
 *   3. `''`
 *
 * Keeps user-typed keys local-only — they never leave the dev server.
 */
function pickKey(envName: string, req: IncomingMessage, env: NodeJS.ProcessEnv): string {
  const header = `x-user-key-${envName.toLowerCase().replace(/_/g, '-')}`
  const fromHeader = req.headers[header]
  if (typeof fromHeader === 'string' && fromHeader.trim()) return fromHeader.trim()
  if (Array.isArray(fromHeader) && fromHeader[0]?.trim())  return fromHeader[0]!.trim()
  return env[envName]?.trim() ?? ''
}

/** Effective YouTube data API key — request-aware. */
function youtubeDataKeyForReq(req: IncomingMessage, env: NodeJS.ProcessEnv): string {
  return pickKey('YOUTUBE_API_KEY', req, env) || pickKey('GOOGLE_API_KEY', req, env)
}

export type ConfigStatusResponse = {
  YOUTUBE_API_KEY: boolean
  GEMINI_API_KEY: boolean
  GOOGLE_API_KEY: boolean
  RSS_FEED_URLS: boolean
  /** Dedicated key for Harmony Stack → Client Projects prompt builder (see `/api/harmony/client-projects/build-prompt`). */
  HARMONY_CLIENT_PROJECTS_AI_KEY: boolean
  /** Server-only paths for mixing / YouTube audio (`process.env`, not browser headers). */
  FFMPEG_PATH: boolean
  YT_DLP_PATH: boolean
}

export type YoutubeSearchItem = {
  videoId: string | null
  title: string
  description: string
  channelTitle: string
  publishedAt: string | null
}

export type YoutubeSearchResponse =
  | { ok: true; data: { items: YoutubeSearchItem[] } }
  | { ok: false; error: string; message: string }

export type GeminiPingResponse =
  | { ok: true; data: { modelCount: number; sampleModelNames: string[] } }
  | { ok: false; error: string; message: string }

export type RssItem = {
  title: string
  link: string
  publishedAt: string | null
  feedUrl: string
}

export type RssAggregateResponse =
  | { ok: true; items: RssItem[]; errors?: ReadonlyArray<{ feedUrl: string; message: string }> }
  | { ok: false; error: string; message: string }

type YoutubeChannelData = {
  channelId: string
  title: string
  descriptionPreview: string
  thumbnailUrl: string | null
  subscriberCount: string | null
  videoCount: string | null
  viewCount: string | null
}

export type YoutubeChannelResponse =
  | { ok: true; data: YoutubeChannelData }
  | { ok: false; error: string; message: string }

export type OpenAiPingData = {
  baseUrlUsed: string
  modelSampleIds: string[]
  modelTotal: number | null
}

export type OpenAiPingResponse =
  | { ok: true; data: OpenAiPingData }
  | { ok: false; error: string; message: string }

function jsonRes(res: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', Buffer.byteLength(body))
  res.end(body)
}


function parseRequestUrl(req: IncomingMessage): URL {
  return new URL(req.url ?? '/', 'http://localhost')
}

async function drainRequestBody(req: IncomingMessage): Promise<void> {
  if (req.method?.toUpperCase() !== 'POST' && req.method?.toUpperCase() !== 'PUT' && req.method?.toUpperCase() !== 'PATCH')
    return
  await new Promise<void>((resolve, reject) => {
    req.resume()
    req.on('end', () => resolve())
    req.on('error', reject)
  })
}

async function youtubeSearch(apiKey: string | undefined, qRaw: string | null): Promise<YoutubeSearchResponse> {
  if (!apiKey) {
    return {
      ok: false,
      error: 'MISSING_CONFIG',
      message: 'Set YOUTUBE_API_KEY or GOOGLE_API_KEY (YouTube Data API v3 enabled) in .env and restart dev.',
    }
  }
  const q = typeof qRaw === 'string' ? qRaw.trim() : ''
  if (!q) {
    return { ok: false, error: 'BAD_REQUEST', message: 'Missing query parameter q.' }
  }

  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    maxResults: '8',
    q,
    key: apiKey,
  })

  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`)
    const payload = res.ok ? ((await res.json()) as YoutubeSearchJson) : null
    if (!res.ok) {
      const errMsg =
        typeof payload?.error?.message === 'string' ? payload.error.message : `YouTube HTTP ${res.status}`
      return { ok: false, error: 'UPSTREAM', message: errMsg.slice(0, 400) }
    }

    const raw = payload?.items
    const itemsIn = Array.isArray(raw) ? raw : []
    const items: YoutubeSearchItem[] = itemsIn.map(it => {
      const vid = typeof it.id === 'object' && it.id && typeof it.id.videoId === 'string' ? it.id.videoId : null
      const sn = it.snippet
      return {
        videoId: vid,
        title: typeof sn?.title === 'string' ? sn.title : '(untitled)',
        description: typeof sn?.description === 'string' ? sn.description : '',
        channelTitle: typeof sn?.channelTitle === 'string' ? sn.channelTitle : '',
        publishedAt: typeof sn?.publishedAt === 'string' ? sn.publishedAt : null,
      }
    })

    return { ok: true, data: { items } }
  } catch {
    return { ok: false, error: 'NETWORK', message: 'Could not reach YouTube Data API.' }
  }
}

type YoutubeSearchJson = {
  items?: ReadonlyArray<{
    id?: { videoId?: string } | string
    snippet?: {
      title?: string
      description?: string
      channelTitle?: string
      publishedAt?: string
    }
  }>
  error?: { message?: string }
}

type YoutubeChannelsListJson = {
  items?: ReadonlyArray<{
    id?: string
    snippet?: {
      title?: string
      description?: string
      thumbnails?: { high?: { url?: string }; medium?: { url?: string } }
    }
    statistics?: {
      subscriberCount?: string
      videoCount?: string
      viewCount?: string
    }
  }>
  error?: { message?: string }
}

function mapYoutubeChannelItem(
  item: NonNullable<YoutubeChannelsListJson['items']>[number],
): YoutubeChannelData | null {
  const sn = item?.snippet
  if (!item?.id || !sn) return null
  const desc = typeof sn.description === 'string' ? sn.description : ''
  const descriptionPreview = desc.length <= 260 ? desc : `${desc.slice(0, 257)}…`
  const thumb =
    typeof sn.thumbnails?.high?.url === 'string'
      ? sn.thumbnails.high.url
      : typeof sn.thumbnails?.medium?.url === 'string'
        ? sn.thumbnails.medium.url
        : null
  const st = item.statistics
  return {
    channelId: item.id,
    title: typeof sn.title === 'string' ? sn.title : '(untitled)',
    descriptionPreview,
    thumbnailUrl: thumb,
    subscriberCount: typeof st?.subscriberCount === 'string' ? st.subscriberCount : null,
    videoCount: typeof st?.videoCount === 'string' ? st.videoCount : null,
    viewCount: typeof st?.viewCount === 'string' ? st.viewCount : null,
  }
}

async function youtubeChannelById(apiKey: string | undefined, channelId: string | undefined): Promise<YoutubeChannelResponse> {
  if (!apiKey) {
    return {
      ok: false,
      error: 'MISSING_CONFIG',
      message: 'Set YOUTUBE_API_KEY or GOOGLE_API_KEY. Restart dev.',
    }
  }
  if (!channelId) {
    return {
      ok: false,
      error: 'MISSING_CONFIG',
      message: 'Set AGENT_FARM_YOUTUBE_CHANNEL_ID or use ?handle= on /api/youtube/channel.',
    }
  }
  const params = new URLSearchParams({ part: 'snippet,statistics', id: channelId, key: apiKey })
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params}`)
    const payload = res.ok ? ((await res.json()) as YoutubeChannelsListJson) : null
    if (!res.ok) {
      const errMsg =
        typeof payload?.error?.message === 'string' ? payload.error.message : `YouTube HTTP ${res.status}`
      return { ok: false, error: 'UPSTREAM', message: errMsg.slice(0, 400) }
    }
    const item = payload?.items?.[0]
    const mapped = item ? mapYoutubeChannelItem(item) : null
    if (!mapped) {
      return { ok: false, error: 'BAD_REQUEST', message: `No channel for id="${channelId}".` }
    }
    return { ok: true, data: mapped }
  } catch {
    return { ok: false, error: 'NETWORK', message: 'Could not reach YouTube Data API.' }
  }
}

async function youtubeChannelByHandle(apiKey: string | undefined, handleRaw: string): Promise<YoutubeChannelResponse> {
  if (!apiKey) {
    return {
      ok: false,
      error: 'MISSING_CONFIG',
      message: 'Set YOUTUBE_API_KEY or GOOGLE_API_KEY.',
    }
  }
  const h = handleRaw.replace(/^@/, '').trim()
  if (!h) {
    return { ok: false, error: 'BAD_REQUEST', message: 'Missing or empty handle query param.' }
  }
  const params = new URLSearchParams({ part: 'snippet,statistics', forHandle: h, key: apiKey })
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params}`)
    const payload = res.ok ? ((await res.json()) as YoutubeChannelsListJson) : null
    if (!res.ok) {
      const errMsg =
        typeof payload?.error?.message === 'string' ? payload.error.message : `YouTube HTTP ${res.status}`
      return { ok: false, error: 'UPSTREAM', message: errMsg.slice(0, 400) }
    }
    const item = payload?.items?.[0]
    const mapped = item ? mapYoutubeChannelItem(item) : null
    if (!mapped) {
      return { ok: false, error: 'BAD_REQUEST', message: `No channel for handle="${h}".` }
    }
    return { ok: true, data: mapped }
  } catch {
    return { ok: false, error: 'NETWORK', message: 'Could not reach YouTube Data API.' }
  }
}

async function geminiPing(apiKey?: string): Promise<GeminiPingResponse> {
  if (!apiKey?.trim()) {
    return {
      ok: false,
      error: 'MISSING_CONFIG',
      message: 'Add GEMINI_API_KEY to .env (server-only). Restart dev.',
    }
  }

  const key = apiKey.trim()
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`
    const res = await fetch(url)
    if (!res.ok) {
      const text = await res.text()
      let msg = `Gemini HTTP ${res.status}`
      try {
        const j = JSON.parse(text) as { error?: { message?: string } }
        if (typeof j?.error?.message === 'string') msg = j.error.message
      } catch {
        if (text) msg = text.slice(0, 400)
      }
      return { ok: false, error: 'UPSTREAM', message: msg.slice(0, 400) }
    }

    const body = (await res.json()) as { models?: ReadonlyArray<{ name?: string }> }
    const models = Array.isArray(body?.models) ? body.models : []
    const names = models
      .map(m => (typeof m?.name === 'string' ? m.name.split('/').pop() ?? m.name : ''))
      .filter(Boolean)
      .slice(0, 8)

    return {
      ok: true,
      data: {
        modelCount: models.length,
        sampleModelNames: names,
      },
    }
  } catch {
    return { ok: false, error: 'NETWORK', message: 'Could not reach Generative Language API.' }
  }
}

function normalizeOpenAiBase(raw: string | undefined): string {
  const fallback = 'https://api.openai.com/v1'
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  if (!trimmed) return fallback

  let base = trimmed.replace(/\/+$/, '')
  if (!base.endsWith('/v1')) base = `${base}/v1`

  try {
    new URL(base)
    return base
  } catch {
    return fallback
  }
}

async function openAiPing(apiKey?: string, baseUrlRaw?: string): Promise<OpenAiPingResponse> {
  if (!apiKey?.trim()) {
    return {
      ok: false,
      error: 'MISSING_CONFIG',
      message:
        'Add OPENAI_API_KEY to .env. For Azure/OpenRouter, set OPENAI_BASE_URL.',
    }
  }

  const base = normalizeOpenAiBase(baseUrlRaw)
  try {
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
    })

    if (!res.ok) {
      const text = await res.text()
      let msg = `OpenAI-compatible HTTP ${res.status}`
      try {
        const j = JSON.parse(text) as { error?: { message?: string } | string | undefined }
        if (typeof j?.error === 'object' && j.error && typeof j.error.message === 'string') msg = j.error.message
      } catch {
        if (text) msg = text.slice(0, 400)
      }
      return { ok: false, error: 'UPSTREAM', message: msg.slice(0, 400) }
    }

    const body = (await res.json()) as { data?: ReadonlyArray<{ id?: string }> }
    const ids = Array.isArray(body?.data)
      ? body.data.map(d => (typeof d.id === 'string' ? d.id : '')).filter(Boolean)
      : []

    return {
      ok: true,
      data: {
        baseUrlUsed: base,
        modelSampleIds: ids.slice(0, 8),
        modelTotal: ids.length > 0 ? ids.length : null,
      },
    }
  } catch {
    return { ok: false, error: 'NETWORK', message: 'Could not reach OpenAI-compatible /models.' }
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw.trim()) return {}
  return JSON.parse(raw) as unknown
}

async function geminiGenerate(
  apiKey: string | undefined,
  body: unknown,
): Promise<{ ok: true; preview: string | null; model: string } | { ok: false; error: string; message: string }> {
  if (!apiKey?.trim()) {
    return { ok: false, error: 'MISSING_CONFIG', message: 'Set GEMINI_API_KEY.' }
  }
  const key = apiKey.trim()
  const promptRaw =
    body && typeof body === 'object' && 'prompt' in body && typeof (body as { prompt?: unknown }).prompt === 'string'
      ? (body as { prompt: string }).prompt.trim()
      : ''
  const prompt = promptRaw || 'Say hello in one short sentence.'
  let maxOutputTokens = 64
  if (body && typeof body === 'object' && 'maxOutputTokens' in body) {
    const raw = (body as { maxOutputTokens?: unknown }).maxOutputTokens
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (Number.isFinite(n)) maxOutputTokens = Math.min(512, Math.max(16, Math.floor(n)))
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens, temperature: 0.4 },
      }),
    })
    const text = await res.text()
    if (!res.ok) {
      return { ok: false, error: 'UPSTREAM', message: text.slice(0, 400) }
    }
    let parsed: { candidates?: ReadonlyArray<{ content?: { parts?: ReadonlyArray<{ text?: string }> } }> }
    try {
      parsed = JSON.parse(text) as {
        candidates?: ReadonlyArray<{ content?: { parts?: ReadonlyArray<{ text?: string }> } }>
      }
    } catch {
      return { ok: false, error: 'UPSTREAM', message: 'Invalid JSON from Gemini.' }
    }
    const preview =
      parsed.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text)
        .filter(Boolean)
        .join('') ?? null
    return { ok: true, preview, model: 'gemini-2.0-flash' }
  } catch {
    return { ok: false, error: 'NETWORK', message: 'Could not reach Gemini generateContent.' }
  }
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
})

function parseLinkField(link: unknown): string {
  if (typeof link === 'string') return link.trim()
  if (link && typeof link === 'object') {
    const o = link as { '#text'?: string; '@_href'?: string }
    if (typeof o['#text'] === 'string') return o['#text'].trim()
    if (typeof o['@_href'] === 'string') return o['@_href'].trim()
  }
  return ''
}

function extractRssItems(parsed: unknown, feedUrl: string): RssItem[] {
  const out: RssItem[] = []

  const asObj = parsed as {
    rss?: { channel?: { item?: unknown } }
    feed?: { entry?: unknown }
  }

  // RSS 2.0
  const channelItems = asObj.rss?.channel?.item
  if (channelItems) {
    const list = Array.isArray(channelItems) ? channelItems : [channelItems]
    for (const it of list) {
      const row = it as Record<string, unknown>
      const titleRaw = parseRssTitle(row.title)
      const t = titleRaw.trim() ? titleRaw.trim() : '(untitled)'
      const link = parseLinkField(row.link)
      const lnk = link || feedUrl
      const pub =
        typeof row.pubDate === 'string'
          ? row.pubDate
          : typeof row['dc:date'] === 'string'
            ? (row['dc:date'] as string)
            : null
      out.push({ title: t, link: lnk, publishedAt: pub, feedUrl })
    }
    return out
  }

  // Atom
  const entries = asObj.feed?.entry
  if (entries) {
    const list = Array.isArray(entries) ? entries : [entries]
    for (const ent of list) {
      const row = ent as Record<string, unknown>
      const title = parseRssTitle(row.title).trim() || '(untitled)'
      let link = feedUrl
      const linkRaw = row.link
      if (Array.isArray(linkRaw)) {
        const withHref = linkRaw.find(l => typeof l === 'object' && l && '@_href' in (l as object)) as
          | { '@_href'?: string }
          | undefined
        if (withHref && typeof withHref['@_href'] === 'string') link = withHref['@_href']
      } else if (typeof linkRaw === 'string' && linkRaw.trim()) {
        link = linkRaw.trim()
      } else if (linkRaw && typeof linkRaw === 'object' && '@_href' in linkRaw) {
        const h = (linkRaw as { '@_href'?: string })['@_href']
        if (typeof h === 'string') link = h
      } else {
        const lf = parseLinkField(linkRaw)
        if (lf) link = lf
      }
      const pub =
        typeof row.published === 'string'
          ? row.published
          : typeof row.updated === 'string'
            ? row.updated
            : null
      out.push({ title, link: link || feedUrl, publishedAt: pub, feedUrl })
    }
  }

  return out
}

function parseRssTitle(t: unknown): string {
  if (typeof t === 'string') return t
  if (t && typeof t === 'object' && '#text' in t) return String((t as { '#text': unknown })['#text'] ?? '')
  return ''
}

async function aggregateRss(env: NodeJS.ProcessEnv, opts?: { onlyUrl?: string | null }): Promise<RssAggregateResponse> {
  const raw = env.RSS_FEED_URLS?.trim()
  if (!raw) {
    return {
      ok: false,
      error: 'MISSING_CONFIG',
      message: 'Set RSS_FEED_URLS in .env (comma-separated feed URLs). Restart dev.',
    }
  }

  let urls = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  if (urls.length === 0) {
    return { ok: false, error: 'BAD_REQUEST', message: 'RSS_FEED_URLS has no URLs after parsing.' }
  }

  const only = opts?.onlyUrl?.trim()
  if (only) {
    if (!urls.includes(only)) {
      return {
        ok: false,
        error: 'FORBIDDEN',
        message: 'url must exactly match an entry in RSS_FEED_URLS (or omit url to fetch all).',
      }
    }
    urls = [only]
  }

  const all: RssItem[] = []
  const errors: Array<{ feedUrl: string; message: string }> = []

  for (const feedUrl of urls) {
    try {
      const res = await fetch(feedUrl, { headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*' } })
      if (!res.ok) {
        errors.push({ feedUrl, message: `HTTP ${res.status}` })
        continue
      }
      const xml = await res.text()
      let parsed: unknown
      try {
        parsed = xmlParser.parse(xml)
      } catch (e) {
        errors.push({ feedUrl, message: e instanceof Error ? e.message : 'XML parse error' })
        continue
      }
      const items = extractRssItems(parsed, feedUrl)
      all.push(...items)
    } catch (e) {
      errors.push({
        feedUrl,
        message: e instanceof Error ? e.message : 'Network error',
      })
    }
  }

  const parseTime = (s: string | null): number => {
    if (!s) return 0
    const d = Date.parse(s)
    return Number.isFinite(d) ? d : 0
  }

  all.sort((a, b) => parseTime(b.publishedAt) - parseTime(a.publishedAt))

  return { ok: true, items: all, errors: errors.length > 0 ? errors : undefined }
}

export function attachAgentFarmBff(
  middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: Next) => void) => void },
  env = process.env,
) {
  middlewares.use(async (req, res, next) => {
    const u = parseRequestUrl(req)
    const path = u.pathname
    const method = (req.method ?? 'GET').toUpperCase()

    if (!path.startsWith('/api/')) {
      next()
      return
    }

    if (method === 'GET' && path === '/api/health') {
      jsonRes(res, 200, { ok: true })
      return
    }

    /** Booleans / presence labels only — allowlisted keys from `diagnostics-env-contract.ts`. */
    if (method === 'GET' && path === '/api/diagnostics/env-keys') {
      const server: Record<string, EnvPresence> = {}
      for (const e of SERVER_DIAGNOSTIC_ENV_ENTRIES) {
        server[e.envKey] = classifyEnvPresence(pickKey(e.envKey, req, env))
      }
      jsonRes(res, 200, { server })
      return
    }

    if (method === 'GET' && path === '/api/integrations/status') {
      // `configured` = env OR user-typed key from the Settings page.
      const googleKey  = pickKey('GOOGLE_API_KEY',  req, env)
      const geminiKey  = pickKey('GEMINI_API_KEY',  req, env)
      const youtubeKey = pickKey('YOUTUBE_API_KEY', req, env)
      const rssRaw     = pickKey('RSS_FEED_URLS',   req, env)
      const feedCount = rssRaw
        ? rssRaw.split(',').map(s => s.trim()).filter(Boolean).length
        : 0
      jsonRes(res, 200, {
        googleApi: {
          configured: Boolean(googleKey),
          lastError: integrationLastError.google,
          note: 'Generic Google API key. YouTube prefers YOUTUBE_API_KEY then falls back to GOOGLE_API_KEY. Gemini uses GEMINI_API_KEY (often distinct from GCP console keys).',
        },
        gemini:  { configured: Boolean(geminiKey),  lastError: integrationLastError.gemini },
        youtube: { configured: Boolean(youtubeKey) || Boolean(googleKey), lastError: integrationLastError.youtube },
        rss:     { configured: feedCount > 0, feedCount, lastError: integrationLastError.rss },
      })
      return
    }

    if (method === 'GET' && path === '/api/google/health') {
      const googleKey = pickKey('GOOGLE_API_KEY', req, env)
      if (!googleKey) {
        integrationLastError.google = 'missing_GOOGLE_API_KEY'
        jsonRes(res, 200, {
          ok: false,
          configured: false,
          error: 'MISSING_CONFIG',
          message: 'Set GOOGLE_API_KEY for generic Google API access.',
        })
        return
      }
      integrationLastError.google = null
      jsonRes(res, 200, { ok: true, configured: true })
      return
    }

    if (method === 'GET' && path === '/api/gemini/health') {
      const result = await geminiPing(pickKey('GEMINI_API_KEY', req, env))
      if (result.ok) integrationLastError.gemini = null
      else integrationLastError.gemini = result.message.slice(0, 200)
      jsonRes(res, 200, result)
      return
    }

    if (method === 'POST' && path === '/api/gemini/generate') {
      let parsed: unknown
      try {
        parsed = await readJsonBody(req)
      } catch {
        jsonRes(res, 400, { ok: false, error: 'BAD_REQUEST', message: 'Invalid JSON body.' })
        return
      }
      const result = await geminiGenerate(pickKey('GEMINI_API_KEY', req, env), parsed)
      if (result.ok) {
        integrationLastError.gemini = null
        jsonRes(res, 200, result)
      } else {
        integrationLastError.gemini = result.message.slice(0, 200)
        jsonRes(res, 502, result)
      }
      return
    }

    if (method === 'GET' && path === '/api/youtube/channel') {
      const handle = u.searchParams.get('handle')?.trim() ?? ''
      const key = youtubeDataKeyForReq(req, env)
      const channelId = pickKey('AGENT_FARM_YOUTUBE_CHANNEL_ID', req, env)
      const result = handle
        ? await youtubeChannelByHandle(key, handle)
        : await youtubeChannelById(key, channelId || undefined)
      if (result.ok) integrationLastError.youtube = null
      else integrationLastError.youtube = result.message.slice(0, 200)
      jsonRes(res, 200, result)
      return
    }

    if (method === 'GET' && path === '/api/config/status') {
      // Each flag is true if EITHER the env or the user-typed key is set.
      const body: ConfigStatusResponse = {
        YOUTUBE_API_KEY: Boolean(pickKey('YOUTUBE_API_KEY', req, env)),
        GEMINI_API_KEY:  Boolean(pickKey('GEMINI_API_KEY',  req, env)),
        GOOGLE_API_KEY:  Boolean(pickKey('GOOGLE_API_KEY',  req, env)),
        RSS_FEED_URLS:   Boolean(pickKey('RSS_FEED_URLS',   req, env)),
        HARMONY_CLIENT_PROJECTS_AI_KEY: Boolean(pickKey('HARMONY_CLIENT_PROJECTS_AI_KEY', req, env)),
        FFMPEG_PATH: Boolean(env.FFMPEG_PATH?.trim()),
        YT_DLP_PATH: Boolean(env.YT_DLP_PATH?.trim()),
      }
      jsonRes(res, 200, body)
      return
    }

    if (method === 'GET' && path === '/api/harmony/client-projects/ai-health') {
      const harmony = pickKey('HARMONY_CLIENT_PROJECTS_AI_KEY', req, env)
      const gemini = pickKey('GEMINI_API_KEY', req, env)
      const source: 'harmony' | 'gemini' | 'none' = harmony
        ? 'harmony'
        : gemini
          ? 'gemini'
          : 'none'
      jsonRes(res, 200, {
        ok: true,
        configured: Boolean(harmony || gemini),
        source,
      })
      return
    }

    if (method === 'POST' && path === '/api/harmony/client-projects/build-prompt') {
      let parsed: unknown
      try {
        parsed = await readJsonBody(req)
      } catch {
        jsonRes(res, 400, { ok: false, error: 'BAD_REQUEST', message: 'Invalid JSON body.' })
        return
      }
      const apiKey =
        pickKey('HARMONY_CLIENT_PROJECTS_AI_KEY', req, env) || pickKey('GEMINI_API_KEY', req, env)
      if (!apiKey.trim()) {
        jsonRes(res, 502, {
          ok: false,
          error: 'MISSING_CONFIG',
          message: 'Set HARMONY_CLIENT_PROJECTS_AI_KEY or GEMINI_API_KEY.',
        })
        return
      }
      const result = await geminiGenerate(apiKey, parsed)
      if (result.ok) {
        jsonRes(res, 200, result)
      } else {
        jsonRes(res, 502, result)
      }
      return
    }

    if (method === 'GET' && path === '/api/youtube/search') {
      const q = u.searchParams.get('q')
      const result = await youtubeSearch(youtubeDataKeyForReq(req, env), q)
      if (result.ok) integrationLastError.youtube = null
      else integrationLastError.youtube = result.message.slice(0, 200)
      jsonRes(res, 200, result)
      return
    }

    if (method === 'GET' && path === '/api/openai/ping') {
      const result = await openAiPing(
        pickKey('OPENAI_API_KEY',  req, env),
        pickKey('OPENAI_BASE_URL', req, env) || undefined,
      )
      jsonRes(res, 200, result)
      return
    }

    if (method === 'POST' && path === '/api/gemini/ping') {
      await drainRequestBody(req)
      const result = await geminiPing(pickKey('GEMINI_API_KEY', req, env))
      if (result.ok) integrationLastError.gemini = null
      else integrationLastError.gemini = result.message.slice(0, 200)
      jsonRes(res, 200, result)
      return
    }

    /**
     * Canonical unified entry point for all YouTube media operations.
     *
     * Single POST takes `{ mode, q?, channelId?, videoId?, handle? }` and dispatches
     * to the same named helpers the legacy routes use (`youtubeSearch`,
     * `youtubeChannelById` / `youtubeChannelByHandle`, `handleMixingYoutubeAudioPost`)
     * — no logic is duplicated.
     *
     * The legacy routes (`GET /api/youtube/search`, `GET /api/youtube/channel`,
     * `POST /api/mixing/youtube-audio`) are retained for backward compatibility;
     * consumers will migrate to this alias gradually.
     */
    if (method === 'POST' && path === '/api/media/youtube') {
      let parsed: unknown
      try {
        parsed = await readJsonBody(req)
      } catch {
        jsonRes(res, 400, { ok: false, error: 'BAD_REQUEST', message: 'Invalid JSON body.' })
        return
      }
      const body = (parsed && typeof parsed === 'object' ? parsed : {}) as {
        mode?: unknown
        q?: unknown
        channelId?: unknown
        handle?: unknown
        videoId?: unknown
        url?: unknown
      }
      const mode = typeof body.mode === 'string' ? body.mode.trim() : ''

      if (mode === 'search') {
        const q = typeof body.q === 'string' ? body.q : null
        const result = await youtubeSearch(youtubeDataKeyForReq(req, env), q)
        if (result.ok) integrationLastError.youtube = null
        else integrationLastError.youtube = result.message.slice(0, 200)
        jsonRes(res, 200, result)
        return
      }

      if (mode === 'channel') {
        const key = youtubeDataKeyForReq(req, env)
        const handle = typeof body.handle === 'string' ? body.handle.trim() : ''
        const channelId =
          typeof body.channelId === 'string' && body.channelId.trim()
            ? body.channelId.trim()
            : pickKey('AGENT_FARM_YOUTUBE_CHANNEL_ID', req, env)
        const result = handle
          ? await youtubeChannelByHandle(key, handle)
          : await youtubeChannelById(key, channelId || undefined)
        if (result.ok) integrationLastError.youtube = null
        else integrationLastError.youtube = result.message.slice(0, 200)
        jsonRes(res, 200, result)
        return
      }

      if (mode === 'download') {
        // The download handler reads `{ url }` from the body, so synthesise a
        // body-bearing request that wraps either an incoming `url` field or a
        // `videoId` shorthand. We delegate to the existing exported handler so
        // there is no duplication of yt-dlp / yt2mp3 logic.
        const url =
          typeof body.url === 'string' && body.url.trim()
            ? body.url.trim()
            : typeof body.videoId === 'string' && body.videoId.trim()
              ? `https://www.youtube.com/watch?v=${body.videoId.trim()}`
              : ''
        if (!url) {
          jsonRes(res, 400, {
            ok: false,
            error: 'MISSING_URL',
            message: 'Send { mode: "download", url | videoId }.',
          })
          return
        }
        const payload = Buffer.from(JSON.stringify({ url }), 'utf8')
        const proxyReq = Object.create(req) as IncomingMessage & {
          headers: NodeJS.Dict<string | string[]>
        }
        proxyReq.headers = { ...req.headers, 'content-type': 'application/json' }
        let yielded = false
        const iter = (async function* () {
          if (yielded) return
          yielded = true
          yield payload
        })()
        ;(proxyReq as unknown as { [Symbol.asyncIterator]: () => AsyncIterator<Buffer> })[
          Symbol.asyncIterator
        ] = () => iter
        await handleMixingYoutubeAudioPost(proxyReq, res)
        return
      }

      jsonRes(res, 400, {
        ok: false,
        error: 'BAD_REQUEST',
        message: 'mode must be "search" | "channel" | "download".',
      })
      return
    }

    if (method === 'GET' && path === '/api/rss') {
      const limitRaw = u.searchParams.get('limit')
      const limit = Math.min(100, Math.max(1, limitRaw ? Number.parseInt(limitRaw, 10) || 30 : 30))
      const onlyUrl = u.searchParams.get('url')
      // Pass an env-like overlay so aggregateRss() sees the per-request RSS feeds.
      const reqRssFeeds = pickKey('RSS_FEED_URLS', req, env)
      const envOverlay = reqRssFeeds
        ? { ...env, RSS_FEED_URLS: reqRssFeeds } as NodeJS.ProcessEnv
        : env
      const result = await aggregateRss(envOverlay, { onlyUrl })
      if (!result.ok) {
        integrationLastError.rss = result.message.slice(0, 200)
        jsonRes(res, 200, result)
        return
      }
      integrationLastError.rss = null
      const sliced = { ...result, items: result.items.slice(0, limit) }
      jsonRes(res, 200, sliced)
      return
    }

    jsonRes(res, 404, { ok: false, error: 'NOT_FOUND', message: 'Unknown API route.' })
  })
}
