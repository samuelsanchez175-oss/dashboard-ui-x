import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  AudioWaveform,
  Disc,
  FileMusic,
  MonitorPlay,
  Music,
  Radio,
  Scissors,
  SlidersVertical,
  Volume2,
} from 'lucide-react'

export type HubAccentTone =
  | 'red'
  | 'violet'
  | 'blue'
  | 'amber'
  | 'green'
  | 'cyan'
  | 'slate'
  | 'teal'
  | 'fuchsia'
  | 'indigo'

export type HubToolStatus = 'ready' | 'beta' | 'soon'

export type HubToolDef = {
  id: string
  name: string
  desc: string
  icon: LucideIcon
  category: string
  accentTone: HubAccentTone
  status: HubToolStatus
  lastUsed: string
  badge: string | null
  /** When set, hub navigates here for ready/beta tiles that should open in-app. */
  navigateRouteId?: string
}

export const HUB_TOOLS: HubToolDef[] = [
  {
    id: 'yt-downloader',
    name: 'YouTube Downloader',
    desc: 'Pull audio from any YouTube link as MP3.',
    icon: MonitorPlay,
    category: 'Capture',
    accentTone: 'red',
    status: 'ready',
    lastUsed: '2h ago',
    badge: 'Popular',
    navigateRouteId: 'tools-youtube-downloader',
  },
  {
    id: 'key-finder',
    name: 'Key & BPM Finder',
    desc: 'Detect musical key, tempo, and Camelot code.',
    icon: Radio,
    category: 'Analysis',
    accentTone: 'violet',
    status: 'ready',
    lastUsed: 'Yesterday',
    badge: null,
    navigateRouteId: 'tools-key-finder',
  },
  {
    id: 'stem-splitter',
    name: 'Stem Splitter',
    desc: 'Isolate vocals, drums, bass, and other.',
    icon: SlidersVertical,
    category: 'Analysis',
    accentTone: 'blue',
    status: 'beta',
    lastUsed: '3d ago',
    badge: 'Beta',
  },
  {
    id: 'sample-chopper',
    name: 'Sample Chopper',
    desc: 'Slice loops at transients, export as kit.',
    icon: Scissors,
    category: 'Production',
    accentTone: 'amber',
    status: 'ready',
    lastUsed: '—',
    badge: null,
  },
  {
    id: 'tempo-tap',
    name: 'Tempo Tap',
    desc: 'Tap-to-BPM and clickable metronome.',
    icon: Activity,
    category: 'Utility',
    accentTone: 'green',
    status: 'ready',
    lastUsed: '1w ago',
    badge: null,
    navigateRouteId: 'tools-tempo-tap',
  },
  {
    id: 'lufs-meter',
    name: 'Loudness Meter',
    desc: 'Integrated LUFS / true peak / dynamic range.',
    icon: Volume2,
    category: 'Mastering',
    accentTone: 'cyan',
    status: 'ready',
    lastUsed: '—',
    badge: null,
  },
  {
    id: 'format-converter',
    name: 'Format Converter',
    desc: 'WAV ↔ MP3 ↔ FLAC ↔ AAC, batch.',
    icon: FileMusic,
    category: 'Utility',
    accentTone: 'slate',
    status: 'ready',
    lastUsed: '5d ago',
    badge: null,
  },
  {
    id: 'silence-trim',
    name: 'Silence Trimmer',
    desc: 'Auto-trim leading/trailing silence.',
    icon: AudioWaveform,
    category: 'Utility',
    accentTone: 'teal',
    status: 'ready',
    lastUsed: '—',
    badge: null,
  },
  {
    id: 'chord-detect',
    name: 'Chord Detector',
    desc: 'Transcribe chord progression from audio.',
    icon: Music,
    category: 'Analysis',
    accentTone: 'fuchsia',
    status: 'beta',
    lastUsed: '—',
    badge: 'Beta',
    navigateRouteId: 'tools-chord-detector',
  },
  {
    id: 'ab-ref',
    name: 'Reference A/B',
    desc: 'Loudness-matched A/B against a reference.',
    icon: Disc,
    category: 'Mastering',
    accentTone: 'indigo',
    status: 'soon',
    lastUsed: '—',
    badge: 'Soon',
  },
]

export const HUB_CATEGORIES = ['All', 'Capture', 'Analysis', 'Production', 'Mastering', 'Utility'] as const

export type HubCategory = (typeof HUB_CATEGORIES)[number]

/** Light tile icon backgrounds — aligned with Claude Design handoff. */
export const TONE_LIGHT: Record<
  HubAccentTone,
  { bg: string; fg: string; border: string }
> = {
  red: { bg: '#fef2f2', fg: '#dc2626', border: '#fecaca' },
  violet: { bg: '#f5f3ff', fg: '#7c3aed', border: '#ddd6fe' },
  blue: { bg: '#eff6ff', fg: '#2563eb', border: '#bfdbfe' },
  amber: { bg: '#fffbeb', fg: '#d97706', border: '#fde68a' },
  green: { bg: '#ecfdf5', fg: '#059669', border: '#a7f3d0' },
  cyan: { bg: '#ecfeff', fg: '#0891b2', border: '#a5f3fc' },
  slate: { bg: '#f1f5f9', fg: '#475569', border: '#cbd5e1' },
  teal: { bg: '#f0fdfa', fg: '#0d9488', border: '#99f6e4' },
  fuchsia: { bg: '#fdf4ff', fg: '#c026d3', border: '#f5d0fe' },
  indigo: { bg: '#eef2ff', fg: '#4f46e5', border: '#c7d2fe' },
}

export const TONE_DARK: Record<HubAccentTone, { bg: string; fg: string; border: string }> = {
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
}

export type HubRecentRow = {
  id: number
  tool: string
  action: string
  target: string
  time: string
  icon: LucideIcon
  tone: HubAccentTone
}

export const HUB_RECENT: HubRecentRow[] = [
  {
    id: 1,
    tool: 'YouTube Downloader',
    action: 'Downloaded',
    target: 'Frank Ocean — Pyramids',
    time: '2h ago',
    icon: MonitorPlay,
    tone: 'red',
  },
  {
    id: 2,
    tool: 'Key & BPM Finder',
    action: 'Analyzed',
    target: 'rough_mix_v3.wav',
    time: '1d ago',
    icon: Radio,
    tone: 'violet',
  },
  {
    id: 3,
    tool: 'Stem Splitter',
    action: 'Split',
    target: 'demo_loop.mp3',
    time: '3d ago',
    icon: SlidersVertical,
    tone: 'blue',
  },
  {
    id: 4,
    tool: 'Tempo Tap',
    action: 'Tapped',
    target: '94 BPM',
    time: '1w ago',
    icon: Activity,
    tone: 'green',
  },
]
