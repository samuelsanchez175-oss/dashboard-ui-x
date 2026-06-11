import { useEffect, useState } from 'react'
import {
  Cpu,
  Trash2,
  RefreshCw,
  SlidersHorizontal,
  Check,
  X,
  ShieldAlert,
  ExternalLink,
  ChevronRight
} from 'lucide-react'
import ZoneHeader from '../../components/ZoneHeader'
import Button from '../../components/ui/Button'
import { usePolymarketBotData } from './usePolymarketBotData'
import type { BotPosition } from './usePolymarketBotData'

const usd = (n: number | null | undefined): string => {
  if (n == null) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const usdShort = (n: number | null | undefined): string => {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1000) {
    return `$${(n / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k`
  }
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

const fmtPct = (n: number | null | undefined): string => {
  if (n == null) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

export default function PolymarketBotZone() {
  const {
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
    clearPaperData
  } = usePolymarketBotData()

  const [showConfig, setShowConfig] = useState(false)
  const [draftCap, setDraftCap] = useState(settings.priceCap.toString())
  const [draftSize, setDraftSize] = useState(settings.tradeSize.toString())
  const [draftScout, setDraftScout] = useState(settings.copyTargetAddress)

  // Sync draft states with settings
  useEffect(() => {
    setDraftCap(settings.priceCap.toString())
    setDraftSize(settings.tradeSize.toString())
    setDraftScout(settings.copyTargetAddress)
  }, [settings])

  // 1s ticker so "updated Ns ago" stays live.
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const agoStr = lastUpdated ? `${Math.max(0, Math.round((Date.now() - lastUpdated) / 1000))}s ago` : '—'

  const handleSaveSettings = () => {
    const cap = parseFloat(draftCap) || 0.25
    const size = parseFloat(draftSize) || 10
    setSettings({
      ...settings,
      priceCap: cap,
      tradeSize: size,
      copyTargetAddress: draftScout
    })
    setShowConfig(false)
  }

  // Combined stats
  const cashBalance = data?.balance ?? 0
  const realPositionsValue = data?.portfolioValue ?? 0
  const paperPositionsValue = paperPositions.reduce((acc, p) => acc + p.value, 0)
  const totalPositionsValue = realPositionsValue + paperPositionsValue

  // Compute paper realized PnL + current open paper PnL
  const paperOpenPnL = paperPositions.reduce((acc, p) => acc + p.pnl, 0)
  const paperRealizedPnL = paperTrades
    .filter(t => t.status === 'success' && t.action === 'sell')
    .reduce((acc, t) => acc + t.amount, 0) // simplify
  const sessionPnL = paperOpenPnL + paperRealizedPnL

  // Standard Apps / links configuration
  const handleMarketLink = (slug: string) => `https://polymarket.com/event/${slug}`

  return (
    <div
      className="flex-1 overflow-y-auto"
      style={{
        background: 'var(--bg-canvas)',
        backgroundImage: 'url("/nothingeverhappens.svg")',
        backgroundSize: '100% 100%',
        backgroundPosition: 'center center',
        backgroundAttachment: 'fixed',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Warm backdrop filter overlay representing the sterlingcrispin "nothing ever happens" layout */}
      <div className="min-h-full px-6 py-12 backdrop-brightness-[0.98] backdrop-contrast-[1.01] dark:backdrop-brightness-[0.92]">
        <div className="mx-auto max-w-7xl">
          <ZoneHeader
            eyebrow="POLYMARKET COCKPIT"
            title="Nothing Ever Happens"
            icon={Cpu}
            description={
              <>
                Autonomous trading funnel scout. Runs active proposers on standalone binary markets.{' '}
                <span className="font-semibold text-amber-600 dark:text-amber-400">CC0 Layout & Strategy Funnel</span>.
              </>
            }
            actions={
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ background: error ? 'var(--warn)' : 'var(--good)', animation: 'pulse-dot 1.5s infinite' }}
                  />
                  updated {agoStr}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={refresh}
                  disabled={loading}
                  leading={<RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />}
                >
                  Refresh
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowConfig(!showConfig)}
                  leading={<SlidersHorizontal className="size-3.5" />}
                >
                  Strategies
                </Button>
              </div>
            }
          />

          {/* Configuration panel */}
          {showConfig && (
            <div
              className="mt-6 rounded-xl p-6 shadow-lg border animate-fadeDown"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-1)' }}>
                Strategy Settings
              </h3>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
                    NO-Bias Price Cap (¢)
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={draftCap}
                    onChange={(e) => setDraftCap(e.target.value)}
                    className="rounded-lg border px-3 py-2 text-sm outline-none"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                  />
                  <span className="text-[10px] text-[var(--text-4)]">Bet NO if ask price is below this cap.</span>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
                    Target Trade Size ($)
                  </span>
                  <input
                    type="number"
                    min="1"
                    value={draftSize}
                    onChange={(e) => setDraftSize(e.target.value)}
                    className="rounded-lg border px-3 py-2 text-sm outline-none"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                  />
                  <span className="text-[10px] text-[var(--text-4)]">Standard stake per proposed trade.</span>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
                    Scout Target Wallet
                  </span>
                  <input
                    type="text"
                    value={draftScout}
                    onChange={(e) => setDraftScout(e.target.value)}
                    className="rounded-lg border px-3 py-2 text-sm outline-none font-mono"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                  />
                  <span className="text-[10px] text-[var(--text-4)]">EOA/Proxy to copy trades from.</span>
                </div>
                <div className="flex flex-col justify-end gap-2">
                  <Button variant="primary" size="md" onClick={handleSaveSettings}>
                    Save Settings
                  </Button>
                </div>
              </div>

              <div className="mt-6 border-t pt-4 flex flex-wrap items-center justify-between gap-4" style={{ borderColor: 'var(--border)' }}>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.strategies.nobias}
                      onChange={(e) => setSettings({
                        ...settings,
                        strategies: { ...settings.strategies, nobias: e.target.checked }
                      })}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    NO-Bias Sniper
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.strategies.copyScout}
                      onChange={(e) => setSettings({
                        ...settings,
                        strategies: { ...settings.strategies, copyScout: e.target.checked }
                      })}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    Copy-Trader Scout
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.strategies.hftSniper}
                      onChange={(e) => setSettings({
                        ...settings,
                        strategies: { ...settings.strategies, hftSniper: e.target.checked }
                      })}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    HFT Arbitrageur
                  </label>
                </div>
                <button
                  type="button"
                  onClick={clearPaperData}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
                >
                  <Trash2 className="size-3.5" /> Reset Cockpit History
                </button>
              </div>
            </div>
          )}

          {/* Stats Cards Funnel */}
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
            <div className="rounded-xl border p-4 bg-white/70 backdrop-blur-md dark:bg-[#14151b]/70" style={{ borderColor: 'var(--border)' }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1">Monitored</div>
              <div className="text-xl font-bold font-mono text-[var(--text-1)]">{data?.monitored_markets ?? '--'}</div>
              <div className="text-[9px] text-[var(--text-4)] mt-1 truncate">filtered standalone</div>
            </div>
            <div className="rounded-xl border p-4 bg-white/70 backdrop-blur-md dark:bg-[#14151b]/70" style={{ borderColor: 'var(--border)' }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1">Eligible</div>
              <div className="text-xl font-bold font-mono text-[var(--text-1)]">{data?.eligible_markets ?? '--'}</div>
              <div className="text-[9px] text-[var(--text-4)] mt-1 truncate">no current position</div>
            </div>
            <div className="rounded-xl border p-4 bg-white/70 backdrop-blur-md dark:bg-[#14151b]/70" style={{ borderColor: 'var(--border)' }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1">In Range</div>
              <div className="text-xl font-bold font-mono text-[var(--text-1)]">{data?.in_range_markets ?? '--'}</div>
              <div className="text-[9px] text-[var(--text-4)] mt-1 truncate">ask below cap</div>
            </div>
            <div className="rounded-xl border p-4 bg-white/70 backdrop-blur-md dark:bg-[#14151b]/70" style={{ borderColor: 'var(--border)' }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1">Proposals</div>
              <div className="text-xl font-bold font-mono text-purple-600 dark:text-purple-400">{proposals.length}</div>
              <div className="text-[9px] text-[var(--text-4)] mt-1 truncate">awaiting approval</div>
            </div>
            <div className="rounded-xl border p-4 bg-white/70 backdrop-blur-md dark:bg-[#14151b]/70" style={{ borderColor: 'var(--border)' }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1">Spendable</div>
              <div className="text-xl font-bold font-mono text-[var(--good)]">{usdShort(cashBalance)}</div>
              <div className="text-[9px] text-[var(--text-4)] mt-1 truncate">wallet pUSD</div>
            </div>
            <div className="rounded-xl border p-4 bg-white/70 backdrop-blur-md dark:bg-[#14151b]/70" style={{ borderColor: 'var(--border)' }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1">Positions Val</div>
              <div className="text-xl font-bold font-mono text-[var(--text-1)]">{usdShort(totalPositionsValue)}</div>
              <div className="text-[9px] text-[var(--text-4)] mt-1 truncate">real + paper bets</div>
            </div>
            <div className="rounded-xl border p-4 bg-white/70 backdrop-blur-md dark:bg-[#14151b]/70" style={{ borderColor: 'var(--border)' }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1">Session PnL</div>
              <div className="text-xl font-bold font-mono" style={{ color: sessionPnL >= 0 ? 'var(--good)' : 'var(--bad)' }}>
                {sessionPnL >= 0 ? '+' : ''}{usdShort(sessionPnL)}
              </div>
              <div className="text-[9px] text-[var(--text-4)] mt-1 truncate">realized + open PnL</div>
            </div>
            <div className="rounded-xl border p-4 bg-white/70 backdrop-blur-md dark:bg-[#14151b]/70" style={{ borderColor: 'var(--border)' }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1">Bot Status</div>
              <div className="text-xs font-bold uppercase text-[var(--good)] mt-1 tracking-widest truncate">ACTIVE</div>
              <div className="text-[9px] text-[var(--text-4)] mt-2">watching wallet</div>
            </div>
          </div>

          {/* Proposals / Queue section */}
          <div
            className="mt-6 rounded-xl border p-6 bg-white/75 backdrop-blur-md dark:bg-[#14151b]/75 shadow-sm"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-1)' }}>
                Active Proposals Queue (Awaiting Approval)
              </h3>
              <span className="rounded-full bg-purple-100 text-purple-800 text-[10px] font-bold px-2 py-0.5 dark:bg-purple-900/30 dark:text-purple-300 font-mono">
                {proposals.length} proposed
              </span>
            </div>

            {proposals.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--text-3)] italic">
                Queue is empty. Proposers are scanning Polymarket standalone candidates...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
                      <th className="pb-3 font-semibold uppercase tracking-wider">Strategy</th>
                      <th className="pb-3 font-semibold uppercase tracking-wider">Market / Event</th>
                      <th className="pb-3 font-semibold uppercase tracking-wider">Outcome</th>
                      <th className="pb-3 font-semibold uppercase tracking-wider text-right">Price</th>
                      <th className="pb-3 font-semibold uppercase tracking-wider text-right">Target Size</th>
                      <th className="pb-3 font-semibold uppercase tracking-wider text-right">Est. Cost</th>
                      <th className="pb-3 font-semibold uppercase tracking-wider text-center">Confidence</th>
                      <th className="pb-3 font-semibold uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposals.map((prop) => (
                      <tr
                        key={prop.id}
                        className="border-b hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <td className="py-3.5 pr-2 font-medium">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-700 dark:text-purple-400">
                            {prop.strategy}
                          </span>
                        </td>
                        <td className="py-3.5 pr-2 max-w-[320px] font-sans">
                          <a
                            href={handleMarketLink(prop.slug)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 hover:text-[var(--accent)] transition-colors"
                          >
                            <span className="font-semibold text-[var(--text-1)] line-clamp-1">{prop.marketTitle}</span>
                            <ExternalLink className="size-3 shrink-0 text-[var(--text-3)]" />
                          </a>
                        </td>
                        <td className="py-3.5 pr-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400">
                            {prop.outcome}
                          </span>
                        </td>
                        <td className="py-3.5 pr-2 text-right font-mono font-semibold text-[var(--text-1)]">
                          {(prop.proposedPrice * 100).toFixed(0)}¢
                        </td>
                        <td className="py-3.5 pr-2 text-right font-mono text-[var(--text-2)]">
                          {prop.targetSize.toLocaleString()}
                        </td>
                        <td className="py-3.5 pr-2 text-right font-mono font-semibold text-[var(--text-1)]">
                          {usd(prop.cost)}
                        </td>
                        <td className="py-3.5 pr-2 text-center">
                          <span
                            className="font-mono font-bold text-xs"
                            style={{ color: prop.confidence >= 80 ? 'var(--good)' : 'var(--warn)' }}
                          >
                            {prop.confidence}%
                          </span>
                        </td>
                        <td className="py-3.5 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => dismissProposal(prop.id)}
                              className="p-1 rounded hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/20 text-[var(--text-3)] transition-colors"
                              title="Dismiss proposal"
                            >
                              <X className="size-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => approveProposal(prop.id)}
                              className="px-2.5 py-1 rounded bg-[var(--good)] hover:bg-[#047857] text-[#04140c] font-bold font-sans text-[11px] inline-flex items-center gap-1 shadow-sm transition-all active:scale-[0.97]"
                              title="Approve and execute trade"
                            >
                              <Check className="size-3.5 stroke-[3]" /> Approve
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Main Grid: Positions + Trades */}
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Open Positions Section (2/3 width) */}
            <div
              className="lg:col-span-2 rounded-xl border p-6 bg-white/75 backdrop-blur-md dark:bg-[#14151b]/75 shadow-sm"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-1)' }}>
                  Active Positions
                </h3>
                <span className="text-xs text-[var(--text-3)] font-mono">
                  {(data?.positions || []).length} real · {paperPositions.length} paper
                </span>
              </div>

              {((data?.positions || []).length === 0 && paperPositions.length === 0) ? (
                <div className="py-12 text-center text-xs text-[var(--text-3)] italic">
                  No open positions right now. Approve proposed trades to build your portfolio.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
                        <th className="pb-3 font-semibold uppercase tracking-wider">Market</th>
                        <th className="pb-3 font-semibold uppercase tracking-wider">Side</th>
                        <th className="pb-3 font-semibold uppercase tracking-wider text-right">Size</th>
                        <th className="pb-3 font-semibold uppercase tracking-wider text-right">Avg Paid</th>
                        <th className="pb-3 font-semibold uppercase tracking-wider text-right">Current</th>
                        <th className="pb-3 font-semibold uppercase tracking-wider text-right">Market Value</th>
                        <th className="pb-3 font-semibold uppercase tracking-wider text-right">PnL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Real Positions */}
                      {(data?.positions || []).map((p: BotPosition, idx) => (
                        <tr
                          key={`real-${idx}`}
                          className="border-b hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                          style={{ borderColor: 'var(--border)' }}
                        >
                          <td className="py-3 pr-2">
                            <div className="font-semibold text-[var(--text-1)] line-clamp-1">{p.title}</div>
                            <div className="text-[10px] text-[var(--text-4)] flex items-center gap-1 font-mono mt-0.5">
                              <span>REAL</span> · <span>{p.slug}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-2">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[9px] font-bold dark:bg-purple-900/30 dark:text-purple-300">
                              {p.outcome}
                            </span>
                          </td>
                          <td className="py-3 pr-2 text-right font-mono text-[var(--text-2)]">
                            {p.size.toLocaleString()}
                          </td>
                          <td className="py-3 pr-2 text-right font-mono text-[var(--text-2)]">
                            {usd(p.avgPrice)}
                          </td>
                          <td className="py-3 pr-2 text-right font-mono text-[var(--text-2)]">
                            {usd(p.curPrice)}
                          </td>
                          <td className="py-3 pr-2 text-right font-mono font-semibold text-[var(--text-1)]">
                            {usd(p.value)}
                          </td>
                          <td
                            className="py-3 text-right font-mono font-bold"
                            style={{ color: p.pnl >= 0 ? 'var(--good)' : 'var(--bad)' }}
                          >
                            <div>{p.pnl >= 0 ? '+' : ''}{usd(p.pnl)}</div>
                            <div className="text-[9px] font-semibold opacity-75">{fmtPct(p.percentPnl)}</div>
                          </td>
                        </tr>
                      ))}

                      {/* Paper Positions */}
                      {paperPositions.map((p: BotPosition, idx) => (
                        <tr
                          key={`paper-${idx}`}
                          className="border-b hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                          style={{ borderColor: 'var(--border)' }}
                        >
                          <td className="py-3 pr-2">
                            <div className="font-semibold text-[var(--text-1)] line-clamp-1">{p.title}</div>
                            <div className="text-[10px] text-[var(--text-4)] flex items-center gap-1 font-mono mt-0.5">
                              <span className="text-amber-600 dark:text-amber-400 font-bold">PAPER</span> · <span>{p.slug}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-2">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-bold dark:bg-amber-900/30 dark:text-amber-300">
                              {p.outcome}
                            </span>
                          </td>
                          <td className="py-3 pr-2 text-right font-mono text-[var(--text-2)]">
                            {p.size.toLocaleString()}
                          </td>
                          <td className="py-3 pr-2 text-right font-mono text-[var(--text-2)]">
                            {usd(p.avgPrice)}
                          </td>
                          <td className="py-3 pr-2 text-right font-mono text-[var(--text-2)]">
                            {usd(p.curPrice)}
                          </td>
                          <td className="py-3 pr-2 text-right font-mono font-semibold text-[var(--text-1)]">
                            {usd(p.value)}
                          </td>
                          <td
                            className="py-3 text-right font-mono font-bold"
                            style={{ color: p.pnl >= 0 ? 'var(--good)' : 'var(--bad)' }}
                          >
                            <div>{p.pnl >= 0 ? '+' : ''}{usd(p.pnl)}</div>
                            <div className="text-[9px] font-semibold opacity-75">{fmtPct(p.percentPnl)}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Recent Trades Section (1/3 width) */}
            <div
              className="rounded-xl border p-6 bg-white/75 backdrop-blur-md dark:bg-[#14151b]/75 shadow-sm"
              style={{ borderColor: 'var(--border)' }}
            >
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-1)' }}>
                Recent Trades Ledger
              </h3>

              {paperTrades.length === 0 ? (
                <div className="py-12 text-center text-xs text-[var(--text-3)] italic">
                  No trades recorded yet.
                </div>
              ) : (
                <div className="flex flex-col gap-3 max-h-[420px] overflow-y-auto pr-1">
                  {paperTrades.map((t, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border p-3 bg-white/50 dark:bg-black/20"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="rounded bg-emerald-500/10 text-emerald-700 text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-wider dark:text-emerald-400">
                          {t.action} {t.side}
                        </span>
                        <span className="text-[9px] text-[var(--text-4)] font-mono">
                          {new Date((t.ts || 0) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      <div className="text-[11px] font-semibold text-[var(--text-1)] line-clamp-1 mb-1">{t.market_slug}</div>
                      <div className="flex items-center justify-between text-[10px] text-[var(--text-3)] font-mono">
                        <div>
                          <span>Amt:</span> <span className="font-semibold text-[var(--text-2)]">{usd(t.amount)}</span>
                        </div>
                        <div>
                          <span>Price:</span> <span className="font-semibold text-[var(--text-2)]">{(t.reference_price * 100).toFixed(0)}¢</span>
                        </div>
                      </div>
                      {t.strategy && (
                        <div className="mt-1.5 text-[8.5px] text-[var(--text-4)] uppercase tracking-wider font-semibold flex items-center gap-1">
                          <ChevronRight className="size-2" /> {t.strategy}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Integration disclaimers */}
          <div className="mt-8 flex gap-2 rounded-xl p-4 text-[11px] bg-amber-500/5 border" style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
            <ShieldAlert className="size-4 shrink-0 text-amber-500" />
            <div className="flex flex-col gap-1.5">
              <p className="font-semibold text-[var(--text-2)]">Unified Proposal Engine & CLI Integration Notice:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Trade proposals in this Cockpit are evaluated by simulated strategy models using live Polymarket feeds.</li>
                <li>Executing via "Approve" records a local Paper Trade to test returns. To swap to on-chain orders, configure EOA private keys and launch <code className="px-1 rounded bg-black/10 dark:bg-white/10 font-mono">polymarket-cli clob create-order</code>.</li>
                <li>Standard Apps (like Blender, Figma, after-effects) will be connected as tags once these workflows are mapped to files in your Obsidian vault.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
