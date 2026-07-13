import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  BarChart3,
  Coins,
  Database,
  ExternalLink,
  Flame,
  FolderOpen,
  Layers,
  RefreshCw,
  Target,
  Zap,
} from 'lucide-react'
import ZoneHeader from '../../components/ZoneHeader'
import Button from '../../components/ui/Button'
import { LoadingState, ErrorState } from '../../components/ui/states'
import { CONTAINERS } from '../../lib/design-tokens'

/**
 * Cost zone — AI spend, from the CodeBurn snapshot baked into
 * `public/data/codeburn.json` by `scripts/refresh-codeburn.mjs` (run by hand via
 * `npm run refresh:codeburn`, and every morning by the vault's daily-brief
 * routine). CodeBurn reads local session logs and only serves them from
 * localhost, so — like the Daily Brief — this zone consumes a committed
 * snapshot and never re-derives.
 */

const DATA_URL = '/data/codeburn.json'
const LIVE_URL = 'http://127.0.0.1:4747'

type PeriodKey = 'today' | 'month' | 'all'

interface Activity_ { name: string; cost: number; turns: number; oneShotRate: number | null }
interface ModelRow { name: string; cost: number; calls: number; inputTokens: number; outputTokens: number }
interface ProjectRow { name: string; cost: number; calls: number; sessions: number }
interface ProviderRow { name: string; cost: number; calls: number }

interface PeriodData {
  label: string
  cost: number
  calls: number
  sessions: number
  oneShotRate: number | null
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  cacheHitPercent: number
  codexCredits: number
  topActivities: Activity_[]
  topModels: ModelRow[]
  topProjects: ProjectRow[]
  providers: ProviderRow[]
}

interface DailyPoint { date: string; cost: number; calls: number; inputTokens: number; outputTokens: number }

interface CodeburnSnapshot {
  generated_at: string
  device: string
  history: { daily: DailyPoint[] }
  periods: Record<PeriodKey, PeriodData | null>
}

const PERIOD_TABS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'Last 6 months' },
]

/* ─── formatting helpers ───────────────────────────────────────────── */
const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n >= 100 ? 0 : 2 })
const usd2 = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
function compact(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(Math.round(n))
}
const pct = (n: number | null) => (n == null ? '—' : `${Math.round(n * (n <= 1 ? 100 : 1))}%`)

function StatTile({
  icon,
  value,
  label,
  sub,
  accent,
}: {
  icon: React.ReactNode
  value: React.ReactNode
  label: string
  sub?: string
  accent?: boolean
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl border px-4 py-3.5"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-soft)' }}
    >
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-xl ${
          accent ? 'bg-emerald-500/15 text-emerald-600' : 'bg-emerald-500/10 text-emerald-600'
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span
          className="block truncate text-sm font-bold tabular-nums"
          style={{ color: accent ? 'var(--good, #059669)' : 'var(--text-1)' }}
        >
          {value}
        </span>
        <span className="block text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
          {label}
          {sub ? <span className="ml-1 normal-case tracking-normal opacity-80">· {sub}</span> : null}
        </span>
      </span>
    </div>
  )
}

function SectionCard({
  title,
  right,
  children,
}: {
  title: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section
      className="rounded-2xl border p-5 sm:p-6"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-soft)' }}
    >
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
          {title}
        </h2>
        <span className="ml-auto">{right}</span>
      </div>
      {children}
    </section>
  )
}

/** Simple, dependency-free daily bar chart (matches the live visualizer). */
function DailyBars({ data, metric }: { data: DailyPoint[]; metric: 'cost' | 'calls' }) {
  const max = Math.max(1, ...data.map(d => d[metric]))
  return (
    <div className="flex h-40 items-end gap-[2px] overflow-hidden">
      {data.map(d => {
        const v = d[metric]
        const h = Math.max(2, (v / max) * 100)
        const title =
          metric === 'cost'
            ? `${d.date} · ${usd2(d.cost)} · ${d.calls} calls`
            : `${d.date} · ${d.calls} calls · ${usd2(d.cost)}`
        return (
          <div
            key={d.date}
            title={title}
            className="flex-1 rounded-t-sm transition-opacity hover:opacity-70"
            style={{
              height: `${h}%`,
              minWidth: 2,
              background: v > 0 ? 'var(--good, #10b981)' : 'var(--border)',
            }}
          />
        )
      })}
    </div>
  )
}

function BarRow({ label, value, max, right }: { label: string; value: number; max: number; right: string }) {
  const w = max > 0 ? Math.max(3, (value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-40 shrink-0 truncate text-[13px]" style={{ color: 'var(--text-2)' }} title={label}>
        {label}
      </span>
      <span className="relative h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--bg-hover)' }}>
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${w}%`, background: 'var(--good, #10b981)' }} />
      </span>
      <span className="w-20 shrink-0 text-right text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text-1)' }}>
        {right}
      </span>
    </div>
  )
}

export default function CostZone() {
  const [data, setData] = useState<CodeburnSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<PeriodKey>('month')
  const [metric, setMetric] = useState<'cost' | 'calls'>('cost')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`snapshot not found (${res.status})`)
      const json = (await res.json()) as CodeburnSnapshot
      setData(json)
      // Default to the first period that actually has data.
      if (!json.periods[period]) {
        const first = (['month', 'today', 'all'] as PeriodKey[]).find(k => json.periods[k])
        if (first) setPeriod(first)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cur = data?.periods[period] ?? null
  const daily = data?.history.daily ?? []
  const chartMax = useMemo(() => Math.max(1, ...daily.map(d => d[metric])), [daily, metric])

  return (
    <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}>
      <div className={`${CONTAINERS.page} py-8`}>
        <div className="mx-auto w-full max-w-5xl space-y-5">
          <ZoneHeader
          eyebrow="AI SPEND · CODEBURN"
          title="Cost"
          icon={Flame}
          description="Where your AI coding tokens go — by task, tool, model, and project. Baked from CodeBurn on your Mac."
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => load()}
                leading={<RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />}
              >
                Reload
              </Button>
              <a href={LIVE_URL} target="_blank" rel="noopener noreferrer" title="Opens the live CodeBurn dashboard running on your Mac (localhost:4747)">
                <Button variant="primary" size="sm" trailing={<ExternalLink className="size-3.5" />}>
                  Open live dashboard
                </Button>
              </a>
            </div>
          }
        />

        {loading && !data ? <LoadingState label="Loading spend snapshot…" /> : null}
        {error && !data ? (
          <ErrorState
            title="No CodeBurn snapshot yet"
            message={`${error}. Run "npm run refresh:codeburn" on your Mac to bake one.`}
            onRetry={() => load()}
          />
        ) : null}

        {data ? (
          <>
            {/* Period tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              {PERIOD_TABS.map(t => {
                const has = !!data.periods[t.key]
                const active = period === t.key
                return (
                  <button
                    key={t.key}
                    type="button"
                    disabled={!has}
                    onClick={() => setPeriod(t.key)}
                    className="rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-40"
                    style={{
                      background: active ? 'var(--accent)' : 'var(--bg-card)',
                      color: active ? '#fff' : 'var(--text-2)',
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    }}
                  >
                    {t.label}
                  </button>
                )
              })}
              <span className="ml-auto text-[11px]" style={{ color: 'var(--text-4)' }}>
                {data.device} · snapshot {new Date(data.generated_at).toLocaleString()}
              </span>
            </div>

            {cur ? (
              <>
                {/* Headline cost */}
                <section
                  className="rounded-2xl border p-5 sm:p-6"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border-soft)' }}
                >
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                        {cur.label} · spend
                      </div>
                      <div className="text-4xl font-bold tabular-nums" style={{ color: 'var(--good, #059669)' }}>
                        {usd2(cur.cost)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {(['cost', 'calls'] as const).map(m => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setMetric(m)}
                          className="rounded-md px-2.5 py-1 text-[12px] font-medium capitalize transition-colors"
                          style={{
                            background: metric === m ? 'var(--bg-hover)' : 'transparent',
                            color: metric === m ? 'var(--text-1)' : 'var(--text-3)',
                            border: '1px solid var(--border-soft)',
                          }}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4">
                    <DailyBars data={daily} metric={metric} />
                    <div className="mt-1.5 flex justify-between text-[10px]" style={{ color: 'var(--text-4)' }}>
                      <span>{daily[0]?.date ?? ''}</span>
                      <span>daily {metric} · max {metric === 'cost' ? usd(chartMax) : compact(chartMax)}</span>
                      <span>{daily[daily.length - 1]?.date ?? ''}</span>
                    </div>
                  </div>
                </section>

                {/* Stat grid */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <StatTile icon={<Coins className="size-4" />} value={usd(cur.cost)} label="Cost" accent />
                  <StatTile
                    icon={<Layers className="size-4" />}
                    value={compact(cur.inputTokens + cur.outputTokens)}
                    label="Tokens"
                    sub={`${compact(cur.inputTokens)} in / ${compact(cur.outputTokens)} out`}
                  />
                  <StatTile icon={<Activity className="size-4" />} value={cur.calls.toLocaleString()} label="Calls" />
                  <StatTile icon={<Zap className="size-4" />} value={cur.sessions.toLocaleString()} label="Sessions" />
                  <StatTile icon={<Target className="size-4" />} value={pct(cur.oneShotRate)} label="One-shot" />
                  <StatTile
                    icon={<Database className="size-4" />}
                    value={`${cur.cacheHitPercent.toFixed(1)}%`}
                    label="Cache hit"
                  />
                  <StatTile icon={<Database className="size-4" />} value={compact(cur.cacheReadTokens)} label="Cache read" />
                  <StatTile icon={<Database className="size-4" />} value={compact(cur.cacheWriteTokens)} label="Cache write" />
                </div>

                {/* Breakdowns */}
                <div className="grid gap-4 lg:grid-cols-2">
                  <SectionCard title="By activity" right={<Activity className="size-3.5" style={{ color: 'var(--text-4)' }} />}>
                    {cur.topActivities.length ? (
                      <div>
                        {cur.topActivities.slice(0, 8).map(a => (
                          <BarRow
                            key={a.name}
                            label={a.name}
                            value={a.cost}
                            max={cur.topActivities[0].cost}
                            right={usd(a.cost)}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-[13px]" style={{ color: 'var(--text-4)' }}>No activity data.</p>
                    )}
                  </SectionCard>

                  <SectionCard title="Top models" right={<BarChart3 className="size-3.5" style={{ color: 'var(--text-4)' }} />}>
                    {cur.topModels.length ? (
                      <div>
                        {cur.topModels.slice(0, 8).map(m => (
                          <BarRow key={m.name} label={m.name} value={m.cost} max={cur.topModels[0].cost} right={usd(m.cost)} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-[13px]" style={{ color: 'var(--text-4)' }}>No model data.</p>
                    )}
                  </SectionCard>

                  <SectionCard title="Top projects" right={<FolderOpen className="size-3.5" style={{ color: 'var(--text-4)' }} />}>
                    {cur.topProjects.length ? (
                      <div>
                        {cur.topProjects.slice(0, 8).map(p => (
                          <BarRow key={p.name} label={p.name} value={p.cost} max={cur.topProjects[0].cost} right={usd(p.cost)} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-[13px]" style={{ color: 'var(--text-4)' }}>No project data.</p>
                    )}
                  </SectionCard>

                  <SectionCard title="By provider" right={<Coins className="size-3.5" style={{ color: 'var(--text-4)' }} />}>
                    {cur.providers.length ? (
                      <div>
                        {cur.providers.slice(0, 8).map(p => (
                          <BarRow key={p.name} label={p.name} value={p.cost} max={cur.providers[0].cost} right={usd(p.cost)} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-[13px]" style={{ color: 'var(--text-4)' }}>No provider data.</p>
                    )}
                  </SectionCard>
                </div>

                <p className="pt-1 text-center text-[11px]" style={{ color: 'var(--text-4)' }}>
                  Snapshot only — refresh from your Mac with{' '}
                  <code
                    className="rounded px-1.5 py-0.5"
                    style={{ background: 'var(--bg-hover)', color: 'var(--text-2)' }}
                  >
                    npm run refresh:codeburn
                  </code>
                  , or open the live dashboard above.
                </p>
              </>
            ) : (
              <p className="py-8 text-center text-sm" style={{ color: 'var(--text-4)' }}>
                No data for this period in the snapshot.
              </p>
            )}
          </>
        ) : null}
        </div>
      </div>
    </div>
  )
}
