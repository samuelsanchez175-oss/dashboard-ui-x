import { useEffect, useState } from 'react'
import {
  Wallet,
  RefreshCw,
  Fuel,
  ExternalLink,
  CircleDollarSign,
  TrendingUp,
  Activity as ActivityIcon,
  Copy,
  Check,
} from 'lucide-react'
import ZoneHeader from '../../components/ZoneHeader'
import Button from '../../components/ui/Button'
import { usePolymarketWalletData } from './usePolymarketWalletData'

const usd = (n: number | null | undefined): string =>
  n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const shortAddr = (a: string | undefined): string => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—')

const scan = (a: string): string => `https://polygonscan.com/address/${a}`

function CopyAddr({ value }: { value: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value)
        setDone(true)
        setTimeout(() => setDone(false), 1200)
      }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] transition-colors"
      style={{ color: 'var(--text-3)', border: '1px solid var(--border)' }}
      title="Copy address"
    >
      {done ? <Check className="size-3" /> : <Copy className="size-3" />}
      {done ? 'copied' : 'copy'}
    </button>
  )
}

function StatCard({
  label,
  value,
  sub,
  accent,
  icon: Icon,
}: {
  label: string
  value: string
  sub?: React.ReactNode
  accent?: string
  icon: typeof Wallet
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="size-3.5" style={{ color: 'var(--text-3)' }} />
        <span
          className="text-[11px] font-semibold uppercase"
          style={{ color: 'var(--text-3)', letterSpacing: '0.08em' }}
        >
          {label}
        </span>
      </div>
      <div
        className="text-[28px] font-semibold leading-none"
        style={{ color: accent ?? 'var(--text-1)', fontFamily: 'var(--font-mono)' }}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-2 text-[12px]" style={{ color: 'var(--text-3)' }}>
          {sub}
        </div>
      )}
    </div>
  )
}

function Step({ n, label, state, sub }: { n: number; label: string; state: 'done' | 'active' | 'idle'; sub: string }) {
  const ring =
    state === 'done' ? 'var(--good)' : state === 'active' ? 'var(--accent)' : 'var(--border)'
  const fg = state === 'done' ? 'var(--good)' : state === 'active' ? 'var(--text-1)' : 'var(--text-3)'
  return (
    <div className="flex flex-1 items-center gap-3 px-4 py-3">
      <div
        className="grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-bold"
        style={{
          border: `1px solid ${ring}`,
          background: state === 'done' ? 'var(--good)' : state === 'active' ? 'var(--accent)' : 'transparent',
          color: state === 'idle' ? 'var(--text-3)' : '#04140c',
        }}
      >
        {state === 'done' ? '✓' : n}
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold" style={{ color: fg }}>
          {label}
        </div>
        <div className="truncate text-[11px]" style={{ color: 'var(--text-3)' }}>
          {sub}
        </div>
      </div>
    </div>
  )
}

export default function PolymarketWalletZone() {
  const { data, loading, error, lastUpdated, refresh } = usePolymarketWalletData()

  // 1s ticker so "updated Ns ago" stays live.
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const proxy = data?.addresses.proxy ?? '0xB6Ebd5C112725eEAc60B64d77f712Cd3807F4b66'
  const eoa = data?.addresses.eoa ?? '0xfE7C0BC616c35d1C12c7BF7a6a566C7b39211316'

  const balance = data?.balance ?? null
  const gas = data?.gasPol ?? null
  const approved = data?.approved ?? null
  const funded = (balance ?? 0) > 0
  const ready = funded && approved === true

  const agoStr = lastUpdated ? `${Math.max(0, Math.round((Date.now() - lastUpdated) / 1000))}s ago` : '—'

  const positions = data?.positions ?? []
  const activity = data?.activity ?? []

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-canvas)' }}>
      <div className="mx-auto max-w-6xl px-6 pb-16 pt-12">
        <ZoneHeader
          eyebrow="POLYMARKET"
          title="Wallet"
          icon={Wallet}
          description={
            <>
              Live read-only view of your trading wallet —{' '}
              <a href={scan(proxy)} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                {shortAddr(proxy)} ↗
              </a>
              . Auto-refreshes every 30s.
            </>
          }
          actions={
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ background: error ? 'var(--warn)' : 'var(--good)' }}
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
            </div>
          }
        />

        {/* setup stepper */}
        <div
          className="mt-6 flex flex-col rounded-xl sm:flex-row"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <Step n={1} label="Funded" state={funded ? 'done' : 'active'} sub={funded ? `${usd(balance)} in` : 'awaiting deposit'} />
          <div style={{ borderLeft: '1px solid var(--border)' }} />
          <Step
            n={2}
            label="Approved"
            state={approved === true ? 'done' : funded ? 'active' : 'idle'}
            sub={approved === true ? 'contracts approved' : (gas ?? 0) > 0 ? 'run approve set' : 'needs POL for gas'}
          />
          <div style={{ borderLeft: '1px solid var(--border)' }} />
          <Step n={3} label="Ready to trade" state={ready ? 'done' : 'idle'} sub={ready ? 'place an order' : 'after approvals'} />
        </div>

        {/* stat cards */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Spendable balance"
            value={usd(balance)}
            accent="var(--good)"
            icon={CircleDollarSign}
            sub="pUSD · ready to bet"
          />
          <StatCard
            label="Gas (POL)"
            value={gas == null ? '—' : gas.toFixed(4)}
            icon={Fuel}
            accent={gas != null && gas === 0 ? 'var(--warn)' : undefined}
            sub={gas != null && gas === 0 ? 'no gas — approvals blocked' : 'Polygon gas for approvals'}
          />
          <StatCard label="Portfolio value" value={usd(data?.portfolioValue)} icon={TrendingUp} sub="open positions, marked to market" />
        </div>

        {/* addresses */}
        <div className="mt-4 rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="mb-3 text-[11px] font-semibold uppercase" style={{ color: 'var(--text-3)', letterSpacing: '0.08em' }}>
            Addresses
          </div>
          {[
            { k: 'Proxy · holds funds', v: proxy },
            { k: 'EOA · signer / gas', v: eoa },
          ].map((row) => (
            <div
              key={row.v}
              className="flex items-center justify-between gap-3 py-2"
              style={{ borderTop: row.k.startsWith('EOA') ? '1px solid var(--border)' : undefined }}
            >
              <div className="min-w-0">
                <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                  {row.k}
                </div>
                <div className="truncate text-[12px]" style={{ color: 'var(--text-1)', fontFamily: 'var(--font-mono)' }}>
                  {row.v}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <CopyAddr value={row.v} />
                <a
                  href={scan(row.v)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px]"
                  style={{ color: 'var(--accent)' }}
                >
                  explorer <ExternalLink className="size-3" />
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* positions */}
        <div className="mt-4 rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase" style={{ color: 'var(--text-3)', letterSpacing: '0.08em' }}>
            <TrendingUp className="size-3.5" /> Positions
          </div>
          {positions.length === 0 ? (
            <div className="py-6 text-center text-[13px]" style={{ color: 'var(--text-3)' }}>
              No positions yet — place your first bet to see it here.
            </div>
          ) : (
            <table className="w-full text-[12px]" style={{ fontFamily: 'var(--font-mono)' }}>
              <thead>
                <tr style={{ color: 'var(--text-3)' }}>
                  <th className="pb-2 text-left font-medium">Market</th>
                  <th className="pb-2 text-left font-medium">Side</th>
                  <th className="pb-2 text-right font-medium">Size</th>
                  <th className="pb-2 text-right font-medium">Value</th>
                  <th className="pb-2 text-right font-medium">PnL</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="py-2 pr-2" style={{ color: 'var(--text-1)', fontFamily: 'var(--font-sans)' }}>
                      {p.title}
                    </td>
                    <td className="py-2" style={{ color: 'var(--text-2)' }}>
                      {p.outcome}
                    </td>
                    <td className="py-2 text-right" style={{ color: 'var(--text-2)' }}>
                      {p.size.toFixed(2)}
                    </td>
                    <td className="py-2 text-right" style={{ color: 'var(--text-1)' }}>
                      {usd(p.value)}
                    </td>
                    <td className="py-2 text-right" style={{ color: p.pnl >= 0 ? 'var(--good)' : 'var(--bad)' }}>
                      {p.pnl >= 0 ? '+' : ''}
                      {usd(p.pnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* activity */}
        <div className="mt-4 rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase" style={{ color: 'var(--text-3)', letterSpacing: '0.08em' }}>
            <ActivityIcon className="size-3.5" /> Recent activity
          </div>
          {activity.length === 0 ? (
            <div className="py-6 text-center text-[13px]" style={{ color: 'var(--text-3)' }}>
              No activity yet.
            </div>
          ) : (
            <div className="flex flex-col">
              {activity.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 py-2 text-[12px]"
                  style={{ borderTop: i === 0 ? undefined : '1px solid var(--border)' }}
                >
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] uppercase" style={{ background: 'var(--bg-hover)', color: 'var(--text-2)' }}>
                    {a.type}
                  </span>
                  <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text-1)' }}>
                    {a.title || '—'} {a.outcome && <span style={{ color: 'var(--text-3)' }}>· {a.outcome}</span>}
                  </span>
                  <span className="shrink-0" style={{ color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                    {a.size ? `${a.size.toFixed(2)}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* error / degraded note */}
        {data && Object.keys(data.errors).length > 0 && (
          <div className="mt-4 text-[11px]" style={{ color: 'var(--warn)' }}>
            Some sources are temporarily unavailable: {Object.keys(data.errors).join(', ')} — will retry on next refresh.
          </div>
        )}
        {error && !data && (
          <div className="mt-4 text-[12px]" style={{ color: 'var(--bad)' }}>
            Could not reach the wallet API: {error}
          </div>
        )}
      </div>
    </div>
  )
}
