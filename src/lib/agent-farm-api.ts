/** Browser calls to the Vite BFF (`/api/*`). Never contains secrets — only booleans / public API payloads. */

import type { ApiResult } from '../components/agent-farm/api-stubs'

export type ConfigStatus = {
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

export type YoutubeSearchPayload = { items: YoutubeSearchItem[] }

export type GeminiPingPayload = {
  modelCount: number
  sampleModelNames: string[]
}

export type RssItem = {
  title: string
  link: string
  publishedAt: string | null
  feedUrl: string
}

export async function fetchConfigStatus(): Promise<ConfigStatus | null> {
  try {
    const res = await fetch('/api/config/status')
    if (!res.ok) return null
    return (await res.json()) as ConfigStatus
  } catch {
    return null
  }
}

export async function fetchYoutubeSearch(q: string): Promise<ApiResult<YoutubeSearchPayload>> {
  const res = await fetch(`/api/youtube/search?${new URLSearchParams({ q })}`)
  return (await res.json()) as ApiResult<YoutubeSearchPayload>
}

export async function postGeminiPing(): Promise<ApiResult<GeminiPingPayload>> {
  const res = await fetch('/api/gemini/ping', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
  return (await res.json()) as ApiResult<GeminiPingPayload>
}

export async function fetchRssHeadlines(limit = 12): Promise<
  ApiResult<{ items: RssItem[]; errors?: ReadonlyArray<{ feedUrl: string; message: string }> }>
> {
  const res = await fetch(`/api/rss?${new URLSearchParams({ limit: String(limit) })}`)
  return (await res.json()) as ApiResult<{
    items: RssItem[]
    errors?: ReadonlyArray<{ feedUrl: string; message: string }>
  }>
}

export function canUseYoutubeSearch(status: ConfigStatus | null): boolean {
  if (!status) return false
  return status.YOUTUBE_API_KEY || status.GOOGLE_API_KEY
}
