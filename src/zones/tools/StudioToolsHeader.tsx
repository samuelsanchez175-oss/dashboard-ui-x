import { Bell, ChevronRight, Folder } from 'lucide-react'
import type { ReactNode } from 'react'

import UpdateDot from '../../components/ui/UpdateDot'
import { getToolById } from '../../lib/toolsRegistry'

export type StudioCrumb = { label: string; emphasis?: boolean }

interface StudioToolsHeaderProps {
  crumbs:     StudioCrumb[]
  leftExtra?: ReactNode
  /** When set, shows the tool icon from the registry to the left of breadcrumbs. */
  toolId?: string
}

export default function StudioToolsHeader({ crumbs, leftExtra, toolId }: StudioToolsHeaderProps) {
  const tool = toolId ? getToolById(toolId) : undefined
  const ToolIcon = tool?.icon
  const updateZoneId = toolId ?? 'tools-hub'

  return (
    <header
      className="sticky top-0 z-[5] flex shrink-0 items-center justify-between gap-4 px-8 py-3.5 backdrop-blur-md"
      style={{
        background:   'color-mix(in oklab, var(--bg-sidebar) 92%, transparent)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {leftExtra}
        {ToolIcon && (
          <span
            className="grid size-[26px] shrink-0 place-items-center rounded-md text-[var(--text-3)]"
            style={{
              background: 'var(--bg-card)',
              border:     '1px solid var(--border-soft)',
            }}
          >
            <ToolIcon className="size-[15px] text-inherit" strokeWidth={1.8} aria-hidden />
          </span>
        )}
        <div className="relative flex min-w-0 items-center gap-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
          <Folder className="size-3.5 shrink-0" style={{ color: 'var(--text-4)' }} aria-hidden />
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`} className="flex items-center gap-1.5 truncate">
              {i > 0 && (
                <ChevronRight className="size-3 shrink-0" style={{ color: 'var(--border-strong)' }} aria-hidden />
              )}
              <span
                className="truncate"
                style={{
                  color:      c.emphasis ? 'var(--text-1)' : 'var(--text-3)',
                  fontWeight: c.emphasis ? 500 : 400,
                }}
              >
                {c.label}
              </span>
            </span>
          ))}
          <span className="ml-0.5 inline-flex shrink-0 items-center self-center">
            <UpdateDot zoneId={updateZoneId} className="h-2 w-2" />
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <span
          className="mono inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide"
          style={{
            background: 'var(--good-soft)',
            color:      'var(--good)',
            border:     '1px solid color-mix(in oklab, var(--good) 25%, transparent)',
          }}
        >
          <span
            className="inline-block size-1.5 animate-pulse rounded-full"
            style={{ background: 'var(--good)' }}
            aria-hidden
          />
          Local · connected
        </span>
        <button
          type="button"
          className="rounded-lg p-2 transition"
          style={{
            background: 'var(--bg-card)',
            border:     '1px solid var(--border)',
            color:      'var(--text-3)',
            boxShadow:  'var(--shadow-sm)',
          }}
          aria-label="Notifications (placeholder)"
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-card)')}
        >
          <Bell className="size-[15px]" strokeWidth={1.8} />
        </button>
      </div>
    </header>
  )
}
