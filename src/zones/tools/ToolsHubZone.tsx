import { ChevronRight, Search, Wrench, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import StudioToolsHeader from './StudioToolsHeader'
import { loadSidebarNavLayout, SIDEBAR_NAV_LAYOUT_EVENT } from '../../components/sidebar/sidebarNavLayout'
import { useSidebarNavModel } from '../../components/sidebar/useSidebarNavModel'
import type { NavItem, NavSection } from '../../components/sidebar/navigation'
import {
  TONE_DARK,
} from './toolsHubData'

interface ToolsHubZoneProps {
  onNavigate: (routeId: string) => void
}

function itemMatches(item: NavItem, sectionTitle: string, query: string): boolean {
  if (!query) return true
  return `${sectionTitle} ${item.label} ${item.id}`.toLowerCase().includes(query)
}

function filteredNavSections(sections: NavSection[], query: string): NavSection[] {
  const q = query.trim().toLowerCase()
  return sections
    .map(section => ({
      ...section,
      items: section.items.filter(item => itemMatches(item, section.title, q)),
    }))
    .filter(section => section.items.length > 0)
}

function countItems(sections: NavSection[]): number {
  return sections.reduce((sum, section) => sum + section.items.length, 0)
}

function ToolRow({
  item,
  sectionTitle,
  onNavigate,
  toneIndex,
}: {
  item: NavItem
  sectionTitle: string
  onNavigate: (routeId: string) => void
  toneIndex: number
}) {
  const Icon = item.icon
  const tones = [
    TONE_DARK.red,
    TONE_DARK.violet,
    TONE_DARK.blue,
    TONE_DARK.green,
    TONE_DARK.fuchsia,
    TONE_DARK.cyan,
  ]
  const tone = tones[toneIndex % tones.length]

  return (
    <button
      type="button"
      onClick={() => onNavigate(item.id)}
      className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:-translate-y-px"
      style={{
        background: 'var(--bg-card)',
        border:     '1px solid var(--border)',
        boxShadow:  'var(--shadow-sm)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--border-strong)'
        e.currentTarget.style.background = 'var(--bg-hover)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.background = 'var(--bg-card)'
      }}
    >
      <span
        className="grid size-9 shrink-0 place-items-center rounded-lg"
        style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}` }}
      >
        <Icon className="size-[17px]" strokeWidth={2} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>
          {item.label}
        </span>
        <span className="mono block truncate text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-4)' }}>
          {sectionTitle} · {item.id}
        </span>
      </span>
      {item.badge != null && (
        <span
          className={`mono rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.badgeClass ?? ''}`}
          style={item.badgeClass ? undefined : { background: 'var(--bg-muted)', color: 'var(--text-3)' }}
        >
          {item.badge}
        </span>
      )}
      <ChevronRight className="size-4 shrink-0 transition group-hover:translate-x-0.5" style={{ color: 'var(--text-4)' }} aria-hidden />
    </button>
  )
}

function NavSectionCard({
  section,
  sectionIndex,
  onNavigate,
}: {
  section: NavSection
  sectionIndex: number
  onNavigate: (routeId: string) => void
}) {
  return (
    <section
      className="rounded-2xl p-4"
      style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="mono text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-3)' }}>
            {section.title}
          </h2>
          <div className="mt-1 text-xs" style={{ color: 'var(--text-4)' }}>
            {section.items.length} {section.items.length === 1 ? 'destination' : 'destinations'}
          </div>
        </div>
        <span
          className="mono rounded-full px-2 py-1 text-[10px] font-semibold"
          style={{ background: 'var(--bg-card)', color: 'var(--text-4)', border: '1px solid var(--border)' }}
        >
          {section.items.length}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {section.items.map((item, itemIndex) => (
          <ToolRow
            key={item.id}
            item={item}
            sectionTitle={section.title}
            onNavigate={onNavigate}
            toneIndex={sectionIndex + itemIndex}
          />
        ))}
      </div>
    </section>
  )
}

export default function ToolsHubZone({ onNavigate }: ToolsHubZoneProps) {
  const [layout, setLayout] = useState(() => loadSidebarNavLayout())
  const [query, setQuery]   = useState('')
  const { allToolsSections, allToolsItemCount } = useSidebarNavModel(layout)

  useEffect(() => {
    const refreshLayout = () => setLayout(loadSidebarNavLayout())
    window.addEventListener(SIDEBAR_NAV_LAYOUT_EVENT, refreshLayout)
    window.addEventListener('storage', refreshLayout)
    return () => {
      window.removeEventListener(SIDEBAR_NAV_LAYOUT_EVENT, refreshLayout)
      window.removeEventListener('storage', refreshLayout)
    }
  }, [])

  const sections = useMemo(
    () => filteredNavSections(allToolsSections, query),
    [allToolsSections, query],
  )
  const filteredCount = useMemo(() => countItems(sections), [sections])
  const palette = TONE_DARK.slate

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}
    >
      <StudioToolsHeader crumbs={[{ label: 'Workspace' }, { label: 'Tools', emphasis: true }]} />

      <div className="flex-1 overflow-auto pb-20">
        <div className="mx-auto max-w-[1280px] px-8 pt-8">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
            <div className="max-w-xl">
              <div className="mono mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                <Wrench className="size-3" style={{ color: 'var(--text-4)' }} strokeWidth={2} aria-hidden />
                Sidebar mirror
              </div>
              <h1 className="mb-2 text-balance text-[32px] font-semibold leading-tight tracking-tight" style={{ color: 'var(--text-1)' }}>
                All tools, one alternate entry point.
              </h1>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-3)' }}>
                Everything visible in the left rail is grouped here with the same route IDs, including starred Web Designer pages, custom zones, and pinned actions.
              </p>
            </div>
            <div
              className="rounded-2xl px-5 py-4"
              style={{
                background: `linear-gradient(135deg, ${palette.bg}, var(--bg-card))`,
                border:     '1px solid var(--border)',
                boxShadow:  'var(--shadow-sm)',
              }}
            >
              <div className="mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-4)' }}>
                Current index
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="mono text-3xl font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>
                  {allToolsItemCount}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>reachable destinations</span>
              </div>
            </div>
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-3">
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
                placeholder="Search tools, zones, sections..."
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
            </div>
            <span className="mono rounded-full px-3 py-2 text-[10px] font-semibold uppercase tracking-wide" style={{ background: 'var(--bg-muted)', color: 'var(--text-4)' }}>
              {filteredCount} shown
            </span>
          </div>

          {sections.length === 0 ? (
            <div
              className="rounded-2xl py-16 text-center"
              style={{ border: '1px dashed var(--border-strong)' }}
            >
              <Search className="mx-auto mb-3 size-7" style={{ color: 'var(--text-4)' }} strokeWidth={1.5} aria-hidden />
              <div className="mb-1 text-sm font-medium" style={{ color: 'var(--text-2)' }}>
                No destinations match &quot;{query}&quot;
              </div>
              <div className="text-xs" style={{ color: 'var(--text-3)' }}>
                Try a section name, tool name, custom zone, or route ID.
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              {sections.map((section, sectionIndex) => (
                <NavSectionCard
                  key={section.id}
                  section={section}
                  sectionIndex={sectionIndex}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
