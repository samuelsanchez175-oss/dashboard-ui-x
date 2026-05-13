/**
 * Tone palette for the Tools hub zone list rows (ToolsHubZone).
 * Former hub tile dataset (HUB_TOOLS) and ToolsHubToolCard were removed as unused.
 */

export const TONE_DARK = {
  red:     { bg: '#2a1414', fg: '#f87171', border: '#3d1f1f' },
  violet:  { bg: '#1e1832', fg: '#a78bfa', border: '#261e44' },
  blue:    { bg: '#0f1d3a', fg: '#60a5fa', border: '#1a2b54' },
  amber:   { bg: '#1f1608', fg: '#fbbf24', border: '#2e2010' },
  green:   { bg: '#0a2118', fg: '#34d399', border: '#143028' },
  cyan:    { bg: '#0a1f22', fg: '#22d3ee', border: '#0f2d34' },
  slate:   { bg: '#1b1c24', fg: '#94a3b8', border: '#23252e' },
  teal:    { bg: '#0a1e1c', fg: '#2dd4bf', border: '#0f2e2b' },
  fuchsia: { bg: '#2a1030', fg: '#e879f9', border: '#3d1845' },
  indigo:  { bg: '#141830', fg: '#818cf8', border: '#1e2445' },
} as const

export type HubAccentTone = keyof typeof TONE_DARK
