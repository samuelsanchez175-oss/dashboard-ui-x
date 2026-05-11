/**
 * Agent Farm BFF: Vite dev/preview middleware for `/api/*`.
 * Secrets stay in process.env (loaded via dotenv in vite.config). Never sent to the client bundle.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

import { XMLParser } from 'fast-xml-parser'

type Next = () => void

const integrationLastError = {
  google: null as string | null,
  gemini: null as string | null,
  youtube: null as string | null,
  rss: null as string | null,
}

export type ConfigStatusResponse = {
  YOUTUBE_API_KEY: boolean
  GEMINI_API_KEY: boolean
  GOOGLE_API_KEY: boolean
  RSS_FEED_URLS: boolean
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

function envBool(v: string | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0
}

function youtubeDataKey(env: NodeJS.ProcessEnv): string | undefined {
  const y = env.YOUTUBE_API_KEY?.trim()
  const g = env.GOOGLE_API_KEY?.trim()
  return y && y.length > 0 ? y : g && g.length > 0 ? g : undefined
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

    if (method === 'GET' && path === '/api/integrations/status') {
      const feedCount = env.RSS_FEED_URLS
        ? env.RSS_FEED_URLS.split(',')
            .map(s => s.trim())
            .filter(Boolean).length
        : 0
      jsonRes(res, 200, {
        googleApi: {
          configured: envBool(env.GOOGLE_API_KEY),
          lastError: integrationLastError.google,
          note: 'Generic Google API key. YouTube prefers YOUTUBE_API_KEY then falls back to GOOGLE_API_KEY. Gemini uses GEMINI_API_KEY (often distinct from GCP console keys).',
        },
        gemini: { configured: envBool(env.GEMINI_API_KEY), lastError: integrationLastError.gemini },
        youtube: {
          configured: envBool(env.YOUTUBE_API_KEY) || envBool(env.GOOGLE_API_KEY),
          lastError: integrationLastError.youtube,
        },
        rss: {
          configured: feedCount > 0,
          feedCount,
          lastError: integrationLastError.rss,
        },
      })
      return
    }

    if (method === 'GET' && path === '/api/google/health') {
      if (!envBool(env.GOOGLE_API_KEY)) {
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
      const result = await geminiPing(env.GEMINI_API_KEY)
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
      const result = await geminiGenerate(env.GEMINI_API_KEY, parsed)
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
      const key = youtubeDataKey(env)
      const result = handle
        ? await youtubeChannelByHandle(key, handle)
        : await youtubeChannelById(key, env.AGENT_FARM_YOUTUBE_CHANNEL_ID?.trim())
      if (result.ok) integrationLastError.youtube = null
      else integrationLastError.youtube = result.message.slice(0, 200)
      jsonRes(res, 200, result)
      return
    }

    if (method === 'GET' && path === '/api/config/status') {
      const body: ConfigStatusResponse = {
        YOUTUBE_API_KEY: envBool(env.YOUTUBE_API_KEY),
        GEMINI_API_KEY: envBool(env.GEMINI_API_KEY),
        GOOGLE_API_KEY: envBool(env.GOGLE_API_KEY),
        RSS_FEED_URLS: envBool(env.RSS_FEED_URLS),
      }
      jsonRes(res, 200, body)
      return
    }

    if (method === 'GET' && path === '/api/youtube/search') {
      const q = u.searchParams.get('q')
      const result = await youtubeSearch(youtubeDataKey(env), q)
      if (result.ok) integrationLastError.youtube = null
      else integrationLastError.youtube = result.message.slice(0, 200)
      jsonRes(res, 200, result)
      return
    }

    if (method === 'GET' && path === '/api/openai/ping') {
      const result = await openAiPing(env.OPENAI_API_KEY, env.OPENAI_BASE_URL)
      jsonRes(res, 200, result)
      return
    }

    if (method === 'POST' && path === '/api/gemini/ping') {
      await drainRequestBody(req)
      const result = await geminiPing(env.GEMINI_API_KEY)
      if (result.ok) integrationLastError.gemini = null
      else integrationLastError.gemini = result.message.slice(0, 200)
      jsonRes(res, 200, result)
      return
    }

    if (method === 'GET' && path === '/api/rss') {
      const limitRaw = u.searchParams.get('limit')
      const limit = Math.min(100, Math.max(1, limitRaw ? Number.parseInt(limitRaw, 10) || 30 : 30))
      const onlyUrl = u.searchParams.get('url')
      const result = await aggregateRss(env, { onlyUrl })
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
