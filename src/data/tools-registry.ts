/**
 * Single source of truth for the dashboard's tool catalog.
 *
 * Both the sidebar (TOOLS section) and the Tools Hub gallery derive their
 * data from this registry, so the same tool always presents identically:
 * same icon, same label, same route.
 *
 * Anything *not* listed here is intentionally not a "tool" — e.g., the
 * "All tools" sidebar entry is a meta-link to the hub itself and is kept
 * out of the registry.
 */
import {
  Activity,
  AudioWaveform,
  Crop,
  Disc,
  Drum,
  FileMusic,
  LayoutList,
  MonitorPlay,
  Music,
  Radio,
  SlidersVertical,
  Timer,
  Volume2,
  WholeWord,
  type LucideIcon,
} from 'lucide-react'

/** Accent tone for hub tiles. Must stay aligned with TONE_LIGHT/TONE_DARK palettes. */
export type ToolTone =
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

/** Open-ended so we don't lock new categories behind a type bump. */
export type ToolCategory = string

/** Hub tile status — drives badge styling and "coming soon" treatment. */
export type ToolStatus = 'ready' | 'beta' | 'soon'

export interface ToolEntry {
  /** Stable hub id (used by HUB_TOOLS consumers, e.g. 'stem-splitter'). */
  id: string
  /** Routing key consumed by MainContent (e.g. 'tools-stem-splitter'). Optional for hub-only tiles that have no in-app zone yet. */
  route?: string
  /** Display label — same string in the sidebar and on the hub tile. */
  label: string
  /** Lucide icon component. */
  icon: LucideIcon
  /** Accent tone for the hub tile (sidebar ignores it). */
  tone: ToolTone
  /** Hub category — used by `HUB_CATEGORIES` filters. */
  category: ToolCategory
  /** Long blurb for the hub tile. */
  description: string
  /** Short one-liner; falls back to `description` when omitted. */
  shortDescription?: string
  /** Hub readiness state. */
  status: ToolStatus
  /** Hub "last used" caption. */
  lastUsed: string
  /** Hub badge text (e.g. "Popular", "Beta"). */
  badge: string | null
  /** When false/undefined, the sidebar omits this tool. Hub-only entries set this to false. */
  showInSidebar: boolean
}

/**
 * Canonical tool list. Order here = order in the sidebar's TOOLS section
 * (for entries with `showInSidebar: true`).
 */
export const TOOLS_REGISTRY: ToolEntry[] = [
  {
    id: 'yt-downloader',
    route: 'tools-youtube-downloader',
    label: 'YouTube Downloader',
    icon: MonitorPlay,
    tone: 'red',
    category: 'Capture',
    description: 'Pull audio from any YouTube link as MP3.',
    status: 'ready',
    lastUsed: '2h ago',
    badge: 'Popular',
    showInSidebar: true,
  },
  {
    id: 'key-finder',
    route: 'tools-key-finder',
    label: 'Key & BPM Finder',
    icon: Radio,
    tone: 'violet',
    category: 'Analysis',
    description: 'Detect musical key, tempo, and Camelot code.',
    status: 'ready',
    lastUsed: 'Yesterday',
    badge: null,
    showInSidebar: true,
  },
  {
    id: 'chord-detect',
    route: 'tools-chord-detector',
    label: 'Chord Detector',
    icon: Music,
    tone: 'fuchsia',
    category: 'Analysis',
    description: 'Transcribe chord progression from audio.',
    status: 'beta',
    lastUsed: '—',
    badge: 'Beta',
    showInSidebar: true,
  },
  {
    id: 'tempo-tap',
    route: 'tools-tempo-tap',
    label: 'Tempo Tap',
    icon: Activity,
    tone: 'green',
    category: 'Utility',
    description: 'Tap-to-BPM and clickable metronome.',
    status: 'ready',
    lastUsed: '1w ago',
    badge: null,
    showInSidebar: true,
  },
  {
    id: 'metronome-export',
    route: 'tools-metronome-export',
    label: 'Metronome export',
    icon: Drum,
    tone: 'green',
    category: 'Utility',
    description: 'Live click + downloadable WAV / MIDI for practice.',
    status: 'ready',
    lastUsed: '—',
    badge: null,
    showInSidebar: true,
  },
  {
    id: 'phonetics-inspector',
    route: 'tools-phonetics-inspector',
    label: 'Phonetics inspector',
    icon: WholeWord,
    tone: 'indigo',
    category: 'Utility',
    description: 'CMU dictionary ARPAbet lookup for lyric words.',
    status: 'ready',
    lastUsed: '—',
    badge: null,
    showInSidebar: true,
  },
  {
    id: 'session-timer',
    route: 'tools-session-timer',
    label: 'Session timer',
    icon: Timer,
    tone: 'violet',
    category: 'Production',
    description: 'Running clock, named cues, Markdown / text export.',
    status: 'ready',
    lastUsed: '—',
    badge: null,
    showInSidebar: true,
  },
  {
    id: 'arrangement-pad',
    route: 'tools-arrangement-pad',
    label: 'Arrangement pad',
    icon: LayoutList,
    tone: 'fuchsia',
    category: 'Production',
    description: 'Sketch sections with bar counts; export outline.',
    status: 'ready',
    lastUsed: '—',
    badge: null,
    showInSidebar: true,
  },
  {
    id: 'sample-chopper',
    route: 'tools-sample-slicer',
    label: 'Sample / loop slicer',
    icon: Crop,
    tone: 'amber',
    category: 'Production',
    description: 'Waveform trim handles and export selection as WAV.',
    status: 'ready',
    lastUsed: '—',
    badge: null,
    showInSidebar: true,
  },
  {
    id: 'stem-splitter',
    route: 'tools-stem-splitter',
    label: 'Stem Splitter',
    icon: SlidersVertical,
    tone: 'blue',
    category: 'Utility',
    description: 'Crossover “brightness vs body” split — not ML isolation.',
    status: 'beta',
    lastUsed: '3d ago',
    badge: 'Beta',
    showInSidebar: true,
  },
  // ── Hub-only tiles below (no in-app zone yet → not in the sidebar) ────────
  {
    id: 'lufs-meter',
    label: 'Loudness Meter',
    icon: Volume2,
    tone: 'cyan',
    category: 'Mastering',
    description: 'Integrated LUFS / true peak / dynamic range.',
    status: 'ready',
    lastUsed: '—',
    badge: null,
    showInSidebar: false,
  },
  {
    id: 'format-converter',
    label: 'Format Converter',
    icon: FileMusic,
    tone: 'slate',
    category: 'Utility',
    description: 'WAV ↔ MP3 ↔ FLAC ↔ AAC, batch.',
    status: 'ready',
    lastUsed: '5d ago',
    badge: null,
    showInSidebar: false,
  },
  {
    id: 'silence-trim',
    label: 'Silence Trimmer',
    icon: AudioWaveform,
    tone: 'teal',
    category: 'Utility',
    description: 'Auto-trim leading/trailing silence.',
    status: 'ready',
    lastUsed: '—',
    badge: null,
    showInSidebar: false,
  },
  {
    id: 'ab-ref',
    label: 'Reference A/B',
    icon: Disc,
    tone: 'indigo',
    category: 'Mastering',
    description: 'Loudness-matched A/B against a reference.',
    status: 'soon',
    lastUsed: '—',
    badge: 'Soon',
    showInSidebar: false,
  },
]

/** Lookup helpers — same shape pattern as elsewhere in the codebase. */
export const TOOLS_BY_ID: Record<string, ToolEntry> = Object.fromEntries(
  TOOLS_REGISTRY.map((t) => [t.id, t]),
)

export const TOOLS_BY_CATEGORY: Record<string, ToolEntry[]> = TOOLS_REGISTRY.reduce(
  (acc, t) => {
    ;(acc[t.category] ||= []).push(t)
    return acc
  },
  {} as Record<string, ToolEntry[]>,
)

/** Count of tools shown in the sidebar's TOOLS section. */
export const SIDEBAR_TOOL_COUNT: number = TOOLS_REGISTRY.filter((t) => t.showInSidebar).length

/** Total number of tools in the hub — used for the sidebar's "All tools" badge. */
export const HUB_TOOL_COUNT: number = TOOLS_REGISTRY.length
