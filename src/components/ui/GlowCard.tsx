import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import './GlowCard.css'

export interface GlowCardProps {
  children: ReactNode
  className?: string
  glowColor?: 'blue' | 'purple' | 'green' | 'red' | 'orange'
  size?: 'sm' | 'md' | 'lg'
  width?: string | number
  height?: string | number
  /** When true, ignores `size` and uses width/height or className for dimensions; uses a flexible column layout for tab cards. */
  customSize?: boolean
}

const glowColorMap = {
  blue: { base: 220, spread: 200 },
  purple: { base: 280, spread: 300 },
  green: { base: 120, spread: 200 },
  red: { base: 0, spread: 200 },
  orange: { base: 30, spread: 200 },
} as const

const sizeMap = {
  sm: 'w-48 h-64',
  md: 'w-64 h-80',
  lg: 'w-80 h-96',
}

export function GlowCard({
  children,
  className = '',
  glowColor = 'blue',
  size = 'md',
  width,
  height,
  customSize = false,
}: GlowCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const syncPointer = (e: PointerEvent) => {
      const { clientX: x, clientY: y } = e
      const el = cardRef.current
      if (!el) return
      el.style.setProperty('--x', x.toFixed(2))
      el.style.setProperty('--xp', (x / window.innerWidth).toFixed(2))
      el.style.setProperty('--y', y.toFixed(2))
      el.style.setProperty('--yp', (y / window.innerHeight).toFixed(2))
    }

    document.addEventListener('pointermove', syncPointer)
    return () => document.removeEventListener('pointermove', syncPointer)
  }, [])

  const { base, spread } = glowColorMap[glowColor]

  const getSizeClasses = () => {
    if (customSize) return ''
    return sizeMap[size]
  }

  const getInlineStyles = (): CSSProperties => {
    const baseStyles = {
      '--base': base,
      '--spread': spread,
      '--radius': '14',
      '--border': '3',
      '--backdrop': 'hsl(0 0% 60% / 0.12)',
      '--backup-border': 'var(--backdrop)',
      '--size': '200',
      '--outer': '1',
      '--border-size': 'calc(var(--border, 2) * 1px)',
      '--spotlight-size': 'calc(var(--size, 150) * 1px)',
      '--hue': 'calc(var(--base) + (var(--xp, 0) * var(--spread, 0)))',
      backgroundImage: `radial-gradient(
        var(--spotlight-size) var(--spotlight-size) at
        calc(var(--x, 0) * 1px)
        calc(var(--y, 0) * 1px),
        hsl(var(--hue, 210) calc(var(--saturation, 100) * 1%) calc(var(--lightness, 70) * 1%) / var(--bg-spot-opacity, 0.1)), transparent
      )`,
      backgroundColor: 'var(--backdrop, transparent)',
      backgroundSize: 'calc(100% + (2 * var(--border-size))) calc(100% + (2 * var(--border-size)))',
      backgroundPosition: '50% 50%',
      backgroundAttachment: 'fixed',
      border: 'var(--border-size) solid var(--backup-border)',
      position: 'relative',
    } as CSSProperties

    if (width !== undefined) {
      baseStyles.width = typeof width === 'number' ? `${width}px` : width
    }
    if (height !== undefined) {
      baseStyles.height = typeof height === 'number' ? `${height}px` : height
    }

    return baseStyles
  }

  const layoutClasses = customSize
    ? 'flex flex-col min-h-0 w-full'
    : 'grid grid-rows-[1fr_auto]'

  return (
    <div
      ref={cardRef}
      data-glow=""
      style={{ ...getInlineStyles(), touchAction: customSize ? 'auto' : 'none' }}
      className={`
        ${getSizeClasses()}
        ${!customSize ? 'aspect-[3/4]' : ''}
        rounded-2xl
        relative
        ${layoutClasses}
        shadow-[0_1rem_2rem_-1rem_black]
        p-4
        gap-4
        backdrop-blur-[5px]
        ${className}
      `}
    >
      <div data-glow="" aria-hidden />
      {children}
    </div>
  )
}
