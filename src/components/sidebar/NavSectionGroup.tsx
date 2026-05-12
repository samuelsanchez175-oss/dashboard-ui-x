import { ChevronDown, Pin, PinOff } from 'lucide-react'
import NavItemButton from './NavItemButton'
import type { NavSection } from './navigation'

interface NavSectionGroupProps {
  section:               NavSection
  collapsed:             boolean
  onToggle:              (id: string) => void
  activeItemId:          string
  onSelectItem:          (id: string) => void
  baseAnimationDelayMs?: number
  layoutEditMode?:     boolean
  sectionHidden?:      boolean
  onPinPress?:         () => void
  onSectionPinToggle?: () => void
  onRemoveItem?:      (itemId: string) => void
  onDragItemStart?:   (sectionId: string, itemId: string) => void
  onItemDragEnd?:     () => void
  onDropBeforeItem?:  (sectionId: string, beforeItemId: string | null) => void
}

export default function NavSectionGroup({
  section,
  collapsed,
  onToggle,
  activeItemId,
  onSelectItem,
  baseAnimationDelayMs = 0,
  layoutEditMode = false,
  sectionHidden = false,
  onPinPress,
  onSectionPinToggle,
  onRemoveItem,
  onDragItemStart,
  onItemDragEnd,
  onDropBeforeItem,
}: NavSectionGroupProps) {
  return (
    <div
      className="section-fade"
      style={{
        animationDelay: `${baseAnimationDelayMs}ms`,
        opacity:        sectionHidden ? 0.55 : undefined,
      }}
    >
      {/* Section header */}
      <div className="w-full flex items-stretch gap-0.5 px-2 pt-4 pb-1.5">
        <button
          type="button"
          onClick={() => onToggle(section.id)}
          aria-expanded={!collapsed}
          className="flex-1 flex items-center justify-between min-w-0 group rounded-md px-0.5 -mx-0.5"
        >
          <span
            className="text-[10px] font-semibold tracking-[0.08em] transition-colors truncate"
            style={{ fontFamily: "'DM Mono', monospace", color: 'var(--text-4)' }}
          >
            {section.title}
          </span>
          <ChevronDown
            size={12}
            className="shrink-0 ml-1"
            style={{
              color:      'var(--text-4)',
              transform:  collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform 200ms',
            }}
          />
        </button>

        <button
          type="button"
          onClick={e => {
            e.stopPropagation()
            if (layoutEditMode) onSectionPinToggle?.()
            else onPinPress?.()
          }}
          title={
            layoutEditMode
              ? sectionHidden ? 'Add section to sidebar' : 'Remove section from sidebar'
              : 'Customize sidebar'
          }
          className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md transition-colors"
          style={{
            color:      layoutEditMode && sectionHidden ? 'var(--text-4)' : 'var(--text-3)',
            background: 'transparent',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--bg-hover)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
          }}
        >
          {layoutEditMode && sectionHidden ? (
            <PinOff size={13} strokeWidth={2} />
          ) : (
            <Pin size={13} strokeWidth={layoutEditMode ? 2 : 1.6} />
          )}
        </button>
      </div>

      {!collapsed && section.items.length > 0 && (
        <div className="space-y-0.5">
          {section.items.map((item, idx) => (
            <div key={item.id} className="relative group/item">
              {layoutEditMode && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation()
                    onRemoveItem?.(item.id)
                  }}
                  className="absolute -top-1 -left-1 z-[1] flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold leading-none shadow-sm transition-transform hover:scale-105"
                  style={{
                    background: 'var(--danger, #dc2626)',
                    color:      '#fff',
                    border:     '1.5px solid var(--bg-sidebar)',
                  }}
                  title="Remove from sidebar"
                  aria-label={`Remove ${item.label} from sidebar`}
                >
                  ×
                </button>
              )}
              <div
                role="presentation"
                onDragOver={e => {
                  if (!layoutEditMode) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                }}
                onDrop={e => {
                  if (!layoutEditMode) return
                  e.preventDefault()
                  onDropBeforeItem?.(section.id, item.id)
                }}
              >
                <NavItemButton
                  item={item}
                  isActive={item.id === activeItemId}
                  onSelect={onSelectItem}
                  animationDelayMs={baseAnimationDelayMs + idx * 28}
                  layoutEditMode={layoutEditMode}
                  draggable={layoutEditMode}
                  onDragStart={() => onDragItemStart?.(section.id, item.id)}
                  onDragEnd={onItemDragEnd}
                />
              </div>
            </div>
          ))}
          {layoutEditMode && (
            <div
              role="presentation"
              className="h-2 rounded-md"
              onDragOver={e => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
              }}
              onDrop={e => {
                e.preventDefault()
                onDropBeforeItem?.(section.id, null)
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}
