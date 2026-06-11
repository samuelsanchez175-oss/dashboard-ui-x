import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Live Polymarket wallet data, served by the public-read BFF at
 * `GET /api/polymarket/wallet`. Auto-polls every 30s while mounted and exposes
 * a manual `refresh()` for the toolbar button. No credentials — all reads are
 * public, keyed by the configured wallet address.
 */

export interface PolymarketPosition {
  title: string
  outcome: string
  size: number
  avgPrice: number
  curPrice: number
  value: number
  pnl: number
  percentPnl: number
}

export interface PolymarketActivity {
  type: string
  title: string
  outcome: string
  size: number
  price: number
  timestamp: number | null
}

export interface PolymarketWallet {
  ok: boolean
  status: 'live' | 'error' | string
  ts: number
  addresses: { proxy: string; eoa: string }
  balance: number | null
  portfolioValue: number | null
  gasPol: number | null
  approved: boolean | null
  positions: PolymarketPosition[]
  activity: PolymarketActivity[]
  errors: Record<string, string>
}

export interface PolymarketWalletState {
  data: PolymarketWallet | null
  loading: boolean
  error: string | null
  lastUpdated: number | null
  refresh: () => void
}

const POLL_MS = 30_000

export function usePolymarketWalletData(): PolymarketWalletState {
  const [data, setData] = useState<PolymarketWallet | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const inFlight = useRef(false)

  const run = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setLoading(true)
    try {
      const r = await fetch('/api/polymarket/wallet', { cache: 'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = (await r.json()) as PolymarketWallet
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
    const id = setInterval(() => void run(), POLL_MS)
    return () => clearInterval(id)
  }, [run])

  const refresh = useCallback(() => void run(), [run])

  return { data, loading, error, lastUpdated, refresh }
}
