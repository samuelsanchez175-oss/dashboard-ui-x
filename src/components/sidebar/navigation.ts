import {
  Biohazard,
  Bus,
  Car,
  CheckSquare,
  CircleDot,
  ClipboardList,
  Container,
  Cpu,
  Disc,
  Droplets,
  Fuel,
  Globe,
  GraduationCap,
  Headphones,
  Images,
  KeyRound,
  LayoutGrid,
  Link2,
  Music,
  Paintbrush,
  Piano,
  Rss,
  School,
  SlidersHorizontal,
  Smartphone,
  Stethoscope,
  Truck,
  Wand2,
  Workflow,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

import { TOOLS_REGISTRY } from '../../lib/toolsRegistry'

export interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  badge?: number | string
  badgeClass?: string
  /** Tooltip for the trailing badge (e.g. Settings scratch key count). */
  badgeTitle?: string
}

export interface NavSection {
  id: string
  title: string
  items: NavItem[]
}

const TOOLS_SECTION_ITEMS: NavItem[] = [
  { id: 'tools-hub', label: 'All tools', icon: LayoutGrid, badge: TOOLS_REGISTRY.length },
  ...TOOLS_REGISTRY.map(
    (t): NavItem => ({
      id:    t.id,
      label: t.label,
      icon:  t.icon,
      ...(t.badge != null ? { badge: t.badge } : {}),
    }),
  ),
]

export const NAV_SECTIONS: NavSection[] = [
  {
    id:    'tools',
    title: 'TOOLS',
    items: TOOLS_SECTION_ITEMS,
  },
  {
    id:    'production',
    title: 'PRODUCTION',
    items: [{ id: 'agent-farm', label: 'Agent Farm', icon: Cpu, badge: 8 }],
  },
  {
    id:    'vocals',
    title: 'VOCALS',
    items: [
      { id: 'vocals', label: 'Piano / MIDI', icon: Piano },
      { id: 'rhyme-studio', label: 'Rhyme Studio', icon: Wand2 },
    ],
  },
  {
    id:    'mixing',
    title: 'MIXING',
    items: [
      { id: 'mixing', label: 'Mix board', icon: SlidersHorizontal },
      { id: 'mixing-audio-grab', label: 'Audio grab', icon: Headphones },
    ],
  },
  {
    id:    'harmony',
    title: 'HARMONY STACK',
    items: [
      { id: 'harmony-services', label: 'Services & Pricing', icon: Globe },
      { id: 'harmony-todos', label: 'Client Projects', icon: CheckSquare },
      { id: 'harmony-portfolio', label: 'Portfolio', icon: Images },
    ],
  },
  {
    id:    'cpw',
    title: 'CPW',
    items: [{ id: 'cpw-projects', label: 'Projects', icon: Music }],
  },
  {
    id:    'pulse',
    title: 'PULSE',
    items: [{ id: 'pulse', label: 'AI digest', icon: Rss }],
  },
  {
    id:    'cdl',
    title: 'CDL PRAC',
    items: [
      { id: 'cdl-practice-app', label: '📱 CDL Mobile App', icon: Smartphone, badge: 'NEW', badgeClass: 'bg-cyan-500/10 text-[#22d3ee] border-[#22d3ee]/30' },
      { id: 'cdl-hub', label: 'All quizzes', icon: GraduationCap, badge: 13 },
      { id: 'cdl-hazmat', label: 'Hazmat (H)', icon: Biohazard },
      { id: 'cdl-air-brakes', label: 'Air Brakes', icon: Disc },
      { id: 'cdl-tanker', label: 'Tanker (N)', icon: Droplets },
      { id: 'cdl-tanker-hazmat', label: 'Tanker + HazMat (X)', icon: Fuel },
      { id: 'cdl-passenger', label: 'Passenger (P)', icon: Bus },
      { id: 'cdl-school-bus', label: 'School Bus (S)', icon: School },
      { id: 'cdl-doubles-triples', label: 'Doubles / Triples (T)', icon: Container },
      { id: 'cdl-tanker-doubles', label: 'Tanker Doubles', icon: Workflow },
      { id: 'cdl-pretrip-cabin', label: 'Pre-Trip: In-Cabin', icon: ClipboardList },
      { id: 'cdl-pretrip-engine-bay', label: 'Pre-Trip: Engine Bay', icon: Wrench },
      { id: 'cdl-pretrip-steering-axle', label: 'Pre-Trip: Steering Axle', icon: CircleDot },
      { id: 'cdl-pretrip-coupling', label: 'Pre-Trip: Coupling', icon: Link2 },
      { id: 'cdl-pretrip-trailer', label: 'Pre-Trip: Trailer', icon: Truck },
    ],
  },
  {
    id:    'web-designer-nav',
    title: 'WEB DESIGN',
    items: [{ id: 'web-designer', label: 'Designer browser', icon: Paintbrush }],
  },
  {
    id:    'dev',
    title: 'DEV',
    items: [
      { id: 'dev-diagnostics', label: 'Diagnostics', icon: Stethoscope },
      { id: 'dev', label: 'Settings & API', icon: KeyRound },
    ],
  },
  {
    id:    'tesla',
    title: 'TESLA',
    items: [{ id: 'tesla', label: 'Tesla Fleet', icon: Car }],
  },
]

/** Default selected route on first mount. */
export const DEFAULT_ACTIVE_ID = 'agent-farm'
