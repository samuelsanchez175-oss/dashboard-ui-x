import { createContext, useCallback, useContext, useEffect, useState } from 'react'

export type Theme   = 'light' | 'dark'
export type Accent  = 'purple' | 'red' | 'blue' | 'green'
export type Density = 'comfy' | 'compact'

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
}
const ACCENTS_DARK: Record<Accent, { soft: string; soft2: string; fg: string }> = {
  purple: { soft: '#1e1832', soft2: '#261e44', fg: '#a78bfa' },
  red:    { soft: '#2a1414', soft2: '#3d1f1f', fg: '#f87171' },
  blue:   { soft: '#0f1d3a', soft2: '#1a2b54', fg: '#60a5fa' },
  green:  { soft: '#0c2018', soft2: '#143028', fg: '#34d399' },
}

function applyTheme(theme: Theme, accent: Accent, density: Density) {
  const root = document.documentElement
  root.setAttribute('data-theme',   theme)
  root.setAttribute('data-density', density)

  const a  = ACCENTS[accent]
  const ad = ACCENTS_DARK[accent]
  root.style.setProperty('--accent',       a.color)
  root.style.setProperty('--accent-hover', a.hover)
  if (theme === 'dark') {
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
  const [theme,   setThemeState]   = useState<Theme>(()   => (localStorage.getItem('ui-theme')   as Theme)   ?? 'light')
  const [accent,  setAccentState]  = useState<Accent>(()  => (localStorage.getItem('ui-accent')  as Accent)  ?? 'purple')
  const [density, setDensityState] = useState<Density>(() => (localStorage.getItem('ui-density') as Density) ?? 'comfy')

  useEffect(() => { applyTheme(theme, accent, density) }, [theme, accent, density])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t); localStorage.setItem('ui-theme', t)
  }, [])
  const setAccent = useCallback((a: Accent) => {
    setAccentState(a); localStorage.setItem('ui-accent', a)
  }, [])
  const setDensity = useCallback((d: Density) => {
    setDensityState(d); localStorage.setItem('ui-density', d)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, accent, density, setTheme, setAccent, setDensity }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
