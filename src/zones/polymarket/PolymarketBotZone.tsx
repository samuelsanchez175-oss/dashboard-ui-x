import { useEffect, useState } from 'react'
import { usePolymarketBotData } from './usePolymarketBotData'
import type { TradeProposal, CockpitFill } from './usePolymarketBotData'
import './PolymarketBotZone.css'

const fmtUsd = (value: number | null | undefined, digits = 2) => {
  if (value == null || Number.isNaN(Number(value))) return "--"
  return "$" + Number(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

const fmtPct = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(Number(value))) return "--"
  const num = Number(value)
  const sign = num >= 0 ? "+" : ""
  return sign + num.toFixed(2) + "%"
}

const fmtShares = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(Number(value))) return "--"
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: 4 })
}

const fmtResolves = (endDate: string | null | undefined) => {
  if (!endDate) return '—'
  const d = new Date(endDate)
  if (isNaN(d.getTime())) return '—'
  const now = Date.now()
  const diff = d.getTime() - now
  if (diff < 0) return 'Resolved'
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days < 7) return `${days}d`
  if (days < 30) return `${Math.floor(days / 7)}w`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${Math.floor(days / 365)}y`
}

const fmtAgo = (tsMs: number | null | undefined) => {
  if (!tsMs) return "--"
  const delta = Math.max(0, Math.floor((Date.now() - tsMs) / 1000))
  if (delta < 60) return delta + "s ago"
  if (delta < 3600) return Math.floor(delta / 60) + "m ago"
  return Math.floor(delta / 3600) + "h ago"
}

export default function PolymarketBotZone() {
  const {
    data,
    lastUpdated,
    settings,
    proposals,
    history,
    historySummary,
    approvingId,
    approvalError,
    cockpitOnline,
    cockpitBalance,
    setSettings,
    approveProposal,
    dismissProposal,
    clearPaperData,
    refresh,
  } = usePolymarketBotData()

  // 1s ticker so "updated Ns ago" stays live.
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Cockpit balance (via CLI) is authoritative — BFF eth_call returns 0 because
  // Polymarket CLOB funds aren't a raw ERC-20 balance on-chain.
  const cashBalance = cockpitBalance ?? data?.balance ?? 0
  const realPositionsValue = data?.portfolioValue ?? 0
  const totalPositionsValue = realPositionsValue

  const sessionPnL = historySummary?.realizedPnl ?? 0

  const allPositions = data?.positions ?? []
  // Paper-trading positions aren't wired to the cockpit feed yet — keep the
  // "real | paper" split honest with an empty set so the count reads 0.
  const paperPositions: typeof allPositions = []

  const handleCopyScoutToggle = () => {
    setSettings({
      ...settings,
      strategies: {
        ...settings.strategies,
        copyScout: !settings.strategies.copyScout
      }
    })
  }

  return (
    <div className="neh-dashboard">
      <div className="shell">
        <div className="header">
          <div className="title">
            <span className="eyebrow">Polymarket Cockpit</span>
            <h1>Nothing Ever Happens</h1>
            <div className="subtitle text-sm">
              Autonomous trading funnel scout running standalone binary markets.
            </div>
          </div>
          <div className="header-actions">
            <div className={`socket ${cockpitOnline ? 'connected' : 'disconnected'}`}>
              cockpit: {cockpitOnline ? 'live' : 'offline'} · updated {fmtAgo(lastUpdated)}
            </div>
            <button className="theme-toggle" type="button" aria-label="Refresh" title="Refresh" onClick={refresh}>↻</button>
          </div>
        </div>

        <div className="summary-grid">
          <div className="summary-card">
            <div className="label">Monitored</div>
            <div className="value">{data?.monitored_markets ?? '--'}</div>
            <div className="meta">filtered standalone</div>
          </div>
          <div className="summary-card">
            <div className="label">Eligible</div>
            <div className="value">{data?.eligible_markets ?? '--'}</div>
            <div className="meta">no current position</div>
          </div>
          <div className="summary-card">
            <div className="label">In Range</div>
            <div className="value">{data?.in_range_markets ?? '--'}</div>
            <div className="meta">ask at or below cap</div>
          </div>
          <div className="summary-card">
            <div className="label">Open Positions</div>
            <div className="value">{allPositions.length}</div>
            <div className="meta">{data?.positions?.length || 0} real | {paperPositions.length} paper</div>
          </div>
          <div className="summary-card">
            <div className="label">Cash</div>
            <div className="value">{fmtUsd(cashBalance)}</div>
            <div className="meta">pUSD spendable</div>
          </div>
          <div className="summary-card">
            <div className="label">Portfolio</div>
            <div className="value">{fmtUsd(cashBalance + totalPositionsValue)}</div>
            <div className="meta">cash {fmtUsd(cashBalance)} | pos {fmtUsd(totalPositionsValue)}</div>
          </div>
          <div className="summary-card">
            <div className="label">Session PnL</div>
            <div className="value">
              <span className={sessionPnL >= 0 ? 'positive' : 'negative'}>
                {sessionPnL >= 0 ? '+' : ''}{fmtUsd(sessionPnL)}
              </span>
            </div>
            <div className="meta">balance {fmtUsd(cashBalance)}</div>
          </div>
          <div className="summary-card">
            <div className="label">Proposals</div>
            <div className="value">{proposals.length}</div>
            <div className="meta">awaiting approval</div>
          </div>
        </div>

        <section className="panel control-panel">
          <div className="panel-head">
            <h2 className="panel-title">Strategy Controls</h2>
            <div className="panel-note">Bot Configuration</div>
          </div>
          <div className="control-row">
            <div className="control-field">
              <span>Scout Target (Copy Trade)</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input 
                  type="text" 
                  className="control-input mono" 
                  value={settings.copyTargetAddress}
                  onChange={(e) => setSettings({...settings, copyTargetAddress: e.target.value})}
                  style={{ width: '100%', fontSize: '0.8rem' }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}>
                  <input type="checkbox" checked={settings.strategies.copyScout} onChange={handleCopyScoutToggle} />
                  Active
                </label>
              </div>
            </div>
            <div className="control-field">
              <span>Trade Size ($)</span>
              <input 
                type="number" 
                className="control-input mono" 
                value={settings.tradeSize}
                onChange={(e) => setSettings({...settings, tradeSize: Number(e.target.value) || 10})}
                style={{ width: '100px' }}
              />
            </div>
            <div className="control-actions">
               <button className="action-button" onClick={clearPaperData} style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>Reset Memory</button>
            </div>
          </div>
        </section>

        {proposals.length > 0 && (
          <section className="panel" style={{ marginBottom: '18px', border: '1px solid var(--accent)' }}>
            <div className="panel-head">
              <h2 className="panel-title" style={{ color: 'var(--accent)' }}>Awaiting Approval Queue</h2>
              <div className="panel-note">
                {cockpitOnline
                  ? <span style={{ color: 'var(--green)' }}>● cockpit live — approve executes real order</span>
                  : <span style={{ color: 'var(--red)' }}>● cockpit offline — start cockpit.py to trade</span>}
              </div>
            </div>
            {approvalError && (
              <div style={{ padding: '8px 12px', marginBottom: '10px', background: 'rgba(255,77,79,0.1)', border: '1px solid var(--red)', borderRadius: '8px', color: 'var(--red)', fontSize: '13px' }}>
                ✕ {approvalError}
              </div>
            )}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Strategy</th>
                    <th>Market</th>
                    <th>Outcome</th>
                    <th>Price</th>
                    <th>Size</th>
                    <th>Cost</th>
                    <th>Conf.</th>
                    <th>Resolves</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {proposals.map((prop: TradeProposal) => {
                    const isApproving = approvingId === prop.id
                    const isBusy = approvingId !== null
                    return (
                      <tr key={prop.id} style={{ opacity: isBusy && !isApproving ? 0.5 : 1 }}>
                        <td className="mono" style={{ fontSize: '0.75rem' }}>{prop.strategy}</td>
                        <td>
                          {prop.slug ? (
                            <a href={`https://polymarket.com/event/${prop.slug}`} target="_blank" rel="noreferrer" className="market-link">
                              <span className="market-name">{prop.marketTitle}</span>
                              <span className="market-slug">{prop.slug}</span>
                            </a>
                          ) : prop.condition_id ? (
                            <a href={`https://polymarket.com/event/${prop.condition_id}`} target="_blank" rel="noreferrer" className="market-link">
                              <span className="market-name">{prop.marketTitle}</span>
                            </a>
                          ) : (
                            <a href={`https://polymarket.com/search?q=${encodeURIComponent(prop.marketTitle)}`} target="_blank" rel="noreferrer" className="market-link">
                              <span className="market-name">{prop.marketTitle}</span>
                            </a>
                          )}
                        </td>
                        <td><span className="outcome-pill">{prop.outcome}</span></td>
                        <td className="mono">{prop.proposedPrice > 0 ? (prop.proposedPrice * 100).toFixed(0) + '¢' : '—'}</td>
                        <td className="mono">{prop.targetSize > 0 ? prop.targetSize.toLocaleString() : '—'}</td>
                        <td className="mono font-bold">{fmtUsd(prop.cost)}</td>
                        <td className="mono">
                          <span className={prop.confidence >= 80 ? 'positive' : 'negative'}>
                            {typeof prop.confidence === 'number' ? prop.confidence + '%' : prop.confidence}
                          </span>
                        </td>
                        <td className="mono" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                          {prop.end_date ? (
                            <span title={new Date(prop.end_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}>
                              {fmtResolves(prop.end_date)}
                            </span>
                          ) : '—'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              className="btn-dismiss"
                              disabled={isBusy}
                              onClick={() => dismissProposal(prop.id)}
                            >
                              Skip
                            </button>
                            <button
                              className="btn-approve"
                              disabled={isBusy || (!cockpitOnline && !prop._fromCockpit)}
                              title={(!cockpitOnline && !prop._fromCockpit) ? 'Start cockpit.py first' : undefined}
                              onClick={() => approveProposal(prop.id)}
                              style={isApproving ? { opacity: 0.7 } : undefined}
                            >
                              {isApproving ? '⏳ placing…' : `Approve ${fmtUsd(prop.cost)}`}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div className="layout">
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Open Positions</h2>
              <div className="panel-note">Real + Paper Tracker</div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Market</th>
                    <th>Side</th>
                    <th>Size</th>
                    <th>Avg Paid</th>
                    <th>Current</th>
                    <th>Value</th>
                    <th>PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {allPositions.length === 0 ? (
                    <tr><td colSpan={8} className="empty">No open positions</td></tr>
                  ) : (
                    allPositions.map((p, idx) => {
                      return (
                        <tr key={idx}>
                          <td className="mono">
                            <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--green)' }}>
                              REAL
                            </span>
                          </td>
                          <td>
                            {p.slug ? (
                              <a href={`https://polymarket.com/event/${p.slug}`} target="_blank" rel="noreferrer" className="market-link">
                                <span className="market-name">{p.title}</span>
                                <span className="market-slug">{p.slug}</span>
                              </a>
                            ) : (
                              <a href={`https://polymarket.com/search?q=${encodeURIComponent(p.title)}`} target="_blank" rel="noreferrer" className="market-link">
                                <span className="market-name">{p.title}</span>
                              </a>
                            )}
                          </td>
                          <td><span className="outcome-pill">{p.outcome}</span></td>
                          <td className="mono">{fmtShares(p.size)}</td>
                          <td className="mono">{fmtUsd(p.avgPrice, 4)}</td>
                          <td className="mono">{fmtUsd(p.curPrice, 4)}</td>
                          <td className="mono font-bold">{fmtUsd(p.value)}</td>
                          <td>
                            <div className={`mono ${p.pnl >= 0 ? 'positive' : 'negative'}`}>
                              {p.pnl >= 0 ? '+' : ''}{fmtUsd(p.pnl)}
                            </div>
                            <div className={`trade-meta ${p.percentPnl >= 0 ? 'positive' : 'negative'}`}>
                              {fmtPct(p.percentPnl)}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel" style={{ gridColumn: '1 / -1' }}>
            <div className="panel-head">
              <h2 className="panel-title">Trade History</h2>
              <div className="panel-note" style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                {historySummary && (
                  <>
                    <span>{historySummary.totalTrades} trades</span>
                    <span style={{ color: 'var(--green)' }}>{historySummary.wonTrades}W</span>
                    <span style={{ color: 'var(--red)' }}>{historySummary.lostTrades}L</span>
                    <span style={{ color: 'var(--dim)' }}>{historySummary.openTrades} open</span>
                    {historySummary.winRate != null && (
                      <span style={{ color: historySummary.winRate >= 0.5 ? 'var(--green)' : 'var(--red)' }}>
                        {(historySummary.winRate * 100).toFixed(0)}% win rate
                      </span>
                    )}
                    <span style={{ color: historySummary.realizedPnl >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                      PnL: {historySummary.realizedPnl >= 0 ? '+' : ''}{fmtUsd(historySummary.realizedPnl)}
                    </span>
                  </>
                )}
                {!cockpitOnline && <span style={{ color: 'var(--dim)' }}>cockpit offline</span>}
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date / Time</th>
                    <th>Market</th>
                    <th>Outcome</th>
                    <th>Strategy</th>
                    <th>Cost</th>
                    <th>Price</th>
                    <th>Shares</th>
                    <th>Payout</th>
                    <th>P&amp;L</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="empty">
                        {cockpitOnline ? 'No trades yet — approve a proposal above to start' : 'Start cockpit.py to see history'}
                      </td>
                    </tr>
                  ) : (
                    history.map((f: CockpitFill, idx) => {
                      const statusColor =
                        f.status === 'won' ? 'var(--green)' :
                        f.status === 'lost' ? 'var(--red)' :
                        f.status === 'redeemed' ? 'var(--blue)' : 'var(--dim)'
                      const pnlColor = (f.pnl ?? 0) >= 0 ? 'var(--green)' : 'var(--red)'
                      const date = new Date(f.ts * 1000)
                      const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' })
                      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      return (
                        <tr key={f.id ?? idx}>
                          <td className="mono" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                            <div>{dateStr}</div>
                            <div style={{ color: 'var(--dim)' }}>{timeStr}</div>
                          </td>
                          <td style={{ maxWidth: '200px' }}>
                            <span className="market-name" style={{ fontSize: '0.8rem' }}>{f.market}</span>
                          </td>
                          <td><span className="outcome-pill">{f.outcome ?? f.side}</span></td>
                          <td style={{ fontSize: '0.75rem', color: 'var(--dim)' }}>{f.strategy || '—'}</td>
                          <td className="mono font-bold">{fmtUsd(f.amount)}</td>
                          <td className="mono">{f.price ? (f.price * 100).toFixed(0) + '¢' : '—'}</td>
                          <td className="mono">{f.shares_est != null ? f.shares_est.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}</td>
                          <td className="mono">{f.payout != null ? fmtUsd(f.payout) : '—'}</td>
                          <td>
                            {f.pnl != null ? (
                              <span className="mono" style={{ color: pnlColor, fontWeight: 600 }}>
                                {f.pnl >= 0 ? '+' : ''}{fmtUsd(f.pnl)}
                              </span>
                            ) : <span style={{ color: 'var(--dim)' }}>open</span>}
                          </td>
                          <td>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: statusColor, textTransform: 'uppercase' }}>
                              {f.status ?? 'open'}
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
