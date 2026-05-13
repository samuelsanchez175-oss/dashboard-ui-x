/*
  Keyboard precedence (highest first):
  1. Text input fields — all global hotkeys yield.
  2. Open modal/dialog — global hotkeys yield, modal owns its keys.
  3. Zone-local handlers — e.g. Harmony tablist arrows, Piano note keys.
  4. Global app shortcuts — ? opens help, Esc closes help.
*/

import { useCallback, useEffect, useRef, useState } from 'react'

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  if (t.closest('[contenteditable="true"]')) return true
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/** True when the node is the keyboard-shortcuts help overlay (`ShortcutOverlay`). */
function isShortcutHelpDialog(el: Element): boolean {
  const h2 = el.querySelector('h2')
  const text = h2?.textContent?.trim() ?? ''
  return text.startsWith('Keyboard shortcuts')
}

function hasBlockingModalOpen(): boolean {
  const modals = document.querySelectorAll('[role="dialog"][aria-modal="true"]')
  for (const m of modals) {
    if (!isShortcutHelpDialog(m)) return true
  }
  return false
}

/**
 * Global listeners for the keyboard-shortcuts help overlay (`ShortcutOverlay`).
 * Mount once near the app root; `?` (Shift + /) toggles when focus is not in a field.
 */
export function useGlobalShortcutOverlay(): {
  overlayOpen: boolean
  closeOverlay: () => void
} {
  const [overlayOpen, setOverlayOpen] = useState(false)
  const prevFocusRef = useRef<HTMLElement | null>(null)

  const restoreFocus = useCallback(() => {
    queueMicrotask(() => {
      prevFocusRef.current?.focus()
      prevFocusRef.current = null
    })
  }, [])

  const closeOverlay = useCallback(() => {
    setOverlayOpen(open => {
      if (!open) return open
      restoreFocus()
      return false
    })
  }, [restoreFocus])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (overlayOpen && e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closeOverlay()
        return
      }

      const wantsHelp = e.key === '?' || (e.shiftKey && e.key === '/')
      if (!wantsHelp) return
      if (isEditableTarget(e.target)) return
      if (!overlayOpen && hasBlockingModalOpen()) return

      e.preventDefault()
      setOverlayOpen(open => {
        if (open) {
          restoreFocus()
          return false
        }
        const ae = document.activeElement
        prevFocusRef.current = ae instanceof HTMLElement ? ae : null
        return true
      })
    }

    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [overlayOpen, closeOverlay, restoreFocus])

  return { overlayOpen, closeOverlay }
}
