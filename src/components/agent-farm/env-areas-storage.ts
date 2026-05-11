export type EnvArea = {
  id: string
  label: string
  body: string
}

export const ENV_AREAS_STORAGE_KEY = 'agent-farm-env-areas-v1'

export function loadEnvAreas(): EnvArea[] {
  try {
    const raw = localStorage.getItem(ENV_AREAS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isEnvArea)
  } catch {
    return []
  }
}

export function saveEnvAreas(areas: EnvArea[]) {
  localStorage.setItem(ENV_AREAS_STORAGE_KEY, JSON.stringify(areas))
}

function isEnvArea(x: unknown): x is EnvArea {
  if (x === null || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.label === 'string' &&
    typeof o.body === 'string'
  )
}

export function envTabId(areaId: string): `env:${string}` {
  return `env:${areaId}`
}

export function parseEnvTabId(tab: `env:${string}`): string {
  return tab.slice(4)
}
