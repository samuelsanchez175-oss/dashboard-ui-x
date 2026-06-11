import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Copy-Trader scorecard data. Pulls the weekly leaderboard (the picker) and,
 * for a chosen address, the R-B-I backtest battery from the public BFF routes
 * `/api/polymarket/leaderboard` and `/api/polymarket/copy?user=`. Auto-polls
 * every 60s. All reads are public — no credentials.
 */

export interface LeaderTrader {
  rank: number
  name: string
  addr: string
  pnl: number
  vol: number
}

export interface CopyRecent {
  win: boolean
  pnl: number
  title: string
}
export interface CopyOpen {
  title: string
  outcome: string
  size: number
  curPrice: number
  value: number
}
export interface CopyScore {
  ok: boolean
  ts: number
  user: string
  value: number | null
  closed: {
    count: number
    netRealized: number
    totalStaked: number
    roiPct: number
    settledWins: number
    biggestWin: number
    concentrationPct: number
    recent: CopyRecent[]
  }
  open: CopyOpen[]
  score: { label: string; reasons: string[] }
  caveats: string[]
  errors: Record<string, string>
}

const POLL_MS = 60_000
/** Default trader on first load — 'beet420', a real weekly-leaderboard name. */
export const DEFAULT_TRADER = '0xd81E5bc01e4a98D0af93d82Dc2C542a4c0f9E3D0'

export interface CopyTraderState {
  address: string
  setAddress: (a: string) => void
  score: CopyScore | null
  leaderboard: LeaderTrader[]
  loading: boolean
  error: string | null
  lastUpdated: number | null
  refresh: () => void
}

export function useCopyTraderData(): CopyTraderState {
  const [address, setAddress] = useState(DEFAULT_TRADER)
  const [score, setScore] = useState<CopyScore | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderTrader[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const inFlight = useRef(false)

  const run = useCallback(async (addr: string) => {
    if (inFlight.current) return
    inFlight.current = true
    setLoading(true)
    try {
      const [lbRes, scRes] = await Promise.all([
        fetch('/api/polymarket/leaderboard', { cache: 'no-store' }),
        /^0x[0-9a-fA-F]{40}$/.test(addr)
          ? fetch(`/api/polymarket/copy?user=${addr}`, { cache: 'no-store' })
          : Promise.resolve(null),
      ])
      const lb = (await lbRes.json()) as { traders?: LeaderTrader[] }
      setLeaderboard(lb.traders ?? [])
      if (scRes) {
        const sc = (await scRes.json()) as CopyScore
        setScore(sc.ok ? sc : null)
        if (!sc.ok) setError('No record for that address')
        else setError(null)
      }
      setLastUpdated(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fetch failed')
    } finally {
      setLoading(false)
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    void run(address)
    const id = setInterval(() => void run(address), POLL_MS)
    return () => clearInterval(id)
  }, [run, address])

  const refresh = useCallback(() => void run(address), [run, address])

  return { address, setAddress, score, leaderboard, loading, error, lastUpdated, refresh }
}
