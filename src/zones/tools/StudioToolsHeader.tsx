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
      className="sticky top-0 z-[5] flex shrink-0 items-center justify-between gap-4 px-8 py-3.5 backdrop-blur-md bg-[color-mix(in_oklab,var(--bg-sidebar)_92%,transparent)] border-b border-border"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {leftExtra}
        {ToolIcon && (
          <span className="grid size-[26px] shrink-0 place-items-center rounded-md text-[var(--text-3)] bg-card border border-border-soft">
            <ToolIcon className="size-[15px] text-inherit" strokeWidth={1.8} aria-hidden />
          </span>
        )}
        <div className="relative flex min-w-0 items-center gap-1.5 text-xs text-t3">
          <Folder className="size-3.5 shrink-0 text-t4" aria-hidden />
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`} className="flex items-center gap-1.5 truncate">
              {i > 0 && (
                <ChevronRight className="size-3 shrink-0 text-border-strong" aria-hidden />
              )}
              <span
                className={`truncate ${c.emphasis ? 'text-t1 font-medium' : 'text-t3 font-normal'}`}
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
        <span className="mono inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide bg-good-soft text-good border border-[color-mix(in_oklab,var(--good)_25%,transparent)]">
          <span
            className="inline-block size-1.5 animate-pulse rounded-full bg-good"
            aria-hidden
          />
          Local · connected
        </span>
        <button
          type="button"
          className="rounded-lg p-2 transition bg-card border border-border text-t3 shadow-[var(--shadow-sm)] hover:bg-hover"
          aria-label="Notifications (placeholder)"
        >
          <Bell className="size-[15px]" strokeWidth={1.8} />
        </button>
      </div>
    </header>
  )
}
