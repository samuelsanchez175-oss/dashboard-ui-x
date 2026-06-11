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
  paperPositions: BotPosition[]
  paperTrades: BotTrade[]
  setSettings: (s: BotSettings) => void
  refresh: () => void
  approveProposal: (id: string) => void
  dismissProposal: (id: string) => void
  clearPaperData: () => void
}

const DEFAULT_SETTINGS: BotSettings = {
  priceCap: 0.25,
  tradeSize: 10,
  strategies: {
    nobias: true,
    copyScout: false,
    hftSniper: false,
  },
  copyTargetAddress: '0xaB1087e594d761665aEaE0E01518D6857140eD5B', // Example Promising Trader
}

export function usePolymarketBotData(): BotState {
  const [data, setData] = useState<BotState['data']>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  
  // Local storage backed states
  const [settings, setSettingsState] = useState<BotSettings>(() => {
    try {
      const saved = localStorage.getItem('polymarket_bot_settings')
      return saved ? (JSON.parse(saved) as BotSettings) : DEFAULT_SETTINGS
    } catch {
      return DEFAULT_SETTINGS
    }
  })

  const [proposals, setProposals] = useState<TradeProposal[]>([])

  const [paperPositions, setPaperPositions] = useState<BotPosition[]>(() => {
    try {
      const saved = localStorage.getItem('polymarket_paper_positions')
      return saved ? (JSON.parse(saved) as BotPosition[]) : []
    } catch {
      return []
    }
  })

  const [paperTrades, setPaperTrades] = useState<BotTrade[]>(() => {
    try {
      const saved = localStorage.getItem('polymarket_paper_trades')
      return saved ? (JSON.parse(saved) as BotTrade[]) : []
    } catch {
      return []
    }
  })

  const inFlight = useRef(false)

  const setSettings = (newSettings: BotSettings) => {
    setSettingsState(newSettings)
    localStorage.setItem('polymarket_bot_settings', JSON.stringify(newSettings))
  }

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

  // Proposer Simulation Loop
  useEffect(() => {
    if (!data) return

    const newProposals: TradeProposal[] = []
    const ownedConditionIds = new Set([
      ...(data.positions || []).map(p => p.conditionId),
      ...paperPositions.map(p => p.conditionId)
    ].filter(Boolean))

    // 1. NO-Bias Sniper Proposer
    if (settings.strategies.nobias && data.markets) {
      data.markets.forEach((market) => {
        if (market.no_price > 0 && market.no_price <= settings.priceCap) {
          if (!ownedConditionIds.has(market.condition_id)) {
            newProposals.push({
              id: `nobias-${market.condition_id}`,
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
              marketTitle: market.title
            })
          }
        }
      })
    }

    setProposals(prev => {
      // Keep manual dismisses and merge new ones
      const merged = [...newProposals]
      // Add existing ones if they are still valid and not processed
      prev.forEach(p => {
        if (!ownedConditionIds.has(p.condition_id) && !merged.some(m => m.id === p.id)) {
          // If it was manually dismissed, we don't re-add
          const wasDismissed = localStorage.getItem(`dismissed_${p.id}`) === 'true'
          if (!wasDismissed) {
            merged.push(p)
          }
        }
      })
      return merged
    })
  }, [data, settings.strategies.nobias, settings.priceCap, settings.tradeSize, paperPositions])

  // 2. Copy Trader Scout Proposer Loop
  useEffect(() => {
    if (!data || !settings.strategies.copyScout || !settings.copyTargetAddress) return

    let active = true
    const scout = async () => {
      try {
        const r = await fetch(`/api/polymarket/copy?user=${settings.copyTargetAddress}`)
        if (!r.ok || !active) return
        const j = await r.json()
        if (j && j.ok && Array.isArray(j.open)) {
          const ownedTitles = new Set([
            ...(data.positions || []).map(p => p.title.toLowerCase()),
            ...paperPositions.map(p => p.title.toLowerCase())
          ])

          const closed = j.closed || {}
          const count = closed.count || 0
          const netRealized = closed.netRealized || 0
          const settledWins = closed.settledWins || 0
          const winRate = count > 0 ? settledWins / count : 0
          const concentrationPct = closed.concentrationPct || 0

          // MrFadiAi Copy Filters:
          // - Win rate >= 60%
          // - Net PnL >= $500
          // - Single-trade profit concentration <= 30%
          const passesWinRate = winRate >= 0.60
          const passesPnL = netRealized >= 500
          const passesConcentration = concentrationPct <= 30

          // Calculate confidence score dynamically
          let baseConfidence = 50
          if (passesWinRate) baseConfidence += 15
          if (passesPnL) baseConfidence += 15
          if (passesConcentration) baseConfidence += 10
          if (count >= 15) baseConfidence += 5

          // Propose open trades from this user
          j.open.forEach((pos: any) => {
            const title = pos.title || ''
            if (title && !ownedTitles.has(title.toLowerCase())) {
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
                    slug: pos.slug || '',
                    condition_id: pos.conditionId || '',
                    token_id: '',
                    outcome: pos.outcome,
                    proposedPrice: pos.curPrice || 0.50,
                    targetSize: Math.round((settings.tradeSize / (pos.curPrice || 0.50)) * 100) / 100,
                    cost: settings.tradeSize,
                    confidence: Math.min(99, baseConfidence),
                    strategy: `Copy Scout (${passesWinRate && passesPnL && passesConcentration ? 'Verified' : 'Unverified'})`,
                    marketTitle: pos.title
                  }
                ]
              })
            }
          })
        }
      } catch (_) {
        // ignore fetch failures silently in loop
      }
    }

    void scout()
    const id = setInterval(scout, 60_000) // Poll copy scouting every minute
    return () => {
      active = false
      clearInterval(id)
    }
  }, [data, settings.strategies.copyScout, settings.copyTargetAddress, settings.tradeSize, paperPositions])

  // 3. Simulated HFT Arbitrage Proposer Loop (Simulates a proposed trade every few mins if active)
  useEffect(() => {
    if (!data || !settings.strategies.hftSniper) return

    const runArb = () => {
      if (data.markets && data.markets.length > 0) {
        // Pick a random market to pretend we found a pricing discrepancy on Yes + No < $1.00
        const randMarket = data.markets[Math.floor(Math.random() * data.markets.length)]
        const propId = `arb-${randMarket.condition_id}`
        const wasDismissed = localStorage.getItem(`dismissed_${propId}`) === 'true'
        if (wasDismissed) return

        setProposals(prev => {
          if (prev.some(p => p.id === propId)) return prev
          const spreadSum = randMarket.yes_price + randMarket.no_price
          if (spreadSum >= 1.0) {
            // Simulate a mock arbitrage proposal
            return [
              ...prev,
              {
                id: propId,
                title: `Arbitrage: YES (${randMarket.yes_price * 100}¢) + NO (${randMarket.no_price * 100}¢)`,
                slug: randMarket.slug,
                condition_id: randMarket.condition_id,
                token_id: randMarket.yes_token_id,
                outcome: 'YES + NO',
                proposedPrice: spreadSum,
                targetSize: 20,
                cost: 18.5,
                confidence: 94,
                strategy: 'HFT Arbitrageur',
                marketTitle: randMarket.title
              }
            ]
          }
          return prev
        })
      }
    }

    const id = setInterval(runArb, 45_000)
    return () => clearInterval(id)
  }, [data, settings.strategies.hftSniper])

  const approveProposal = useCallback((id: string) => {
    setProposals(prev => {
      const prop = prev.find(p => p.id === id)
      if (!prop) return prev

      // Add to paper positions
      setPaperPositions(positions => {
        const existingIdx = positions.findIndex(p => p.conditionId === prop.condition_id && p.outcome === prop.outcome)
        let updated: BotPosition[]
        if (existingIdx >= 0) {
          const prevPos = positions[existingIdx]
          const totalSize = prevPos.size + prop.targetSize
          const avgPrice = ((prevPos.avgPrice * prevPos.size) + (prop.proposedPrice * prop.targetSize)) / totalSize
          const currentVal = totalSize * prop.proposedPrice
          const cost = totalSize * avgPrice
          const pnl = currentVal - cost
          const percentPnl = cost > 0 ? (pnl / cost) * 100 : 0
          updated = [...positions]
          updated[existingIdx] = {
            ...prevPos,
            size: totalSize,
            avgPrice,
            curPrice: prop.proposedPrice,
            value: currentVal,
            pnl,
            percentPnl
          }
        } else {
          updated = [
            ...positions,
            {
              title: prop.marketTitle,
              slug: prop.slug,
              outcome: prop.outcome,
              size: prop.targetSize,
              avgPrice: prop.proposedPrice,
              curPrice: prop.proposedPrice,
              value: prop.cost,
              pnl: 0,
              percentPnl: 0,
              conditionId: prop.condition_id
            }
          ]
        }
        localStorage.setItem('polymarket_paper_positions', JSON.stringify(updated))
        return updated
      })

      // Log to paper trades ledger
      setPaperTrades(trades => {
        const newTrade: BotTrade = {
          ts: Date.now() / 1000,
          action: 'buy',
          side: prop.outcome,
          market_slug: prop.slug,
          amount: prop.cost,
          reference_price: prop.proposedPrice,
          status: 'success',
          strategy: prop.strategy
        }
        const updated = [newTrade, ...trades].slice(0, 100)
        localStorage.setItem('polymarket_paper_trades', JSON.stringify(updated))
        return updated
      })

      return prev.filter(p => p.id !== id)
    })
  }, [])

  const dismissProposal = useCallback((id: string) => {
    localStorage.setItem(`dismissed_${id}`, 'true')
    setProposals(prev => prev.filter(p => p.id !== id))
  }, [])

  const clearPaperData = useCallback(() => {
    localStorage.removeItem('polymarket_paper_positions')
    localStorage.removeItem('polymarket_paper_trades')
    // Clear dismisses
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('dismissed_')) {
        localStorage.removeItem(key)
        i--
      }
    }
    setPaperPositions([])
    setPaperTrades([])
    setProposals([])
  }, [])

  return {
    data,
    loading,
    error,
    lastUpdated,
    settings,
    proposals,
    paperPositions,
    paperTrades,
    setSettings,
    refresh,
    approveProposal,
    dismissProposal,
    clearPaperData,
  }
}
