import { useEffect } from 'react'
import * as React from 'react'

export type MapKeyboardActions = {
  zoomIn: () => void
  zoomOut: () => void
  recenter: () => void
  toggleFullscreen: () => void
  cycleMapType: () => void
  focusSearch: () => void
  openDetail: () => void
  closeDetail: () => void
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  // closest() handles nested spans inside contenteditable hosts
  if (target.closest('[contenteditable="true"], input, textarea')) return true
  return false
}

/**
 * Adds window-level keyboard shortcuts. Ignores keypresses while any input/
 * textarea/contenteditable is focused so it doesn't fight the search bar.
 */
export function useMapKeyboardShortcuts(actions: MapKeyboardActions): void {
  useEffect(() => {
    function handler(event: KeyboardEvent) {
      // Escape always fires regardless of focus or modifiers
      if (event.key === 'Escape') {
        actions.closeDetail()
        return
      }

      // Any modifier disqualifies the press
      if (event.ctrlKey || event.metaKey || event.altKey) return

      // Skip when typing into a form control or contenteditable
      if (isEditableTarget(event.target)) return

      const key = event.key

      // Zoom shortcuts: allow both shifted and unshifted variants
      if (key === '+' || key === '=') {
        event.preventDefault()
        actions.zoomIn()
        return
      }
      if (key === '-' || key === '_') {
        event.preventDefault()
        actions.zoomOut()
        return
      }
      if (key === '/') {
        event.preventDefault()
        actions.focusSearch()
        return
      }

      // For alpha shortcuts: require a single printable character
      // (skips dead keys, IME composition, F-keys, Arrow*, etc.)
      if (key.length !== 1) return

      const lower = key.toLowerCase()
      switch (lower) {
        case 'r':
          event.preventDefault()
          actions.recenter()
          return
        case 'f':
          event.preventDefault()
          actions.toggleFullscreen()
          return
        case 'l':
          event.preventDefault()
          actions.cycleMapType()
          return
        case 'd':
          event.preventDefault()
          actions.openDetail()
          return
        default:
          return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [actions])
}

// ---------- Visual hint chip ----------

const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.125rem 0.375rem',
  borderRadius: '9999px',
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  fontSize: '10px',
  lineHeight: 1,
  background: 'rgba(255, 255, 255, 0.08)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  color: 'rgba(255, 255, 255, 0.85)',
  whiteSpace: 'nowrap',
}

const containerStyle: React.CSSProperties = {
  position: 'absolute',
  right: '0.75rem',
  bottom: '0.75rem',
  zIndex: 30,
  padding: '0.25rem 0.75rem',
  borderRadius: '9999px',
  background: 'rgba(15, 17, 21, 0.55)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
  color: 'rgba(255, 255, 255, 0.85)',
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  fontSize: '10px',
  lineHeight: 1.2,
}

const summaryStyle: React.CSSProperties = {
  cursor: 'pointer',
  listStyle: 'none',
  userSelect: 'none',
  padding: '0.125rem 0',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.375rem',
  alignItems: 'center',
  paddingTop: '0.375rem',
  flexWrap: 'wrap',
}

type ShortcutEntry = { key: string; label: string; aria: string }

const SHORTCUTS: ShortcutEntry[] = [
  { key: '/', label: 'Search', aria: '/' },
  { key: 'R', label: 'Recenter', aria: 'R' },
  { key: 'F', label: 'Fullscreen', aria: 'F' },
  { key: 'L', label: 'Layers', aria: 'L' },
]

/**
 * Tiny floating chip listing the most useful shortcuts.
 * Self-contained — styles match the glass aesthetic.
 * Default position: bottom-right, but caller can override via className.
 */
export default function MapShortcutHint(props: {
  className?: string
}) {
  return React.createElement(
    'details',
    { style: containerStyle, className: props.className },
    React.createElement(
      'summary',
      { style: summaryStyle, 'aria-label': 'Keyboard shortcuts' },
      'Shortcuts ▾',
    ),
    React.createElement(
      'div',
      { style: rowStyle, role: 'list' },
      ...SHORTCUTS.map((s) =>
        React.createElement(
          'span',
          {
            key: s.key,
            style: chipStyle,
            role: 'listitem',
            'aria-keyshortcuts': s.aria,
          },
          `${s.key} = ${s.label}`,
        ),
      ),
    ),
  )
}
