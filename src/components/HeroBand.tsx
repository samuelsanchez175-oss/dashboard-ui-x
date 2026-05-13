import type { ReactNode } from 'react'

interface HeroBandProps {
  /** Children = a ZoneHeader (typically `scale="hero"`) + optional secondary content. */
  children: ReactNode
  /** Override the gradient — defaults to a subtle accent-tinted band. */
  gradient?: string
  className?: string
}

/**
 * Soft gradient band reserved for hub-level pages (Tools Hub, Production Overview).
 * Sits between the chrome (sidebar / RouteStatusBar) and the zone body — gives
 * landings a different "weight" than leaf pages, without going full marketing.
 *
 * Inspired by the burnt-orange band in `public/harmony-stack-portfolio/`, but
 * dialed down for dashboard chrome.
 */
export default function HeroBand({
  children,
  gradient,
  className = '',
}: HeroBandProps) {
  return (
    <div
      data-hero-band
      className={`relative overflow-hidden ${className}`}
      style={{
        background:
          gradient ??
          'radial-gradient(120% 80% at 0% 0%, color-mix(in oklab, var(--accent) 14%, transparent) 0%, transparent 55%), radial-gradient(80% 60% at 100% 0%, color-mix(in oklab, var(--accent) 8%, transparent) 0%, transparent 60%)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* faint grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          maskImage: 'radial-gradient(ellipse at top, black 25%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse at top, black 25%, transparent 70%)',
        }}
      />
      <div className="relative">{children}</div>
    </div>
  )
}
