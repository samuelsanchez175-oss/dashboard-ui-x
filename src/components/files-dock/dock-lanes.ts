import type { LucideIcon } from 'lucide-react'
import { Download, FolderOpen, LayoutGrid, Radio } from 'lucide-react'

import { toolsWithDock } from '../../lib/toolsRegistry'

/** Minimal file shape for lane matching (avoids circular imports with `files-store`). */
export type DockFileLike = {
  lane?:   string
  source?: string
}

export type DockLaneDef = {
  id:    string
  label: string
  icon:  LucideIcon
  match: (file: DockFileLike) => boolean
}

const LANE_CHROME: Record<string, { label: string; icon: LucideIcon }> = {
  downloads: { label: 'Downloads', icon: Download },
  analysis:  { label: 'Analysis',  icon: Radio },
}

function registryPinTabs(): string[] {
  const ids = new Set<string>()
  for (const t of toolsWithDock()) {
    const pin = t.dock?.pinTab
    if (pin) ids.add(pin)
  }
  return [...ids]
}

function sourceHintMatchesLane(laneId: string, source?: string): boolean {
  const s = source?.toLowerCase() ?? ''
  if (laneId === 'downloads') {
    return s.includes('youtube') || s.includes('grab')
  }
  if (laneId === 'analysis') {
    return s.includes('key finder') || s.includes('key & bpm')
  }
  return false
}

function makeRegistryLaneMatch(laneId: string): (file: DockFileLike) => boolean {
  return file =>
    file.lane === laneId
    || (!file.lane && sourceHintMatchesLane(laneId, file.source))
}

/**
 * Dock lanes: virtual `all` plus every distinct `dock.pinTab` from `TOOLS_REGISTRY`
 * (via `toolsWithDock()`), so new tools only need registry metadata — not a second map.
 */
export const LANES: DockLaneDef[] = [
  {
    id:    'all',
    label: 'All',
    icon:  LayoutGrid,
    match: () => true,
  },
  ...registryPinTabs().map((id): DockLaneDef => {
    const meta = LANE_CHROME[id] ?? {
      label: id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      icon:  FolderOpen,
    }
    return {
      id,
      label: meta.label,
      icon:  meta.icon,
      match: makeRegistryLaneMatch(id),
    }
  }),
]

const LANE_ID_SET = new Set(LANES.map(l => l.id))

/** `pinTab` values that correspond to a real lane tab (excludes only virtual ids if any). */
export function isDockLaneTabId(tab: string | undefined): tab is string {
  return tab != null && tab !== '' && LANE_ID_SET.has(tab)
}

export function getLaneDef(id: string): DockLaneDef | undefined {
  return LANES.find(l => l.id === id)
}
