import { useUpdatesStore } from '../../lib/updatesStore'

interface SidebarUpdateBadgeProps {
  zoneId: string
}

/**
 * Session “unread updates” count for a zone. `pointer-events-none` so the parent
 * `button` receives the click (clears count in `NavItemButton`).
 */
export default function SidebarUpdateBadge({ zoneId }: SidebarUpdateBadgeProps) {
  const count = useUpdatesStore(s => s.getCount(zoneId))
  if (count <= 0) return null

  return (
    <span
      aria-label={`${count} new ${count === 1 ? 'update' : 'updates'}`}
      className="pointer-events-none shrink-0 text-[10px] font-semibold leading-none tabular-nums min-w-[1.1rem] px-1.5 py-0.5 rounded-full text-white"
      style={{ background: 'var(--accent)', fontFamily: "'DM Mono', monospace" }}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
