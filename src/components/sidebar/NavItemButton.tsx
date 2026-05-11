import type { NavItem } from './navigation'

interface NavItemButtonProps {
  item:              NavItem
  isActive:          boolean
  onSelect:          (id: string) => void
  animationDelayMs?: number
}

export default function NavItemButton({
  item,
  isActive,
  onSelect,
  animationDelayMs = 0,
}: NavItemButtonProps) {
  const Icon = item.icon

  return (
    <button
      onClick={() => onSelect(item.id)}
      aria-current={isActive ? 'page' : undefined}
      className="nav-item-animate relative w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] font-medium transition-all duration-150 text-left"
      style={{
        animationDelay: `${animationDelayMs}ms`,
        background: isActive ? 'var(--accent-soft)' : 'transparent',
        color:      isActive ? 'var(--accent-fg)'   : 'var(--text-3)',
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

      <Icon
        size={15}
        strokeWidth={isActive ? 2.2 : 1.8}
        style={{
          flexShrink: 0,
          color:      isActive ? 'var(--accent)' : 'var(--text-4)',
          transition: 'color 150ms',
        }}
      />

      <span className="flex-1 leading-none">{item.label}</span>

      {item.badge !== undefined && (
        <span
          className={
            item.badgeClass
              ? `ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${item.badgeClass}`
              : 'ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full'
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
    </button>
  )
}
