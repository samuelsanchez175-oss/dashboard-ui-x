import { ChevronRight, PanelLeftOpen, Search, Wrench, X, Zap } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { getToolById, toolAcceptsMime, fileInputTools } from '../../lib/toolsRegistry'
import { startDropRun } from '../../lib/tool-drop-run'
import { useGlobalDrag } from '../../hooks/useGlobalDrag'
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

/**
 * Capability sub-grouping for the flat TOOLS section — groups the destinations
 * by what they *do* rather than one long list. Unmapped items (e.g. the hub
 * itself) fall into "More".
 */
const CAP_GROUPS: { id: string; title: string }[] = [
  { id: 'audio',   title: 'Audio & Music' },
  { id: 'media',   title: 'Media' },
  { id: 'design',  title: 'Design & Export' },
  { id: 'utility', title: 'Utility' },
  { id: 'more',    title: 'More' },
]
const HUB_GROUP: Record<string, string> = {
  'tools-key-finder': 'audio', 'tools-chord-detector': 'audio', 'tools-note-detector-2': 'audio',
  'tools-stem-splitter': 'audio', 'tools-sample-slicer': 'audio', 'tools-tempo-tap': 'audio',
  'tools-metronome-export': 'audio',
  'tools-youtube-downloader': 'media',
  'tools-app-icon': 'design', 'tools-device-mockup': 'design',
  'tools-phonetics-inspector': 'utility', 'tools-session-timer': 'utility', 'tools-arrangement-pad': 'utility',
}
const hubGroupOf = (id: string): string => HUB_GROUP[id] ?? 'more'

function groupToolsByCapability(items: NavItem[]): { id: string; title: string; items: NavItem[] }[] {
  return CAP_GROUPS
    .map(g => ({ ...g, items: items.filter(it => hubGroupOf(it.id) === g.id) }))
    .filter(g => g.items.length > 0)
}

function ToolRow({
  item,
  sectionTitle,
  onNavigate,
  toneIndex,
  onSidebar,
  onRestore,
  dragging,
  dragMime,
}: {
  item: NavItem
  sectionTitle: string
  onNavigate: (routeId: string) => void
  toneIndex: number
  /** Whether this tool is currently shown on the left sidebar. */
  onSidebar: boolean
  /** Put a removed tool back on the sidebar (the no-drag path). */
  onRestore: (id: string) => void
  /** True while an OS file is being dragged over the window. */
  dragging: boolean
  /** Mime of the dragged file (for drop-target eligibility). */
  dragMime: string
}) {
  const Icon = item.icon
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  // Map this nav item back to its tool def (undefined for zones/non-tools).
  const tool = getToolById(item.id)
  const accepts = tool?.accepts
  const eligible = dragging && !!tool && toolAcceptsMime(tool, dragMime || 'application/octet-stream')

  const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files')

  const onFileDrop = (e: React.DragEvent) => {
    if (!tool || !accepts || !isFileDrag(e)) return // ignore the tile→sidebar nav drag
    e.preventDefault(); e.stopPropagation(); setOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f && toolAcceptsMime(tool, f.type || 'application/octet-stream')) void startDropRun(tool, f)
  }
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f && tool) void startDropRun(tool, f)
    e.target.value = ''
  }
  const acceptAttr = accepts?.[0] === 'image/' ? 'image/*' : accepts?.[0] === 'audio/' ? 'audio/*' : undefined

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
    <div
      className={`relative ${eligible || over ? 'outline outline-2 outline-offset-2 outline-[var(--accent)] rounded-[14px]' : ''}`}
      onDragOver={e => { if (accepts && isFileDrag(e)) { e.preventDefault(); setOver(true) } }}
      onDragLeave={() => setOver(false)}
      onDrop={onFileDrop}
    >
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
          <span className="block truncate text-sm font-semibold tracking-tight text-t1">
            {item.label}
          </span>
          <span
            className={`mono block truncate text-[10px] uppercase tracking-wide ${onSidebar ? 'text-t4' : 'text-accent'}`}
          >
            {eligible ? 'Drop file to run' : onSidebar ? `${sectionTitle} · ${item.id}` : 'Not on sidebar · drag to add'}
          </span>
        </span>
        {item.badge != null && (
          <span
            className={`mono rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.badgeClass ?? 'bg-muted text-t3'}`}
          >
            {item.badge}
          </span>
        )}
        <ChevronRight className="size-4 shrink-0 transition group-hover:translate-x-0.5 text-t4" aria-hidden />
      </button>

      {tool?.quickActions && tool.quickActions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-1">
          {tool.quickActions.map(qa => (
            <button
              key={qa.id}
              type="button"
              onClick={e => {
                e.stopPropagation()
                if (qa.id === 'upload') fileInputRef.current?.click()
                else onNavigate(item.id)
              }}
              className="rounded-md px-2 py-1 text-[11px] font-medium transition bg-hover text-t2 border border-border"
            >
              {qa.label}
            </button>
          ))}
          {accepts && (
            <span className="mono text-[10px] uppercase tracking-wide text-t4">or drop a file</span>
          )}
        </div>
      )}

      {accepts && (
        <input ref={fileInputRef} type="file" hidden accept={acceptAttr} onChange={onPick} />
      )}

      {!onSidebar && (
        <button
          type="button"
          onClick={() => onRestore(item.id)}
          className="absolute -right-2 -top-2 z-[1] flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold leading-none shadow-sm transition-transform hover:scale-105 bg-accent text-[var(--accent-on,#fff)] border-[1.5px] border-canvas"
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
  dragging,
  dragMime,
}: {
  section: NavSection
  sectionIndex: number
  onNavigate: (routeId: string) => void
  isOnSidebar: (sectionId: string, itemId: string) => boolean
  onRestore: (id: string) => void
  dragging: boolean
  dragMime: string
}) {
  return (
    <section
      className="rounded-2xl p-4 bg-muted border border-border border-t-[color-mix(in_oklab,var(--accent)_24%,var(--border))]"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="mono text-[11px] font-semibold uppercase tracking-[0.16em] text-t3">
            {section.title}
          </h2>
          <div className="mt-1 text-xs text-t4">
            {section.items.length} {section.items.length === 1 ? 'destination' : 'destinations'}
          </div>
        </div>
        <span
          className="mono rounded-full px-2 py-1 text-[10px] font-semibold bg-card text-t4 border border-border"
        >
          {section.items.length}
        </span>
      </div>
      {section.id === 'tools' ? (
        <div className="space-y-4">
          {groupToolsByCapability(section.items).map((g, gi) => (
            <div key={g.id}>
              <div className="mb-2 mono text-[10px] font-semibold uppercase tracking-[0.14em] text-t4">
                {g.title}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {g.items.map((item, itemIndex) => (
                  <ToolRow
                    key={item.id}
                    item={item}
                    sectionTitle={section.title}
                    onNavigate={onNavigate}
                    toneIndex={gi * 3 + itemIndex}
                    onSidebar={isOnSidebar(section.id, item.id)}
                    onRestore={onRestore}
                    dragging={dragging}
                    dragMime={dragMime}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
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
              dragging={dragging}
              dragMime={dragMime}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export default function ToolsHubZone({ onNavigate }: ToolsHubZoneProps) {
  const [layout, setLayout] = useState(() => loadSidebarNavLayout())
  const [query, setQuery]   = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const { allToolsSections, allToolsItemCount } = useSidebarNavModel(layout)
  const { dragging, mime: dragMime } = useGlobalDrag()

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

  // Fast-lane: the drop-capable tools, pinned at the top for quick drag-and-drop.
  const dropTools = useMemo<NavItem[]>(() => {
    const q = query.trim().toLowerCase()
    return fileInputTools()
      .map(t => ({ id: t.id, label: t.label, icon: t.icon, badge: t.badge }))
      .filter(it => !q || `${it.label} ${it.id}`.toLowerCase().includes(q))
  }, [query])

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
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas text-t1"
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
                  className="relative overflow-hidden rounded-2xl px-5 py-4 bg-card border border-border-soft shadow-[var(--shadow-sm)]"
                >
                  <span
                    aria-hidden
                    className="absolute bottom-3 left-0 top-3 w-px rounded-full bg-accent"
                  />
                  <div className="mono text-[10px] uppercase tracking-wide text-t4">
                    Current index
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="mono text-3xl font-semibold tracking-tight text-t1">
                      {allToolsItemCount}
                    </span>
                    <span className="text-xs text-t3">reachable destinations</span>
                  </div>
                </div>
              }
            />
          </div>
        </HeroBand>
        <div className="mx-auto max-w-[1280px] px-[var(--pad-card)] pt-[var(--pad-card)]">

          <div className="mb-5 flex flex-wrap items-center gap-3">
            <div
              className={`flex min-w-[220px] max-w-[380px] flex-1 items-center gap-2 rounded-[10px] px-3 py-2 transition-shadow bg-card border border-border ${
                isSearchFocused
                  ? 'shadow-[var(--shadow-sm),0_0_0_2px_color-mix(in_oklab,var(--accent)_30%,transparent)]'
                  : 'shadow-[var(--shadow-sm)]'
              }`}
            >
              <Search className="size-[15px] shrink-0 text-t4" strokeWidth={2} aria-hidden />
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search tools, zones, sections..."
                className="min-w-0 flex-1 bg-transparent text-[13px] outline-none text-t1"
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
              />
              {query && (
                <button
                  type="button"
                  className="shrink-0 p-0.5 transition text-t4"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                >
                  <X className="size-[13px]" strokeWidth={2} />
                </button>
              )}
            </div>
            <span className="mono rounded-full px-3 py-2 text-[10px] font-semibold uppercase tracking-wide bg-muted text-t4">
              {filteredCount} shown
            </span>
            {offSidebarCount > 0 && (
              <span
                className="mono inline-flex items-center gap-1 rounded-full px-3 py-2 text-[10px] font-semibold uppercase tracking-wide bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-accent"
                title="Tools removed from the left sidebar. Drag a tile onto the sidebar, or press Add, to put it back."
              >
                <PanelLeftOpen size={11} strokeWidth={2.2} aria-hidden />
                {offSidebarCount} off sidebar
              </span>
            )}
          </div>

          <div className="grid gap-[var(--grid-gap)]">
            {/* Fast-lane: drop-ready tools pinned at the top */}
            {dropTools.length > 0 && (
              <section className="rounded-2xl p-4 border border-[color-mix(in_oklab,var(--accent)_40%,var(--border))] bg-[color-mix(in_oklab,var(--accent)_6%,var(--bg-muted))]">
                <div className="mb-3 flex items-center gap-2">
                  <Zap className="size-4 text-accent" strokeWidth={2} aria-hidden />
                  <h2 className="mono text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                    Drop-ready tools
                  </h2>
                  <span className="text-xs text-t4">drag a file onto any of these to run it</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {dropTools.map((item, i) => (
                    <ToolRow
                      key={item.id}
                      item={item}
                      sectionTitle="Drop-ready"
                      onNavigate={onNavigate}
                      toneIndex={i}
                      onSidebar
                      onRestore={() => {}}
                      dragging={dragging}
                      dragMime={dragMime}
                    />
                  ))}
                </div>
              </section>
            )}

            {sections.length > 0 ? (
              sections.map((section, sectionIndex) => (
                <NavSectionCard
                  key={section.id}
                  section={section}
                  sectionIndex={sectionIndex}
                  onNavigate={onNavigate}
                  isOnSidebar={isOnSidebar}
                  onRestore={restoreToSidebar}
                  dragging={dragging}
                  dragMime={dragMime}
                />
              ))
            ) : dropTools.length === 0 ? (
              <div className="rounded-2xl py-16 text-center border border-dashed border-border-strong">
                <Search className="mx-auto mb-3 size-7 text-t4" strokeWidth={1.5} aria-hidden />
                <div className="mb-1 text-sm font-medium text-t2">
                  No destinations match &quot;{query}&quot;
                </div>
                <div className="text-xs text-t3">
                  Try a section name, tool name, custom zone, or route ID.
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
