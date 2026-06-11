import { useEffect, useState } from 'react'
import { Users, RefreshCw, Search, Trophy, TrendingUp, AlertTriangle } from 'lucide-react'
import ZoneHeader from '../../components/ZoneHeader'
import Button from '../../components/ui/Button'
import { useCopyTraderData } from './useCopyTraderData'

const usd = (n: number | null | undefined): string => {
  if (n == null) return '—'
  const abs = Math.abs(n)
  const s =
    abs >= 1000
      ? `$${(n / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k`
      : `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  return s
}
const short = (a: string): string => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—')

const VERDICT: Record<string, { bg: string; fg: string }> = {
  Promising: { bg: 'rgba(22,199,132,.10)', fg: 'var(--good)' },
  Mixed: { bg: 'rgba(245,166,35,.10)', fg: 'var(--warn)' },
  Caution: { bg: 'rgba(255,77,79,.10)', fg: 'var(--bad)' },
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="mb-2 text-[11px] font-semibold uppercase" style={{ color: 'var(--text-3)', letterSpacing: '0.08em' }}>
        {label}
      </div>
      <div className="text-[24px] font-semibold leading-none" style={{ color: accent ?? 'var(--text-1)', fontFamily: 'var(--font-mono)' }}>
        {value}
      </div>
    </div>
  )
}

export default function CopyTraderZone() {
  const { address, setAddress, score, leaderboard, loading, error, lastUpdated, refresh } = useCopyTraderData()
  const [draft, setDraft] = useState(address)
  useEffect(() => setDraft(address), [address])

  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const ago = lastUpdated ? `${Math.max(0, Math.round((Date.now() - lastUpdated) / 1000))}s ago` : '—'

  const c = score?.closed
  const verdict = score?.score.label ?? 'Mixed'
  const vc = VERDICT[verdict] ?? VERDICT.Mixed

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-canvas)' }}>
      <div className="mx-auto max-w-6xl px-6 pb-16 pt-12">
        <ZoneHeader
          eyebrow="POLYMARKET"
          title="Copy-Trader Scout"
          icon={Users}
          description="Backtest any trader's public record (R-B-I) before you mirror them. Read-only — works without a wallet."
          actions={
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
                <span className="inline-block size-2 rounded-full" style={{ background: error ? 'var(--warn)' : 'var(--good)' }} />
                updated {ago}
              </span>
              <Button variant="secondary" size="sm" onClick={refresh} disabled={loading} leading={<RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />}>
                Refresh
              </Button>
            </div>
          }
        />

        {/* picker */}
        <div className="mt-6 flex flex-col gap-3 rounded-xl p-4 lg:flex-row lg:items-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex flex-1 items-center gap-2">
            <Search className="size-4 shrink-0" style={{ color: 'var(--text-3)' }} />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value.trim())}
              onKeyDown={(e) => e.key === 'Enter' && setAddress(draft)}
              placeholder="Paste a trader address (0x…)"
              spellCheck={false}
              className="w-full bg-transparent text-[13px] outline-none"
              style={{ color: 'var(--text-1)', fontFamily: 'var(--font-mono)' }}
            />
            <Button variant="primary" size="sm" onClick={() => setAddress(draft)}>
              Analyze
            </Button>
          </div>
        </div>

        {/* leaderboard quick-pick */}
        {leaderboard.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase" style={{ color: 'var(--text-3)', letterSpacing: '0.08em' }}>
              <Trophy className="size-3" /> This week:
            </span>
            {leaderboard.slice(0, 8).map((t) => (
              <button
                key={t.addr}
                onClick={() => setAddress(t.addr)}
                className="rounded-full px-2.5 py-1 text-[11px] transition-colors"
                style={{
                  border: '1px solid var(--border)',
                  background: t.addr.toLowerCase() === address.toLowerCase() ? 'var(--accent-soft)' : 'transparent',
                  color: t.addr.toLowerCase() === address.toLowerCase() ? 'var(--accent)' : 'var(--text-2)',
                }}
                title={`${t.name} · +${usd(t.pnl)} PnL · ${usd(t.vol)} vol`}
              >
                #{t.rank} {t.name.length > 14 ? short(t.addr) : t.name} · +{usd(t.pnl)}
              </button>
            ))}
          </div>
        )}

        {!score ? (
          <div className="mt-6 rounded-xl p-8 text-center text-[13px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>
            {loading ? 'Running backtest…' : error ?? 'Enter a trader address or pick from the leaderboard.'}
          </div>
        ) : (
          <>
            {/* verdict */}
            <div className="mt-4 flex flex-col gap-2 rounded-xl p-4 sm:flex-row sm:items-center sm:gap-4" style={{ background: vc.bg, border: `1px solid ${vc.fg}33` }}>
              <span className="shrink-0 rounded-md px-2.5 py-1 text-[12px] font-bold uppercase" style={{ background: vc.fg, color: '#04140c', letterSpacing: '0.05em' }}>
                {verdict}
              </span>
              <ul className="flex flex-col gap-0.5 text-[12px]" style={{ color: 'var(--text-2)' }}>
                {score.score.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>

            {/* scorecard */}
            <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat label="Portfolio value" value={usd(score.value)} />
              <Stat label="Net realized" value={usd(c?.netRealized)} accent={(c?.netRealized ?? 0) >= 0 ? 'var(--good)' : 'var(--bad)'} />
              <Stat label="ROI on stake" value={c ? `${Math.round(c.roiPct)}%` : '—'} accent={(c?.roiPct ?? 0) >= 0 ? 'var(--good)' : 'var(--bad)'} />
              <Stat label="Sample (settled)" value={c ? `${c.count}` : '—'} />
            </div>
            <div className="mt-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
              Concentration: biggest single win = <b style={{ color: 'var(--text-2)' }}>{c ? Math.round(c.concentrationPct) : 0}%</b> of all profit ·
              total staked {usd(c?.totalStaked)}
            </div>

            {/* recent form */}
            {c && c.recent.length > 0 && (
              <div className="mt-4 rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="mb-3 text-[11px] font-semibold uppercase" style={{ color: 'var(--text-3)', letterSpacing: '0.08em' }}>
                  Recent settled (newest first)
                </div>
                <div className="flex flex-col gap-1.5">
                  {c.recent.map((r, i) => (
                    <div key={i} className="flex items-center gap-3 text-[12px]">
                      <span className="grid size-5 shrink-0 place-items-center rounded text-[10px] font-bold" style={{ background: r.win ? 'rgba(22,199,132,.15)' : 'rgba(255,77,79,.15)', color: r.win ? 'var(--good)' : 'var(--bad)' }}>
                        {r.win ? 'W' : 'L'}
                      </span>
                      <span className="w-16 shrink-0 text-right" style={{ color: r.pnl >= 0 ? 'var(--good)' : 'var(--bad)', fontFamily: 'var(--font-mono)' }}>
                        {r.pnl >= 0 ? '+' : ''}
                        {usd(r.pnl)}
                      </span>
                      <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text-2)' }}>
                        {r.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* copy targets */}
            <div className="mt-4 rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase" style={{ color: 'var(--text-3)', letterSpacing: '0.08em' }}>
                <TrendingUp className="size-3.5" /> Current open positions — copy targets
              </div>
              {score.open.length === 0 ? (
                <div className="py-4 text-center text-[13px]" style={{ color: 'var(--text-3)' }}>
                  No open positions right now.
                </div>
              ) : (
                <table className="w-full text-[12px]" style={{ fontFamily: 'var(--font-mono)' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-3)' }}>
                      <th className="pb-2 text-left font-medium">Market</th>
                      <th className="pb-2 text-left font-medium">Side</th>
                      <th className="pb-2 text-right font-medium">Price</th>
                      <th className="pb-2 text-right font-medium">Their stake</th>
                    </tr>
                  </thead>
                  <tbody>
                    {score.open.map((p, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                        <td className="py-2 pr-2" style={{ color: 'var(--text-1)', fontFamily: 'var(--font-sans)' }}>{p.title}</td>
                        <td className="py-2" style={{ color: 'var(--text-2)' }}>{p.outcome}</td>
                        <td className="py-2 text-right" style={{ color: 'var(--text-2)' }}>{(p.curPrice * 100).toFixed(0)}¢</td>
                        <td className="py-2 text-right" style={{ color: 'var(--text-1)' }}>{usd(p.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* caveats */}
            <div className="mt-4 flex gap-2 rounded-xl p-4 text-[11px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>
              <AlertTriangle className="size-4 shrink-0" style={{ color: 'var(--warn)' }} />
              <ul className="flex flex-col gap-1">
                {score.caveats.map((cv, i) => (
                  <li key={i}>{cv}</li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
