import {
  Activity,
  AudioWaveform,
  Biohazard,
  Bus,
  Car,
  CheckSquare,
  Columns2,
  Container,
  Cpu,
  Crop,
  Disc,
  Droplets,
  Fuel,
  Drum,
  Globe,
  GraduationCap,
  Grid2X2,
  Headphones,
  KeyRound,
  LayoutGrid,
  LayoutList,
  MonitorPlay,
  Music,
  Paintbrush,
  Piano,
  Radio,
  Rss,
  School,
  SlidersHorizontal,
  Stethoscope,
  Timer,
  Wand2,
  WholeWord,
  Workflow,
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
      { id: 'tools-hub', label: 'All tools', icon: LayoutGrid, badge: 14 },
      { id: 'tools-youtube-downloader', label: 'YouTube downloader', icon: MonitorPlay },
      { id: 'tools-key-finder', label: 'Key & BPM finder', icon: Radio },
      { id: 'tools-chord-detector', label: 'Chord Detector', icon: AudioWaveform },
      { id: 'tools-tempo-tap', label: 'Tempo Tap', icon: Activity },
      { id: 'tools-metronome-export', label: 'Metronome export', icon: Drum },
      { id: 'tools-phonetics-inspector', label: 'Phonetics inspector', icon: WholeWord },
      { id: 'tools-session-timer', label: 'Session timer', icon: Timer },
      { id: 'tools-arrangement-pad', label: 'Arrangement pad', icon: LayoutList },
      { id: 'tools-sample-slicer', label: 'Sample slicer', icon: Crop },
      { id: 'tools-stem-splitter', label: 'Stem splitter', icon: Columns2 },
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
    id: 'cdl',
    title: 'CDL PRAC',
    items: [
      { id: 'cdl-hub',             label: 'All quizzes',            icon: GraduationCap, badge: 8 },
      { id: 'cdl-hazmat',          label: 'Hazmat (H)',             icon: Biohazard },
      { id: 'cdl-air-brakes',      label: 'Air Brakes',             icon: Disc },
      { id: 'cdl-tanker',          label: 'Tanker (N)',             icon: Droplets },
      { id: 'cdl-tanker-hazmat',   label: 'Tanker + HazMat (X)',    icon: Fuel },
      { id: 'cdl-passenger',       label: 'Passenger (P)',          icon: Bus },
      { id: 'cdl-school-bus',      label: 'School Bus (S)',         icon: School },
      { id: 'cdl-doubles-triples', label: 'Doubles / Triples (T)',  icon: Container },
      { id: 'cdl-tanker-doubles',  label: 'Tanker Doubles',         icon: Workflow },
    ],
  },
  {
    id: 'web-designer-nav',
    title: 'WEB DESIGN',
    items: [{ id: 'web-designer', label: 'Designer browser', icon: Paintbrush }],
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
