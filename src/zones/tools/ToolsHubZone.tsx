import { ChevronRight, PanelLeftOpen, Search, Wrench, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import StudioToolsHeader from './StudioToolsHeader'
import HeroBand from '../../components/HeroBand'
import ZoneHeader from '../../components/ZoneHeader'
import {
  isNavItemOnSidebar,
  loadSidebarNavLayout,
  restoreNavItemToSidebar,
  saveSidebarNavLayout,
  SIDEBAR_NAV_DND_MIME,
  SIDEBAR_NAV_LAYOUT_EVENT,
} from '../../components/sidebar/sidebarNavLayout'
import { useSidebarNavModel } from '../../components/sidebar/useSidebarNavModel'
import type { NavItem, NavSection } from '../../components/sidebar/navigation'
import {
  TONE_DARK,
} from './toolsHubData'

const TOOLS_HUB_HERO_GRADIENT =
  'radial-gradient(115% 90% at 0% 0%, color-mix(in oklab, var(--accent) 24%, transparent) 0%, color-mix(in oklab, var(--accent) 12%, transparent) 30%, transparent 66%), radial-gradient(90% 70% at 100% 100%, color-mix(in oklab, #38bdf8 28%, transparent) 0%, color-mix(in oklab, #7dd3fc 14%, transparent) 38%, transparent 72%), radial-gradient(65% 42% at 42% 0%, color-mix(in oklab, white 8%, transparent) 0%, transparent 58%), linear-gradient(135deg, color-mix(in oklab, var(--accent) 11%, var(--bg-canvas)) 0%, color-mix(in oklab, #38bdf8 8%, var(--bg-canvas)) 100%)'

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
  onSidebar,
  onRestore,
}: {
  item: NavItem
  sectionTitle: string
  onNavigate: (routeId: string) => void
  toneIndex: number
  /** Whether this tool is currently shown on the left sidebar. */
  onSidebar: boolean
  /** Put a removed tool back on the sidebar (the no-drag path). */
  onRestore: (id: string) => void
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
    <div className="relative">
      <button
        type="button"
        draggable
        onDragStart={e => {
          e.dataTransfer.setData(SIDEBAR_NAV_DND_MIME, item.id)
          e.dataTransfer.setData('text/plain', item.label)
          e.dataTransfer.effectAllowed = 'copyMove'
        }}
        onClick={() => onNavigate(item.id)}
        title={onSidebar ? 'Open · drag onto the sidebar' : 'Drag onto the sidebar to add it back'}
        className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:-translate-y-px"
        style={{
          background: 'var(--bg-card)',
          border:     onSidebar
            ? '1px solid var(--border)'
            : '1px dashed color-mix(in oklab, var(--accent) 55%, var(--border))',
          boxShadow:  'var(--shadow-sm)',
          cursor:     'grab',
        }}
        onMouseEnter={e => {
          if (onSidebar) e.currentTarget.style.borderColor = 'var(--border-strong)'
          e.currentTarget.style.background = 'linear-gradient(to right, var(--bg-hover), color-mix(in oklab, var(--accent) 8%, var(--bg-hover)))'
        }}
        onMouseLeave={e => {
          if (onSidebar) e.currentTarget.style.borderColor = 'var(--border)'
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
          <span
            className="mono block truncate text-[10px] uppercase tracking-wide"
            style={{ color: onSidebar ? 'var(--text-4)' : 'var(--accent)' }}
          >
            {onSidebar ? `${sectionTitle} · ${item.id}` : 'Not on sidebar · drag to add'}
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
      {!onSidebar && (
        <button
          type="button"
          onClick={() => onRestore(item.id)}
          className="absolute -right-2 -top-2 z-[1] flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold leading-none shadow-sm transition-transform hover:scale-105"
          style={{ background: 'var(--accent)', color: 'var(--accent-on, #fff)', border: '1.5px solid var(--bg-canvas)' }}
          title="Add this tool back to the left sidebar"
          aria-label={`Add ${item.label} to the sidebar`}
        >
          <PanelLeftOpen size={11} strokeWidth={2.2} aria-hidden />
          Add
        </button>
      )}
    </div>
  )
}

function NavSectionCard({
  section,
  sectionIndex,
  onNavigate,
  isOnSidebar,
  onRestore,
}: {
  section: NavSection
  sectionIndex: number
  onNavigate: (routeId: string) => void
  isOnSidebar: (sectionId: string, itemId: string) => boolean
  onRestore: (id: string) => void
}) {
  return (
    <section
      className="rounded-2xl p-4"
      style={{
        background: 'var(--bg-muted)',
        border:     '1px solid var(--border)',
        borderTop:  '1px solid color-mix(in oklab, var(--accent) 24%, var(--border))',
      }}
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
            onSidebar={isOnSidebar(section.id, item.id)}
            onRestore={onRestore}
          />
        ))}
      </div>
    </section>
  )
}

export default function ToolsHubZone({ onNavigate }: ToolsHubZoneProps) {
  const [layout, setLayout] = useState(() => loadSidebarNavLayout())
  const [query, setQuery]   = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
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

  const isOnSidebar = useCallback(
    (sectionId: string, itemId: string) => isNavItemOnSidebar(layout, sectionId, itemId),
    [layout],
  )

  // Put a removed tool back on the sidebar. Writing + dispatching the layout
  // event keeps the sidebar (which listens) in sync without a reload.
  const restoreToSidebar = useCallback(
    (itemId: string) => {
      const next = restoreNavItemToSidebar(loadSidebarNavLayout(), allToolsSections, itemId)
      saveSidebarNavLayout(next)
      setLayout(next)
    },
    [allToolsSections],
  )

  const offSidebarCount = useMemo(
    () =>
      allToolsSections.reduce(
        (n, s) => n + s.items.filter(i => !isNavItemOnSidebar(layout, s.id, i.id)).length,
        0,
      ),
    [allToolsSections, layout],
  )

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}
    >
      <StudioToolsHeader crumbs={[{ label: 'Workspace' }, { label: 'Tools', emphasis: true }]} />

      <div className="flex-1 overflow-auto pb-20">
        <HeroBand gradient={TOOLS_HUB_HERO_GRADIENT}>
          <div className="mx-auto max-w-[1280px] px-[var(--pad-card)] py-8">
            <ZoneHeader
              eyebrow="TOOLS · SOURCE OF TRUTH"
              title="Every tool lives here."
              icon={Wrench}
              scale="hero"
              description="This hub always lists every destination — including tools you removed from the left sidebar. Drag any tile onto the sidebar, or press Add, to put it back."
              actions={
                <div
                  className="relative overflow-hidden rounded-2xl px-5 py-4"
                  style={{
                    background: 'var(--bg-card)',
                    border:     '1px solid var(--border-soft)',
                    boxShadow:  'var(--shadow-sm)',
                  }}
                >
                  <span
                    aria-hidden
                    className="absolute bottom-3 left-0 top-3 w-px rounded-full"
                    style={{ background: 'var(--accent)' }}
                  />
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
              }
            />
          </div>
        </HeroBand>
        <div className="mx-auto max-w-[1280px] px-[var(--pad-card)] pt-[var(--pad-card)]">

          <div className="mb-5 flex flex-wrap items-center gap-3">
            <div
              className="flex min-w-[220px] max-w-[380px] flex-1 items-center gap-2 rounded-[10px] px-3 py-2 transition-shadow"
              style={{
                background: 'var(--bg-card)',
                border:     '1px solid var(--border)',
                boxShadow:  isSearchFocused
                  ? 'var(--shadow-sm), 0 0 0 2px color-mix(in oklab, var(--accent) 30%, transparent)'
                  : 'var(--shadow-sm)',
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
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
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
            {offSidebarCount > 0 && (
              <span
                className="mono inline-flex items-center gap-1 rounded-full px-3 py-2 text-[10px] font-semibold uppercase tracking-wide"
                style={{ background: 'color-mix(in oklab, var(--accent) 14%, transparent)', color: 'var(--accent)' }}
                title="Tools removed from the left sidebar. Drag a tile onto the sidebar, or press Add, to put it back."
              >
                <PanelLeftOpen size={11} strokeWidth={2.2} aria-hidden />
                {offSidebarCount} off sidebar
              </span>
            )}
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
            <div className="grid gap-[var(--grid-gap)]">
              {sections.map((section, sectionIndex) => (
                <NavSectionCard
                  key={section.id}
                  section={section}
                  sectionIndex={sectionIndex}
                  onNavigate={onNavigate}
                  isOnSidebar={isOnSidebar}
                  onRestore={restoreToSidebar}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
