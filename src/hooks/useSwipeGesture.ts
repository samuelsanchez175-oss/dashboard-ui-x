import { useEffect, useRef } from 'react'

interface UseSwipeGestureOptions {
  /** When false the listeners are still attached but no handler fires. */
  enabled?: boolean
  onSwipeRight?: () => void
  onSwipeLeft?: () => void
  onSwipeUp?: () => void
  onSwipeDown?: () => void
  /** Min primary-axis distance in px to register as a swipe. Default 60. */
  threshold?: number
  /** Max off-axis drift in px. Above this the gesture is treated as a scroll and ignored. Default 60. */
  offAxisTolerance?: number
  /** Slow drags above this duration are ignored. Default 600ms. */
  maxDurationMs?: number
  /** If set, onSwipeRight only fires when touchstart.x <= rightEdgeSize. */
  rightEdgeSize?: number
  /** If set, onSwipeLeft only fires when touchstart.x >= window.innerWidth - leftEdgeSize. */
  leftEdgeSize?: number
  /** Only react on viewports < 768px. Default true. */
  mobileOnly?: boolean
  /** Suppress the synthetic click that follows a recognized swipe. Default true. */
  preventClickAfterSwipe?: boolean
}

/**
 * Lightweight touch swipe recognizer. Attaches passive document listeners and
 * fires the matching `onSwipe*` callback once per gesture. Designed for
 * mobile-drawer open/close, but generic enough for other gestures.
 */
export function useSwipeGesture(options: UseSwipeGestureOptions): void {
  const {
    enabled = true,
    threshold = 60,
    offAxisTolerance = 60,
    maxDurationMs = 600,
    rightEdgeSize,
    leftEdgeSize,
    mobileOnly = true,
    preventClickAfterSwipe = true,
  } = options

  const handlersRef = useRef({
    onSwipeRight: options.onSwipeRight,
    onSwipeLeft: options.onSwipeLeft,
    onSwipeUp: options.onSwipeUp,
    onSwipeDown: options.onSwipeDown,
  })
  handlersRef.current = {
    onSwipeRight: options.onSwipeRight,
    onSwipeLeft: options.onSwipeLeft,
    onSwipeUp: options.onSwipeUp,
    onSwipeDown: options.onSwipeDown,
  }

  useEffect(() => {
    if (!enabled) return
    if (typeof window === 'undefined') return

    let startX = 0
    let startY = 0
    let startedAt = 0
    let fromLeftEdge = false
    let fromRightEdge = false
    let active = false
    let recognized = false

    const isMobile = () => !mobileOnly || window.innerWidth < 768

    const onTouchStart = (e: TouchEvent) => {
      recognized = false
      if (!isMobile() || e.touches.length !== 1) {
        active = false
        return
      }
      const t = e.touches[0]
      startX = t.clientX
      startY = t.clientY
      startedAt = Date.now()
      fromLeftEdge = rightEdgeSize == null ? true : t.clientX <= rightEdgeSize
      fromRightEdge =
        leftEdgeSize == null ? true : t.clientX >= window.innerWidth - leftEdgeSize
      active = true
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!active) return
      if (e.touches.length > 1) active = false
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (!active) return
      active = false
      if (Date.now() - startedAt > maxDurationMs) return
      const t = e.changedTouches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)

      const horizontal = absDx > absDy
      if (horizontal) {
        if (absDx < threshold || absDy > offAxisTolerance) return
        if (dx > 0) {
          if (!fromLeftEdge) return
          if (!handlersRef.current.onSwipeRight) return
          handlersRef.current.onSwipeRight()
          recognized = true
        } else {
          if (!fromRightEdge) return
          if (!handlersRef.current.onSwipeLeft) return
          handlersRef.current.onSwipeLeft()
          recognized = true
        }
      } else {
        if (absDy < threshold || absDx > offAxisTolerance) return
        if (dy < 0) {
          if (!handlersRef.current.onSwipeUp) return
          handlersRef.current.onSwipeUp()
          recognized = true
        } else {
          if (!handlersRef.current.onSwipeDown) return
          handlersRef.current.onSwipeDown()
          recognized = true
        }
      }
    }

    const onClickCapture = (e: MouseEvent) => {
      if (!recognized || !preventClickAfterSwipe) return
      e.stopPropagation()
      e.preventDefault()
      recognized = false
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    document.addEventListener('touchcancel', onTouchEnd, { passive: true })
    document.addEventListener('click', onClickCapture, true)

    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', onTouchEnd)
      document.removeEventListener('click', onClickCapture, true)
    }
  }, [
    enabled,
    threshold,
    offAxisTolerance,
    maxDurationMs,
    rightEdgeSize,
    leftEdgeSize,
    mobileOnly,
    preventClickAfterSwipe,
  ])
}
