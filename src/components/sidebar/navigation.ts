import {
  Activity,
  AudioWaveform,
  Car,
  CheckSquare,
  Cpu,
  Globe,
  Grid2X2,
  Headphones,
  KeyRound,
  LayoutGrid,
  MonitorPlay,
  Music,
  Piano,
  Radio,
  Rss,
  SlidersHorizontal,
  Stethoscope,
  Wand2,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  badge?: number | string
  badgeClass?: string
}

export interface NavSection {
  id: string
  title: string
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'tools',
    title: 'TOOLS',
    items: [
      { id: 'tools-hub', label: 'All tools', icon: LayoutGrid, badge: 10 },
      { id: 'tools-youtube-downloader', label: 'YouTube downloader', icon: MonitorPlay },
      { id: 'tools-key-finder', label: 'Key & BPM finder', icon: Radio },
      { id: 'tools-chord-detector', label: 'Chord Detector', icon: AudioWaveform },
      { id: 'tools-tempo-tap', label: 'Tempo Tap', icon: Activity },
    ],
  },
  {
    id: 'production',
    title: 'PRODUCTION',
    items: [
      { id: 'production-overview', label: 'Overview', icon: Grid2X2 },
      { id: 'agent-farm', label: 'Agent Farm', icon: Cpu, badge: 8 },
    ],
  },
  {
    id: 'vocals',
    title: 'VOCALS',
    items: [
      { id: 'vocals', label: 'Piano / MIDI', icon: Piano },
      { id: 'rhyme-studio', label: 'Rhyme Studio', icon: Wand2 },
    ],
  },
  {
    id: 'mixing',
    title: 'MIXING',
    items: [
      { id: 'mixing', label: 'Mix board', icon: SlidersHorizontal },
      { id: 'mixing-audio-grab', label: 'Audio grab', icon: Headphones },
    ],
  },
  {
    id: 'harmony',
    title: 'HARMONY STACK',
    items: [
      { id: 'harmony-services', label: 'Services & Pricing', icon: Globe },
      { id: 'harmony-todos',    label: 'Client Projects',    icon: CheckSquare },
    ],
  },
  {
    id: 'cpw',
    title: 'CPW',
    items: [
      { id: 'cpw-projects', label: 'Projects', icon: Music },
    ],
  },
  {
    id: 'pulse',
    title: 'PULSE',
    items: [{ id: 'pulse', label: 'AI digest', icon: Rss }],
  },
  {
    id: 'dev',
    title: 'DEV',
    items: [
      { id: 'dev-diagnostics', label: 'Diagnostics', icon: Stethoscope },
      { id: 'dev', label: 'Settings & API', icon: KeyRound },
    ],
  },
  {
    id: 'tesla',
    title: 'TESLA',
    items: [{ id: 'tesla', label: 'Vehicle (mock)', icon: Car }],
  },
]

/** Default selected route on first mount. */
export const DEFAULT_ACTIVE_ID = 'production-overview'
