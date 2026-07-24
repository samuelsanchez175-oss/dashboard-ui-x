import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  BarChart3,
  Bot,
  Check,
  ClipboardCopy,
  Coins,
  Database,
  ExternalLink,
  Flame,
  FolderOpen,
  Layers,
  RefreshCw,
  Server,
  Sparkles,
  Target,
  TrendingDown,
  Wrench,
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

type PeriodKey = 'today' | 'week' | '30days' | 'month' | 'all'

interface Activity_ { name: string; cost: number; turns: number; oneShotRate: number | null }
interface ModelRow { name: string; cost: number; calls: number; inputTokens: number; outputTokens: number }
interface ProjectRow { name: string; cost: number; calls: number; sessions: number; avgCostPerSession?: number }
interface ProviderRow { name: string; cost: number; calls: number }
interface ToolRow { name: string; calls: number; cost?: number }
interface SkillRow { name: string; turns: number; cost: number }
interface SubagentRow { name: string; calls: number; cost: number }
interface RetryTax {
  totalUSD: number
  retries: number
  editTurns: number
  byModel: { name: string; taxUSD: number; retries: number; retriesPerEdit: number }[]
}
interface RoutingWaste {
  totalSavingsUSD: number
  baselineModel: string
  baselineCostPerEdit: number
  byModel: {
    name: string
    costPerEdit: number
    editTurns: number
    actualUSD: number
    counterfactualUSD: number
    savingsUSD: number
  }[]
}
interface LocalModelSavings {
  totalUSD: number
  calls: number
  byModel: { name: string; savingsUSD: number; calls: number }[]
}

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
  // Sections the live visualizer renders — optional so an older snapshot
  // (baked before these were captured) still loads instead of blanking the zone.
  tools?: ToolRow[]
  skills?: SkillRow[]
  subagents?: SubagentRow[]
  mcpServers?: ToolRow[]
  retryTax?: RetryTax | null
  routingWaste?: RoutingWaste | null
  localModelSavings?: LocalModelSavings | null
}

interface DailyPoint { date: string; cost: number; calls: number; inputTokens: number; outputTokens: number }

interface CodeburnSnapshot {
  generated_at: string
  device: string
  history: { daily: DailyPoint[] }
  periods: Record<PeriodKey, PeriodData | null>
}

/** Same five periods, same order, as the live visualizer's tab bar. */
const PERIOD_TABS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: '7 days' },
  { key: '30days', label: '30 days' },
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

type Metric = 'cost' | 'tokens' | 'calls'

/** Value of a daily point under the selected metric. Tokens are in + out, the
 * same total the live visualizer charts. */
const metricValue = (d: DailyPoint, metric: Metric) =>
  metric === 'cost' ? d.cost : metric === 'calls' ? d.calls : d.inputTokens + d.outputTokens

/** Simple, dependency-free daily bar chart (matches the live visualizer). */
function DailyBars({ data, metric }: { data: DailyPoint[]; metric: Metric }) {
  const max = Math.max(1, ...data.map(d => metricValue(d, metric)))
  return (
    <div className="flex h-40 items-end gap-[2px] overflow-hidden">
      {data.map(d => {
        const v = metricValue(d, metric)
        const h = Math.max(2, (v / max) * 100)
        const title = `${d.date} · ${usd2(d.cost)} · ${d.calls} calls · ${compact(d.inputTokens + d.outputTokens)} tokens`
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

/**
 * One breakdown row. `total` is the period total for this breakdown — when
 * given, the row also shows its share of spend, the way the live visualizer
 * labels each bar ("$21.38  100%").
 */
function BarRow({
  label,
  value,
  max,
  right,
  total,
}: {
  label: string
  value: number
  max: number
  right: string
  total?: number
}) {
  const w = max > 0 ? Math.max(3, (value / max) * 100) : 0
  const share = total && total > 0 ? Math.round((value / total) * 100) : null
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
      {share != null ? (
        <span className="w-9 shrink-0 text-right text-[12px] tabular-nums" style={{ color: 'var(--text-4)' }}>
          {share}%
        </span>
      ) : null}
    </div>
  )
}

/** Compact table for the count-based panels (tools, skills, MCP servers, …),
 * matching the live visualizer's table panels. */
function DataTable({
  columns,
  rows,
  empty,
}: {
  columns: { key: string; label: string; align?: 'right' }[]
  rows: Record<string, React.ReactNode>[]
  empty: string
}) {
  if (!rows.length) {
    return (
      <p className="text-[13px]" style={{ color: 'var(--text-4)' }}>
        {empty}
      </p>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr>
            {columns.map(c => (
              <th
                key={c.key}
                className={`pb-2 text-[11px] font-semibold uppercase tracking-wide ${
                  c.align === 'right' ? 'text-right' : 'text-left'
                }`}
                style={{ color: 'var(--text-4)' }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border-soft)' }}>
              {columns.map(c => (
                <td
                  key={c.key}
                  className={`py-1.5 ${c.align === 'right' ? 'text-right tabular-nums font-semibold' : 'truncate'}`}
                  style={{ color: c.align === 'right' ? 'var(--text-1)' : 'var(--text-2)' }}
                >
                  {r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Headline number + caption, used inside the "Savings & waste" panel. */
function WasteStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'bad' | 'good' }) {
  return (
    <div className="rounded-xl border px-3.5 py-3" style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-hover)' }}>
      <div
        className="text-lg font-bold tabular-nums"
        style={{ color: tone === 'bad' ? 'var(--bad, #dc2626)' : tone === 'good' ? 'var(--good, #059669)' : 'var(--text-1)' }}
      >
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        {label}
      </div>
      {sub ? (
        <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-4)' }}>
          {sub}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Paste-ready prompt that re-bakes the CodeBurn spend snapshot. Copied by the
 * "Copy refresh prompt" button — drop it into Claude Code on the vault Mac to
 * update this zone with current AI-spend numbers.
 */
const REFRESH_PROMPT = `Refresh the CodeBurn AI-spend snapshot on the dashboard. cd "~/dev/UI Dashboard x" and run \`npm run refresh:codeburn\` to bake a fresh public/data/codeburn.json from the local CodeBurn CLI, then commit ONLY public/data/codeburn.json and git push origin main so the deployed Cost zone updates on Vercel. Report the new totals (today / month / all).`

export default function CostZone() {
  const [data, setData] = useState<CodeburnSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<PeriodKey>('month')
  const [metric, setMetric] = useState<Metric>('cost')
  const [copied, setCopied] = useState(false)

  async function copyRefreshPrompt() {
    try {
      await navigator.clipboard.writeText(REFRESH_PROMPT)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked — no-op */
    }
  }

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
        const first = (['month', '30days', 'week', 'today', 'all'] as PeriodKey[]).find(k => json.periods[k])
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
  const chartMax = useMemo(() => Math.max(1, ...daily.map(d => metricValue(d, metric))), [daily, metric])

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
                onClick={copyRefreshPrompt}
                leading={copied ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />}
                title="Copy the prompt that re-bakes the CodeBurn snapshot with current numbers"
              >
                {copied ? 'Copied!' : 'Copy refresh prompt'}
              </Button>
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
                      {(['cost', 'tokens', 'calls'] as const).map(m => (
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

                {/* Breakdowns — same panels, same order, as the live visualizer:
                    by tool · top models · top projects · by activity ·
                    subagents · skills · MCP servers · savings & waste · tools. */}
                <div className="grid gap-4 lg:grid-cols-2">
                  <SectionCard title="By tool" right={<Coins className="size-3.5" style={{ color: 'var(--text-4)' }} />}>
                    {cur.providers.length ? (
                      <div>
                        {cur.providers.slice(0, 8).map(p => (
                          <BarRow
                            key={p.name}
                            label={p.name}
                            value={p.cost}
                            max={cur.providers[0].cost}
                            right={usd(p.cost)}
                            total={cur.cost}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-[13px]" style={{ color: 'var(--text-4)' }}>No tool data.</p>
                    )}
                  </SectionCard>

                  <SectionCard title="Top models" right={<BarChart3 className="size-3.5" style={{ color: 'var(--text-4)' }} />}>
                    {cur.topModels.length ? (
                      <div>
                        {cur.topModels.slice(0, 8).map(m => (
                          <BarRow
                            key={m.name}
                            label={m.name}
                            value={m.cost}
                            max={cur.topModels[0].cost}
                            right={usd(m.cost)}
                            total={cur.cost}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-[13px]" style={{ color: 'var(--text-4)' }}>No model data.</p>
                    )}
                  </SectionCard>

                  <SectionCard title="Top projects" right={<FolderOpen className="size-3.5" style={{ color: 'var(--text-4)' }} />}>
                    <DataTable
                      columns={[
                        { key: 'name', label: 'Project' },
                        { key: 'cost', label: 'Cost', align: 'right' },
                        { key: 'sessions', label: 'Sessions', align: 'right' },
                      ]}
                      rows={cur.topProjects.slice(0, 8).map(p => ({
                        name: p.name,
                        cost: usd2(p.cost),
                        sessions: p.sessions.toLocaleString(),
                      }))}
                      empty="No project data."
                    />
                  </SectionCard>

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
                            total={cur.cost}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-[13px]" style={{ color: 'var(--text-4)' }}>No activity data.</p>
                    )}
                  </SectionCard>

                  <SectionCard title="Subagents" right={<Bot className="size-3.5" style={{ color: 'var(--text-4)' }} />}>
                    <DataTable
                      columns={[
                        { key: 'name', label: 'Subagent' },
                        { key: 'calls', label: 'Calls', align: 'right' },
                        { key: 'cost', label: 'Cost', align: 'right' },
                      ]}
                      rows={(cur.subagents ?? []).slice(0, 8).map(s => ({
                        name: s.name,
                        calls: s.calls.toLocaleString(),
                        cost: usd2(s.cost),
                      }))}
                      empty="No data."
                    />
                  </SectionCard>

                  <SectionCard title="Skills" right={<Sparkles className="size-3.5" style={{ color: 'var(--text-4)' }} />}>
                    <DataTable
                      columns={[
                        { key: 'name', label: 'Skill' },
                        { key: 'turns', label: 'Turns', align: 'right' },
                        { key: 'cost', label: 'Cost', align: 'right' },
                      ]}
                      rows={(cur.skills ?? []).slice(0, 8).map(s => ({
                        name: s.name,
                        turns: s.turns.toLocaleString(),
                        cost: usd2(s.cost),
                      }))}
                      empty="No data."
                    />
                  </SectionCard>

                  <SectionCard title="MCP servers" right={<Server className="size-3.5" style={{ color: 'var(--text-4)' }} />}>
                    <DataTable
                      columns={[
                        { key: 'name', label: 'Server' },
                        { key: 'calls', label: 'Calls', align: 'right' },
                      ]}
                      rows={(cur.mcpServers ?? []).slice(0, 8).map(m => ({
                        name: m.name,
                        calls: m.calls.toLocaleString(),
                      }))}
                      empty="No data."
                    />
                  </SectionCard>

                  <SectionCard title="Tools" right={<Wrench className="size-3.5" style={{ color: 'var(--text-4)' }} />}>
                    <DataTable
                      columns={[
                        { key: 'name', label: 'Tool' },
                        { key: 'calls', label: 'Calls', align: 'right' },
                      ]}
                      rows={(cur.tools ?? []).slice(0, 10).map(t => ({
                        name: t.name,
                        calls: t.calls.toLocaleString(),
                      }))}
                      empty="No data."
                    />
                  </SectionCard>
                </div>

                {/* Savings & waste — full width: three headline numbers plus the
                    per-model detail behind retry tax and routing waste. */}
                <SectionCard
                  title="Savings & waste"
                  right={<TrendingDown className="size-3.5" style={{ color: 'var(--text-4)' }} />}
                >
                  <div className="grid gap-3 sm:grid-cols-3">
                    <WasteStat
                      label="Local-model savings"
                      value={usd2(cur.localModelSavings?.totalUSD ?? 0)}
                      sub={`${(cur.localModelSavings?.calls ?? 0).toLocaleString()} calls on local models`}
                      tone="good"
                    />
                    <WasteStat
                      label="Retry tax"
                      value={usd2(cur.retryTax?.totalUSD ?? 0)}
                      sub={`${(cur.retryTax?.retries ?? 0).toLocaleString()} retries over ${(
                        cur.retryTax?.editTurns ?? 0
                      ).toLocaleString()} edit turns`}
                      tone="bad"
                    />
                    <WasteStat
                      label="Routing waste (potential)"
                      value={usd2(cur.routingWaste?.totalSavingsUSD ?? 0)}
                      sub={
                        cur.routingWaste?.baselineModel
                          ? `vs ${cur.routingWaste.baselineModel} at ${usd2(
                              cur.routingWaste.baselineCostPerEdit ?? 0,
                            )}/edit`
                          : 'no cheaper baseline found'
                      }
                      tone="bad"
                    />
                  </div>

                  {cur.retryTax?.byModel?.length ? (
                    <div className="mt-4">
                      <h3 className="mb-1 text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-4)' }}>
                        Retry tax by model
                      </h3>
                      <DataTable
                        columns={[
                          { key: 'name', label: 'Model' },
                          { key: 'tax', label: 'Tax', align: 'right' },
                          { key: 'retries', label: 'Retries', align: 'right' },
                          { key: 'perEdit', label: 'Per edit', align: 'right' },
                        ]}
                        rows={cur.retryTax.byModel.slice(0, 6).map(m => ({
                          name: m.name,
                          tax: usd2(m.taxUSD),
                          retries: m.retries.toLocaleString(),
                          perEdit: m.retriesPerEdit.toFixed(1),
                        }))}
                        empty="No data."
                      />
                    </div>
                  ) : null}

                  {cur.routingWaste?.byModel?.length ? (
                    <div className="mt-4">
                      <h3 className="mb-1 text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-4)' }}>
                        Routing waste by model
                      </h3>
                      <DataTable
                        columns={[
                          { key: 'name', label: 'Model' },
                          { key: 'perEdit', label: 'Cost / edit', align: 'right' },
                          { key: 'actual', label: 'Actual', align: 'right' },
                          { key: 'counterfactual', label: 'On baseline', align: 'right' },
                          { key: 'savings', label: 'Could save', align: 'right' },
                        ]}
                        rows={cur.routingWaste.byModel.slice(0, 6).map(m => ({
                          name: m.name,
                          perEdit: usd2(m.costPerEdit),
                          actual: usd2(m.actualUSD),
                          counterfactual: usd2(m.counterfactualUSD),
                          savings: usd2(m.savingsUSD),
                        }))}
                        empty="No data."
                      />
                    </div>
                  ) : null}
                </SectionCard>

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
