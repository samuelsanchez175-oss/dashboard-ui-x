/**
 * Dev BFF: extract YouTube audio as MP3.
 * - Default YOUTUBE_AUDIO_BACKEND=auto: yt2mp3.gs-style flow first, then yt-dlp + ffmpeg.
 * - ytdlp: yt-dlp only. yt2mp3: remote converter only (no local yt-dlp).
 * yt-dlp resolves binaries via YT_DLP_PATH / FFMPEG_PATH, Homebrew paths, PATH, then `npx --yes yt-dlp`.
 */

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { tryYoutubeMp3WithYt2Mp3Gs } from './yt2mp3-gs-client'

export function extractYoutubeVideoId(raw: string): string | null {
  const input = raw.trim()
  if (!input) return null
  try {
    const u = new URL(input.startsWith('http') ? input : `https://${input}`)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split(/[/?#]/)[0] ?? ''
      return /^[\w-]{11}$/.test(id) ? id : null
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const v = u.searchParams.get('v')
      if (v && /^[\w-]{11}$/.test(v)) return v
      const shorts = u.pathname.match(/^\/shorts\/([\w-]{11})/)
      if (shorts?.[1]) return shorts[1]
      const embed = u.pathname.match(/^\/embed\/([\w-]{11})/)
      if (embed?.[1]) return embed[1]
    }
    return null
  } catch {
    return null
  }
}

export function sanitizeFilenameBase(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'youtube-audio'
}

function fileExistsSync(p: string): boolean {
  try {
    fsSync.accessSync(p)
    return true
  } catch {
    return false
  }
}

/** Directory passed to yt-dlp `--ffmpeg-location` (must contain ffmpeg binary). */
function resolveFfmpegLocationDir(): string | undefined {
  const envRaw = process.env.FFMPEG_PATH?.trim()
  if (envRaw) {
    const resolved = path.resolve(envRaw)
    if (fileExistsSync(resolved)) {
      return fsSync.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved)
    }
  }
  for (const dir of ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']) {
    if (fileExistsSync(path.join(dir, 'ffmpeg'))) {
      return dir
    }
  }
  return undefined
}

function ytDlpCandidateBins(): string[] {
  const envBin = process.env.YT_DLP_PATH?.trim()
  const ordered = [
    envBin,
    '/opt/homebrew/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    'yt-dlp',
  ].filter((x): x is string => Boolean(x))
  return [...new Set(ordered)]
}

type SpawnOutcome = {
  code: number | null
  stdout: string
  stderr: string
  spawnFailed: boolean
}

function spawnProcess(cmd: string, args: string[], options?: { shell?: boolean }): Promise<SpawnOutcome> {
  return new Promise(resolve => {
    const proc = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: options?.shell ?? false,
    })
    let stdout = ''
    let stderr = ''
    let settled = false

    proc.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString()
    })
    proc.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString()
    })

    const finish = (out: SpawnOutcome) => {
      if (settled) return
      settled = true
      resolve(out)
    }

    proc.on('error', err => {
      finish({
        code: -1,
        stdout,
        stderr: err.message,
        spawnFailed: true,
      })
    })
    proc.on('close', code => {
      finish({ code, stdout, stderr, spawnFailed: false })
    })
  })
}

/** Run yt-dlp with automatic binary resolution (Homebrew paths + npx fallback). */
async function spawnYtDlp(ytdlpArgs: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const ffmpegDir = resolveFfmpegLocationDir()
  const prefixed = ffmpegDir ? ['--ffmpeg-location', ffmpegDir, ...ytdlpArgs] : ytdlpArgs

  let lastSpawnErr = ''

  for (const bin of ytDlpCandidateBins()) {
    if (path.isAbsolute(bin) && !fileExistsSync(bin)) {
      continue
    }
    const r = await spawnProcess(bin, prefixed)
    if (r.spawnFailed) {
      lastSpawnErr = r.stderr
      continue
    }
    return { code: r.code, stdout: r.stdout, stderr: r.stderr }
  }

  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const npxR = await spawnProcess(npxCmd, ['--yes', 'yt-dlp', ...prefixed], {
    shell: process.platform === 'win32',
  })
  if (!npxR.spawnFailed) {
    return { code: npxR.code, stdout: npxR.stdout, stderr: npxR.stderr }
  }

  return {
    code: -1,
    stdout: '',
    stderr:
      lastSpawnErr ||
      npxR.stderr ||
      'Could not run yt-dlp. Install: brew install yt-dlp ffmpeg (macOS), or set YT_DLP_PATH / FFMPEG_PATH, or ensure npx can fetch yt-dlp.',
  }
}

async function ytDlpMeta(url: string): Promise<{ title: string } | null> {
  const { code, stdout } = await spawnYtDlp(['-j', '--skip-download', '--no-warnings', url])
  if (code !== 0 || !stdout.trim()) {
    return null
  }
  try {
    const j = JSON.parse(stdout) as { title?: string }
    return j.title ? { title: j.title } : null
  } catch {
    return null
  }
}

async function downloadYoutubeMp3File(canonicalUrl: string, outFile: string): Promise<{ ok: true } | { ok: false; message: string }> {
  await fs.rm(outFile, { force: true })
  const { code, stderr } = await spawnYtDlp([
    '-x',
    '--audio-format',
    'mp3',
    '--no-playlist',
    '--no-warnings',
    '-o',
    outFile,
    canonicalUrl,
  ])
  if (code !== 0) {
    const low = stderr.toLowerCase()
    const hint = low.includes('ffmpeg')
      ? ' Install ffmpeg (brew install ffmpeg) or set FFMPEG_PATH to the ffmpeg binary or its folder.'
      : low.includes('yt-dlp') || low.includes('not found')
        ? ' Set YT_DLP_PATH to your yt-dlp executable, or run: brew install yt-dlp'
        : ''
    return {
      ok: false,
      message: (stderr.slice(-900) || `yt-dlp exited with code ${code}`) + hint,
    }
  }
  try {
    await fs.access(outFile)
    return { ok: true }
  } catch {
    return { ok: false, message: 'Download finished but output file was not found.' }
  }
}

export async function tryYoutubeMp3WithYtDlp(pageUrl: string): Promise<
  | { ok: true; buffer: Buffer; title: string; videoId: string }
  | { ok: false; code: string; message: string }
> {
  const videoId = extractYoutubeVideoId(pageUrl)
  if (!videoId) {
    return {
      ok: false,
      code: 'BAD_URL',
      message: 'Paste a valid YouTube watch, Shorts, music, or youtu.be link.',
    }
  }
  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`
  const meta = await ytDlpMeta(canonicalUrl)
  const titleBase = sanitizeFilenameBase(meta?.title ?? `YouTube ${videoId}`)
  const outFile = path.join(os.tmpdir(), `mix-yt-${videoId}-${randomUUID()}.mp3`)

  const dl = await downloadYoutubeMp3File(canonicalUrl, outFile)
  if (!dl.ok) {
    await fs.rm(outFile, { force: true })
    return { ok: false, code: 'YTDLP_FAILED', message: dl.message }
  }

  try {
    const buffer = await fs.readFile(outFile)
    await fs.rm(outFile, { force: true })
    return { ok: true, buffer, title: titleBase, videoId }
  } catch (e) {
    await fs.rm(outFile, { force: true })
    return {
      ok: false,
      code: 'READ_ERROR',
      message: e instanceof Error ? e.message : 'Could not read downloaded audio.',
    }
  }
}

type AudioBackend = 'auto' | 'yt2mp3' | 'ytdlp'

function resolveYoutubeAudioBackend(): AudioBackend {
  const raw = (process.env.YOUTUBE_AUDIO_BACKEND ?? 'auto').trim().toLowerCase()
  if (raw === 'yt2mp3' || raw === 'ytdlp' || raw === 'auto') return raw
  return 'auto'
}

async function tryYoutubeMp3ForUrl(pageUrl: string): Promise<
  | { ok: true; buffer: Buffer; title: string; videoId: string }
  | { ok: false; code: string; message: string }
> {
  const videoId = extractYoutubeVideoId(pageUrl)
  if (!videoId) {
    return {
      ok: false,
      code: 'BAD_URL',
      message: 'Paste a valid YouTube watch, Shorts, music, or youtu.be link.',
    }
  }

  const backend = resolveYoutubeAudioBackend()

  if (backend === 'yt2mp3') {
    return tryYoutubeMp3WithYt2Mp3Gs(videoId)
  }

  if (backend === 'ytdlp') {
    return tryYoutubeMp3WithYtDlp(pageUrl)
  }

  const remote = await tryYoutubeMp3WithYt2Mp3Gs(videoId)
  if (remote.ok) {
    return remote
  }

  const local = await tryYoutubeMp3WithYtDlp(pageUrl)
  if (local.ok) {
    return local
  }

  return {
    ok: false,
    code: 'ALL_BACKENDS_FAILED',
    message: `${remote.message} (${remote.code}). Fallback yt-dlp: ${local.message}`,
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

/** POST /api/mixing/youtube-audio — returns MP3 bytes or JSON error. */
export async function handleMixingYoutubeAudioPost(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let parsed: unknown
  try {
    parsed = await readJsonBody(req)
  } catch {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ ok: false, error: 'BAD_JSON', message: 'Invalid JSON body.' }))
    return
  }
  const url =
    parsed && typeof parsed === 'object' && typeof (parsed as { url?: unknown }).url === 'string'
      ? (parsed as { url: string }).url.trim()
      : ''
  if (!url) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ ok: false, error: 'MISSING_URL', message: 'Send JSON { "url": "https://..." }.' }))
    return
  }

  const result = await tryYoutubeMp3ForUrl(url)
  if (!result.ok) {
    res.statusCode = result.code === 'BAD_URL' ? 400 : 502
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ ok: false, error: result.code, message: result.message }))
    return
  }

  const dispTitle = sanitizeFilenameBase(result.title)
  const asciiName = `youtube-${result.videoId}.mp3`
  res.statusCode = 200
  res.setHeader('Content-Type', 'audio/mpeg')
  res.setHeader('Content-Length', result.buffer.length)
  res.setHeader('X-Video-Id', result.videoId)
  res.setHeader('X-Audio-Title', encodeURIComponent(dispTitle))
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(`${dispTitle}.mp3`)}`,
  )
  res.end(result.buffer)
}
