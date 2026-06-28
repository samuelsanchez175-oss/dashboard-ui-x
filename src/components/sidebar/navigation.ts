import {
  Car,
  CheckSquare,
  Cpu,
  Globe,
  Headphones,
  Images,
  FolderKanban,
  KeyRound,
  LayoutGrid,
  Paintbrush,
  Piano,
  Rss,
  SlidersHorizontal,
  Stethoscope,
  Sunrise,
  Users,
  Wallet,
  Wand2,
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
    id:    'brief',
    title: 'DAILY BRIEF',
    items: [{ id: 'daily-brief', label: 'Daily Brief', icon: Sunrise }],
  },
  {
    id:    'cpw',
    title: 'PROJECTS',
    items: [{ id: 'cpw-projects', label: 'All projects', icon: FolderKanban }],
  },
  {
    id:    'polymarket',
    title: 'POLYMARKET',
    items: [
      { id: 'polymarket', label: 'Wallet', icon: Wallet },
      { id: 'polymarket-copy', label: 'Copy Scout', icon: Users },
      { id: 'polymarket-bot', label: 'Bot Cockpit', icon: Cpu },
    ],
  },
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
    id:    'pulse',
    title: 'PULSE',
    items: [{ id: 'pulse', label: 'AI digest', icon: Rss }],
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
