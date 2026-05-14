import { TOOLS_REGISTRY, getToolById } from './toolsRegistry'

const TOOL_TITLES = Object.fromEntries(
  TOOLS_REGISTRY.map(t => [t.id, t.longLabel ?? t.label]),
) as Record<string, string>

const NON_TOOL_TITLES: Record<string, string> = {
  'agent-farm': 'Agent farm',
  'cdl-air-brakes': 'Air brakes',
  'cdl-doubles-triples': 'Doubles & triples',
  'cdl-hazmat': 'Hazmat',
  'cdl-hub': 'Study hub',
  'cdl-passenger': 'Passenger',
  'cdl-pretrip-cabin': 'Pre-trip: in-cabin',
  'cdl-pretrip-coupling': 'Pre-trip: coupling',
  'cdl-pretrip-engine-bay': 'Pre-trip: engine bay',
  'cdl-pretrip-steering-axle': 'Pre-trip: steering axle',
  'cdl-pretrip-trailer': 'Pre-trip: trailer',
  'cdl-school-bus': 'School bus',
  'cdl-tanker': 'Tanker',
  'cdl-tanker-doubles': 'Tanker + doubles',
  'cdl-tanker-hazmat': 'Tanker + hazmat',
  'cpw-projects': 'C.Please projects',
  'dev': 'Dev settings',
  'dev-diagnostics': 'Diagnostics',
  'harmony-portfolio': 'Harmony portfolio',
  'harmony-services': 'Harmony services',
  'harmony-todos': 'Harmony todos',
  'mixing': 'Mixing',
  'mixing-audio-grab': 'Audio grab',
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
