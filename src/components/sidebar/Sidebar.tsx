import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Moon, Plus, Sun, X } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'
import SidebarBrand from './SidebarBrand'
import NavSectionGroup from './NavSectionGroup'
import ProfileWidget from './ProfileWidget'
import { DEFAULT_ACTIVE_ID } from './navigation'
import type { NavSection } from './navigation'
import { useSidebarNavModel } from './useSidebarNavModel'
import {
  hideNavItem,
  loadSidebarNavLayout,
  moveNavItemInLayout,
  orderedSectionIds,
  resetSidebarNavLayout,
  saveSidebarNavLayout,
  sectionForEdit,
  toggleSectionCollapsed,
  toggleSectionHidden,
  type SidebarNavLayoutPersist,
} from './sidebarNavLayout'

interface SidebarProps {
  onRouteChange?:  (id: string) => void
  activeRouteId?:  string
  mobileOpen?:     boolean
  onMobileClose?:  () => void
}

export default function Sidebar({ onRouteChange, activeRouteId, mobileOpen, onMobileClose }: SidebarProps) {
  const { theme, setTheme }           = useTheme()
  const [activeId, setActiveId]       = useState<string>(activeRouteId ?? DEFAULT_ACTIVE_ID)
  const [layout, setLayout]           = useState<SidebarNavLayoutPersist>(() => loadSidebarNavLayout())
  const [layoutEditMode, setLayoutEditMode] = useState(false)
  const dragRef                       = useRef<{ fromSectionId: string, itemId: string } | null>(null)
  const {
    sourceSections: navSections,
    visibleSections: standardNav,
    customZonesSection,
  } = useSidebarNavModel(layout)

  useEffect(() => {
    if (activeRouteId != null && activeRouteId !== '') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror App route into sidebar selection
      setActiveId(activeRouteId)
    }
  }, [activeRouteId])

  useEffect(() => {
    saveSidebarNavLayout(layout)
  }, [layout])

  const editNavGroups = useMemo(() => {
    if (!layoutEditMode) return null
    const ids = orderedSectionIds(navSections, layout)
    const hidden = new Set(layout.hiddenSectionIds)
    const byId = new Map(navSections.map(s => [s.id, s] as const))
    const onSidebar: NavSection[] = []
    const offSidebar: NavSection[] = []
    for (const id of ids) {
      const raw = byId.get(id)
      if (!raw) continue
      const sec = sectionForEdit(raw, layout)
      if (hidden.has(id)) offSidebar.push(sec)
      else onSidebar.push(sec)
    }
    return { onSidebar, offSidebar }
  }, [navSections, layout, layoutEditMode])

  const toggleSection = useCallback((sectionId: string) => {
    setLayout(prev => toggleSectionCollapsed(prev, sectionId))
  }, [])

  const selectItem = useCallback(
    (id: string) => {
      setActiveId(id)
      onRouteChange?.(id)
    },
    [onRouteChange],
  )

  const enterLayoutEdit = useCallback(() => {
    setLayoutEditMode(true)
  }, [])

  const exitLayoutEdit = useCallback(() => {
    setLayoutEditMode(false)
    dragRef.current = null
  }, [])

  const handleSectionPinToggle = useCallback((sectionId: string) => {
    setLayout(prev => toggleSectionHidden(prev, sectionId))
  }, [])

  const handleRemoveItem = useCallback((itemId: string) => {
    setLayout(prev => hideNavItem(prev, itemId))
  }, [])

  const handleDragItemStart = useCallback((sectionId: string, itemId: string) => {
    dragRef.current = { fromSectionId: sectionId, itemId }
  }, [])

  const handleItemDragEnd = useCallback(() => {
    dragRef.current = null
  }, [])

  const handleDropBeforeItem = useCallback(
    (toSectionId: string, beforeItemId: string | null) => {
      const d = dragRef.current
      if (!d) return
      if (d.fromSectionId === toSectionId && beforeItemId === d.itemId) return
      setLayout(prev => moveNavItemInLayout(prev, navSections, d.fromSectionId, toSectionId, d.itemId, beforeItemId))
      dragRef.current = null
    },
    [navSections],
  )

  const handleResetLayout = useCallback(() => {
    setLayout(resetSidebarNavLayout())
    dragRef.current = null
  }, [])

  const isDark = theme === 'dark'

  const renderSection = (section: NavSection, i: number, offSidebar: boolean) => (
    <NavSectionGroup
      key={section.id}
      section={section}
      collapsed={!layoutEditMode && layout.collapsedSectionIds.includes(section.id)}
      onToggle={toggleSection}
      activeItemId={activeId}
      onSelectItem={selectItem}
      baseAnimationDelayMs={i * 40}
      layoutEditMode={layoutEditMode}
      sectionHidden={offSidebar}
      onPinPress={enterLayoutEdit}
      onSectionPinToggle={() => handleSectionPinToggle(section.id)}
      onRemoveItem={handleRemoveItem}
      onDragItemStart={handleDragItemStart}
      onItemDragEnd={handleItemDragEnd}
      onDropBeforeItem={handleDropBeforeItem}
    />
  )

  return (
    <aside
      className="sidebar-shell flex flex-col h-screen w-[240px] shrink-0"
      data-mobile-open={mobileOpen ? 'true' : 'false'}
      style={{
        background:  'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
      }}
    >
      <SidebarBrand />

      {/* Mobile-only close row */}
      {onMobileClose && (
        <div
          className="md:hidden flex items-center justify-end px-3 py-1.5"
          style={{ borderBottom: '1px solid var(--border-soft)' }}
        >
          <button
            type="button"
            onClick={onMobileClose}
            className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
            style={{ color: 'var(--text-3)', background: 'var(--bg-hover)' }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      <nav
        className={
          'flex-1 overflow-y-auto px-3 py-3 space-y-0.5'
          + (layoutEditMode ? ' sidebar-nav-wiggle' : '')
        }
        aria-label="Primary navigation"
      >
        {layoutEditMode && (
          <div
            className="sticky top-0 z-10 -mx-1 px-1 pb-2 mb-1 flex gap-2"
            style={{
              background: 'linear-gradient(180deg, var(--bg-sidebar) 85%, transparent)',
            }}
          >
            <button
              type="button"
              onClick={exitLayoutEdit}
              className="flex-1 rounded-lg py-2 text-[12px] font-semibold transition-colors"
              style={{
                background: 'var(--accent)',
                color:      'var(--accent-on, #fff)',
              }}
            >
              Done
            </button>
            <button
              type="button"
              onClick={handleResetLayout}
              className="shrink-0 rounded-lg px-2.5 py-2 text-[11px] font-medium transition-colors"
              style={{
                background: 'var(--bg-hover)',
                color:      'var(--text-3)',
                border:     '1px solid var(--border)',
              }}
              title="Restore default navigation"
            >
              Reset
            </button>
          </div>
        )}

        {layoutEditMode && editNavGroups
          ? (
              <>
                {editNavGroups.onSidebar.map((section, i) => renderSection(section, i, false))}
                {editNavGroups.offSidebar.length > 0 && (
                  <div
                    className="pt-3 mt-1 space-y-0.5"
                    style={{ borderTop: '1px solid var(--border-soft)' }}
                  >
                    <div
                      className="px-2 pb-1 text-[10px] font-semibold tracking-wider uppercase"
                      style={{ fontFamily: "'DM Mono', monospace", color: 'var(--text-4)' }}
                    >
                      Off sidebar
                    </div>
                    {editNavGroups.offSidebar.map((section, i) =>
                      renderSection(section, editNavGroups.onSidebar.length + i, true),
                    )}
                  </div>
                )}
              </>
            )
          : (
              standardNav.map((section, i) => renderSection(section, i, false))
            )}

        {/* ── Custom zones ── */}
        {!layoutEditMode && customZonesSection && (
          <div className="pt-2">
            <div className="px-2 pb-1 flex items-center justify-between">
              <span
                className="text-[10px] font-semibold tracking-wider uppercase"
                style={{ fontFamily: "'DM Mono', monospace", color: 'var(--text-4)' }}
              >
                MY ZONES
              </span>
            </div>
            {customZonesSection.items.map((item, i) => {
              const isActive = activeId === item.id
              const ItemIcon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectItem(item.id)}
                  className="nav-item-animate relative w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] font-medium transition-all duration-150 text-left"
                  style={{
                    animationDelay: `${i * 30}ms`,
                    background: isActive ? 'var(--accent-soft)'   : 'transparent',
                    color:      isActive ? 'var(--accent-fg)'     : 'var(--text-3)',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                >
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                      style={{ background: 'var(--accent)' }}
                    />
                  )}
                  <ItemIcon
                    size={15}
                    strokeWidth={isActive ? 2.2 : 1.8}
                    style={{ flexShrink: 0, color: isActive ? 'var(--accent)' : 'var(--text-4)' }}
                  />
                  <span className="flex-1 leading-none truncate">{item.label}</span>
                </button>
              )
            })}
          </div>
        )}
      </nav>

      {/* ── Bottom actions: Add Zone + theme toggle ── */}
      <div
        className="px-3 py-2 flex items-center gap-2"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <button
          type="button"
          onClick={() => selectItem('zone-builder')}
          className="flex flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-medium transition-all"
          style={{
            background: activeId === 'zone-builder' ? 'var(--accent-soft)' : 'var(--bg-hover)',
            color:      activeId === 'zone-builder' ? 'var(--accent-fg)'   : 'var(--text-3)',
            border:     '1px solid var(--border)',
          }}
          onMouseEnter={e => { if (activeId !== 'zone-builder') e.currentTarget.style.color = 'var(--text-1)' }}
          onMouseLeave={e => { if (activeId !== 'zone-builder') e.currentTarget.style.color = 'var(--text-3)' }}
        >
          <Plus size={13} />
          New Zone
        </button>

        <button
          type="button"
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className="flex items-center justify-center rounded-lg p-2 transition-all"
          style={{
            background: 'var(--bg-hover)',
            color:      'var(--text-3)',
            border:     '1px solid var(--border)',
          }}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-1)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
        >
          {isDark ? <Sun size={13} /> : <Moon size={13} />}
        </button>
      </div>

      <ProfileWidget />
    </aside>
  )
}
