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
    try {
      const r = await fetch('/api/polymarket/cockpit/state', { cache: 'no-store' })
      if (!r.ok) { setCockpitOnline(false); return }
      const j = await r.json() as {
        ok?: boolean
        offline?: boolean
        proposals?: Array<{
          id: string; market?: string; token?: string; side?: string
          amount?: number; price?: number; confidence?: number
          strategy?: string; status?: string
        }>
        fills?: CockpitFill[]
      }
      if (j.offline) { setCockpitOnline(false); return }
      setCockpitOnline(true)

      // Merge cockpit-side pending proposals into local proposals list
      const cockpitPending = (j.proposals ?? []).filter(p => p.status === 'pending')
      setProposals(prev => {
        const existingIds = new Set(prev.map(p => p.id))
        const newFromCockpit: TradeProposal[] = cockpitPending
          .filter(cp => !existingIds.has(cp.id))
          .map(cp => ({
            id: cp.id,
            title: cp.market ?? '—',
            slug: '',
            condition_id: '',
            token_id: cp.token ?? '',
            outcome: cp.side === 'buy' ? 'YES' : cp.side ?? 'YES',
            proposedPrice: cp.price ?? 0,
            targetSize: cp.amount ?? 0,
            cost: cp.amount ?? 0,
            confidence: (cp.confidence as number) ?? 0,
            strategy: cp.strategy ?? 'cockpit',
            marketTitle: cp.market ?? '—',
            _fromCockpit: true,
          }))
        return [...prev, ...newFromCockpit]
      })

      if (Array.isArray(j.fills)) setFills(j.fills.slice().reverse().slice(0, 20))
    } catch {
      setCockpitOnline(false)
    }
  }, [])

  useEffect(() => {
    void pollCockpit()
    const id = setInterval(() => void pollCockpit(), 15_000)
    return () => clearInterval(id)
  }, [pollCockpit])

  // --- Poll history endpoint (fills + settlement enrichment) ---
  const pollHistory = useCallback(async () => {
    try {
      const r = await fetch('/api/polymarket/cockpit/history', { cache: 'no-store' })
      if (!r.ok) return
      const j = await r.json() as { fills?: CockpitFill[]; summary?: HistorySummary }
      if (Array.isArray(j.fills)) setHistory(j.fills)
      if (j.summary) setHistorySummary(j.summary)
    } catch { /* non-fatal */ }
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

  // --- Real approve: propose to cockpit (with token_id lookup) then execute ---
  const approveProposal = useCallback((id: string) => {
    setProposals(prev => {
      const prop = prev.find(p => p.id === id)
      if (!prop) return prev

      setApprovingId(id)
      setApprovalError(null)

      const doApprove = async () => {
        try {
          if (prop._fromCockpit) {
            // Already in cockpit queue — just approve by id
            const r = await fetch('/api/polymarket/cockpit/approve', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ id }),
            })
            const j = await r.json() as { ok: boolean; error?: string; result?: unknown }
            if (!j.ok) throw new Error(j.error ?? String(j.result) ?? 'approve failed')
          } else {
            // Frontend-generated proposal — submit + execute in one shot
            const r = await fetch('/api/polymarket/cockpit/execute', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                marketTitle: prop.marketTitle,
                title: prop.title,
                slug: prop.slug,
                condition_id: prop.condition_id,
                token_id: prop.token_id,
                outcome: prop.outcome,
                side: 'buy',
                cost: prop.cost,
                amount: prop.cost,
                proposedPrice: prop.proposedPrice,
                price: prop.proposedPrice,
                confidence: prop.confidence,
                strategy: prop.strategy,
                rationale: `Approved via dashboard — ${prop.strategy}`,
              }),
            })
            const j = await r.json() as { ok: boolean; error?: string; offline?: boolean }
            if (j.offline) throw new Error('Cockpit is offline — run cockpit.py first')
            if (!j.ok) throw new Error(j.error ?? 'execute failed')
          }
          // Remove from queue on success, refresh cockpit + history
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
      return prev // state update happens async
    })
  }, [pollCockpit, pollHistory])

  // --- Reject: if cockpit-originated hit cockpit; otherwise just dismiss locally ---
  const dismissProposal = useCallback((id: string) => {
    setProposals(prev => {
      const prop = prev.find(p => p.id === id)
      if (prop?._fromCockpit) {
        void fetch('/api/polymarket/cockpit/reject', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id }),
        }).catch(() => { /* fire and forget */ })
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
