import {
  Activity,
  BookOpen,
  Brain,
  Car,
  CheckSquare,
  ClipboardList,
  Compass,
  Cpu,
  Disc3,
  Flame,
  FolderKanban,
  Globe,
  Headphones,
  HeartPulse,
  KeyRound,
  LayoutGrid,
  MessageSquare,
  Mic2,
  Music2,
  Paintbrush,
  Piano,
  QrCode,
  Rss,
  Scissors,
  Stethoscope,
  Sunrise,
  Truck,
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
    id:    'vault',
    title: 'VAULT · BRAIN',
    items: [
      { id: 'vault-console', label: 'Vault Console', icon: Brain },
      { id: 'vault-rag', label: 'RAG Chat', icon: MessageSquare },
      { id: 'vault-handoffs', label: 'Handoff Resume', icon: ClipboardList },
      { id: 'vault-study', label: 'Project Study', icon: BookOpen },
      { id: 'vault-clippings', label: 'Clipping Digest', icon: Scissors },
      { id: 'vault-media', label: 'Media Library', icon: Disc3 },
      { id: 'vault-lyrics', label: 'Lyric Study', icon: Mic2 },
      { id: 'vault-ingest', label: 'Ingest Health', icon: HeartPulse },
    ],
  },
  {
    id:    'brief',
    title: 'DAILY BRIEF',
    items: [
      { id: 'daily-brief', label: 'Daily Brief', icon: Sunrise },
      { id: 'command-center', label: 'Project Command Center', icon: Compass },
      { id: 'cpw-projects', label: 'All projects', icon: FolderKanban },
      { id: 'codeburn', label: 'Cost', icon: Flame },
    ],
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
    title: 'GROWTH',
    items: [{ id: 'agent-farm', label: 'Reach Lab', icon: Activity }],
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
    title: 'AUDIO IN',
    items: [
      { id: 'mixing-audio-grab', label: 'Audio grab', icon: Headphones },
    ],
  },
  {
    id:    'harmony',
    title: 'HARMONY STACK',
    items: [
      { id: 'harmony-portfolio', label: 'Live site', icon: Globe },
      { id: 'harmony-todos', label: 'Client projects', icon: CheckSquare },
      { id: 'harmony-cdl', label: 'CDL One Stop', icon: Truck },
      { id: 'harmony-cdl-qr', label: 'CDL QR code', icon: QrCode },
      { id: 'harmony-penwork', label: 'Penwork Studio', icon: Music2 },
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
    items: [{ id: 'web-designer', label: 'Reference browser', icon: Paintbrush }],
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
export const DEFAULT_ACTIVE_ID = 'vault-console'
