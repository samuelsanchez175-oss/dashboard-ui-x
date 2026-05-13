import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { TYPOGRAPHY } from '../lib/design-tokens'
import RecentClipsTray from './RecentClipsTray'

interface ZoneHeaderProps {
  /** Uppercase mono eyebrow above the title ("AUDIO PRODUCTION TOOLKIT"). Optional. */
  eyebrow?: string
  /** Page title. Always rendered as <h1>. */
  title: string
  /** Optional icon to render inline before the title. */
  icon?: LucideIcon
  /** Short descriptor sentence under the title. */
  description?: ReactNode
  /**
   * `'hero'` uses the bigger H1 scale (28px) — reserve for hub-level pages
   * like Tools Hub and Production Overview. Defaults to `'page'`.
   */
  scale?: 'page' | 'hero'
  /** Right-aligned action slot (buttons, filters, etc.). Lives below the status bar. */
  actions?: ReactNode
  /** Extra wrapper classes if a zone needs to tweak spacing. */
  className?: string
  /**
   * When true, render `<RecentClipsTray />` below the title block. Pair with
   * `recentClipsTargetRoute` so pill clicks know which tool to feed the clip
   * into (via `inbound-clip-<routeId>` sessionStorage + `'dashboard:set-route'`).
   *
   * Without a target route the tray still renders as a read-only preview —
   * useful while wiring is incremental.
   */
  recentClipsTray?: boolean
  /** Destination route id for `RecentClipsTray` pill clicks. */
  recentClipsTargetRoute?: string
}

/**
 * Canonical zone header — eyebrow + title + description, with an action slot on the right.
 *
 * The top-right status pills (API · Mock · Real) come from `RouteStatusBar`,
 * which is rendered globally in `MainContent`. ZoneHeader leaves room for that
 * group by capping its own right edge and using `pt-12` (top gutter) inside
 * pages so the title doesn't collide with the absolute-positioned pills.
 */
export default function ZoneHeader({
  eyebrow,
  title,
  icon: Icon,
  description,
  scale = 'page',
  actions,
  className = '',
  recentClipsTray = false,
  recentClipsTargetRoute,
}: ZoneHeaderProps) {
  const titleClass = scale === 'hero' ? TYPOGRAPHY.hero : TYPOGRAPHY.pageTitle

  return (
    <header
      className={`flex flex-wrap items-start justify-between gap-4 ${className}`}
      data-zone-header
    >
      <div className="min-w-0 max-w-2xl">
        {eyebrow && (
          <p
            className={`mb-1.5 ${TYPOGRAPHY.eyebrow}`}
            style={{ color: 'var(--text-3)', letterSpacing: '0.12em' }}
          >
            {eyebrow}
          </p>
        )}
        <h1
          className={`flex items-center gap-2 ${titleClass}`}
          style={{ color: 'var(--text-1)' }}
        >
          {Icon && <Icon className="size-5 shrink-0" aria-hidden style={{ color: 'var(--text-2)' }} />}
          {title}
        </h1>
        {description && (
          <p className={`mt-1.5 ${TYPOGRAPHY.pageDescription}`} style={{ color: 'var(--text-3)' }}>
            {description}
          </p>
        )}
        {recentClipsTray && (
          <div className="mt-3">
            <RecentClipsTray targetRouteId={recentClipsTargetRoute} />
          </div>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
    </header>
  )
}
