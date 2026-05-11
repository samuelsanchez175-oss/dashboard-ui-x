import { ChevronDown } from 'lucide-react'
import NavItemButton from './NavItemButton'
import type { NavSection } from './navigation'

interface NavSectionGroupProps {
  section:               NavSection
  collapsed:             boolean
  onToggle:              (id: string) => void
  activeItemId:          string
  onSelectItem:          (id: string) => void
  baseAnimationDelayMs?: number
}

export default function NavSectionGroup({
  section,
  collapsed,
  onToggle,
  activeItemId,
  onSelectItem,
  baseAnimationDelayMs = 0,
}: NavSectionGroupProps) {
  return (
    <div className="section-fade" style={{ animationDelay: `${baseAnimationDelayMs}ms` }}>
      {/* Section header */}
      <button
        onClick={() => onToggle(section.id)}
        aria-expanded={!collapsed}
        className="w-full flex items-center justify-between px-2 pt-4 pb-1.5 group"
      >
        <span
          className="text-[10px] font-semibold tracking-[0.08em] transition-colors"
          style={{ fontFamily: "'DM Mono', monospace", color: 'var(--text-4)' }}
        >
          {section.title}
        </span>
        <ChevronDown
          size={12}
          style={{
            color:     'var(--text-4)',
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            transition: 'transform 200ms',
          }}
        />
      </button>

      {!collapsed && section.items.length > 0 && (
        <div className="space-y-0.5">
          {section.items.map((item, idx) => (
            <NavItemButton
              key={item.id}
              item={item}
              isActive={item.id === activeItemId}
              onSelect={onSelectItem}
              animationDelayMs={baseAnimationDelayMs + idx * 28}
            />
          ))}
        </div>
      )}
    </div>
  )
}
