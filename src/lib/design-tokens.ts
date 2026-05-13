/**
 * Canonical design tokens for Dashboard X.
 *
 * Use these helpers instead of ad-hoc Tailwind sizes so:
 *   • H1 / H2 / eyebrow scale stays consistent across zones.
 *   • Container widths don't drift (we had 6 different choices).
 *   • Card + button recipes are theme-aware (no hardcoded slate/white).
 *
 * Anything visual that's reused on more than one page belongs here.
 */

/* ─── Typography scale ─────────────────────────────────────────────── */
export const TYPOGRAPHY = {
  /** Hub-level title (All tools, hub landings). One per app. */
  hero: 'text-[28px] font-semibold leading-tight tracking-tight',
  /** Standard page H1 (every leaf zone). */
  pageTitle: 'text-xl font-semibold tracking-tight',
  /** Section H2 within a page. */
  sectionTitle: 'text-[15px] font-semibold tracking-tight',
  /** Page descriptor under the H1. */
  pageDescription: 'text-sm leading-relaxed',
  /** Uppercase mono eyebrow above an H1 ("AUDIO PRODUCTION TOOLKIT"). */
  eyebrow: 'mono text-[11px] uppercase tracking-wide',
  /** Card label (uppercase, mono, muted). */
  cardLabel: 'mono text-[10px] uppercase tracking-wide',
} as const

/* ─── Container width ──────────────────────────────────────────────── *
 *
 * Fluid widths — content grows with the viewport. No fixed pixel caps on
 * `hub` / `page`; padding scales with viewport so narrow windows breathe
 * and wide windows don't waste space.
 *
 * `narrow` keeps a reading-width cap (forms / single-input tools).
 */
export const CONTAINERS = {
  /** Hubs / dashboards that show a grid of tiles. Fluid — fills available width. */
  hub:    'mx-auto w-full px-4 sm:px-6 lg:px-8 xl:px-12',
  /** Default page width for content-heavy leaf zones. Fluid. */
  page:   'mx-auto w-full px-4 sm:px-6 lg:px-8 xl:px-12',
  /** Narrower reading width — for forms / single-input tools. Capped at ~768px. */
  narrow: 'mx-auto w-full max-w-3xl px-4 sm:px-6 lg:px-8',
} as const

/* ─── Background + card recipes (theme-aware via CSS vars) ─────────── */
export const SURFACES = {
  /** Outer page background. */
  canvasStyle: { background: 'var(--bg-canvas)', color: 'var(--text-1)' } as const,
  /** Standard card style — theme-aware, drop into `style={SURFACES.cardStyle}`. */
  cardStyle: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-sm)',
  } as const,
  /** Soft inset card (e.g. tray inside a card). */
  softCardStyle: {
    background: 'var(--bg-card-soft)',
    border: '1px solid var(--border-soft)',
  } as const,
  /** Dashed empty / placeholder card. */
  dashedCardStyle: {
    background: 'var(--bg-card)',
    border: '1px dashed var(--border-strong)',
  } as const,
  /** Theme-aware text color helpers. */
  textPrimary:   { color: 'var(--text-1)' } as const,
  textSecondary: { color: 'var(--text-2)' } as const,
  textMuted:     { color: 'var(--text-3)' } as const,
  textHint:      { color: 'var(--text-4)' } as const,
} as const

/* ─── Button recipes ───────────────────────────────────────────────── */
export type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'destructive' | 'ghost'

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2'

/** Tailwind utility class strings for each variant. Theme-aware via CSS vars. */
export const BUTTON_VARIANTS: Record<ButtonVariant, { className: string; style?: Record<string, string> }> = {
  primary: {
    className: `${BUTTON_BASE} text-white shadow-sm hover:brightness-110`,
    style: { background: 'var(--accent)', borderColor: 'var(--accent)' },
  },
  secondary: {
    className: `${BUTTON_BASE} shadow-sm`,
    style: {
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      color: 'var(--text-1)',
    },
  },
  subtle: {
    className: `${BUTTON_BASE}`,
    style: {
      background: 'var(--bg-hover)',
      color: 'var(--text-2)',
    },
  },
  destructive: {
    className: `${BUTTON_BASE} shadow-sm`,
    style: {
      background: 'var(--bad-soft)',
      color: 'var(--bad)',
      border: '1px solid color-mix(in oklab, var(--bad) 25%, transparent)',
    },
  },
  ghost: {
    className: `${BUTTON_BASE} hover:bg-[var(--bg-hover)]`,
    style: { color: 'var(--text-2)' },
  },
} as const

/* ─── Spacing / sizing helpers ─────────────────────────────────────── */
export const SPACING = {
  /** Default vertical rhythm between page sections. */
  pageStack: 'space-y-8',
  /** Card body padding. */
  cardPad: 'p-5',
  /** Top spacing under the global RouteStatusBar (which is `absolute top-3`). */
  topGutter: 'pt-12',
} as const
