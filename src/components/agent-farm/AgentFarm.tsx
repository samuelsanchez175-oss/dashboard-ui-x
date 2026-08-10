import { useCallback, useEffect, useId, useState } from 'react'
import {
  Activity,
  AudioWaveform,
  Bot,
  Calendar,
  ChevronLeft,
  Coins,
  Cpu,
  HeadphonesIcon,
  Link2,
  MessageSquare,
  PieChart,
  Plug,
  Plus,
  Search,
  Sparkles,
  Workflow,
} from 'lucide-react'
import { canUseYoutubeSearch, parseConfigStatusPayload, type ConfigStatus } from '../../lib/agent-farm-api'
import { useAgentFarmLive, type AgentFarmLive } from '../../lib/agent-farm-live'
import { useUiChrome } from '../../context/UiChromeContext'
import { useMockData } from '../../context/MockDataContext'
import { AgentFarmMockOffPlaceholder, MockDataToggle } from '../MockDataToggle'
import { GlowCard, type GlowCardProps } from '../ui/GlowCard'
import {
  envTabId,
  loadEnvAreas,
  parseEnvTabId,
  saveEnvAreas,
  type EnvArea,
} from './env-areas-storage'
import { isEnvWorkspaceTab, type AgentFarmTabId, type BuiltinAgentFarmTabId } from './types'
import {
  alertsMock,
  beatAnalysisMock,
  farmStatus,
  marketResearchMock,
  revenueMock,
  seoRecommendationsMock,
  socialCalendarMock,
  supportQueueMock,
  usageStats,
} from './mock-data'
import { ENV_KEY_LOGO_URL, INTEGRATION_MARKETPLACE_URLS } from './integration-logos'

interface TabDef {
  id: BuiltinAgentFarmTabId
  label: string
  shortLabel: string
  icon: typeof Cpu
}

const TABS: TabDef[] = [
  { id: 'overview', label: 'Overview', shortLabel: 'Overview', icon: Bot },
  { id: 'beat-analysis', label: 'Beat Analysis', shortLabel: 'Beats', icon: AudioWaveform },
  { id: 'customer-support', label: 'Customer Support', shortLabel: 'Support', icon: HeadphonesIcon },
  { id: 'revenue', label: 'Revenue', shortLabel: 'Revenue', icon: PieChart },
  { id: 'market-research', label: 'Market Research', shortLabel: 'Research', icon: Search },
  { id: 'seo', label: 'SEO', shortLabel: 'SEO', icon: Link2 },
  { id: 'social', label: 'Social', shortLabel: 'Social', icon: Calendar },
  { id: 'automations', label: 'Automations', shortLabel: 'Chains', icon: Workflow },
  { id: 'integrations', label: 'Integrations', shortLabel: 'API', icon: Plug },
  { id: 'usage', label: 'Usage', shortLabel: 'Usage', icon: Activity },
]

function Card({
  children,
  className = '',
  glowColor = 'purple',
}: {
  children: React.ReactNode
  className?: string
  /** Border spotlight hue — defaults to violet to match Agent Farm chrome. */
  glowColor?: GlowCardProps['glowColor']
}) {
  return (
    <GlowCard customSize glowColor={glowColor} className={`min-w-0 rounded-xl ${className}`}>
      {children}
    </GlowCard>
  )
}

function OverviewPanel({ live, mockEnabled }: { live: AgentFarmLive; mockEnabled: boolean }) {
  const maxBar = Math.max(...revenueMock.series.map(s => s.value), 1)
  const ytReady = canUseYoutubeSearch(live.config)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-1)] tracking-tight">Reach Lab</h2>
          <p className="text-sm text-[var(--text-3)] mt-1">
            Think tank for SEO, social reach, and engagement friction — drafts, calendars, and research
            so posting is less painful.{' '}
            {mockEnabled ? (
              <>
                Mock metrics below; live RSS / YouTube load from the dev BFF when keys are set.
              </>
            ) : (
              <>
                sample metrics are hidden; live RSS / YouTube still load from the dev BFF when keys are set.
              </>
            )}
          </p>
        </div>
        <div
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
            live.liveAny
              ? 'border-cyan-500/35 bg-cyan-500/10 text-cyan-200'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
          }`}
        >
          <span
            className={`size-2 rounded-full animate-pulse ${live.liveAny ? 'bg-cyan-400' : 'bg-emerald-400'}`}
            aria-hidden
          />
          {live.liveAny ? 'Live API data available' : 'Mock + local UI only'}
        </div>
      </div>

      {live.config && (
        <Card className="p-4 border-[var(--border-soft)]">
          <h3 className="text-sm font-semibold text-[var(--text-1)]">Integration keys (server `.env`)</h3>
          <p className="text-xs text-[var(--text-4)] mt-1">
            Booleans only — never the secret values. YouTube search accepts YOUTUBE_API_KEY or GOOGLE_API_KEY.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {(
              [
                ['YOUTUBE_API_KEY', live.config.YOUTUBE_API_KEY],
                ['GOOGLE_API_KEY', live.config.GOOGLE_API_KEY],
                ['GEMINI_API_KEY', live.config.GEMINI_API_KEY],
                ['RSS_FEED_URLS', live.config.RSS_FEED_URLS],
              ] as const
            ).map(([label, on]) => (
              <li
                key={label}
                className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md border ${
                  on ? 'border-emerald-500/30 text-emerald-200 bg-emerald-500/10' : 'border-[var(--border-strong)] text-[var(--text-4)] bg-[var(--bg-card-soft)]'
                }`}
              >
                <img
                  src={ENV_KEY_LOGO_URL[label]}
                  alt=""
                  className="size-4 shrink-0 object-contain opacity-90"
                  loading="lazy"
                  decoding="async"
                />
                <span>
                  {label}: {on ? 'set' : 'missing'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {live.config?.RSS_FEED_URLS && (
        <Card className="p-5 border-cyan-500/15">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-[var(--text-1)]">RSS headlines</h3>
            {live.rssLoading && <span className="text-xs text-[var(--text-4)]">Loading…</span>}
          </div>
          <p className="text-xs text-[var(--text-4)] mt-1">{live.rssMeta ?? '—'}</p>
          <ul className="mt-4 space-y-2 text-sm">
            {live.rssItems.slice(0, 8).map((it, i) => (
              <li key={`${it.link}-${i}`}>
                <a
                  href={it.link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-200/90 hover:text-[var(--text-1)] font-medium line-clamp-2"
                >
                  {it.title}
                </a>
                <p className="text-[11px] text-[var(--text-4)] mt-0.5 truncate" title={it.feedUrl}>
                  {it.feedUrl.replace(/^https?:\/\//, '')}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {ytReady && (
        <Card className="p-5 border-[color-mix(in_oklab,var(--accent)_15%,transparent)]">
          <h3 className="text-sm font-semibold text-[var(--text-1)]">YouTube search (live)</h3>
          <p className="text-xs text-[var(--text-4)] mt-1">YouTube Data API v3 search — results stay client-safe (titles + ids).</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <input
              type="search"
              value={live.ytQuery}
              onChange={e => live.setYtQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void live.runYoutubeSearch()}
              placeholder="Query…"
              className="flex-1 min-w-[180px] rounded-lg border border-[var(--border-soft)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-4)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_oklab,var(--accent)_40%,transparent)]"
            />
            <button
              type="button"
              onClick={() => void live.runYoutubeSearch()}
              disabled={live.ytLoading}
              className="rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white"
            >
              {live.ytLoading ? 'Searching…' : 'Search'}
            </button>
          </div>
          {live.ytError && <p className="mt-2 text-xs text-amber-300">{live.ytError}</p>}
          <ul className="mt-4 space-y-3 text-sm">
            {live.ytItems.map(v => (
              <li key={v.videoId ?? v.title} className="border border-[var(--border-soft)] rounded-lg p-3 bg-[var(--bg-card-soft)]">
                <p className="font-medium text-[var(--text-1)]">{v.title}</p>
                <p className="text-xs text-[var(--text-4)] mt-1">{v.channelTitle}</p>
                <p className="text-xs text-[var(--text-3)] mt-2 line-clamp-2">{v.description}</p>
                {v.videoId && (
                  <a
                    className="text-[11px] text-[var(--accent)] hover:text-[var(--accent-fg)] mt-2 inline-block"
                    href={`https://www.youtube.com/watch?v=${encodeURIComponent(v.videoId)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open on YouTube
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {mockEnabled ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4" glowColor="blue">
              <p className="text-xs uppercase tracking-wider text-[var(--text-4)] font-medium">Active agents</p>
              <p className="text-2xl font-semibold text-[var(--text-1)] mt-1 tabular-nums">{farmStatus.activeAgents}</p>
            </Card>
            <Card className="p-4" glowColor="purple">
              <p className="text-xs uppercase tracking-wider text-[var(--text-4)] font-medium">Queued jobs</p>
              <p className="text-2xl font-semibold text-[var(--text-1)] mt-1 tabular-nums">{farmStatus.queuedJobs}</p>
            </Card>
            <Card className="p-4" glowColor="green">
              <p className="text-xs uppercase tracking-wider text-[var(--text-4)] font-medium">Est. monthly burn</p>
              <p className="text-2xl font-semibold text-[var(--text-1)] mt-1 tabular-nums">${usageStats.estimatedCostUsd.toFixed(0)}</p>
              <p className="text-[11px] text-[var(--text-4)] mt-1">Tokens + provider fees (mock)</p>
            </Card>
            <Card className="p-4" glowColor="orange">
              <p className="text-xs uppercase tracking-wider text-[var(--text-4)] font-medium">MRR (mock)</p>
              <p className="text-2xl font-semibold text-[var(--text-1)] mt-1 tabular-nums">${revenueMock.mrr.toLocaleString()}</p>
              <p className="text-[11px] text-emerald-400/90 mt-1">+{revenueMock.growthPct}% vs prev.</p>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5" glowColor="purple">
              <h3 className="text-sm font-semibold text-[var(--text-1)] flex items-center gap-2">
                <Coins size={16} className="text-amber-400/90" />
                Revenue pulse (mock chart)
              </h3>
              <div className="mt-4 flex items-end gap-2 h-36">
                {revenueMock.series.map(row => (
                  <div key={row.label} className="flex-1 flex flex-col items-center gap-2">
                    <div
                      className="w-full rounded-md min-h-[8px] transition-all"
                      style={{
                        height: `${(row.value / maxBar) * 100}%`,
                        background: 'linear-gradient(to top, var(--accent), color-mix(in oklab, var(--accent) 55%, #f0abfc))',
                      }}
                      title={`${row.label}: $${row.value}`}
                    />
                    <span className="text-[10px] text-[var(--text-4)]">{row.label}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5" glowColor="blue">
              <h3 className="text-sm font-semibold text-[var(--text-1)] flex items-center gap-2">
                <MessageSquare size={16} className="text-[var(--accent)]" />
                Next actions / alerts
              </h3>
              <ul className="mt-4 space-y-3">
                {alertsMock.map(a => (
                  <li
                    key={a.id}
                    className="flex gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-sm text-amber-100/90"
                  >
                    <span className="text-amber-400 shrink-0 mt-0.5">!</span>
                    {a.message}
                  </li>
                ))}
                <li className="text-xs text-[var(--text-4)] px-1">
                  Wire real thresholds when analytics APIs are connected.
                </li>
              </ul>
            </Card>
          </div>
        </>
      ) : (
        <AgentFarmMockOffPlaceholder />
      )}
    </div>
  )
}

function BeatAnalysisPanel({ mockEnabled }: { mockEnabled: boolean }) {
  const inputId = useId()
  const [fileName, setFileName] = useState<string | null>(null)

  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    setFileName(f ? f.name : null)
  }, [])

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-1)] tracking-tight">Beat analysis agent</h2>
        <p className="text-sm text-[var(--text-3)] mt-1">
          Upload FLAC, WAV, or MP3 — harmonic structure for sound design
          {mockEnabled ? ' (mock result below).' : '.'}{' '}
          {!mockEnabled && (
            <span className="text-[var(--text-4)]">Sample analysis is hidden while Mock data is off.</span>
          )}
        </p>
      </div>

      <Card className="p-5">
        <label htmlFor={inputId} className="block text-xs font-medium uppercase tracking-wider text-[var(--text-4)]">
          Audio file
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            id={inputId}
            type="file"
            accept=".flac,.wav,.mp3,audio/flac,audio/wav,audio/mpeg"
            onChange={onFile}
            className="text-sm text-[var(--text-2)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--accent)] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-[var(--accent-hover)] cursor-pointer"
          />
          {fileName && (
            <span className="text-sm text-[var(--text-3)] truncate max-w-[220px]" title={fileName}>
              Selected: {fileName}
            </span>
          )}
        </div>
        {!fileName && (
          <p className="mt-3 text-xs text-[var(--text-4)]">
            No file selected
            {mockEnabled ? ' — showing sample analysis.' : '.'}
          </p>
        )}
      </Card>

      {mockEnabled ? (
        <Card className="p-5 border-[color-mix(in_oklab,var(--accent)_20%,transparent)]">
          <h3 className="text-sm font-semibold text-[var(--text-1)]">Mock analysis result</h3>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-[var(--text-4)]">Key / mode</dt>
              <dd className="text-[var(--text-1)] font-medium">{beatAnalysisMock.key}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-4)]">Tempo</dt>
              <dd className="text-[var(--text-1)] font-medium">{beatAnalysisMock.bpm} BPM</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[var(--text-4)]">Chord skeleton</dt>
              <dd className="text-[var(--accent-fg)] font-mono text-sm mt-1">{beatAnalysisMock.chords.join(' → ')}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[var(--text-4)]">Harmonic rhythm</dt>
              <dd className="text-[var(--text-1)]">{beatAnalysisMock.harmonicRhythm}</dd>
            </div>
          </dl>
          <ul className="mt-4 space-y-2 text-sm text-[var(--text-2)] border-t border-[var(--border-soft)] pt-4">
            {beatAnalysisMock.suggestions.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-[var(--accent)] shrink-0">•</span>
                {s}
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <AgentFarmMockOffPlaceholder />
      )}
    </div>
  )
}

function CustomerSupportPanel({ mockEnabled }: { mockEnabled: boolean }) {
  if (!mockEnabled) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-1)] tracking-tight">Customer support agent</h2>
          <p className="text-sm text-[var(--text-3)] mt-1">
            Triage and multi-system workflow placeholder — connect CRM, helpdesk, and billing APIs later.
          </p>
        </div>
        <AgentFarmMockOffPlaceholder />
      </div>
    )
  }
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-1)] tracking-tight">Customer support agent</h2>
        <p className="text-sm text-[var(--text-3)] mt-1">
          Triage and multi-system workflow placeholder — connect CRM, helpdesk, and billing APIs later.
        </p>
      </div>
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-soft)] flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-4)]">Open queue</span>
          <span className="text-xs text-[var(--text-3)]">{supportQueueMock.length} tickets (mock)</span>
        </div>
        <ul className="divide-y divide-[var(--border-soft)]">
          {supportQueueMock.map(t => (
            <li key={t.id} className="px-4 py-3 flex flex-wrap gap-3 items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--text-1)]">{t.subject}</p>
                <p className="text-xs text-[var(--text-4)] mt-0.5">
                  {t.id} · {t.channel} · SLA {t.slaMins}m
                </p>
              </div>
              <span
                className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                  t.priority === 'high'
                    ? 'bg-red-500/15 text-red-300'
                    : t.priority === 'medium'
                      ? 'bg-amber-500/15 text-amber-200'
                      : 'bg-[var(--bg-card-soft)] text-[var(--text-3)]'
                }`}
              >
                {t.priority}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function RevenuePanel({ mockEnabled }: { mockEnabled: boolean }) {
  const maxBar = Math.max(...revenueMock.series.map(s => s.value), 1)

  if (!mockEnabled) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-1)] tracking-tight">Revenue tracking agent</h2>
          <p className="text-sm text-[var(--text-3)] mt-1">Metrics cards and trend bars — mock series for UI scaffolding.</p>
        </div>
        <AgentFarmMockOffPlaceholder />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-1)] tracking-tight">Revenue tracking agent</h2>
        <p className="text-sm text-[var(--text-3)] mt-1">Metrics cards and trend bars — mock series for UI scaffolding.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-[var(--text-4)] uppercase tracking-wider">MRR</p>
          <p className="text-xl font-semibold text-[var(--text-1)] mt-1">${revenueMock.mrr.toLocaleString()}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[var(--text-4)] uppercase tracking-wider">Growth</p>
          <p className="text-xl font-semibold text-emerald-400 mt-1">+{revenueMock.growthPct}%</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[var(--text-4)] uppercase tracking-wider">Pipeline</p>
          <p className="text-xl font-semibold text-[var(--text-1)] mt-1">$42k</p>
          <p className="text-[11px] text-[var(--text-4)] mt-1">mock weighted</p>
        </Card>
      </div>
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-[var(--text-1)]">Six-month trend</h3>
        <div className="mt-4 flex items-end gap-3 h-40">
          {revenueMock.series.map(row => (
            <div key={row.label} className="flex-1 flex flex-col items-center gap-2">
              <span className="text-[11px] text-[var(--text-3)]">${(row.value / 1000).toFixed(1)}k</span>
              <div
                className="w-full rounded-lg"
                style={{
                  height: `${(row.value / maxBar) * 100}%`,
                  minHeight: 8,
                  background: 'linear-gradient(to top, color-mix(in oklab, var(--accent) 70%, #0891b2), var(--accent))',
                }}
              />
              <span className="text-[10px] text-[var(--text-4)]">{row.label}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function MarketResearchPanel({ mockEnabled }: { mockEnabled: boolean }) {
  if (!mockEnabled) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-1)] tracking-tight">Market research agent</h2>
          <p className="text-sm text-[var(--text-3)] mt-1">Keyword and trend snapshots — replace with search APIs or LLM research.</p>
        </div>
        <AgentFarmMockOffPlaceholder />
      </div>
    )
  }
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-1)] tracking-tight">Market research agent</h2>
        <p className="text-sm text-[var(--text-3)] mt-1">Keyword and trend snapshots — replace with search APIs or LLM research.</p>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-soft)] text-left text-xs uppercase tracking-wider text-[var(--text-4)]">
              <th className="px-4 py-3 font-medium">Keyword</th>
              <th className="px-4 py-3 font-medium">Volume</th>
              <th className="px-4 py-3 font-medium">Trend</th>
              <th className="px-4 py-3 font-medium">Intent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-soft)]">
            {marketResearchMock.keywords.map(k => (
              <tr key={k.term} className="hover:bg-[var(--bg-hover)]">
                <td className="px-4 py-3 text-[var(--text-1)] font-medium">{k.term}</td>
                <td className="px-4 py-3 text-[var(--text-3)]">{k.volume}</td>
                <td className="px-4 py-3 text-emerald-400">{k.trend}</td>
                <td className="px-4 py-3 text-[var(--text-3)]">{k.intent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function SEOPanel({ mockEnabled }: { mockEnabled: boolean }) {
  if (!mockEnabled) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-1)] tracking-tight">SEO agent</h2>
          <p className="text-sm text-[var(--text-3)] mt-1">Recommendation backlog — wire Search Console / crawler later.</p>
        </div>
        <AgentFarmMockOffPlaceholder />
      </div>
    )
  }
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-1)] tracking-tight">SEO agent</h2>
        <p className="text-sm text-[var(--text-3)] mt-1">Recommendation backlog — wire Search Console / crawler later.</p>
      </div>
      <ul className="space-y-3">
        {seoRecommendationsMock.map((r, i) => (
          <Card key={i} className="p-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--text-1)] font-medium">{r.title}</p>
            <div className="flex gap-2">
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-fuchsia-500/15 text-fuchsia-200">
                Impact: {r.impact}
              </span>
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-[var(--bg-card-soft)] text-[var(--text-3)]">
                Effort: {r.effort}
              </span>
            </div>
          </Card>
        ))}
      </ul>
    </div>
  )
}

function SocialPanel({ mockEnabled }: { mockEnabled: boolean }) {
  if (!mockEnabled) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-1)] tracking-tight">Social media manager</h2>
          <p className="text-sm text-[var(--text-3)] mt-1">Queue / calendar placeholder — connect publisher APIs when ready.</p>
        </div>
        <AgentFarmMockOffPlaceholder />
      </div>
    )
  }
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-1)] tracking-tight">Social media manager</h2>
        <p className="text-sm text-[var(--text-3)] mt-1">Queue / calendar placeholder — connect publisher APIs when ready.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {socialCalendarMock.map(day => (
          <Card key={day.day} className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">{day.day}</p>
            <ul className="mt-3 space-y-2">
              {day.slots.map((s, i) => (
                <li key={i} className="text-sm text-[var(--text-2)] flex gap-2">
                  <span className="text-[var(--text-4)]">—</span>
                  {s}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  )
}

function AutomationsPanel() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-1)] tracking-tight">Automations</h2>
        <p className="text-sm text-[var(--text-3)] mt-1">
          Chain builder placeholder — Zapier / n8n style: trigger → steps → actions (not wired).
        </p>
      </div>
      <Card className="p-6 border-dashed border-[var(--border-soft)]">
        <div className="flex flex-col items-center text-center gap-3 py-8">
          <Workflow className="text-[var(--text-4)]" size={40} strokeWidth={1.25} />
          <p className="text-sm text-[var(--text-3)] max-w-sm">
            Drag-and-drop step editor will live here. For now, imagine: New lead → enrich → Slack → CRM.
          </p>
          <button
            type="button"
            disabled
            className="mt-2 rounded-lg bg-[var(--bg-card-soft)] px-4 py-2 text-xs font-semibold text-[var(--text-3)] cursor-not-allowed"
          >
            Create automation (soon)
          </button>
        </div>
      </Card>
    </div>
  )
}

function StatusPill({ configured }: { configured: boolean }) {
  if (configured) {
    return (
      <span className="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">
        Configured
      </span>
    )
  }
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[var(--bg-card-soft)] text-[var(--text-3)]">
      Not set
    </span>
  )
}

function IntegrationEnvLogo({
  url,
  label,
  className = '',
}: {
  url: string
  label: string
  className?: string
}) {
  return (
    <div
      className={`relative h-11 w-11 shrink-0 rounded-lg bg-[var(--bg-card)] p-1.5 ring-1 ring-[var(--border-soft)] ${className}`}
    >
      <img src={url} alt="" className="h-full w-full object-contain" loading="lazy" decoding="async" />
      <span className="sr-only">{label}</span>
    </div>
  )
}

const HEX_CLIP =
  'polygon(25% 0%, 75% 0%, 100% 25%, 100% 75%, 75% 100%, 25% 100%, 0% 75%, 0% 25%)' as const

function IntegrationMarketplaceHex({ url, index }: { url: string; index: number }) {
  return (
    <div
      className="relative h-14 w-14 shrink-0 bg-[var(--bg-card-soft)] p-2 shadow-sm ring-2 ring-[var(--border-soft)]"
      style={{ clipPath: HEX_CLIP }}
    >
      <img
        src={url}
        alt=""
        className="h-full w-full object-contain p-1"
        loading="lazy"
        decoding="async"
      />
      <span className="sr-only">Integration logo {index + 1}</span>
    </div>
  )
}

function IntegrationsPanel() {
  const [status, setStatus] = useState<ConfigStatus | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [probeLabel, setProbeLabel] = useState<string | null>(null)
  const [probeBody, setProbeBody] = useState<string | null>(null)
  const [probeBusy, setProbeBusy] = useState(false)

  const load = useCallback(async () => {
    const { fetchWithKeys } = await import('../../lib/api-keys')
    const r = await fetchWithKeys('/api/config/status')
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return parseConfigStatusPayload(await r.json())
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const s = await load()
        if (!cancelled) {
          setStatus(s)
          setLoadError(null)
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Could not load status')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [load])

  const refresh = async () => {
    setRefreshing(true)
    setLoadError(null)
    try {
      const s = await load()
      setStatus(s)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load status')
    } finally {
      setRefreshing(false)
    }
  }

  const runProbe = async (label: string, url: string, init?: RequestInit) => {
    setProbeBusy(true)
    setProbeLabel(label)
    setProbeBody(null)
    try {
      const { fetchWithKeys } = await import('../../lib/api-keys')
      const r = await fetchWithKeys(url, init)
      const text = await r.text()
      let formatted = text
      try {
        formatted = JSON.stringify(JSON.parse(text) as unknown, null, 2)
      } catch {
        formatted = text.slice(0, 800)
      }
      setProbeBody(`${r.status} ${r.statusText}\n\n${formatted.slice(0, 4000)}`)
    } catch (e) {
      setProbeBody(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setProbeBusy(false)
    }
  }

  const ytConfigured =
    status?.YOUTUBE_API_KEY || status?.GOOGLE_API_KEY ? true : false

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-1)] tracking-tight">API integrations</h2>
          <p className="text-sm text-[var(--text-3)] mt-1">
            Flags from `GET /api/config/status` — secret values never leave the server. Probe endpoints to verify the BFF.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white transition-colors"
        >
          {refreshing ? 'Refreshing…' : 'Refresh status'}
        </button>
      </div>

      {loadError && (
        <Card className="p-4 border-red-500/30 bg-red-500/5 text-sm text-red-200">
          {loadError} — is `npm run dev` running?
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <div className="flex gap-3">
            <IntegrationEnvLogo url={ENV_KEY_LOGO_URL.YOUTUBE_API_KEY} label="YouTube" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-[var(--text-1)]">YOUTUBE_API_KEY</p>
                <StatusPill configured={status?.YOUTUBE_API_KEY ?? false} />
              </div>
              <p className="text-xs text-[var(--text-4)] mt-2">Preferred for YouTube Data API v3.</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex gap-3">
            <IntegrationEnvLogo url={ENV_KEY_LOGO_URL.GOOGLE_API_KEY} label="Google" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-[var(--text-1)]">GOOGLE_API_KEY</p>
                <StatusPill configured={status?.GOOGLE_API_KEY ?? false} />
              </div>
              <p className="text-xs text-[var(--text-4)] mt-2">
                Optional fallback if `YOUTUBE_API_KEY` is unset (same key must allow YouTube API).
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex gap-3">
            <IntegrationEnvLogo url={ENV_KEY_LOGO_URL.GEMINI_API_KEY} label="Google Gemini" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-[var(--text-1)]">GEMINI_API_KEY</p>
                <StatusPill configured={status?.GEMINI_API_KEY ?? false} />
              </div>
              <p className="text-xs text-[var(--text-4)] mt-2">Generative Language API (Google AI).</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex gap-3">
            <IntegrationEnvLogo url={ENV_KEY_LOGO_URL.RSS_FEED_URLS} label="RSS and syndication integrations" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-[var(--text-1)]">RSS_FEED_URLS</p>
                <StatusPill configured={status?.RSS_FEED_URLS ?? false} />
              </div>
              <p className="text-xs text-[var(--text-4)] mt-2">Comma-separated feed URLs (server-side fetch only).</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-5 border-[var(--border-soft)]">
        <p className="text-sm font-medium text-[var(--text-1)] mb-1">Integration ecosystem</p>
        <p className="text-xs text-[var(--text-4)] mb-4">Brand icons for services you can wire into the farm.</p>
        <div className="grid grid-cols-6 gap-3 sm:gap-4 justify-items-center">
          {INTEGRATION_MARKETPLACE_URLS.map((url, idx) => (
            <IntegrationMarketplaceHex key={`${idx}-${url}`} url={url} index={idx} />
          ))}
        </div>
      </Card>

      <Card className="p-4 sm:col-span-2">
        <p className="text-sm font-medium text-[var(--text-1)] mb-3">Probe BFF routes</p>
        <div className="flex flex-wrap gap-x-3 gap-y-2">
          <button
            type="button"
            disabled={probeBusy}
            onClick={() => void runProbe('Health', '/api/health')}
            className="text-xs font-semibold text-[var(--accent)] hover:text-[var(--accent-fg)] disabled:opacity-40"
          >
            GET /api/health
          </button>
          <button
            type="button"
            disabled={probeBusy}
            onClick={() => void runProbe('Config status', '/api/config/status')}
            className="text-xs font-semibold text-[var(--accent)] hover:text-[var(--accent-fg)] disabled:opacity-40"
          >
            GET /api/config/status
          </button>
          <button
            type="button"
            disabled={probeBusy || !ytConfigured}
            onClick={() =>
              void runProbe('YouTube search', '/api/youtube/search?q=music')
            }
            className="text-xs font-semibold text-[var(--accent)] hover:text-[var(--accent-fg)] disabled:opacity-40"
          >
            GET /api/youtube/search?q=music
          </button>
          <button
            type="button"
            disabled={probeBusy || !status?.GEMINI_API_KEY}
            onClick={() =>
              void runProbe('Gemini ping', '/api/gemini/ping', { method: 'POST' })
            }
            className="text-xs font-semibold text-[var(--accent)] hover:text-[var(--accent-fg)] disabled:opacity-40"
          >
            POST /api/gemini/ping
          </button>
          <button
            type="button"
            disabled={probeBusy || !status?.RSS_FEED_URLS}
            onClick={() => void runProbe('RSS aggregate', '/api/rss')}
            className="text-xs font-semibold text-[var(--accent)] hover:text-[var(--accent-fg)] disabled:opacity-40"
          >
            GET /api/rss
          </button>
        </div>
      </Card>

      {(probeLabel ?? probeBody) && (
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-4)]">
            Last probe {probeBusy ? '(loading…)' : ''}
          </p>
          {probeLabel && <p className="text-sm text-[var(--text-1)] mt-1">{probeLabel}</p>}
          {probeBody && (
            <pre className="mt-3 text-[11px] text-[var(--text-3)] overflow-x-auto whitespace-pre-wrap break-all max-h-64 overflow-y-auto font-mono bg-[var(--bg-cockpit-strong)] rounded-lg p-3 border border-[var(--border-soft)]">
              {probeBody}
            </pre>
          )}
        </Card>
      )}
    </div>
  )
}

function UsagePanel({ live, mockEnabled }: { live: AgentFarmLive; mockEnabled: boolean }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-1)] tracking-tight">Usage & cost</h2>
        <p className="text-sm text-[var(--text-3)] mt-1">
          {mockEnabled ? (
            <>
              Token and run tracking — mock aggregates for {usageStats.periodLabel.toLowerCase()}. Gemini reachability is tested
              below when `GEMINI_API_KEY` is set.
            </>
          ) : (
            <>
              Sample usage aggregates are hidden. Gemini reachability is tested below when `GEMINI_API_KEY` is set.
            </>
          )}
        </p>
      </div>

      {live.config?.GEMINI_API_KEY && (
        <Card className="p-4 border-fuchsia-500/20">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-4)]">Gemini (live ping)</p>
          {live.geminiLoading ? (
            <p className="text-sm text-[var(--text-3)] mt-2">Checking Generative Language API…</p>
          ) : (
            <>
              <p className="text-sm text-[var(--text-1)] mt-2">{live.geminiStatus ?? '—'}</p>
              {live.geminiDetail && (
                <p className="text-xs text-[var(--text-4)] mt-2 font-mono break-all">{live.geminiDetail}</p>
              )}
            </>
          )}
        </Card>
      )}

      {mockEnabled ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-xs text-[var(--text-4)] uppercase tracking-wider">Total runs</p>
              <p className="text-2xl font-semibold text-[var(--text-1)] mt-1 tabular-nums">{usageStats.totalRuns.toLocaleString()}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-[var(--text-4)] uppercase tracking-wider">Tokens</p>
              <p className="text-2xl font-semibold text-[var(--text-1)] mt-1 tabular-nums">
                {(usageStats.totalTokens / 1e6).toFixed(2)}M
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-[var(--text-4)] uppercase tracking-wider">Est. cost</p>
              <p className="text-2xl font-semibold text-[var(--text-1)] mt-1 tabular-nums">${usageStats.estimatedCostUsd}</p>
            </Card>
          </div>
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-soft)]">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-4)]">By agent</span>
            </div>
            <ul className="divide-y divide-[var(--border-soft)]">
              {usageStats.topAgents.map(row => (
                <li key={row.name} className="px-4 py-3 flex flex-wrap justify-between gap-2 text-sm">
                  <span className="text-[var(--text-1)] font-medium">{row.name}</span>
                  <span className="text-[var(--text-3)] tabular-nums">
                    {row.runs.toLocaleString()} runs · {(row.tokens / 1000).toFixed(0)}k tok
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : (
        <AgentFarmMockOffPlaceholder />
      )}
    </div>
  )
}

function farmSectionHeading(tab: AgentFarmTabId, envAreas: EnvArea[]): string {
  if (isEnvWorkspaceTab(tab)) {
    const id = parseEnvTabId(tab)
    const area = envAreas.find(a => a.id === id)
    return (area?.label ?? '+ Workspace').replace(/^\+\s*/, '') || 'Workspace'
  }
  const builtin = TABS.find(t => t.id === tab)
  return builtin?.label ?? 'Section'
}

function EnvironmentWorkspacePanel({
  area,
  onUpdate,
  onRemove,
}: {
  area: EnvArea
  onUpdate: (patch: Partial<Pick<EnvArea, 'label' | 'body'>>) => void
  onRemove: () => void
}) {
  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-1)] tracking-tight flex items-center gap-2">
            <Sparkles className="size-5 text-[var(--accent)]" aria-hidden />
            <span className="text-[var(--text-1)]">Environment area</span>
          </h2>
          <p className="text-sm text-[var(--text-3)] mt-1">
            Local workspace — prompts, checklists, and notes for this slice of the farm. Open it from the farm tile grid
            with a <span className="font-mono text-[var(--accent)]">+</span> prefix on custom tiles.
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/20 transition-colors"
        >
          Remove area
        </button>
      </div>
      <Card className="p-5" glowColor="purple">
        <label className="block space-y-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-4)]">Title</span>
          <input
            value={area.label}
            onChange={e => onUpdate({ label: e.target.value })}
            placeholder="+ My workspace…"
            className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-4)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_oklab,var(--accent)_40%,transparent)]"
          />
        </label>
        <label className="block space-y-2 mt-5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-4)]">Body</span>
          <textarea
            value={area.body}
            onChange={e => onUpdate({ body: e.target.value })}
            placeholder="Paste briefs, API snippets, or runbooks…"
            rows={14}
            className="w-full resize-y min-h-[200px] rounded-lg border border-[var(--border-soft)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-2)] placeholder:text-[var(--text-4)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_oklab,var(--accent)_40%,transparent)] font-mono leading-relaxed"
          />
        </label>
      </Card>
    </div>
  )
}

export default function AgentFarm() {
  const [tab, setTab] = useState<AgentFarmTabId>('overview')
  const [farmExpanded, setFarmExpanded] = useState(false)
  const [envAreas, setEnvAreas] = useState<EnvArea[]>(() => loadEnvAreas())
  const tabListId = useId()
  const { setAgentFarmTab } = useUiChrome()
  const { mockDataEnabled } = useMockData()
  const live = useAgentFarmLive(tab)

  useEffect(() => {
    saveEnvAreas(envAreas)
  }, [envAreas])

  useEffect(() => {
    setAgentFarmTab(tab)
  }, [tab, setAgentFarmTab])

  useEffect(() => {
    return () => {
      setAgentFarmTab(null)
    }
  }, [setAgentFarmTab])

  const addEnvArea = useCallback(() => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `env-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const next: EnvArea = { id, label: '+ New area', body: '' }
    setEnvAreas(prev => [...prev, next])
    setTab(envTabId(id))
    setFarmExpanded(true)
  }, [])

  const updateEnvArea = useCallback((areaId: string, patch: Partial<Pick<EnvArea, 'label' | 'body'>>) => {
    setEnvAreas(prev => prev.map(a => (a.id === areaId ? { ...a, ...patch } : a)))
  }, [])

  const removeEnvArea = useCallback(
    (areaId: string) => {
      const tId = envTabId(areaId)
      setEnvAreas(prev => prev.filter(a => a.id !== areaId))
      setTab(current => {
        if (current === tId) {
          setFarmExpanded(false)
          return 'overview'
        }
        return current
      })
    },
    [setTab],
  )

  const tabSafeId = (t: AgentFarmTabId) => t.replace(/[^a-zA-Z0-9_-]/g, '-')

  const panel = (() => {
    if (isEnvWorkspaceTab(tab)) {
      const areaId = parseEnvTabId(tab)
      const area = envAreas.find(a => a.id === areaId)
      if (area) {
        return (
          <EnvironmentWorkspacePanel
            area={area}
            onUpdate={patch => updateEnvArea(area.id, patch)}
            onRemove={() => removeEnvArea(area.id)}
          />
        )
      }
      return <OverviewPanel live={live} mockEnabled={mockDataEnabled} />
    }
    switch (tab) {
      case 'overview':
        return <OverviewPanel live={live} mockEnabled={mockDataEnabled} />
      case 'beat-analysis':
        return <BeatAnalysisPanel mockEnabled={mockDataEnabled} />
      case 'customer-support':
        return <CustomerSupportPanel mockEnabled={mockDataEnabled} />
      case 'revenue':
        return <RevenuePanel mockEnabled={mockDataEnabled} />
      case 'market-research':
        return <MarketResearchPanel mockEnabled={mockDataEnabled} />
      case 'seo':
        return <SEOPanel mockEnabled={mockDataEnabled} />
      case 'social':
        return <SocialPanel mockEnabled={mockDataEnabled} />
      case 'automations':
        return <AutomationsPanel />
      case 'integrations':
        return <IntegrationsPanel />
      case 'usage':
        return <UsagePanel live={live} mockEnabled={mockDataEnabled} />
      default:
        return <OverviewPanel live={live} mockEnabled={mockDataEnabled} />
    }
  })()

  return (
    <div className="flex-1 flex flex-col min-h-0 text-[var(--text-2)]" style={{ background: 'var(--bg-cockpit)' }}>
      <header
        className="shrink-0 border-b px-6 py-5"
        style={{
          background: 'var(--gradient-cockpit-header)',
          borderColor: 'var(--border-strong)',
        }}
      >
        <div data-on-gradient>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] font-semibold text-[color-mix(in_oklab,var(--accent)_70%,var(--text-1))]">
                Agent swarm
              </p>
              <h1 className="text-2xl font-semibold text-[var(--text-1)] tracking-tight mt-1">Agent Farm</h1>
              <p className="text-sm mt-1 max-w-xl text-[color-mix(in_oklab,var(--text-1)_92%,transparent)]">
                Extend the environment with <span className="font-mono text-[var(--accent)]">+</span> workspaces — each keeps
                its own title and notes in this browser. Pick a tile below to open a section; built-in tools pull live RSS,
                YouTube, and Gemini when your server{' '}
                <code className="text-[11px] text-[var(--text-2)]">.env</code> is set.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-[var(--text-2)]">
              <div className="inline-flex rounded-full border border-[var(--border-strong)] bg-[var(--bg-card)] p-0.5">
                <MockDataToggle variant="dark" />
              </div>
              <div className="flex items-center gap-2">
                <Cpu size={14} className="text-[var(--accent)] shrink-0" aria-hidden />
                <span className="text-[var(--text-2)]">Sidebar:</span>{' '}
                <span className="text-[var(--text-1)] font-medium">Agent Farm</span>
              </div>
            </div>
          </div>

          {!farmExpanded ? (
            <p className="mt-4 text-xs text-[color-mix(in_oklab,var(--text-1)_88%,transparent)]">
              Tile dashboard — click any card to expand it into the workspace below.
            </p>
          ) : null}
        </div>
      </header>

      <main
        role={farmExpanded ? 'tabpanel' : undefined}
        id={farmExpanded ? `${tabListId}-panel-${tabSafeId(tab)}` : undefined}
        aria-labelledby={farmExpanded ? `${tabListId}-${tabSafeId(tab)}-heading` : undefined}
        className="flex-1 overflow-y-auto p-6 lg:p-8 min-h-0"
      >
        {!farmExpanded ? (
          <nav className="max-w-6xl mx-auto" aria-label="Agent farm sections">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {TABS.map(t => {
                const Icon = t.icon
                const isActiveMemory = tab === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    id={`${tabListId}-${tabSafeId(t.id)}`}
                    onClick={() => {
                      setTab(t.id)
                      setFarmExpanded(true)
                    }}
                    className={`
                      group flex flex-col items-start gap-3 rounded-xl border border-solid p-4 text-left transition-[background-color,border-color,box-shadow] min-h-[112px]
                      focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-cockpit)]
                      ${isActiveMemory
                        ? 'border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_20%,var(--bg-cockpit))] shadow-[0_24px_50px_-30px_color-mix(in_oklab,var(--accent)_45%,transparent)] ring-2 ring-[color-mix(in_oklab,var(--accent)_50%,transparent)] ring-offset-2 ring-offset-[var(--bg-cockpit)]'
                        : 'border-[var(--border-strong)] bg-[color-mix(in_oklab,var(--bg-card)_30%,transparent)] hover:bg-[var(--bg-card-soft)] hover:border-[color-mix(in_oklab,var(--accent)_35%,var(--border-strong))]'
                      }
                    `}
                  >
                    <Icon
                      size={22}
                      strokeWidth={1.75}
                      className={`shrink-0 ${isActiveMemory ? 'text-[var(--accent)]' : 'text-[var(--accent)] opacity-90 group-hover:opacity-100'}`}
                      aria-hidden
                    />
                    <div className="min-w-0 space-y-1">
                      <p className="text-[14px] font-semibold text-[var(--text-1)] leading-tight">{t.label}</p>
                      <p className="text-[11px] text-[var(--text-4)] leading-snug">{t.shortLabel}</p>
                    </div>
                  </button>
                )
              })}
              {envAreas.map(area => {
                const tid = envTabId(area.id)
                const isActiveMemory = tab === tid
                const short = area.label.replace(/^\+\s*/, '').slice(0, 14) || 'area'
                return (
                  <button
                    key={area.id}
                    type="button"
                    id={`${tabListId}-${tabSafeId(tid)}`}
                    title={area.label}
                    onClick={() => {
                      setTab(tid)
                      setFarmExpanded(true)
                    }}
                    className={`
                      group flex flex-col items-start gap-3 rounded-xl border border-solid p-4 text-left transition-[background-color,border-color,box-shadow] min-h-[112px]
                      focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-cockpit)]
                      ${isActiveMemory
                        ? 'border-emerald-400/90 bg-emerald-950/30 shadow-lg shadow-emerald-950/25 ring-2 ring-[color-mix(in_oklab,rgb(52_211_153)_45%,transparent)] ring-offset-2 ring-offset-[var(--bg-cockpit)]'
                        : 'border-[var(--border-strong)] bg-emerald-950/15 hover:bg-emerald-950/25 hover:border-[color-mix(in_oklab,rgb(52_211_153)_35%,var(--border-strong))]'
                      }
                    `}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-emerald-400 select-none" aria-hidden>
                        +
                      </span>
                      <Sparkles size={20} strokeWidth={1.75} className="text-emerald-300 shrink-0" aria-hidden />
                    </div>
                    <div className="min-w-0 space-y-1 w-full">
                      <p className="text-[14px] font-semibold text-[var(--text-1)] leading-tight truncate">{area.label || '+ Untitled'}</p>
                      <p className="text-[11px] text-emerald-200/50 leading-snug truncate">{short}</p>
                    </div>
                  </button>
                )
              })}
              <button
                type="button"
                onClick={addEnvArea}
                className="
                  flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[color-mix(in_oklab,var(--accent)_35%,transparent)] min-h-[112px] p-4
                  text-[13px] font-medium text-[var(--accent)] hover:bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] hover:border-[color-mix(in_oklab,var(--accent)_55%,transparent)] transition-colors
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-cockpit)]
                "
                aria-label="Add environment workspace"
              >
                <Plus size={22} strokeWidth={2} className="shrink-0 text-[var(--accent)]" />
                <span>New workspace</span>
              </button>
            </div>
          </nav>
        ) : (
          <div className="max-w-6xl mx-auto space-y-5">
            <div
              className="sticky top-0 z-10 -mx-6 lg:-mx-8 px-6 lg:px-8 py-3 mb-1 flex flex-wrap items-center gap-3 border-b backdrop-blur-md"
              style={{
                background: 'color-mix(in oklab, var(--bg-cockpit) 90%, transparent)',
                borderColor: 'var(--border-soft)',
              }}
            >
              <button
                type="button"
                onClick={() => setFarmExpanded(false)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card-soft)] px-3 py-2 text-xs font-semibold text-[var(--text-2)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-1)] transition-colors"
              >
                <ChevronLeft size={16} strokeWidth={2} aria-hidden />
                All sections
              </button>
              <h2
                className="text-sm font-semibold text-[var(--text-1)] tracking-tight"
                id={`${tabListId}-${tabSafeId(tab)}-heading`}
              >
                {farmSectionHeading(tab, envAreas)}
              </h2>
            </div>
            <div>{panel}</div>
          </div>
        )}
      </main>
    </div>
  )
}
