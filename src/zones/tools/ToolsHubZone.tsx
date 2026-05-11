import { ChevronRight, Plus, Search, Sparkles, Wrench, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import StudioToolsHeader from './StudioToolsHeader'
import ToolsHubToolCard from './ToolsHubToolCard'
import { useTheme } from '../../context/ThemeContext'
import {
  HUB_CATEGORIES,
  HUB_RECENT,
  HUB_TOOLS,
  TONE_DARK,
  TONE_LIGHT,
  type HubCategory,
} from './toolsHubData'

interface ToolsHubZoneProps {
  onNavigate: (routeId: string) => void
}

function StatRow({ label, value, delta }: { label: string; value: string; delta: string | null }) {
  return (
    <div>
      <div className="mono mb-1 text-[10px] uppercase" style={{ color: 'var(--text-4)' }}>{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="mono text-xl font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>{value}</span>
        {delta && <span className="mono text-[10px] font-semibold" style={{ color: 'var(--good)' }}>{delta}</span>}
      </div>
    </div>
  )
}

export default function ToolsHubZone({ onNavigate }: ToolsHubZoneProps) {
  const { theme } = useTheme()
  const tones = theme === 'dark' ? TONE_DARK : TONE_LIGHT

  const [query, setQuery]       = useState('')
  const [category, setCategory] = useState<HubCategory>('All')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return HUB_TOOLS.filter(t => {
      const hay = `${t.name} ${t.desc} ${t.category}`.toLowerCase()
      return (!q || hay.includes(q)) && (category === 'All' || t.category === category)
    })
  }, [query, category])

  const featured     = HUB_TOOLS.find(t => t.id === 'yt-downloader')
  const featuredTone = featured ? tones[featured.accentTone] : tones.red
  const FeaturedIcon = featured?.icon

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}
    >
      <StudioToolsHeader crumbs={[{ label: 'Workspace' }, { label: 'Tools', emphasis: true }]} />

      <div className="flex-1 overflow-auto pb-20">
        <div className="mx-auto max-w-[1280px] px-8 pt-8">

          {/* Hero */}
          <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
            <div className="max-w-xl">
              <div className="mono mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                <Wrench className="size-3" style={{ color: 'var(--text-4)' }} strokeWidth={2} aria-hidden />
                Audio production toolkit
              </div>
              <h1 className="mb-2 text-balance text-[32px] font-semibold leading-tight tracking-tight" style={{ color: 'var(--text-1)' }}>
                Small tools, fewer tabs.
              </h1>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-3)' }}>
                Capture, analyze, and prep audio for your DAW — all in one place. Local-first, no cloud upload.
              </p>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium transition"
              style={{
                background: 'var(--bg-card)',
                border:     '1px solid var(--border)',
                color:      'var(--text-2)',
                boxShadow:  'var(--shadow-sm)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-card)')}
            >
              <Plus className="size-3.5" strokeWidth={2} aria-hidden />
              Suggest a tool
            </button>
          </div>

          {/* Featured card */}
          {featured && FeaturedIcon && (
            <button
              type="button"
              onClick={() => onNavigate('tools-youtube-downloader')}
              className="group relative mb-7 grid w-full cursor-pointer grid-cols-1 items-center gap-5 overflow-hidden rounded-2xl p-6 text-left transition hover:-translate-y-px sm:grid-cols-[1fr_auto]"
              style={{
                background:  `linear-gradient(135deg, ${featuredTone.bg} 0%, var(--bg-card) 65%)`,
                border:      '1px solid var(--border)',
                boxShadow:   'var(--shadow-sm)',
              }}
            >
              <div className="flex items-center gap-[18px]">
                <div
                  className="grid size-14 shrink-0 place-items-center rounded-[14px] text-white shadow-lg"
                  style={{
                    background: featuredTone.fg,
                    boxShadow:  `0 10px 24px -8px ${featuredTone.fg}66`,
                  }}
                >
                  <FeaturedIcon className="size-7" strokeWidth={2} aria-hidden />
                </div>
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Featured</span>
                    <span
                      className="mono rounded px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide"
                      style={{
                        background: 'var(--accent-soft)',
                        color:      'var(--accent-fg)',
                        outline:    '1px solid color-mix(in oklab, var(--accent) 30%, transparent)',
                      }}
                    >
                      Updated
                    </span>
                  </div>
                  <div className="mb-1 text-[19px] font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>
                    {featured.name}
                  </div>
                  <div className="text-[13px]" style={{ color: 'var(--text-3)' }}>
                    Paste a link, pick quality, queue and grab. Auto-detect key & BPM after.
                  </div>
                </div>
              </div>
              <div
                className="inline-flex items-center justify-center gap-1.5 self-center rounded-[10px] px-4 py-2.5 text-[13px] font-medium sm:justify-self-end"
                style={{ background: 'var(--text-1)', color: 'var(--bg-canvas)' }}
              >
                Open
                <ChevronRight className="size-3.5" strokeWidth={2} aria-hidden />
              </div>
            </button>
          )}

          {/* Search + filter */}
          <div className="mb-[18px] flex flex-wrap items-center gap-3">
            <div
              className="flex min-w-[220px] max-w-[380px] flex-1 items-center gap-2 rounded-[10px] px-3 py-2"
              style={{
                background: 'var(--bg-card)',
                border:     '1px solid var(--border)',
                boxShadow:  'var(--shadow-sm)',
              }}
            >
              <Search className="size-[15px] shrink-0" style={{ color: 'var(--text-4)' }} strokeWidth={2} aria-hidden />
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search tools…"
                className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
                style={{ color: 'var(--text-1)' }}
              />
              {query && (
                <button
                  type="button"
                  className="shrink-0 p-0.5 transition"
                  style={{ color: 'var(--text-4)' }}
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                >
                  <X className="size-[13px]" strokeWidth={2} />
                </button>
              )}
              <kbd
                className="mono hidden shrink-0 rounded px-1 py-0.5 text-[9px] sm:inline"
                style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)', color: 'var(--text-4)' }}
              >
                ⌘K
              </kbd>
            </div>

            <div className="flex flex-wrap gap-1 rounded-[10px] p-1" style={{ background: 'var(--bg-muted)' }}>
              {HUB_CATEGORIES.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className="rounded-[7px] px-3 py-1.5 text-xs font-medium transition"
                  style={{
                    background: category === cat ? 'var(--bg-card)' : 'transparent',
                    color:      category === cat ? 'var(--text-1)' : 'var(--text-3)',
                    boxShadow:  category === cat ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                    outline:    category === cat ? '1px solid var(--border)' : 'none',
                  }}
                >
                  {cat}
                  {cat !== 'All' && (
                    <span className="mono ml-1.5 text-[9px]" style={{ color: 'var(--text-4)' }}>
                      {HUB_TOOLS.filter(t => t.category === cat).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Grid + sidebar */}
          <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              {filtered.length === 0 ? (
                <div
                  className="rounded-[14px] py-16 text-center"
                  style={{ border: '1px dashed var(--border-strong)' }}
                >
                  <Search className="mx-auto mb-3 size-7" style={{ color: 'var(--text-4)' }} strokeWidth={1.5} aria-hidden />
                  <div className="mb-1 text-sm font-medium" style={{ color: 'var(--text-2)' }}>
                    No tools match &quot;{query}&quot;
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-3)' }}>
                    Try a different keyword or clear the filter.
                  </div>
                </div>
              ) : (
                <div
                  className="grid gap-[var(--grid-gap,14px)]"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--tile-min, 240px)), 1fr))' }}
                >
                  {filtered.map(tool => (
                    <ToolsHubToolCard key={tool.id} tool={tool} onOpen={onNavigate} />
                  ))}
                </div>
              )}
            </div>

            <aside className="flex flex-col gap-4 lg:sticky lg:top-[88px]">
              {/* Stats */}
              <div
                className="rounded-[14px] p-[18px]"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
              >
                <div className="mono mb-3 text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-4)' }}>This week</div>
                <div className="grid grid-cols-2 gap-3.5">
                  <StatRow label="Tools used"       value="6"     delta="+2"   />
                  <StatRow label="Files processed"  value="42"    delta="+11"  />
                  <StatRow label="Hours saved"      value="3.2h"  delta="+0.7" />
                  <StatRow label="Avg latency"      value="180ms" delta={null} />
                </div>
              </div>

              {/* Recent activity */}
              <div
                className="rounded-[14px] p-[18px]"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-4)' }}>Recent activity</div>
                  <button
                    type="button"
                    className="text-[11px] font-medium transition"
                    style={{ color: 'var(--accent-fg)' }}
                  >
                    View all
                  </button>
                </div>
                <div className="flex flex-col gap-0.5">
                  {HUB_RECENT.map(r => {
                    const tone = tones[r.tone]
                    const Ico  = r.icon
                    return (
                      <div
                        key={r.id}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-2 transition"
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div
                          className="grid size-7 shrink-0 place-items-center rounded-md"
                          style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}` }}
                        >
                          <Ico className="size-[13px]" strokeWidth={2} aria-hidden />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium" style={{ color: 'var(--text-1)' }}>{r.target}</div>
                          <div className="mono truncate text-[10px]" style={{ color: 'var(--text-4)' }}>
                            {r.action} · {r.tool}
                          </div>
                        </div>
                        <span className="mono shrink-0 text-[10px]" style={{ color: 'var(--text-4)' }}>{r.time}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Tip card */}
              <div
                className="rounded-[14px] p-4"
                style={{
                  background: 'var(--accent-soft)',
                  border:     '1px solid color-mix(in oklab, var(--accent) 25%, transparent)',
                }}
              >
                <div className="flex gap-2.5">
                  <Sparkles className="mt-0.5 size-[15px] shrink-0" style={{ color: 'var(--accent-fg)' }} strokeWidth={2} aria-hidden />
                  <div>
                    <div className="mb-1 text-xs font-semibold" style={{ color: 'var(--accent-fg)' }}>Tip</div>
                    <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
                      Drop any audio file onto the workspace and we&apos;ll route it to the right tool automatically.
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}
