import { TOOLS_REGISTRY, getToolById } from './toolsRegistry'

const TOOL_TITLES = Object.fromEntries(
  TOOLS_REGISTRY.map(t => [t.id, t.longLabel ?? t.label]),
) as Record<string, string>

const NON_TOOL_TITLES: Record<string, string> = {
  'agent-farm': 'Agent farm',
  'cpw-projects': 'C.Please projects',
  'daily-brief': 'Daily brief',
  'dev': 'Dev settings',
  'dev-diagnostics': 'Diagnostics',
  'harmony-portfolio': 'Harmony portfolio',
  'harmony-services': 'Harmony services',
  'harmony-todos': 'Harmony todos',
  'mixing': 'Mixing',
  'mixing-audio-grab': 'Audio grab',
  'polymarket-bot': 'Bot Cockpit',
  'pulse': 'Pulse digest',
  'rhyme-studio': 'Rhyme studio',
  'tesla': 'Tesla Fleet',
  'tools-hub': 'Tools hub',
  'vocals': 'Vocals',
  'web-designer': 'Web designer',
  'zone-builder': 'Zone builder',
}

export const ROUTE_TITLES: Record<string, string> = { ...TOOL_TITLES, ...NON_TOOL_TITLES }

export function resolveRouteTitle(routeId: string): string {
  return (
    ROUTE_TITLES[routeId]
    ?? getToolById(routeId)?.longLabel
    ?? getToolById(routeId)?.label
    ?? ''
  )
}
