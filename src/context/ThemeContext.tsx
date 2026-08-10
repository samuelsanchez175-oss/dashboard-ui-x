import { createContext, useCallback, useContext, useEffect, useState } from 'react'

export type Theme   = 'light' | 'dark' | 'gray2020'
export type Accent  = 'purple' | 'red' | 'blue' | 'green' | 'amber'
/** UI density 0–100. 0 = compact, 50 = balanced, 100 = roomy. */
export type Density = number

interface ThemeState {
  theme:      Theme
  accent:     Accent
  density:    Density
  setTheme:   (t: Theme)   => void
  setAccent:  (a: Accent)  => void
  setDensity: (d: Density) => void
}

const ThemeContext = createContext<ThemeState | null>(null)

const ACCENTS: Record<Accent, { color: string; hover: string; soft: string; soft2: string; fg: string }> = {
  purple: { color: '#7c3aed', hover: '#6d28d9', soft: '#f5f3ff', soft2: '#ede9fe', fg: '#6d28d9' },
  red:    { color: '#dc2626', hover: '#b91c1c', soft: '#fef2f2', soft2: '#fee2e2', fg: '#b91c1c' },
  blue:   { color: '#2563eb', hover: '#1d4ed8', soft: '#eff6ff', soft2: '#dbeafe', fg: '#1d4ed8' },
  green:  { color: '#059669', hover: '#047857', soft: '#ecfdf5', soft2: '#d1fae5', fg: '#047857' },
  /** GRAY2020 instrument accent — only amber, per skill. */
  amber:  { color: '#F5A623', hover: '#d48f1a', soft: 'rgba(245, 166, 35, 0.12)', soft2: 'rgba(245, 166, 35, 0.18)', fg: '#F5A623' },
}
const ACCENTS_DARK: Record<Accent, { soft: string; soft2: string; fg: string }> = {
  purple: { soft: '#1e1832', soft2: '#261e44', fg: '#a78bfa' },
  red:    { soft: '#2a1414', soft2: '#3d1f1f', fg: '#f87171' },
  blue:   { soft: '#0f1d3a', soft2: '#1a2b54', fg: '#60a5fa' },
  green:  { soft: '#0c2018', soft2: '#143028', fg: '#34d399' },
  amber:  { soft: 'rgba(245, 166, 35, 0.12)', soft2: 'rgba(245, 166, 35, 0.2)', fg: '#F5A623' },
}

const VALID_THEMES: Theme[] = ['light', 'dark', 'gray2020']

const DENSITY_MIN = 0
const DENSITY_MAX = 100
const DENSITY_DEFAULT = 55

function clampDensity(n: number): Density {
  if (!Number.isFinite(n)) return DENSITY_DEFAULT
  return Math.min(DENSITY_MAX, Math.max(DENSITY_MIN, Math.round(n)))
}

/** Migrate legacy comfy/compact strings + clamp numeric values. */
function readStoredDensity(): Density {
  const raw = localStorage.getItem('ui-density')
  if (raw == null) return DENSITY_DEFAULT
  if (raw === 'compact') return 18
  if (raw === 'comfy') return 55
  return clampDensity(Number(raw))
}

export function densityLabel(level: Density): string {
  if (level <= 25) return 'Compact'
  if (level <= 45) return 'Snug'
  if (level <= 65) return 'Balanced'
  if (level <= 85) return 'Comfy'
  return 'Roomy'
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

/**
 * Apply density as live CSS custom properties on <html>.
 * 0 = densest instrument rack, 100 = roomiest studio layout.
 */
function applyDensityVars(level: Density) {
  const root = document.documentElement
  const t = clampDensity(level) / 100

  // Core spacing tokens (used by zone-card, tools hub, harmony, etc.)
  root.style.setProperty('--pad-card',   `${lerp(10, 28, t).toFixed(1)}px`)
  root.style.setProperty('--pad-row',    `${lerp(6, 18, t).toFixed(1)}px`)
  root.style.setProperty('--grid-gap',   `${lerp(6, 24, t).toFixed(1)}px`)
  root.style.setProperty('--tile-min',   `${lerp(160, 300, t).toFixed(0)}px`)

  // Shell / page chrome
  root.style.setProperty('--space-page-x',  `${lerp(12, 40, t).toFixed(1)}px`)
  root.style.setProperty('--space-page-y',  `${lerp(12, 40, t).toFixed(1)}px`)
  root.style.setProperty('--space-page-b',  `${lerp(40, 96, t).toFixed(1)}px`)
  root.style.setProperty('--space-section', `${lerp(10, 28, t).toFixed(1)}px`)
  root.style.setProperty('--nav-item-py',   `${lerp(5, 11, t).toFixed(1)}px`)
  root.style.setProperty('--nav-item-px',   `${lerp(8, 12, t).toFixed(1)}px`)
  root.style.setProperty('--topbar-py',     `${lerp(8, 16, t).toFixed(1)}px`)
  root.style.setProperty('--control-h',    `${lerp(28, 36, t).toFixed(1)}px`)

  // Subtle rem scale so Tailwind rem-based spacing (gap-4, p-5, space-y-8…) responds
  const remPx = lerp(14.25, 16.75, t)
  root.style.setProperty('--density-rem', `${remPx.toFixed(2)}px`)
  root.style.fontSize = `${remPx.toFixed(2)}px`

  // Named band for CSS hooks (optional styling)
  const band = t <= 0.33 ? 'compact' : t >= 0.67 ? 'comfy' : 'mid'
  root.setAttribute('data-density', band)
  root.style.setProperty('--density-t', t.toFixed(3))
  root.style.setProperty('--density-level', String(clampDensity(level)))
}

function readStoredTheme(): Theme {
  const stored = localStorage.getItem('ui-theme')
  // Until the user explicitly picks a theme (Tweaks / sidebar cycle),
  // open on GRAY2020 so the full instrument update is visible immediately.
  if (!localStorage.getItem('ui-theme-user-chosen')) {
    localStorage.setItem('ui-theme', 'gray2020')
    return 'gray2020'
  }
  if (stored && VALID_THEMES.includes(stored as Theme)) return stored as Theme
  return 'gray2020'
}

function applyTheme(theme: Theme, accent: Accent, density: Density) {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)

  applyDensityVars(density)

  // GRAY2020 locks accent to amber (single accent language).
  const effectiveAccent: Accent = theme === 'gray2020' ? 'amber' : accent
  const a  = ACCENTS[effectiveAccent]
  const ad = ACCENTS_DARK[effectiveAccent]
  root.style.setProperty('--accent',       a.color)
  root.style.setProperty('--accent-hover', a.hover)

  if (theme === 'dark' || theme === 'gray2020') {
    root.style.setProperty('--accent-soft',   ad.soft)
    root.style.setProperty('--accent-soft-2', ad.soft2)
    root.style.setProperty('--accent-fg',     ad.fg)
  } else {
    root.style.setProperty('--accent-soft',   a.soft)
    root.style.setProperty('--accent-soft-2', a.soft2)
    root.style.setProperty('--accent-fg',     a.fg)
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme,   setThemeState]   = useState<Theme>(() => readStoredTheme())
  const [accent,  setAccentState]  = useState<Accent>(()  => {
    // Keep accent in sync with first-paint theme (GRAY2020 → amber only).
    if (localStorage.getItem('ui-theme') === 'gray2020') return 'amber'
    const s = localStorage.getItem('ui-accent') as Accent | null
    if (s && s in ACCENTS) return s
    return 'purple'
  })
  const [density, setDensityState] = useState<Density>(() => readStoredDensity())

  useEffect(() => { applyTheme(theme, accent, density) }, [theme, accent, density])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    localStorage.setItem('ui-theme', t)
    localStorage.setItem('ui-theme-user-chosen', '1')
    // Switching into gray2020 also pins amber accent in storage for consistency.
    if (t === 'gray2020') {
      setAccentState('amber')
      localStorage.setItem('ui-accent', 'amber')
    }
  }, [])
  const setAccent = useCallback((a: Accent) => {
    // GRAY2020: amber only (skill). Ignore multi-color picks while active.
    const next = theme === 'gray2020' ? 'amber' : a
    setAccentState(next)
    localStorage.setItem('ui-accent', next)
  }, [theme])
  const setDensity = useCallback((d: Density) => {
    const next = clampDensity(d)
    setDensityState(next)
    localStorage.setItem('ui-density', String(next))
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, accent, density, setTheme, setAccent, setDensity }}>
      {children}
    </ThemeContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- provider + hook colocated (context pattern); fast-refresh granularity only, no runtime impact
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
