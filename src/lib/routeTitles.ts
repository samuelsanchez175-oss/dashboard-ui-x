import { TOOLS_REGISTRY, getToolById } from './toolsRegistry'

const TOOL_TITLES = Object.fromEntries(
  TOOLS_REGISTRY.map(t => [t.id, t.longLabel ?? t.label]),
) as Record<string, string>

const NON_TOOL_TITLES: Record<string, string> = {
  'agent-farm': 'Agent farm',
  'codeburn': 'Cost',
  'command-center': 'Project Command Center',
  'cpw-projects': 'All projects',
  'daily-brief': 'Daily brief',
  'dev': 'Dev settings',
  'dev-diagnostics': 'Diagnostics',
  'harmony-portfolio': 'Harmony live site',
  'harmony-services': 'Harmony live site',
  'harmony-todos': 'Harmony client projects',
  'harmony-cdl': 'CDL One Stop',
  'harmony-penwork': 'Penwork Studio',
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
