import { useEffect, useState } from 'react'
import { resolveRouteTitle } from '../../lib/routeTitles'
import { useUpdatesStore } from '../../lib/updatesStore'
import SidebarUpdateBadge from './SidebarUpdateBadge'
import UpdateDot from '../ui/UpdateDot'
import type { NavItem } from './navigation'

/** Orange highlight window — 10 seconds as requested. */
const HIGHLIGHT_MS = 10_000

interface NavItemButtonProps {
  item:               NavItem
  isActive:           boolean
  onSelect:           (id: string) => void
  animationDelayMs?: number
  layoutEditMode?:   boolean
  draggable?:        boolean
  onDragStart?:      () => void
  onDragEnd?:       () => void
}

export default function NavItemButton({
  item,
  isActive,
  onSelect,
  animationDelayMs = 0,
  layoutEditMode = false,
  draggable = false,
  onDragStart,
  onDragEnd,
}: NavItemButtonProps) {
  const Icon = item.icon
  const displayLabel = resolveRouteTitle(item.id) || item.label

  // Orange highlight: active for 10s after the item is marked updated.
  const lastTouched = useUpdatesStore(s => s.entries[item.id]?.lastTouchedAt ?? 0)
  const [highlight, setHighlight] = useState(false)

  useEffect(() => {
    if (!lastTouched || layoutEditMode) {
      setHighlight(false)
      return
    }
    const elapsed = Date.now() - lastTouched
    if (elapsed >= HIGHLIGHT_MS) {
      setHighlight(false)
      return
    }
    setHighlight(true)
    const remaining = HIGHLIGHT_MS - elapsed
    const id = window.setTimeout(() => setHighlight(false), remaining)
    return () => window.clearTimeout(id)
  }, [lastTouched, layoutEditMode])

  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={e => {
        if (!draggable) return
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', item.id)
        onDragStart?.()
      }}
      onDragEnd={() => onDragEnd?.()}
      onClick={() => {
        if (layoutEditMode) return
        useUpdatesStore.getState().clear(item.id)
        onSelect(item.id)
      }}
      aria-current={isActive ? 'page' : undefined}
      className={
        'nav-wiggle-target relative w-full flex items-center gap-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 text-left'
        + (layoutEditMode ? '' : ' nav-item-animate')
        + (highlight && !layoutEditMode ? ' nav-orange-highlight' : '')
      }
      style={{
        padding: 'var(--nav-item-py) var(--nav-item-px)',
        animationDelay: `${animationDelayMs}ms`,
        background: isActive && !layoutEditMode ? 'var(--accent-soft)' : 'transparent',
        color:      isActive && !layoutEditMode ? 'var(--accent-fg)'   : 'var(--text-3)',
        cursor:     layoutEditMode ? 'grab' : undefined,
      }}
      onMouseEnter={e => {
        if (layoutEditMode) return
        if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)'
      }}
      onMouseLeave={e => {
        if (layoutEditMode) return
        if (!isActive) e.currentTarget.style.background = 'transparent'
      }}
    >
      {isActive && !layoutEditMode && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
          style={{ background: 'var(--accent)' }}
        />
      )}

      <Icon
        size={15}
        strokeWidth={isActive && !layoutEditMode ? 2.2 : 1.8}
        style={{
          flexShrink: 0,
          color:      isActive && !layoutEditMode ? 'var(--accent)' : 'var(--text-4)',
          transition: 'color 150ms',
        }}
      />

      <span className="flex-1 min-w-0 leading-none truncate text-left">{displayLabel}</span>

      <span className="ml-auto flex items-center justify-end gap-1.5 shrink-0">
        {item.badge !== undefined && (
          <span
            title={item.badgeTitle}
            className={
              item.badgeClass
                ? `pointer-events-none text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${item.badgeClass}`
                : 'pointer-events-none text-[10px] font-semibold px-1.5 py-0.5 rounded-full'
            }
            style={
              item.badgeClass
                ? { fontFamily: "'DM Mono', monospace" }
                : { fontFamily: "'DM Mono', monospace", background: 'var(--good-soft)', color: 'var(--good)' }
            }
          >
            {item.badge}
          </span>
        )}
        <SidebarUpdateBadge zoneId={item.id} />
        <UpdateDot zoneId={item.id} />
      </span>
    </button>
  )
}
