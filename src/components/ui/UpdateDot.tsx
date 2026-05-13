import { useEffect, useState } from 'react'

import { useUpdatesStore } from '../../lib/updatesStore'

interface UpdateDotProps {
  zoneId:    string
  windowMs?: number
  className?: string
}

/**
 * Blue “recently updated” pulse beside a nav row. Decorative (`aria-hidden`);
 * counts live in `SidebarUpdateBadge`.
 */
export default function UpdateDot({ zoneId, windowMs = 20_000, className }: UpdateDotProps) {
  const lastTouched = useUpdatesStore(s => s.entries[zoneId]?.lastTouchedAt ?? 0)
  const recent = useUpdatesStore(s => s.isRecent(zoneId, windowMs))
  const [, bump] = useState(0)

  useEffect(() => {
    if (!recent || lastTouched <= 0) return
    const elapsed = Date.now() - lastTouched
    const remaining = Math.max(0, windowMs - elapsed)
    const id = window.setTimeout(() => {
      bump(n => n + 1)
    }, remaining)
    return () => {
      window.clearTimeout(id)
    }
  }, [lastTouched, recent, windowMs])

  if (!recent) return null

  return (
    <span
      className={`relative inline-flex h-2 w-2 shrink-0 ${className ?? ''}`}
      aria-hidden="true"
    >
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-50" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
    </span>
  )
}
