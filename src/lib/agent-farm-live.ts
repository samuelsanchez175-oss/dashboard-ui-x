import { useCallback, useEffect, useState } from 'react'

import type { AgentFarmTabId } from '../components/agent-farm/types'

import {
  canUseYoutubeSearch,
  fetchConfigStatus,
  fetchRssHeadlines,
  fetchYoutubeSearch,
  postGeminiPing,
  type ConfigStatus,
  type RssItem,
  type YoutubeSearchItem,
} from './agent-farm-api'

export function useAgentFarmLive(activeTab: AgentFarmTabId) {
  const [config, setConfig] = useState<ConfigStatus | null>(null)

  const [rssItems, setRssItems] = useState<RssItem[]>([])
  const [rssMeta, setRssMeta] = useState<string | null>(null)
  const [rssLoading, setRssLoading] = useState(false)

  const [ytQuery, setYtQuery] = useState('')
  const [ytItems, setYtItems] = useState<YoutubeSearchItem[]>([])
  const [ytLoading, setYtLoading] = useState(false)
  const [ytError, setYtError] = useState<string | null>(null)

  const [geminiStatus, setGeminiStatus] = useState<string | null>(null)
  const [geminiDetail, setGeminiDetail] = useState<string | null>(null)
  const [geminiLoading, setGeminiLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const s = await fetchConfigStatus()
      if (!cancelled) setConfig(s)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const t = window.setTimeout(() => {
      if (cancelled) return
      if (!config?.RSS_FEED_URLS) {
        setRssItems([])
        setRssMeta(null)
        return
      }
      setRssLoading(true)
      void (async () => {
        const r = await fetchRssHeadlines(10)
        if (cancelled) return
        setRssLoading(false)
        if (r.ok) {
          setRssItems(r.data.items)
          const extra =
            r.data.errors && r.data.errors.length > 0
              ? ` (${r.data.errors.length} feed(s) had errors)`
              : ''
          setRssMeta(`${r.data.items.length} headline(s)${extra}`)
        } else {
          setRssItems([])
          setRssMeta(r.message)
        }
      })()
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [config])

  useEffect(() => {
    if (activeTab !== 'usage' || !config?.GEMINI_API_KEY) {
      return
    }
    let cancelled = false
    const t = window.setTimeout(() => {
      if (cancelled) return
      setGeminiLoading(true)
      setGeminiStatus(null)
      setGeminiDetail(null)
      void (async () => {
        const r = await postGeminiPing()
        if (cancelled) return
        setGeminiLoading(false)
        if (r.ok) {
          setGeminiStatus(`Live — ${r.data.modelCount} model(s) visible`)
          setGeminiDetail(r.data.sampleModelNames.join(', ') || '(no sample names)')
        } else {
          setGeminiStatus(r.message)
          setGeminiDetail(null)
        }
      })()
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [activeTab, config])

  const runYoutubeSearch = useCallback(async () => {
    const q = ytQuery.trim()
    if (!q) {
      setYtError('Enter a search query.')
      return
    }
    if (!canUseYoutubeSearch(config)) {
      setYtError('Add YOUTUBE_API_KEY or GOOGLE_API_KEY (YouTube Data API) in server .env.')
      return
    }
    setYtLoading(true)
    setYtError(null)
    try {
      const r = await fetchYoutubeSearch(q)
      if (r.ok) {
        setYtItems(r.data.items)
      } else {
        setYtItems([])
        setYtError(r.message)
      }
    } finally {
      setYtLoading(false)
    }
  }, [config, ytQuery])

  const liveAny =
    config &&
    (config.GEMINI_API_KEY ||
      config.RSS_FEED_URLS ||
      config.YOUTUBE_API_KEY ||
      config.GOOGLE_API_KEY)

  return {
    config,
    liveAny,
    rssItems,
    rssMeta,
    rssLoading,
    ytQuery,
    setYtQuery,
    ytItems,
    ytLoading,
    ytError,
    runYoutubeSearch,
    geminiStatus,
    geminiDetail,
    geminiLoading,
  }
}

export type AgentFarmLive = ReturnType<typeof useAgentFarmLive>
