/**
 * Dev + Vercel BFF: Polymarket wallet read-only panel data.
 *
 * Every value is a PUBLIC read keyed by the configured proxy wallet address —
 * no private key, no API key, so this is safe to ship and runs on Vercel.
 * Sources:
 *   - data-api.polymarket.com : portfolio value, positions, activity
 *   - Polygon JSON-RPC        : POL gas (eth_getBalance), spendable pUSD
 *                               balance + CTF-Exchange allowance (eth_call on
 *                               the collateral ERC-20)
 *
 * Route:  GET /api/polymarket/wallet
 *
 * Override the wallet via env (POLYMARKET_WALLET_ADDRESS / POLYMARKET_EOA_ADDRESS);
 * defaults are the live wallet set up in the polymarket-cli session.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

// --- config ------------------------------------------------------------------
const PROXY = (process.env.POLYMARKET_WALLET_ADDRESS ?? '0xB6Ebd5C112725eEAc60B64d77f712Cd3807F4b66').toLowerCase()
const EOA = (process.env.POLYMARKET_EOA_ADDRESS ?? '0xfE7C0BC616c35d1C12c7BF7a6a566C7b39211316').toLowerCase()

const DATA_API = 'https://data-api.polymarket.com'
const RPCS = [
  'https://polygon-rpc.com',
  'https://1rpc.io/matic',
  'https://polygon.llamarpc.com',
  'https://rpc.ankr.com/polygon',
]
/** Polymarket v2 collateral token "pUSD" (6 decimals) on Polygon. */
const COLLATERAL = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB'
/** CTF Exchange (v2) — allowance target used to infer "approved for trading". */
const CTF_EXCHANGE = '0xE111180000d2663C0091e4f400237545B87B996B'

const REQ_TIMEOUT_MS = 9000

// --- tiny helpers ------------------------------------------------------------
function jsonRes(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', Buffer.byteLength(body))
  res.end(body)
}

function pathnameOnly(url: string | undefined): string {
  if (!url) return '/'
  try {
    return new URL(url, 'http://localhost').pathname
  } catch {
    return '/'
  }
}

function num(x: unknown): number {
  const n = typeof x === 'string' ? parseFloat(x) : typeof x === 'number' ? x : NaN
  return Number.isFinite(n) ? n : 0
}

function str(x: unknown): string {
  return typeof x === 'string' ? x : ''
}

function padAddr(a: string): string {
  return a.replace(/^0x/, '').toLowerCase().padStart(64, '0')
}

function hexToBigInt(h: string | null | undefined): bigint {
  return h && h !== '0x' ? BigInt(h) : 0n
}

/** BigInt → number scaled by 10^decimals. Fine for display-scale magnitudes. */
function formatUnits(v: bigint, decimals: number): number {
  return Number(v) / 10 ** decimals
}

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), REQ_TIMEOUT_MS)
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'UI-Dashboard-X/0.1 (polymarket panel)', Accept: 'application/json' },
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return await r.json()
  } finally {
    clearTimeout(t)
  }
}

/** JSON-RPC call against the first responsive Polygon endpoint. */
async function rpc(method: string, params: unknown[]): Promise<string> {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  let lastErr: unknown = null
  for (const url of RPCS) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), REQ_TIMEOUT_MS)
    try {
      const r = await fetch(url, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json' },
        body,
      })
      if (!r.ok) {
        lastErr = new Error(`HTTP ${r.status}`)
        continue
      }
      const j = (await r.json()) as { result?: string; error?: { message?: string } }
      if (j.result != null) return j.result
      lastErr = new Error(j.error?.message ?? 'rpc error')
    } catch (e) {
      lastErr = e
    } finally {
      clearTimeout(t)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('all RPCs failed')
}

// --- reads -------------------------------------------------------------------
async function getPol(): Promise<number> {
  const hex = await rpc('eth_getBalance', [EOA, 'latest'])
  return formatUnits(hexToBigInt(hex), 18)
}

async function getCollateral(): Promise<number> {
  // balanceOf(address) selector 0x70a08231
  const data = '0x70a08231' + padAddr(PROXY)
  const hex = await rpc('eth_call', [{ to: COLLATERAL, data }, 'latest'])
  return formatUnits(hexToBigInt(hex), 6)
}

async function getApproved(): Promise<boolean> {
  // allowance(owner,spender) selector 0xdd62ed3e
  const data = '0xdd62ed3e' + padAddr(PROXY) + padAddr(CTF_EXCHANGE)
  const hex = await rpc('eth_call', [{ to: COLLATERAL, data }, 'latest'])
  return hexToBigInt(hex) > 0n
}

async function getValue(): Promise<number> {
  const j = await fetchJson(`${DATA_API}/value?user=${PROXY}`)
  if (Array.isArray(j) && j.length > 0) return num((j[0] as Record<string, unknown>).value)
  return 0
}

async function getPositions(): Promise<unknown[]> {
  const j = await fetchJson(`${DATA_API}/positions?user=${PROXY}&sizeThreshold=0.1`)
  if (!Array.isArray(j)) return []
  return j.slice(0, 50).map((raw) => {
    const p = raw as Record<string, unknown>
    return {
      title: str(p.title) || str(p.slug) || '—',
      slug: str(p.slug),
      outcome: str(p.outcome),
      size: num(p.size),
      avgPrice: num(p.avgPrice),
      curPrice: num(p.curPrice),
      value: num(p.currentValue) || num(p.value),
      pnl: num(p.cashPnl) || num(p.pnl),
      percentPnl: num(p.percentPnl),
      conditionId: str(p.conditionId)
    }
  })
}

async function getActivity(): Promise<unknown[]> {
  const j = await fetchJson(`${DATA_API}/activity?user=${PROXY}&limit=20`)
  if (!Array.isArray(j)) return []
  return j.slice(0, 20).map((raw) => {
    const a = raw as Record<string, unknown>
    return {
      type: str(a.type) || str(a.side) || '—',
      title: str(a.title) || str(a.slug),
      outcome: str(a.outcome),
      size: num(a.size) || num(a.usdcSize),
      price: num(a.price),
      timestamp: typeof a.timestamp === 'number' ? a.timestamp : num(a.timestamp) || null,
    }
  })
}

// --- handler -----------------------------------------------------------------
async function handleWallet(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const errors: Record<string, string> = {}
  const out: Record<string, unknown> = {
    ok: true,
    status: 'live',
    ts: Date.now(),
    addresses: { proxy: PROXY, eoa: EOA },
    balance: null,
    portfolioValue: null,
    gasPol: null,
    approved: null,
    positions: [],
    activity: [],
    errors,
  }

  const settle = async <T,>(key: string, fn: () => Promise<T>, assign: (v: T) => void): Promise<void> => {
    try {
      assign(await fn())
    } catch (e) {
      errors[key] = e instanceof Error ? e.message : String(e)
    }
  }

  await Promise.all([
    settle('balance', getCollateral, (v) => (out.balance = v)),
    settle('portfolioValue', getValue, (v) => (out.portfolioValue = v)),
    settle('gasPol', getPol, (v) => (out.gasPol = v)),
    settle('approved', getApproved, (v) => (out.approved = v)),
    settle('positions', getPositions, (v) => (out.positions = v)),
    settle('activity', getActivity, (v) => (out.activity = v)),
  ])

  if (Object.keys(errors).length >= 6) out.status = 'error'
  jsonRes(res, 200, out)
}

async function handleBot(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const errors: Record<string, string> = {}
  const out: Record<string, any> = {
    ok: true,
    status: 'live',
    ts: Date.now(),
    addresses: { proxy: PROXY, eoa: EOA },
    balance: null,
    portfolioValue: null,
    gasPol: null,
    approved: null,
    positions: [],
    errors,
    monitored_markets: 0,
    eligible_markets: 0,
    in_range_markets: 0,
    markets: []
  }

  const settle = async <T,>(key: string, fn: () => Promise<T>, assign: (v: T) => void): Promise<void> => {
    try {
      assign(await fn())
    } catch (e) {
      errors[key] = e instanceof Error ? e.message : String(e)
    }
  }

  // Fetch wallet stats
  await Promise.all([
    settle('balance', getCollateral, (v) => (out.balance = v)),
    settle('portfolioValue', getValue, (v) => (out.portfolioValue = v)),
    settle('gasPol', getPol, (v) => (out.gasPol = v)),
    settle('approved', getApproved, (v) => (out.approved = v)),
    settle('positions', getPositions, (v) => (out.positions = v)),
  ])

  // Fetch open markets from Gamma API
  try {
    const rawMarkets = await fetchJson('https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=100') as any[]
    if (Array.isArray(rawMarkets)) {
      const EXCLUDED_KEYWORDS = [
        'crypto', 'cryptocurrency', 'bitcoin', 'ethereum', 'defi', 'nft', 'solana', 'polygon', 'blockchain', 'token', 'airdrop', 'stablecoin', 'memecoin', 'altcoin', 'btc', 'xrp', 'bnb', 'dogecoin', 'doge',
        'finance', 'stocks', 'forex', 'commodities', 'fed rate', 'fed funds', 'interest rate', 'inflation', 'gdp', 'earnings', 'ipo', 'etf', 's&p', 'nasdaq', 'dow jones', 'yield',
        'mlb', 'nba', 'nfl', 'nhl', 'baseball', 'basketball', 'football', 'hockey', 'soccer', 'mls', 'premier league', 'la liga', 'serie a', 'bundesliga', 'champions league', 'uefa', 'fifa', 'tennis', 'golf', 'ufc', 'mma', 'boxing', 'f1', 'formula 1', 'olympics', 'super bowl', 'world cup'
      ]

      const parseJsonList = (val: any): any[] => {
        if (Array.isArray(val)) return val
        if (typeof val === 'string') {
          try { return JSON.parse(val) } catch { return [] }
        }
        return []
      }

      const filtered = rawMarkets.filter((m: any) => {
        // Binary Yes/No outcomes check
        const outcomes = parseJsonList(m.outcomes)
        if (outcomes.length !== 2) return false
        const labels = outcomes.map(o => String(o).trim().toLowerCase())
        if (!labels.includes('yes') || !labels.includes('no')) return false

        // Exclude sports features
        if (m.sportsMarketType || m.gameStartTime || String(m.feeType || '').startsWith('sports') || m.negRisk) return false

        // Exclude based on keywords in title/description/category
        const textToSearch = `${m.question} ${m.groupItemTitle} ${m.category} ${m.description}`.toLowerCase()
        if (EXCLUDED_KEYWORDS.some(kw => textToSearch.includes(kw))) return false

        // Ends within 3 months check
        const endIso = m.endDate || m.endDateIso
        if (!endIso) return false
        const endTs = new Date(endIso).getTime()
        const nowTs = Date.now()
        const threeMonthsMs = 3 * 30 * 24 * 60 * 60 * 1000
        if (endTs < nowTs || endTs > nowTs + threeMonthsMs) return false

        return true
      })

      out.monitored_markets = filtered.length
      // Eligible markets are monitored markets where we don't have a position
      const ownedConditionIds = new Set((out.positions || []).map((p: any) => p.conditionId).filter(Boolean))
      const eligibleMarkets = filtered.filter(m => !ownedConditionIds.has(m.conditionId))
      out.eligible_markets = eligibleMarkets.length

      // In range markets are eligible markets where NO token price is below the cap (default 25c)
      // Prices are in outcomePrices: e.g. ["0.75", "0.25"] (Yes, No)
      const parseProbabilityPair = (val: any): [number, number] => {
        const prices = parseJsonList(val)
        if (prices.length < 2) return [0, 0]
        return [parseFloat(prices[0]) || 0, parseFloat(prices[1]) || 0]
      }

      const inRangeMarkets = eligibleMarkets.filter(m => {
        const [, noPrice] = parseProbabilityPair(m.outcomePrices)
        return noPrice > 0 && noPrice <= 0.25
      })
      out.in_range_markets = inRangeMarkets.length

      // Return details of top 15 eligible markets for the UI to show in scanned list or proposals
      out.markets = eligibleMarkets.slice(0, 15).map(m => {
        const [yesPrice, noPrice] = parseProbabilityPair(m.outcomePrices)
        const tokenIds = parseJsonList(m.clobTokenIds)
        return {
          slug: m.slug || '',
          title: m.question || m.slug || '',
          condition_id: m.conditionId || '',
          yes_token_id: tokenIds[0] || '',
          no_token_id: tokenIds[1] || '',
          yes_price: yesPrice,
          no_price: noPrice,
          volume: parseFloat(m.volume) || 0,
          liquidity: parseFloat(m.liquidity) || 0,
          end_date: m.endDate || ''
        }
      })
    }
  } catch (e) {
    errors['markets'] = e instanceof Error ? e.message : String(e)
  }

  if (Object.keys(errors).length >= 6) out.status = 'error'
  jsonRes(res, 200, out)
}

// --- copy-trader scorecard ---------------------------------------------------
function queryParam(url: string | undefined, key: string): string | null {
  try {
    return new URL(url ?? '', 'http://localhost').searchParams.get(key)
  } catch {
    return null
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

interface ClosedRow {
  pnl: number
  cost: number
  title: string
  outcome: string
  ts: number
}
interface OpenRow {
  title: string
  outcome: string
  size: number
  curPrice: number
  value: number
}

/** Top traders this week — picker for the copy panel. */
async function handleLeaderboard(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const j = await fetchJson(`${DATA_API}/v1/leaderboard?period=week&orderBy=pnl&limit=20`)
    const rows = Array.isArray(j)
      ? j.slice(0, 20).map((raw) => {
          const r = raw as Record<string, unknown>
          return {
            rank: num(r.rank),
            name: str(r.userName) || str(r.proxyWallet).slice(0, 10),
            addr: str(r.proxyWallet),
            pnl: num(r.pnl),
            vol: num(r.vol),
          }
        })
      : []
    jsonRes(res, 200, { ok: true, ts: Date.now(), traders: rows })
  } catch (e) {
    jsonRes(res, 200, { ok: false, ts: Date.now(), traders: [], error: errMsg(e) })
  }
}

/** Run the R-B-I backtest battery on one trader's public record. */
async function handleCopy(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const user = (queryParam(req.url, 'user') ?? '').toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(user)) {
    jsonRes(res, 400, { ok: false, message: 'invalid or missing ?user=0x… (40 hex)' })
    return
  }

  const errors: Record<string, string> = {}
  let value: number | null = null
  let closedRaw: unknown[] = []
  let openRaw: unknown[] = []

  await Promise.all([
    fetchJson(`${DATA_API}/value?user=${user}`)
      .then((j) => {
        if (Array.isArray(j) && j.length > 0) value = num((j[0] as Record<string, unknown>).value)
      })
      .catch((e) => (errors.value = errMsg(e))),
    fetchJson(`${DATA_API}/closed-positions?user=${user}&limit=500`)
      .then((j) => {
        if (Array.isArray(j)) closedRaw = j
      })
      .catch((e) => (errors.closed = errMsg(e))),
    fetchJson(`${DATA_API}/positions?user=${user}&sizeThreshold=0.1`)
      .then((j) => {
        if (Array.isArray(j)) openRaw = j
      })
      .catch((e) => (errors.open = errMsg(e))),
  ])

  const cp: ClosedRow[] = closedRaw.map((raw) => {
    const r = raw as Record<string, unknown>
    return {
      pnl: num(r.realizedPnl),
      cost: num(r.totalBought),
      title: str(r.title) || str(r.slug),
      outcome: str(r.outcome),
      ts: num(r.timestamp),
    }
  })
  const count = cp.length
  const netRealized = cp.reduce((a, x) => a + x.pnl, 0)
  const totalStaked = cp.reduce((a, x) => a + x.cost, 0)
  const roiPct = totalStaked > 0 ? (netRealized / totalStaked) * 100 : 0
  const settledWins = cp.filter((x) => x.pnl > 0).length
  const biggestWin = cp.reduce((m, x) => Math.max(m, x.pnl), 0)
  const concentrationPct = netRealized > 0 ? (biggestWin / netRealized) * 100 : 0
  const recent = [...cp]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 8)
    .map((x) => ({ win: x.pnl > 0, pnl: Math.round(x.pnl), title: x.title.slice(0, 52) }))

  const open: OpenRow[] = openRaw
    .map((raw) => {
      const r = raw as Record<string, unknown>
      return {
        title: str(r.title) || str(r.slug),
        outcome: str(r.outcome),
        size: num(r.size),
        curPrice: num(r.curPrice),
        value: num(r.currentValue) || num(r.value),
      }
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  // Heuristic verdict — deliberately conservative, not a precise "score".
  const reasons: string[] = []
  if (count < 10) reasons.push('⚠ Small sample (<10 settled) — low confidence')
  if (concentrationPct >= 60) reasons.push(`⚠ ${Math.round(concentrationPct)}% of profit came from ONE bet — fragile`)
  if (roiPct >= 15 && count >= 20 && concentrationPct < 50) reasons.push('✓ Solid ROI across a real sample, not one lucky hit')
  if (roiPct < 0) reasons.push('✗ Net-negative realized PnL')
  if (reasons.length === 0) reasons.push('Mixed signal — readable record, no strong edge or red flag')
  let label = 'Mixed'
  if (roiPct >= 15 && count >= 20 && concentrationPct < 50) label = 'Promising'
  if (concentrationPct >= 60 || count < 10 || roiPct < 0) label = 'Caution'

  jsonRes(res, 200, {
    ok: true,
    ts: Date.now(),
    user,
    value,
    closed: { count, netRealized, totalStaked, roiPct, settledWins, biggestWin, concentrationPct, recent },
    open,
    score: { label, reasons },
    caveats: [
      'No win-rate % shown on purpose: closed-positions returns settled WINNERS, so a naive rate reads ~100%. True rate needs full buy/sell-ledger reconstruction.',
      'The leaderboard ranks survivors — past performance is not predictive.',
      'Whale-size positions may sit in markets too thin to copy at $5 — check liquidity before mirroring.',
    ],
    errors,
  })
}

/**
 * Dispatch Polymarket routes. Returns true if the request was handled (so the
 * caller stops walking the middleware chain), false to pass through.
 */
export function tryHandlePolymarketRoutes(req: IncomingMessage, res: ServerResponse): boolean {
  const pathName = pathnameOnly(req.url ?? '')
  if (!pathName.startsWith('/api/polymarket/')) return false

  const method = (req.method ?? 'GET').toUpperCase()
  if (method === 'GET' && pathName === '/api/polymarket/wallet') {
    void handleWallet(req, res)
    return true
  }
  if (method === 'GET' && pathName === '/api/polymarket/bot') {
    void handleBot(req, res)
    return true
  }
  if (method === 'GET' && pathName === '/api/polymarket/leaderboard') {
    void handleLeaderboard(req, res)
    return true
  }
  if (method === 'GET' && pathName === '/api/polymarket/copy') {
    void handleCopy(req, res)
    return true
  }

  jsonRes(res, 404, { ok: false, status: 'error', message: 'Unknown Polymarket route' })
  return true
}
