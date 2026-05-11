import { useCallback, useEffect, useMemo, useState } from 'react'
import { Folder, Moon, Plus, Sun, X } from 'lucide-react'
import { useDiagnostics } from '../../context/DiagnosticsContext'
import { useTheme } from '../../context/ThemeContext'
import { useCustomZones } from '../../context/CustomZonesContext'
import SidebarBrand from './SidebarBrand'
import NavSectionGroup from './NavSectionGroup'
import ProfileWidget from './ProfileWidget'
import { NAV_SECTIONS, DEFAULT_ACTIVE_ID } from './navigation'
import type { NavSection } from './navigation'

interface SidebarProps {
  onRouteChange?:  (id: string) => void
  activeRouteId?:  string
  mobileOpen?:     boolean
  onMobileClose?:  () => void
}

export default function Sidebar({ onRouteChange, activeRouteId, mobileOpen, onMobileClose }: SidebarProps) {
  const { openBadgeCount, badgeTone } = useDiagnostics()
  const { theme, setTheme }           = useTheme()
  const { zones }                     = useCustomZones()
  const [activeId, setActiveId]       = useState<string>(activeRouteId ?? DEFAULT_ACTIVE_ID)
  const [collapsed, setCollapsed]     = useState<Set<string>>(new Set())

  useEffect(() => {
    if (activeRouteId != null && activeRouteId !== '') setActiveId(activeRouteId)
  }, [activeRouteId])

  const navSections = useMemo<NavSection[]>(() => {
    if (openBadgeCount <= 0) return NAV_SECTIONS
    const diagBadgeClass =
      badgeTone === 'critical' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
    return NAV_SECTIONS.map(sec =>
      sec.id !== 'dev'
        ? sec
        : {
            ...sec,
            items: sec.items.map(item =>
              item.id === 'dev-diagnostics'
                ? { ...item, badge: openBadgeCount, badgeClass: diagBadgeClass }
                : item,
            ),
          },
    )
  }, [openBadgeCount, badgeTone])

  const toggleSection = useCallback((sectionId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }, [])

  const selectItem = useCallback(
    (id: string) => {
      setActiveId(id)
      onRouteChange?.(id)
    },
    [onRouteChange],
  )

  const isDark = theme === 'dark'

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
            onClick={onMobileClose}
            className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
            style={{ color: 'var(--text-3)', background: 'var(--bg-hover)' }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      <nav
        className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5"
        aria-label="Primary navigation"
      >
        {navSections.map((section, i) => (
          <NavSectionGroup
            key={section.id}
            section={section}
            collapsed={collapsed.has(section.id)}
            onToggle={toggleSection}
            activeItemId={activeId}
            onSelectItem={selectItem}
            baseAnimationDelayMs={i * 40}
          />
        ))}

        {/* ── Custom zones ── */}
        {zones.length > 0 && (
          <div className="pt-2">
            <div
              className="px-2 pb-1 flex items-center justify-between"
            >
              <span
                className="text-[10px] font-semibold tracking-wider uppercase"
                style={{ fontFamily: "'DM Mono', monospace", color: 'var(--text-4)' }}
              >
                MY ZONES
              </span>
            </div>
            {zones.map((zone, i) => {
              const isActive = activeId === zone.id
              return (
                <button
                  key={zone.id}
                  onClick={() => selectItem(zone.id)}
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
                  <Folder
                    size={15}
                    strokeWidth={isActive ? 2.2 : 1.8}
                    style={{ flexShrink: 0, color: isActive ? 'var(--accent)' : 'var(--text-4)' }}
                  />
                  <span className="flex-1 leading-none truncate">{zone.title}</span>
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
        {/* New Zone button */}
        <button
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

        {/* Theme toggle */}
        <button
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
