import { useEffect, useState } from 'react'
import { usePolymarketBotData } from './usePolymarketBotData'
import type { TradeProposal } from './usePolymarketBotData'
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

const fmtTime = (epochSec: number | null | undefined) => {
  if (!epochSec) return "--"
  const d = new Date(epochSec * 1000)
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
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
    paperPositions,
    paperTrades,
    setSettings,
    approveProposal,
    dismissProposal,
    clearPaperData
  } = usePolymarketBotData()

  // 1s ticker so "updated Ns ago" stays live.
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const cashBalance = data?.balance ?? 0
  const realPositionsValue = data?.portfolioValue ?? 0
  const paperPositionsValue = paperPositions.reduce((acc, p) => acc + p.value, 0)
  const totalPositionsValue = realPositionsValue + paperPositionsValue

  const paperOpenPnL = paperPositions.reduce((acc, p) => acc + p.pnl, 0)
  const paperRealizedPnL = paperTrades
    .filter(t => t.status === 'success' && t.action === 'sell')
    .reduce((acc, t) => acc + t.amount, 0)
  const sessionPnL = paperOpenPnL + paperRealizedPnL

  const allPositions = [...(data?.positions || []), ...paperPositions]

  const toggleTheme = () => {
    document.documentElement.classList.toggle('dark')
  }

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
            <div className="socket connected">
              socket: connected (updated {fmtAgo(lastUpdated)})
            </div>
            <button className="theme-toggle" type="button" aria-label="Toggle theme" title="Switch theme" onClick={toggleTheme}>🌙</button>
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
              <div className="panel-note">Manual execution required</div>
            </div>
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
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {proposals.map((prop: TradeProposal) => (
                    <tr key={prop.id}>
                      <td className="mono" style={{ fontSize: '0.75rem' }}>{prop.strategy}</td>
                      <td>
                        <a href={`https://polymarket.com/event/${prop.slug}`} target="_blank" rel="noreferrer" className="market-link">
                          <span className="market-name">{prop.marketTitle}</span>
                          <span className="market-slug">{prop.slug}</span>
                        </a>
                      </td>
                      <td><span className="outcome-pill">{prop.outcome}</span></td>
                      <td className="mono">{(prop.proposedPrice * 100).toFixed(0)}¢</td>
                      <td className="mono">{prop.targetSize.toLocaleString()}</td>
                      <td className="mono font-bold">{fmtUsd(prop.cost)}</td>
                      <td className="mono"><span className={prop.confidence >= 80 ? 'positive' : 'negative'}>{prop.confidence}%</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button className="btn-dismiss" onClick={() => dismissProposal(prop.id)}>Skip</button>
                          <button className="btn-approve" onClick={() => approveProposal(prop.id)}>Approve</button>
                        </div>
                      </td>
                    </tr>
                  ))}
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
                      const isPaper = !data?.positions?.some(real => real.conditionId === p.conditionId && real.outcome === p.outcome)
                      return (
                        <tr key={idx}>
                          <td className="mono">
                            <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: isPaper ? 'var(--accent)' : 'var(--text)' }}>
                              {isPaper ? 'PAPER' : 'REAL'}
                            </span>
                          </td>
                          <td>
                            <a href={`https://polymarket.com/event/${p.slug}`} target="_blank" rel="noreferrer" className="market-link">
                              <span className="market-name">{p.title}</span>
                              <span className="market-slug">{p.slug}</span>
                            </a>
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

          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Recent Trades</h2>
              <div className="panel-note">Paper trade ledger tail</div>
            </div>
            <div className="trade-list">
              {paperTrades.length === 0 ? (
                <div className="empty">No trades yet</div>
              ) : (
                paperTrades.map((t, idx) => (
                  <div className="trade-item" key={idx}>
                    <div className="trade-top">
                      <div className={`trade-action ${t.action === 'buy' ? 'positive' : 'negative'}`}>
                        {t.action}
                      </div>
                      <div className="trade-meta mono">{fmtTime(t.ts)}</div>
                    </div>
                    <div className="trade-meta">
                      {t.side} | {t.market_slug}
                    </div>
                    <div className="trade-detail">
                      <strong>Amount:</strong> {fmtUsd(t.amount)} &nbsp;
                      <strong>Price:</strong> {fmtUsd(t.reference_price, 4)}
                      <br/>
                      <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{t.strategy}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
