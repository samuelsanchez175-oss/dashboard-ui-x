import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  AppWindow,
  AudioWaveform,
  Columns2,
  Crop,
  Drum,
  LayoutList,
  MonitorPlay,
  Music4,
  Radio,
  Smartphone,
  Timer,
  WholeWord,
} from 'lucide-react'

export type ToolCategory = 'utility' | 'audio' | 'lyric' | 'arrangement' | 'workspace'

/**
 * Cross-cutting tool family used by shared UI affordances (e.g. `RecentClipsTray`,
 * "Send to" relays). Distinct from `ToolCategory`, which drives the Tools-Hub
 * grouping label. Two tools in different categories can still share a family
 * when they consume the same kind of artefact (audio clip, detection result, …).
 */
export type ToolFamily = 'audio' | 'detection' | 'lyric' | 'doc' | 'static'

/**
 * How a tool relates to the global Files Dock (`FilesDock` / `files-store`).
 *
 * The dock is currently a **single lane** (no tab UI). `pinTab` is a canonical
 * lane id reserved for a future tabbed dock or filters (`downloads`, `stems`,
 * `samples`, …). Consumers should read this from `TOOLS_REGISTRY` / `getToolById`
 * using the active tool route instead of hard-coding maps.
 */
export type ToolDockConfig = {
  /** When true, a future shell may auto-show or emphasize the dock on entering the tool. */
  openOnLaunch?: boolean
  /** Canonical dock lane / tab id for routing files from this tool. */
  pinTab?: string
  /** Optional icon for dock chrome; defaults to the tool’s main `icon`. */
  icon?: LucideIcon
}

export interface ToolDef {
  id: string
  routeId: string
  label: string
  longLabel?: string
  icon: LucideIcon
  category: ToolCategory
  description?: string
  badge?: number | string
  dock?: ToolDockConfig
  /**
   * Cross-cutting family for shared affordances (see `ToolFamily`).
   * Optional — only set when a tool participates in a family-wide pipeline
   * (e.g. all `'audio'` tools accept inbound clips from the grabber).
   */
  family?: ToolFamily
}

export const TOOLS_REGISTRY: ToolDef[] = [
  {
    id:          'tools-youtube-downloader',
    routeId:     'tools-youtube-downloader',
    label:       'YouTube downloader',
    longLabel:   'YouTube Downloader',
    icon:        MonitorPlay,
    category:    'utility',
    description: 'Pull audio from any YouTube link as MP3.',
    family:      'audio',
    dock: {
      pinTab:       'downloads',
      openOnLaunch: true,
    },
  },
  {
    id:          'tools-key-finder',
    routeId:     'tools-key-finder',
    label:       'Key & STEM',
    longLabel:   'Key & STEM',
    icon:        Radio,
    category:    'audio',
    description: 'Find key, BPM, and scale, and split into downloadable stems — in one drop.',
    family:      'detection',
    dock: {
      pinTab: 'analysis',
    },
  },
  {
    id:          'tools-chord-detector',
    routeId:     'tools-chord-detector',
    label:       'Chord Detector',
    longLabel:   'Chord Detector',
    icon:        AudioWaveform,
    category:    'audio',
    description: 'Transcribe chord progression from audio.',
    badge:       'Beta',
    family:      'detection',
  },
  {
    /* Docker-backed sibling of Chord Detector — Demucs stem separation +
     * basic-pitch per stem, served by the FastAPI app under `note-detector-2/`.
     * Needs `docker compose up` running locally; the page shows a clear
     * "service down" banner otherwise. */
    id:          'tools-note-detector-2',
    routeId:     'tools-note-detector-2',
    label:       'Note Detector 2',
    longLabel:   'Note Detector 2',
    icon:        Music4,
    category:    'audio',
    description: 'Demucs-split audio → per-stem MIDI (local Docker service).',
    badge:       'Beta',
    family:      'detection',
  },
  {
    id:          'tools-tempo-tap',
    routeId:     'tools-tempo-tap',
    label:       'Tempo Tap',
    icon:        Activity,
    category:    'utility',
    description: 'Tap-to-BPM and clickable metronome.',
  },
  {
    id:          'tools-metronome-export',
    routeId:     'tools-metronome-export',
    label:       'Metronome export',
    icon:        Drum,
    category:    'utility',
    description: 'Live click + downloadable WAV / MIDI for practice.',
  },
  {
    id:          'tools-phonetics-inspector',
    routeId:     'tools-phonetics-inspector',
    label:       'Phonetics inspector',
    icon:        WholeWord,
    category:    'lyric',
    description: 'CMU dictionary ARPAbet lookup for lyric words.',
    family:      'detection',
  },
  {
    id:          'tools-session-timer',
    routeId:     'tools-session-timer',
    label:       'Session timer',
    icon:        Timer,
    category:    'workspace',
    description: 'Running clock, named cues, Markdown / text export.',
  },
  {
    id:          'tools-arrangement-pad',
    routeId:     'tools-arrangement-pad',
    label:       'Arrangement pad',
    icon:        LayoutList,
    category:    'arrangement',
    description: 'Sketch sections with bar counts; export outline.',
  },
  {
    id:          'tools-sample-slicer',
    routeId:     'tools-sample-slicer',
    label:       'Sample slicer',
    longLabel:   'Sample / loop slicer',
    icon:        Crop,
    category:    'audio',
    description: 'Waveform trim handles and export selection as WAV.',
  },
  {
    id:          'tools-stem-splitter',
    routeId:     'tools-stem-splitter',
    label:       'Stem splitter',
    icon:        Columns2,
    category:    'audio',
    description: 'Crossover “brightness vs body” split — not ML isolation.',
    badge:       'Beta',
    family:      'detection',
  },
  {
    id:          'tools-app-icon',
    routeId:     'tools-app-icon',
    label:       'App Store icon',
    longLabel:   'App Store Icon Studio',
    icon:        AppWindow,
    category:    'utility',
    description: 'Align any image to a 1024×1024 App Store Connect icon and export PNG.',
  },
  {
    id:          'tools-device-mockup',
    routeId:     'tools-device-mockup',
    label:       'iPhone mockup',
    longLabel:   'iPhone 17 Mockup',
    icon:        Smartphone,
    category:    'utility',
    description: 'Drop a screenshot into a clean iPhone 17 frame and export a transparent PNG.',
  },
]

export function getToolById(id: string): ToolDef | undefined {
  return TOOLS_REGISTRY.find(t => t.id === id)
}

export function getToolLabel(id: string): string | undefined {
  const t = getToolById(id)
  return t?.longLabel ?? t?.label
}

/** Tools that declare Files Dock metadata (`dock` is present). */
export const toolsWithDock = (): ToolDef[] => TOOLS_REGISTRY.filter(t => t.dock != null)

/** Tools tagged with a specific family (see `ToolFamily`). */
export const getToolsByFamily = (family: ToolFamily): ToolDef[] =>
  TOOLS_REGISTRY.filter(t => t.family === family)
