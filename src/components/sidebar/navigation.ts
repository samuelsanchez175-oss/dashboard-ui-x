import {
  Biohazard,
  Bus,
  Car,
  CheckSquare,
  Container,
  Cpu,
  Disc,
  Droplets,
  Fuel,
  Globe,
  GraduationCap,
  Grid2X2,
  Headphones,
  KeyRound,
  LayoutGrid,
  Music,
  Paintbrush,
  Piano,
  Rss,
  School,
  SlidersHorizontal,
  Stethoscope,
  Wand2,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

import { HUB_TOOL_COUNT, TOOLS_REGISTRY } from '../../data/tools-registry'

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

/**
 * The TOOLS section is rebuilt from the shared registry so the sidebar
 * and the Tools Hub never drift. Only tools that have an in-app route
 * (`showInSidebar: true`) appear here.
 */
const toolsNavItems: NavItem[] = TOOLS_REGISTRY
  .filter((tool): tool is typeof tool & { route: string } => tool.showInSidebar && Boolean(tool.route))
  .map((tool) => ({
    id: tool.route,
    label: tool.label,
    icon: tool.icon,
  }))

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'tools',
    title: 'TOOLS',
    items: [
      { id: 'tools-hub', label: 'All tools', icon: LayoutGrid, badge: HUB_TOOL_COUNT },
      ...toolsNavItems,
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
