import { useCallback, useEffect, useRef, useState } from 'react'

export interface BotMarket {
  slug: string
  title: string
  condition_id: string
  yes_token_id: string
  no_token_id: string
  yes_price: number
  no_price: number
  volume: number
  liquidity: number
  end_date: string
}

export interface BotPosition {
  title: string
  slug: string
  outcome: string
  size: number
  avgPrice: number
  curPrice: number
  value: number
  pnl: number
  percentPnl: number
  conditionId: string
}

export interface BotTrade {
  ts: number
  action: 'buy' | 'sell' | 'error'
  side: string
  market_slug: string
  amount: number
  reference_price: number
  status: string
  strategy?: string
}

export interface TradeProposal {
  id: string
  title: string
  slug: string
  condition_id: string
  token_id: string
  outcome: string
  proposedPrice: number
  targetSize: number
  cost: number
  confidence: number
  strategy: string
  marketTitle: string
  end_date?: string
  // cockpit-originated proposals also carry these:
  _fromCockpit?: boolean
}

export interface BotSettings {
  priceCap: number
  tradeSize: number
  strategies: {
    nobias: boolean
    copyScout: boolean
    hftSniper: boolean
  }
  copyTargetAddress: string
}

export interface BotState {
  data: {
    ok: boolean
    status: string
    ts: number
    addresses: { proxy: string; eoa: string }
    balance: number | null
    portfolioValue: number | null
    gasPol: number | null
    approved: boolean | null
    positions: BotPosition[]
    monitored_markets: number
    eligible_markets: number
    in_range_markets: number
    markets: BotMarket[]
  } | null
  loading: boolean
  error: string | null
  lastUpdated: number | null
  settings: BotSettings
  proposals: TradeProposal[]
  fills: CockpitFill[]
  history: CockpitFill[]
  historySummary: HistorySummary | null
  approvingId: string | null
  approvalError: string | null
  cockpitOnline: boolean
  setSettings: (s: BotSettings) => void
  refresh: () => void
  approveProposal: (id: string) => void
  dismissProposal: (id: string) => void
  clearPaperData: () => void
}

export interface CockpitFill {
  id?: string
  ts: number
  market: string
  side: string
  outcome?: string
  token?: string
  strategy?: string
  amount: number
  price?: number
  shares_est?: number
  status?: 'open' | 'won' | 'lost' | 'redeemed'
  payout?: number | null
  pnl?: number | null
  settled_ts?: number | null
  result?: unknown
}

export interface HistorySummary {
  totalTrades: number
  openTrades: number
  wonTrades: number
  lostTrades: number
  totalCost: number
  totalPayout: number
  realizedPnl: number
  openCost: number
  winRate: number | null
}

// Cockpit runs locally — try BFF proxy first, fall back to direct browser call.
// Direct call works from any URL (Vercel, localhost) as long as cockpit.py is
// running on this Mac, because cockpit serves CORS headers for all origins.
const COCKPIT_DIRECT = 'http://localhost:8770'

async function gammaMktTokenId(conditionId: string, slug: string, outcome: string): Promise<string> {
  const out = outcome.toLowerCase()
  const urls = [
    conditionId ? `https://gamma-api.polymarket.com/markets?conditionId=${encodeURIComponent(conditionId)}` : '',
    slug        ? `https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}` : '',
  ].filter(Boolean)
  for (const url of urls) {
    try {
      const r = await fetch(url)
      if (!r.ok) continue
      const arr = await r.json() as unknown[]
      const m = (Array.isArray(arr) ? arr[0] : arr) as Record<string, unknown> | undefined
      if (!m) continue
      const raw = m.clobTokenIds
      const ids: string[] = typeof raw === 'string' ? JSON.parse(raw) as string[] : (Array.isArray(raw) ? raw as string[] : [])
      const token = out === 'yes' ? ids[0] : ids[1]
      if (token) return token
    } catch { continue }
  }
  return ''
}

const DEFAULT_SETTINGS: BotSettings = {
  priceCap: 0.25,
  tradeSize: 3,
  strategies: {
    nobias: false,
    copyScout: true,
    hftSniper: false,
  },
  copyTargetAddress: '0xaB1087e594d761665aEaE0E01518D6857140eD5B',
}

export function usePolymarketBotData(): BotState {
  const [data, setData] = useState<BotState['data']>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [approvalError, setApprovalError] = useState<string | null>(null)
  const [cockpitOnline, setCockpitOnline] = useState(false)
  const [fills, setFills] = useState<CockpitFill[]>([])
  const [history, setHistory] = useState<CockpitFill[]>([])
  const [historySummary, setHistorySummary] = useState<HistorySummary | null>(null)

  const [settings, setSettingsState] = useState<BotSettings>(() => {
    try {
      const saved = localStorage.getItem('polymarket_bot_settings')
      return saved ? (JSON.parse(saved) as BotSettings) : DEFAULT_SETTINGS
    } catch {
      return DEFAULT_SETTINGS
    }
  })

  const [proposals, setProposals] = useState<TradeProposal[]>([])

  const inFlight = useRef(false)

  const setSettings = (newSettings: BotSettings) => {
    setSettingsState(newSettings)
    localStorage.setItem('polymarket_bot_settings', JSON.stringify(newSettings))
  }

  // --- Fetch main bot market data (BFF) ---
  const run = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setLoading(true)
    try {
      const r = await fetch('/api/polymarket/bot', { cache: 'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = (await r.json()) as BotState['data']
      setData(j)
      setError(null)
      setLastUpdated(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fetch failed')
    } finally {
      setLoading(false)
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    void run()
    const id = setInterval(() => void run(), 30_000)
    return () => clearInterval(id)
  }, [run])

  const refresh = useCallback(() => void run(), [run])

  // --- Poll cockpit for real proposal queue + fills ---
  const pollCockpit = useCallback(async () => {
    type CockpitState = {
      ok?: boolean; offline?: boolean
      proposals?: Array<{
        id: string; market?: string; token?: string; side?: string
        amount?: number; price?: number; confidence?: number | string
        strategy?: string; status?: string
        outcome?: string; slug?: string; condition_id?: string; end_date?: string
      }>
      fills?: CockpitFill[]
      wallet?: { balance?: number }
    }

    let j: CockpitState | null = null

    // 1. Try BFF proxy (works when running on localhost dev server)
    try {
      const r = await fetch('/api/polymarket/cockpit/state', { cache: 'no-store' })
      if (r.ok) {
        const parsed = await r.json() as CockpitState
        if (!parsed.offline) j = parsed
      }
    } catch { /* try direct */ }

    // 2. Fallback: call cockpit directly from browser (CORS enabled on cockpit)
    if (!j) {
      try {
        const r = await fetch(`${COCKPIT_DIRECT}/api/state`, { cache: 'no-store', mode: 'cors' })
        if (r.ok) j = await r.json() as CockpitState
      } catch { /* cockpit not running */ }
    }

    if (!j) { setCockpitOnline(false); return }
    setCockpitOnline(true)

    // Merge cockpit-side pending proposals; remove ones no longer pending
    const cockpitPending = (j.proposals ?? []).filter(p => p.status === 'pending')
    const pendingIds = new Set(cockpitPending.map(cp => cp.id))

    const confToNum = (c: number | string | undefined): number => {
      if (typeof c === 'number') return c
      const map: Record<string, number> = { low: 40, medium: 65, high: 85 }
      return map[(c ?? '').toString().toLowerCase()] ?? 65
    }

    setProposals(prev => {
      // Drop cockpit proposals that are no longer pending (placed/rejected/error)
      const withoutStale = prev.filter(p => !p._fromCockpit || pendingIds.has(p.id))
      const existingIds = new Set(withoutStale.map(p => p.id))
      const newFromCockpit: TradeProposal[] = cockpitPending
        .filter(cp => !existingIds.has(cp.id))
        .map(cp => ({
          id: cp.id,
          title: cp.market ?? '—',
          slug: cp.slug ?? '',
          condition_id: cp.condition_id ?? '',
          token_id: cp.token ?? '',
          outcome: cp.outcome ?? (cp.side === 'buy' ? 'YES' : 'NO'),
          proposedPrice: cp.price ?? 0,
          targetSize: cp.amount ?? 0,
          cost: cp.amount ?? 0,
          confidence: confToNum(cp.confidence),
          strategy: cp.strategy ?? 'cockpit',
          marketTitle: cp.market ?? '—',
          end_date: cp.end_date ?? '',
          _fromCockpit: true,
        }))
      return [...withoutStale, ...newFromCockpit]
    })

    if (Array.isArray(j.fills)) setFills(j.fills.slice().reverse().slice(0, 20))
  }, [])

  useEffect(() => {
    void pollCockpit()
    const id = setInterval(() => void pollCockpit(), 15_000)
    return () => clearInterval(id)
  }, [pollCockpit])

  // --- Poll history endpoint (fills + settlement enrichment) ---
  const pollHistory = useCallback(async () => {
    type HistoryResp = { fills?: CockpitFill[]; summary?: HistorySummary; offline?: boolean }
    let j: HistoryResp | null = null

    // Try BFF first (has settlement enrichment via data-api cross-reference)
    try {
      const r = await fetch('/api/polymarket/cockpit/history', { cache: 'no-store' })
      if (r.ok) {
        const parsed = await r.json() as HistoryResp
        if (!parsed.offline) j = parsed
      }
    } catch { /* try direct */ }

    // Fallback: read fills directly from cockpit (no settlement enrichment, but shows fills)
    if (!j) {
      try {
        const r = await fetch(`${COCKPIT_DIRECT}/api/state`, { cache: 'no-store', mode: 'cors' })
        if (r.ok) {
          const state = await r.json() as { fills?: CockpitFill[] }
          j = { fills: (state.fills ?? []).slice().reverse() }
        }
      } catch { /* non-fatal */ }
    }

    if (!j) return
    if (Array.isArray(j.fills)) setHistory(j.fills)
    if (j.summary) setHistorySummary(j.summary)
  }, [])

  useEffect(() => {
    void pollHistory()
    const id = setInterval(() => void pollHistory(), 60_000) // less frequent — settlement rarely changes
    return () => clearInterval(id)
  }, [pollHistory])

  // --- NO-Bias Sniper proposal generator ---
  useEffect(() => {
    if (!data || !settings.strategies.nobias || !data.markets) return
    const ownedConditionIds = new Set((data.positions ?? []).map(p => p.conditionId).filter(Boolean))

    setProposals(prev => {
      const existingIds = new Set(prev.map(p => p.id))
      const generated: TradeProposal[] = []
      data.markets!.forEach((market) => {
        if (market.no_price > 0 && market.no_price <= settings.priceCap && !ownedConditionIds.has(market.condition_id)) {
          const id = `nobias-${market.condition_id}`
          const wasDismissed = localStorage.getItem(`dismissed_${id}`) === 'true'
          if (!existingIds.has(id) && !wasDismissed) {
            generated.push({
              id,
              title: `NO on ${market.title}`,
              slug: market.slug,
              condition_id: market.condition_id,
              token_id: market.no_token_id,
              outcome: 'NO',
              proposedPrice: market.no_price,
              targetSize: Math.round((settings.tradeSize / market.no_price) * 100) / 100,
              cost: settings.tradeSize,
              confidence: 85,
              strategy: 'NO-Bias Sniper',
              marketTitle: market.title,
            })
          }
        }
      })
      return [...prev, ...generated]
    })
  }, [data, settings.strategies.nobias, settings.priceCap, settings.tradeSize])

  // --- Copy Scout proposal generator ---
  useEffect(() => {
    if (!data || !settings.strategies.copyScout || !settings.copyTargetAddress) return

    let active = true
    const scout = async () => {
      try {
        const r = await fetch(`/api/polymarket/copy?user=${settings.copyTargetAddress}`)
        if (!r.ok || !active) return
        const j = await r.json()
        if (!j?.ok || !Array.isArray(j.open)) return

        const ownedTitles = new Set((data.positions ?? []).map(p => p.title.toLowerCase()))
        const closed = j.closed ?? {}
        const count = closed.count ?? 0
        const netRealized = closed.netRealized ?? 0
        const settledWins = closed.settledWins ?? 0
        const winRate = count > 0 ? settledWins / count : 0
        const concentrationPct = closed.concentrationPct ?? 0

        const passesWinRate = winRate >= 0.60
        const passesPnL = netRealized >= 500
        const passesConcentration = concentrationPct <= 30
        let baseConfidence = 50
        if (passesWinRate) baseConfidence += 15
        if (passesPnL) baseConfidence += 15
        if (passesConcentration) baseConfidence += 10
        if (count >= 15) baseConfidence += 5

        const label = passesWinRate && passesPnL && passesConcentration ? 'Verified' : 'Unverified'

        j.open.forEach((pos: {
          title?: string; slug?: string; conditionId?: string
          outcome?: string; curPrice?: number
        }) => {
          const title = pos.title ?? ''
          if (!title || ownedTitles.has(title.toLowerCase())) return
          const propId = `copy-${settings.copyTargetAddress}-${pos.title}-${pos.outcome}`
          const wasDismissed = localStorage.getItem(`dismissed_${propId}`) === 'true'
          if (wasDismissed) return

          setProposals(prev => {
            if (prev.some(p => p.id === propId)) return prev
            return [
              ...prev,
              {
                id: propId,
                title: `${pos.outcome} on ${pos.title}`,
                slug: pos.slug ?? '',
                condition_id: pos.conditionId ?? '',
                token_id: '',  // resolved by BFF on execute
                outcome: pos.outcome ?? 'YES',
                proposedPrice: pos.curPrice ?? 0.50,
                targetSize: Math.round((settings.tradeSize / (pos.curPrice ?? 0.50)) * 100) / 100,
                cost: settings.tradeSize,
                confidence: Math.min(99, baseConfidence),
                strategy: `Copy Scout (${label})`,
                marketTitle: pos.title ?? '—',
              },
            ]
          })
        })
      } catch { /* ignore */ }
    }

    void scout()
    const id = setInterval(scout, 60_000)
    return () => { active = false; clearInterval(id) }
  }, [data, settings.strategies.copyScout, settings.copyTargetAddress, settings.tradeSize])

  // --- Real approve: BFF proxy → direct browser fallback ---
  const approveProposal = useCallback((id: string) => {
    setProposals(prev => {
      const prop = prev.find(p => p.id === id)
      if (!prop) return prev

      setApprovingId(id)
      setApprovalError(null)

      const postJson = async (url: string, body: unknown, opts: RequestInit = {}) => {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          ...opts,
        })
        return r.json() as Promise<{ ok: boolean; id?: string; error?: string; offline?: boolean; result?: unknown }>
      }

      const doApprove = async () => {
        try {
          if (prop._fromCockpit) {
            // Already in cockpit queue — just approve by id
            // Try BFF proxy first, then direct
            let j = await postJson('/api/polymarket/cockpit/approve', { id }).catch(() => ({ ok: false, offline: true } as { ok: boolean; offline?: boolean; error?: string }))
            if (j.offline || !j.ok) {
              j = await postJson(`${COCKPIT_DIRECT}/api/approve`, { id }, { mode: 'cors' })
            }
            if (!j.ok) throw new Error((j as { error?: string }).error ?? 'approve failed')

          } else {
            // Resolve token_id if missing, then propose+approve
            let tokenId = prop.token_id

            // Try BFF execute route (handles token lookup server-side)
            const bffPayload = {
              marketTitle: prop.marketTitle, slug: prop.slug,
              condition_id: prop.condition_id, token_id: tokenId,
              outcome: prop.outcome, side: 'buy',
              cost: prop.cost, amount: prop.cost,
              proposedPrice: prop.proposedPrice, price: prop.proposedPrice,
              confidence: prop.confidence, strategy: prop.strategy,
              rationale: `Approved via dashboard — ${prop.strategy}`,
            }
            const bffRes = await postJson('/api/polymarket/cockpit/execute', bffPayload).catch(() => ({ ok: false, offline: true } as { ok: boolean; offline?: boolean; error?: string }))

            if (!bffRes.offline && bffRes.ok) {
              // BFF handled it — done
            } else {
              // BFF offline → do it directly from the browser
              // 1. Resolve token_id from Gamma API
              if (!tokenId) {
                tokenId = await gammaMktTokenId(prop.condition_id, prop.slug, prop.outcome)
              }
              if (!tokenId) throw new Error(`Cannot find token for "${prop.marketTitle}" — no condition_id or slug`)

              // 2. Add to cockpit queue
              const propRes = await postJson(`${COCKPIT_DIRECT}/api/propose`, {
                token: tokenId, market: prop.marketTitle, side: 'buy',
                amount: prop.cost, price: prop.proposedPrice,
                outcome: prop.outcome, confidence: prop.confidence,
                strategy: prop.strategy,
                rationale: `Approved via dashboard — ${prop.strategy}`,
              }, { mode: 'cors' })
              if (!propRes.ok) throw new Error(propRes.error ?? 'propose failed')

              // 3. Immediately approve
              const approveRes = await postJson(`${COCKPIT_DIRECT}/api/approve`, { id: propRes.id }, { mode: 'cors' })
              if (!approveRes.ok) throw new Error((approveRes as { error?: string }).error ?? 'approve failed')
            }
          }

          setProposals(cur => cur.filter(p => p.id !== id))
          void pollCockpit()
          void pollHistory()
        } catch (e) {
          setApprovalError(e instanceof Error ? e.message : 'unknown error')
        } finally {
          setApprovingId(null)
        }
      }

      void doApprove()
      return prev
    })
  }, [pollCockpit, pollHistory])

  // --- Reject: hit cockpit (BFF first, direct fallback); or just dismiss locally ---
  const dismissProposal = useCallback((id: string) => {
    setProposals(prev => {
      const prop = prev.find(p => p.id === id)
      if (prop?._fromCockpit) {
        const body = JSON.stringify({ id })
        const headers = { 'content-type': 'application/json' }
        fetch('/api/polymarket/cockpit/reject', { method: 'POST', headers, body })
          .then(r => r.json())
          .then((j: { ok?: boolean; offline?: boolean }) => {
            if (j.offline || !j.ok) {
              // BFF couldn't reach cockpit — call directly from browser
              void fetch(`${COCKPIT_DIRECT}/api/reject`, { method: 'POST', headers, body, mode: 'cors' })
            }
          })
          .catch(() => {
            void fetch(`${COCKPIT_DIRECT}/api/reject`, { method: 'POST', headers, body, mode: 'cors' })
          })
      } else {
        localStorage.setItem(`dismissed_${id}`, 'true')
      }
      return prev.filter(p => p.id !== id)
    })
  }, [])

  const clearPaperData = useCallback(() => {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key && (key.startsWith('dismissed_') || key.startsWith('polymarket_'))) {
        localStorage.removeItem(key)
      }
    }
    setProposals([])
  }, [])

  return {
    data,
    loading,
    error,
    lastUpdated,
    settings,
    proposals,
    fills,
    history,
    historySummary,
    approvingId,
    approvalError,
    cockpitOnline,
    setSettings,
    refresh,
    approveProposal,
    dismissProposal,
    clearPaperData,
  }
}
