/**
 * Mirrors the browser flow used by yt2mp3.gs (epsiloncloud.org endpoints).
 * Prefer env YOUTUBE_AUDIO_BACKEND=auto|yt2mp3|ytdlp — this module backs yt2mp3/auto.
 */

type EmbedJson = unknown[]

function extractEmbedJson(html: string): EmbedJson {
  const needle = "JSON.parse('"
  const idx = html.indexOf(needle)
  if (idx === -1) {
    throw new Error('YT2MP3_EMBED_MISSING')
  }
  let i = idx + needle.length
  let out = ''
  let escaped = false
  for (; i < html.length; i++) {
    const c = html[i]!
    if (escaped) {
      out += c
      escaped = false
      continue
    }
    if (c === '\\') {
      escaped = true
      continue
    }
    if (c === "'") break
    out += c
  }
  return JSON.parse(out) as EmbedJson
}

function authorization(embed: EmbedJson): string {
  const cipher = embed[0] as number[]
  const reverseFlag = embed[1] as number
  const subs = embed[2] as number[]
  let e = ''
  for (let t = 0; t < cipher.length; t++) {
    e += String.fromCharCode(cipher[t]! - subs[subs.length - (t + 1)]!)
  }
  if (reverseFlag) {
    e = e.split('').reverse().join('')
  }
  return e.length > 32 ? e.substring(0, 32) : e
}

function embedInitQueryKey(embed: EmbedJson): string {
  const code = embed[6]
  if (typeof code !== 'number') {
    throw new Error('YT2MP3_EMBED_BAD_KEY')
  }
  return String.fromCharCode(code)
}

function stripTrailingVideoParams(url: string): string {
  const at = url.indexOf('&v=')
  return at === -1 ? url : url.slice(0, at)
}

function buildConvertUrl(convertBase: string, videoId: string, format: 'mp3'): string {
  const ts = Math.floor(Date.now() / 1000)
  const stem = stripTrailingVideoParams(convertBase)
  return `${stem}&v=${encodeURIComponent(videoId)}&f=${format}&t=${ts}`
}

function yt2Mp3BrowserHeaders(): Record<string, string> {
  return {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://yt2mp3.gs/',
    Origin: 'https://yt2mp3.gs',
  }
}

async function fetchJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, init)
  const txt = await res.text()
  if (!txt.trim()) {
    throw new Error(`EMPTY_RESPONSE:${res.status}`)
  }
  try {
    return JSON.parse(txt) as Record<string, unknown>
  } catch {
    throw new Error(`BAD_JSON:${res.status}:${txt.slice(0, 180)}`)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function looksLikeMp3(buf: Buffer): boolean {
  if (buf.length < 4) return false
  // ID3 tag or MPEG frame sync (approximate)
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true
  if (buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0) return true
  return false
}

export async function tryYoutubeMp3WithYt2Mp3Gs(
  videoId: string,
  opts?: { pollMs?: number; pollCap?: number },
): Promise<
  | { ok: true; buffer: Buffer; title: string; videoId: string }
  | { ok: false; code: string; message: string }
> {
  const pollMs = opts?.pollMs ?? 1500
  const pollCap = opts?.pollCap ?? 80
  const headers = yt2Mp3BrowserHeaders()

  try {
    const home = await fetch('https://yt2mp3.gs/', { headers })
    const html = await home.text()
    const embed = extractEmbedJson(html)
    if (!Array.isArray(embed) || embed.length < 7) {
      return { ok: false, code: 'YT2MP3_EMBED_BAD', message: 'Unexpected embed payload from yt2mp3.gs.' }
    }

    const token = authorization(embed)
    const key = embedInitQueryKey(embed)
    const tsInit = Math.floor(Date.now() / 1000)
    const initUrl = `https://epsilon.epsiloncloud.org/api/v1/init?${encodeURIComponent(key)}=${encodeURIComponent(token)}&t=${tsInit}`
    const init = await fetchJson(initUrl, { headers })
    const convertURLRaw = init.convertURL
    if (typeof convertURLRaw !== 'string' || !convertURLRaw.startsWith('http')) {
      return { ok: false, code: 'YT2MP3_INIT_BAD', message: 'Init response missing convertURL.' }
    }

    let convertTarget = convertURLRaw
    let guard = 0
    while (guard++ < 6) {
      const convUrl = buildConvertUrl(convertTarget, videoId, 'mp3')
      const conv = await fetchJson(convUrl, { headers })
      const err = Number(conv.error ?? 0)
      if (err > 0) {
        return {
          ok: false,
          code: 'YT2MP3_CONVERT_ERR',
          message: `Converter reported error ${String(conv.error)}.`,
        }
      }
      const redirect = Number(conv.redirect ?? 0)
      const next = conv.redirectURL
      if (redirect === 1 && typeof next === 'string' && next.startsWith('http')) {
        convertTarget = next
        continue
      }

      const progressURL = conv.progressURL
      const downloadURL = conv.downloadURL
      if (typeof progressURL !== 'string' || !progressURL.startsWith('http')) {
        return { ok: false, code: 'YT2MP3_NO_PROGRESS', message: 'No progress URL after convert.' }
      }
      if (typeof downloadURL !== 'string' || !downloadURL.startsWith('http')) {
        return { ok: false, code: 'YT2MP3_NO_DOWNLOAD', message: 'No download URL after convert.' }
      }

      let title = typeof conv.title === 'string' ? conv.title.trim() : ''
      let polls = 0
      while (polls++ < pollCap) {
        const ts = Math.floor(Date.now() / 1000)
        const progUrl = `${progressURL}&t=${ts}`
        const pj = await fetchJson(progUrl, { headers })
        const pErr = Number(pj.error ?? 0)
        if (pErr > 0) {
          return {
            ok: false,
            code: 'YT2MP3_PROGRESS_ERR',
            message: `Progress error ${String(pj.error)}.`,
          }
        }
        if (typeof pj.title === 'string' && pj.title.trim()) {
          title = pj.title.trim()
        }
        const prog = Number(pj.progress ?? 0)
        if (prog >= 3) break
        await sleep(pollMs)
      }

      const mp3Url = `${downloadURL}&s=2&v=${encodeURIComponent(videoId)}&f=mp3`
      const audioRes = await fetch(mp3Url, { headers: { ...headers, Accept: '*/*' } })
      if (!audioRes.ok) {
        return {
          ok: false,
          code: 'YT2MP3_MP3_HTTP',
          message: `Download HTTP ${audioRes.status}.`,
        }
      }
      const buf = Buffer.from(await audioRes.arrayBuffer())
      if (!looksLikeMp3(buf)) {
        return {
          ok: false,
          code: 'YT2MP3_BAD_BYTES',
          message: 'Download did not look like MP3 audio.',
        }
      }

      return {
        ok: true,
        buffer: buf,
        title: title || `YouTube ${videoId}`,
        videoId,
      }
    }

    return { ok: false, code: 'YT2MP3_REDIRECT_LOOP', message: 'Too many convert redirects.' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      code: 'YT2MP3_FAILED',
      message: msg.startsWith('YT2MP3_') ? msg : `yt2mp3.gs flow failed: ${msg}`,
    }
  }
}
