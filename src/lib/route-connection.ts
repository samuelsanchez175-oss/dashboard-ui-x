import type { ConfigStatus } from './agent-farm-api'
import type { AgentFarmTabId } from '../components/agent-farm/types'

/** Routes that call the Vite BFF (`/api/*`) for core functionality. */
export const ROUTES_NEEDING_BFF = new Set<string>([
  'agent-farm',
  'dev',
  'dev-diagnostics',
  'pulse',
  'mixing-audio-grab',
  'tools-youtube-downloader',
])

function hasAnyServerIntegration(c: ConfigStatus): boolean {
  return c.YOUTUBE_API_KEY || c.GOOGLE_API_KEY || c.GEMINI_API_KEY || c.RSS_FEED_URLS
}

export type ConnectionBadgeState = {
  show: boolean
  label: string
  detail: string
  className: string
}

/**
 * Top-right status: BFF unreachable vs Agent Farm with zero integration flags.
 */
export function getRouteConnectionBadge(
  routeId: string,
  config: ConfigStatus | null,
  loading: boolean,
  agentFarmTab: AgentFarmTabId | null,
): ConnectionBadgeState {
  if (!ROUTES_NEEDING_BFF.has(routeId)) {
    return { show: false, label: '', detail: '', className: '' }
  }

  if (loading) {
    return { show: false, label: '', detail: '', className: '' }
  }

  if (config === null) {
    return {
      show: true,
      label: 'Not connected',
      detail:
        'The dev BFF is not reachable (start `npm run dev` or check that /api/config/status returns JSON).',
      className: 'bg-rose-950/90 text-rose-100 border-rose-400/40',
    }
  }

  if (routeId === 'agent-farm' && !hasAnyServerIntegration(config)) {
    return {
      show: true,
      label: 'APIs not configured',
      detail:
        'Server is up but no integration keys are set (YOUTUBE_API_KEY, GOOGLE_API_KEY, GEMINI_API_KEY, or RSS_FEED_URLS).',
      className: 'bg-amber-950/90 text-amber-100 border-amber-400/40',
    }
  }

  if (routeId === 'agent-farm' && agentFarmTab === 'usage' && !config.GEMINI_API_KEY) {
    return {
      show: true,
      label: 'Gemini not set',
      detail: 'Usage tab live checks need GEMINI_API_KEY in server .env.',
      className: 'bg-amber-950/90 text-amber-100 border-amber-400/40',
    }
  }

  return { show: false, label: '', detail: '', className: '' }
}
