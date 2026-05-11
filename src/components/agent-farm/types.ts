export type BuiltinAgentFarmTabId =
  | 'overview'
  | 'beat-analysis'
  | 'customer-support'
  | 'revenue'
  | 'market-research'
  | 'seo'
  | 'social'
  | 'automations'
  | 'usage'
  | 'integrations'

/** Built-in tabs plus user-defined `env:<uuid>` workspaces. */
export type AgentFarmTabId = BuiltinAgentFarmTabId | `env:${string}`

const BUILTIN_IDS = new Set<string>([
  'overview',
  'beat-analysis',
  'customer-support',
  'revenue',
  'market-research',
  'seo',
  'social',
  'automations',
  'usage',
  'integrations',
])

export function isBuiltinAgentFarmTab(id: AgentFarmTabId): id is BuiltinAgentFarmTabId {
  return BUILTIN_IDS.has(id)
}

export function isEnvWorkspaceTab(id: AgentFarmTabId): id is `env:${string}` {
  return typeof id === 'string' && id.startsWith('env:')
}
