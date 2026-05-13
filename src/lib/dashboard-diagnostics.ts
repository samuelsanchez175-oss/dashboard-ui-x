/**
 * Client-side health checks + BFF probe. No secrets — booleans and timings only.
 */

import type { ApiResult } from '../components/agent-farm/api-stubs'
import {
  canUseYoutubeSearch,
  parseConfigStatusPayload,
  type ConfigStatus,
  type GeminiPingPayload,
  type YoutubeSearchPayload,
} from './agent-farm-api'
import { summarizeDevSettingsScratch } from './dev-documented-env-keys'
import {
  CLIENT_VITE_DIAG_ENTRIES,
  SERVER_DIAGNOSTIC_ENV_ENTRIES,
  classifyEnvPresence,
  detailFromPresence,
  fixHintFromPresence,
  severityFromPresence,
  type EnvPresence,
} from './diagnostics-env-contract'
import { probeMixingDockIndexedDb } from '../zones/mixing/mixing-audio-idb'

export type DiagnosticSeverity = 'ok' | 'warn' | 'critical'

export type DiagnosticCategory = 'bff' | 'api' | 'browser' | 'integrations' | 'runtime'

export type DiagnosticCheck = {
  id: string
  category: DiagnosticCategory
  severity: DiagnosticSeverity
  title: string
  detail: string
  fix?: string
}

/** `GET /api/integrations/status` — booleans + lastError crumbs only (no secrets). */
export type IntegrationsStatusPayload = {
  googleApi?: { configured: boolean; lastError?: string | null }
  gemini?: { configured: boolean; lastError?: string | null }
  youtube?: { configured: boolean; lastError?: string | null }
  rss?: { configured: boolean; lastError?: string | null; feedCount?: number }
}

export type DiagnosticsReport = {
  generatedAt: number
  checks: DiagnosticCheck[]
  bffLatencyMs: number | null
  config: ConfigStatus | null
  /** Browser context for pasted reports (no PII beyond UA string). */
  clientOrigin: string
  userAgent: string
  language: string
}

function integrationHint(cfg: ConfigStatus): DiagnosticCheck | null {
  const any =
    cfg.YOUTUBE_API_KEY ||
    cfg.GOOGLE_API_KEY ||
    cfg.GEMINI_API_KEY ||
    cfg.RSS_FEED_URLS ||
    cfg.HARMONY_CLIENT_PROJECTS_AI_KEY
  if (any) return null
  return {
    id: 'integrations-empty',
    category: 'integrations',
    severity: 'warn',
    title: 'No integration keys reported by the BFF',
    detail:
      'Agent Farm, Pulse RSS, and some tabs need server keys in .env.local (see Settings & API).',
    fix: 'Add at least one of YOUTUBE_API_KEY, GOOGLE_API_KEY, GEMINI_API_KEY, HARMONY_CLIENT_PROJECTS_AI_KEY, or RSS_FEED_URLS — then restart npm run dev.',
  }
}

async function probeIndexedDb(): Promise<DiagnosticCheck> {
  try {
    const r = await probeMixingDockIndexedDb()
    if (r.ok) {
      return {
        id: 'idb-mixing-dock',
        category: 'browser',
        severity: 'ok',
        title: 'IndexedDB (audio dock) reachable',
        detail: 'mixing-yt-audio-dock-v1 opens successfully.',
      }
    }
    return {
      id: 'idb-mixing-dock',
      category: 'browser',
      severity: 'critical',
      title: 'IndexedDB for audio dock failed',
      detail: r.error ?? 'Unknown error',
      fix: 'Private browsing / strict storage blocks can cause this. Allow site storage or use a normal window.',
    }
  } catch (e) {
    return {
      id: 'idb-mixing-dock',
      category: 'browser',
      severity: 'critical',
      title: 'IndexedDB probe threw',
      detail: e instanceof Error ? e.message : String(e),
    }
  }
}

async function probeAudioContext(): Promise<DiagnosticCheck> {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) {
    return {
      id: 'audio-context',
      category: 'browser',
      severity: 'critical',
      title: 'Web Audio API unavailable',
      detail: 'AudioContext constructor missing.',
      fix: 'Use a modern desktop browser; disable extensions that block audio APIs.',
    }
  }
  try {
    const ctx = new AC()
    await ctx.close().catch(() => {})
    return {
      id: 'audio-context',
      category: 'browser',
      severity: 'ok',
      title: 'Web Audio can initialize',
      detail: 'AudioContext opened and closed cleanly.',
    }
  } catch (e) {
    return {
      id: 'audio-context',
      category: 'browser',
      severity: 'warn',
      title: 'Web Audio blocked or suspended',
      detail: e instanceof Error ? e.message : String(e),
      fix: 'Click the page once to satisfy autoplay policies, or check browser permissions.',
    }
  }
}

function probeLocalStorage(): DiagnosticCheck {
  const key = '__ui_dashboard_x_diag__'
  try {
    localStorage.setItem(key, '1')
    localStorage.removeItem(key)
    return {
      id: 'local-storage',
      category: 'browser',
      severity: 'ok',
      title: 'localStorage read/write works',
      detail: 'Scratch keys and vault may persist.',
    }
  } catch (e) {
    return {
      id: 'local-storage',
      category: 'browser',
      severity: 'warn',
      title: 'localStorage blocked',
      detail: e instanceof Error ? e.message : String(e),
      fix: 'Enable storage for this origin or exit private mode — vault / dev scratch will fail.',
    }
  }
}

function probeOnline(): DiagnosticCheck {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      id: 'navigator-online',
      category: 'browser',
      severity: 'warn',
      title: 'Browser reports offline',
      detail: 'navigator.onLine is false.',
      fix: 'Reconnect to the network for YouTube grab and external APIs.',
    }
  }
  return {
    id: 'navigator-online',
    category: 'browser',
    severity: 'ok',
    title: 'Browser reports online',
    detail: 'navigator.onLine is true.',
  }
}

function probeSessionStorage(): DiagnosticCheck {
  const key = '__ui_dashboard_x_diag_sess__'
  try {
    sessionStorage.setItem(key, '1')
    sessionStorage.removeItem(key)
    return {
      id: 'session-storage',
      category: 'browser',
      severity: 'ok',
      title: 'sessionStorage read/write works',
      detail: 'Ephemeral session-scoped storage is available.',
    }
  } catch (e) {
    return {
      id: 'session-storage',
      category: 'browser',
      severity: 'warn',
      title: 'sessionStorage blocked',
      detail: e instanceof Error ? e.message : String(e),
      fix: 'Some flows assume tab-scoped storage — allow storage or avoid strict sandbox modes.',
    }
  }
}

async function timedFetch(path: string, init?: RequestInit): Promise<{ ms: number; res: Response }> {
  const t0 = performance.now()
  // Use fetchWithKeys so the per-route diagnostics also honor user-typed keys
  // from Settings — otherwise a Gemini key only in localStorage would still
  // show as "missing" in the dev-server probe.
  const { fetchWithKeys } = await import('./api-keys')
  const res = await fetchWithKeys(path, { cache: 'no-store', credentials: 'same-origin', ...init })
  return { ms: Math.round(performance.now() - t0), res }
}

async function probeApiHealth(bffOk: boolean): Promise<DiagnosticCheck> {
  if (!bffOk) {
    return {
      id: 'api-health',
      category: 'api',
      severity: 'warn',
      title: 'GET /api/health skipped',
      detail: 'BFF did not respond to /api/config/status — health probe not run.',
    }
  }
  try {
    const { ms, res } = await timedFetch('/api/health')
    if (!res.ok) {
      return {
        id: 'api-health',
        category: 'api',
        severity: 'critical',
        title: 'GET /api/health failed',
        detail: `HTTP ${res.status} (${ms} ms).`,
        fix: 'Inspect server/agent-farm-bff.ts and Vite middleware wiring.',
      }
    }
    return {
      id: 'api-health',
      category: 'api',
      severity: 'ok',
      title: 'GET /api/health OK',
      detail: `HTTP ${res.status} (${ms} ms).`,
    }
  } catch (e) {
    return {
      id: 'api-health',
      category: 'api',
      severity: 'critical',
      title: 'GET /api/health unreachable',
      detail: e instanceof Error ? e.message : String(e),
    }
  }
}

async function probeApiUnknownRoute(bffOk: boolean): Promise<DiagnosticCheck> {
  if (!bffOk) {
    return {
      id: 'api-unknown-route',
      category: 'api',
      severity: 'warn',
      title: 'Unknown-route probe skipped',
      detail: 'BFF unreachable — did not verify 404 handling.',
    }
  }
  try {
    const { ms, res } = await timedFetch('/api/__dashboard_diag_unknown_route__')
    if (res.status === 404) {
      return {
        id: 'api-unknown-route',
        category: 'api',
        severity: 'ok',
        title: 'Unknown API paths return 404',
        detail: `Probe path returned HTTP 404 (${ms} ms) as expected.`,
      }
    }
    return {
      id: 'api-unknown-route',
      category: 'api',
      severity: 'warn',
      title: 'Unexpected status for unknown API path',
      detail: `Expected HTTP 404, got ${res.status} (${ms} ms).`,
      fix: 'Ensure only the Vite BFF handles /api/* or adjust routing so bogus routes do not fall through incorrectly.',
    }
  } catch (e) {
    return {
      id: 'api-unknown-route',
      category: 'api',
      severity: 'critical',
      title: 'Unknown-route probe failed',
      detail: e instanceof Error ? e.message : String(e),
    }
  }
}

async function probeIntegrationsStatusEndpoint(bffOk: boolean): Promise<DiagnosticCheck> {
  if (!bffOk) {
    return {
      id: 'api-integrations-status',
      category: 'api',
      severity: 'warn',
      title: 'GET /api/integrations/status skipped',
      detail: 'BFF unreachable.',
    }
  }
  try {
    const { ms, res } = await timedFetch('/api/integrations/status')
    if (!res.ok) {
      return {
        id: 'api-integrations-status',
        category: 'api',
        severity: 'critical',
        title: 'GET /api/integrations/status failed',
        detail: `HTTP ${res.status} (${ms} ms).`,
      }
    }
    let body: IntegrationsStatusPayload = {}
    try {
      body = (await res.json()) as IntegrationsStatusPayload
    } catch {
      return {
        id: 'api-integrations-status',
        category: 'api',
        severity: 'warn',
        title: 'Integrations status JSON parse failed',
        detail: `HTTP ${res.status} (${ms} ms) but response was not JSON.`,
      }
    }

    const crumbs: string[] = []
    const pushErr = (label: string, sub?: { configured?: boolean; lastError?: string | null }) => {
      if (!sub?.lastError) return
      crumbs.push(`${label}: ${sub.lastError}`)
    }
    pushErr('Google API', body.googleApi)
    pushErr('Gemini', body.gemini)
    pushErr('YouTube', body.youtube)
    pushErr('RSS', body.rss)

    const severity: DiagnosticSeverity = crumbs.length ? 'warn' : 'ok'
    const rssFeeds = body.rss?.feedCount != null ? `${body.rss.feedCount} feed(s)` : 'feeds n/a'

    return {
      id: 'api-integrations-status',
      category: 'api',
      severity,
      title: 'GET /api/integrations/status OK',
      detail:
        crumbs.length > 0
          ? `HTTP ${res.status} (${ms} ms). Last integration errors: ${crumbs.join('; ')}.`
          : `HTTP ${res.status} (${ms} ms). No stored integration errors. RSS: ${rssFeeds}.`,
      fix:
        crumbs.length > 0
          ? 'Fix .env keys or upstream quotas; open Agent Farm → Integrations to probe individual routes.'
          : undefined,
    }
  } catch (e) {
    return {
      id: 'api-integrations-status',
      category: 'api',
      severity: 'critical',
      title: 'GET /api/integrations/status unreachable',
      detail: e instanceof Error ? e.message : String(e),
    }
  }
}

async function probeRssQuick(bffOk: boolean): Promise<DiagnosticCheck> {
  if (!bffOk) {
    return {
      id: 'api-rss',
      category: 'api',
      severity: 'warn',
      title: 'GET /api/rss skipped',
      detail: 'BFF unreachable.',
    }
  }
  try {
    const { ms, res } = await timedFetch('/api/rss?limit=1')
    if (!res.ok) {
      return {
        id: 'api-rss',
        category: 'api',
        severity: 'critical',
        title: 'GET /api/rss HTTP error',
        detail: `HTTP ${res.status} (${ms} ms).`,
      }
    }
    const json = (await res.json()) as
      | { ok: false; error?: string; message?: string }
      | { ok: true; items?: unknown[]; errors?: Array<{ feedUrl: string; message: string }> }
    if (!json || typeof json !== 'object') {
      return {
        id: 'api-rss',
        category: 'api',
        severity: 'warn',
        title: 'GET /api/rss invalid JSON',
        detail: `HTTP ${res.status} (${ms} ms).`,
      }
    }
    if ('ok' in json && json.ok === false) {
      const sev: DiagnosticSeverity = json.error === 'MISSING_CONFIG' ? 'ok' : 'warn'
      return {
        id: 'api-rss',
        category: 'api',
        severity: sev,
        title: json.error === 'MISSING_CONFIG' ? 'RSS aggregate — not configured' : 'RSS aggregate reported failure',
        detail: `${json.message ?? json.error ?? 'error'} (${ms} ms).`,
        fix: json.error === 'MISSING_CONFIG' ? undefined : 'Set RSS_FEED_URLS in .env.local or fix feed URLs.',
      }
    }
    const items = 'items' in json && Array.isArray(json.items) ? json.items : []
    const errCount =
      'errors' in json && Array.isArray(json.errors) ? json.errors.length : 0
    return {
      id: 'api-rss',
      category: 'api',
      severity: errCount > 0 ? 'warn' : 'ok',
      title: errCount > 0 ? 'RSS aggregate OK with feed errors' : 'GET /api/rss OK',
      detail:
        errCount > 0
          ? `HTTP ${res.status} (${ms} ms). ${items.length} item(s); ${errCount} feed error(s) in payload.`
          : `HTTP ${res.status} (${ms} ms). ${items.length} item(s) returned.`,
    }
  } catch (e) {
    return {
      id: 'api-rss',
      category: 'api',
      severity: 'critical',
      title: 'GET /api/rss unreachable',
      detail: e instanceof Error ? e.message : String(e),
    }
  }
}

async function probeYoutubeQuick(config: ConfigStatus | null, bffOk: boolean): Promise<DiagnosticCheck | null> {
  if (!bffOk || !config || !canUseYoutubeSearch(config)) return null
  try {
    const { ms, res } = await timedFetch('/api/youtube/search?q=diagnostics-smoke')
    if (!res.ok) {
      return {
        id: 'api-youtube-search',
        category: 'api',
        severity: 'critical',
        title: 'GET /api/youtube/search HTTP error',
        detail: `HTTP ${res.status} (${ms} ms).`,
      }
    }
    const json = (await res.json()) as ApiResult<YoutubeSearchPayload>
    if (!json.ok) {
      return {
        id: 'api-youtube-search',
        category: 'api',
        severity: 'warn',
        title: 'YouTube search envelope reported failure',
        detail: `${json.message} (${ms} ms).`,
        fix: 'Verify YOUTUBE_API_KEY / GOOGLE_API_KEY and API quotas.',
      }
    }
    const count = json.data?.items?.length ?? 0
    return {
      id: 'api-youtube-search',
      category: 'api',
      severity: 'ok',
      title: 'GET /api/youtube/search OK',
      detail: `HTTP ${res.status} (${ms} ms). ${count} result(s) for probe query.`,
    }
  } catch (e) {
    return {
      id: 'api-youtube-search',
      category: 'api',
      severity: 'critical',
      title: 'GET /api/youtube/search unreachable',
      detail: e instanceof Error ? e.message : String(e),
    }
  }
}

async function probeGeminiPingQuick(config: ConfigStatus | null, bffOk: boolean): Promise<DiagnosticCheck | null> {
  if (!bffOk || !config?.GEMINI_API_KEY) return null
  try {
    const { ms, res } = await timedFetch('/api/gemini/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (!res.ok) {
      return {
        id: 'api-gemini-ping',
        category: 'api',
        severity: 'critical',
        title: 'POST /api/gemini/ping HTTP error',
        detail: `HTTP ${res.status} (${ms} ms).`,
      }
    }
    const json = (await res.json()) as ApiResult<GeminiPingPayload>
    if (!json.ok) {
      return {
        id: 'api-gemini-ping',
        category: 'api',
        severity: 'warn',
        title: 'Gemini ping reported failure',
        detail: `${json.message} (${ms} ms).`,
        fix: 'Verify GEMINI_API_KEY and Generative Language API access.',
      }
    }
    const models = json.data?.modelCount ?? 0
    return {
      id: 'api-gemini-ping',
      category: 'api',
      severity: 'ok',
      title: 'POST /api/gemini/ping OK',
      detail: `HTTP ${res.status} (${ms} ms). Models reachable (${models} listed).`,
    }
  } catch (e) {
    return {
      id: 'api-gemini-ping',
      category: 'api',
      severity: 'critical',
      title: 'POST /api/gemini/ping unreachable',
      detail: e instanceof Error ? e.message : String(e),
    }
  }
}

async function probeOpenAiPing(bffOk: boolean): Promise<DiagnosticCheck | null> {
  if (!bffOk) return null
  try {
    const { ms, res } = await timedFetch('/api/openai/ping')
    if (!res.ok) {
      return {
        id: 'api-openai-ping',
        category: 'api',
        severity: 'critical',
        title: 'GET /api/openai/ping HTTP error',
        detail: `HTTP ${res.status} (${ms} ms).`,
      }
    }
    const json = (await res.json()) as
      | { ok: true; data: { baseUrlUsed?: string; modelSampleIds?: string[]; modelTotal?: number | null } }
      | { ok: false; error: string; message: string }
    if (!json.ok) {
      const sev: DiagnosticSeverity = json.error === 'MISSING_CONFIG' ? 'ok' : 'warn'
      return {
        id: 'api-openai-ping',
        category: 'api',
        severity: sev,
        title: json.error === 'MISSING_CONFIG' ? 'OpenAI ping — not configured' : 'OpenAI-compatible ping failed',
        detail: `${json.message} (${ms} ms).`,
        fix: json.error === 'MISSING_CONFIG' ? undefined : 'Check OPENAI_API_KEY / OPENAI_BASE_URL and upstream errors.',
      }
    }
    const total = json.data.modelTotal
    return {
      id: 'api-openai-ping',
      category: 'api',
      severity: 'ok',
      title: 'GET /api/openai/ping OK',
      detail:
        typeof total === 'number'
          ? `HTTP ${res.status} (${ms} ms). ${total} model(s) visible at ${json.data.baseUrlUsed ?? 'base'}.`
          : `HTTP ${res.status} (${ms} ms).`,
    }
  } catch (e) {
    return {
      id: 'api-openai-ping',
      category: 'api',
      severity: 'warn',
      title: 'GET /api/openai/ping failed',
      detail: e instanceof Error ? e.message : String(e),
    }
  }
}

type ServerEnvKeysPayload = { server?: Record<string, EnvPresence> }

async function probeEnvKeyRows(extendedApiSmoke: boolean, bffOk: boolean): Promise<DiagnosticCheck[]> {
  if (!extendedApiSmoke) return []

  const rows: DiagnosticCheck[] = []

  for (const e of CLIENT_VITE_DIAG_ENTRIES) {
    const meta = import.meta.env as Record<string, string | boolean | undefined>
    const raw = meta[e.envKey]
    const str = typeof raw === 'string' ? raw : raw != null && raw !== false ? String(raw) : ''
    const p = classifyEnvPresence(str)
    const severity = severityFromPresence(p, e.missingSeverity, e.placeholderSeverity)
    rows.push({
      id: `env-client-${e.envKey}`,
      category: 'runtime',
      severity,
      title: `${e.label} (${e.envKey})`,
      detail: detailFromPresence(p, e.envKey),
      fix: fixHintFromPresence(p, 'client'),
    })
  }

  if (!bffOk) {
    rows.push({
      id: 'env-server-probe',
      category: 'integrations',
      severity: 'warn',
      title: 'Server env key audit skipped',
      detail: 'BFF unreachable — cannot call GET /api/diagnostics/env-keys (server values are never exposed to the client bundle).',
    })
    return rows
  }

  try {
    const { ms, res } = await timedFetch('/api/diagnostics/env-keys')
    if (!res.ok) {
      rows.push({
        id: 'env-server-probe',
        category: 'api',
        severity: 'critical',
        title: 'GET /api/diagnostics/env-keys failed',
        detail: `HTTP ${res.status} (${ms} ms).`,
        fix: 'Ensure the Vite dev BFF is running and `server/agent-farm-bff.ts` includes the diagnostics route.',
      })
      return rows
    }
    let body: ServerEnvKeysPayload = {}
    try {
      body = (await res.json()) as ServerEnvKeysPayload
    } catch {
      rows.push({
        id: 'env-server-probe',
        category: 'api',
        severity: 'warn',
        title: 'GET /api/diagnostics/env-keys — invalid JSON',
        detail: `HTTP ${res.status} (${ms} ms).`,
      })
      return rows
    }
    const server = body.server ?? {}
    for (const e of SERVER_DIAGNOSTIC_ENV_ENTRIES) {
      const p = server[e.envKey] ?? 'missing'
      const severity = severityFromPresence(p, e.missingSeverity, e.placeholderSeverity)
      rows.push({
        id: `env-server-${e.envKey}`,
        category: 'integrations',
        severity,
        title: `${e.label} (${e.envKey})`,
        detail: detailFromPresence(p, e.envKey),
        fix: fixHintFromPresence(p, 'server'),
      })
    }
    rows.push({
      id: 'api-diagnostics-env-keys',
      category: 'api',
      severity: 'ok',
      title: 'GET /api/diagnostics/env-keys OK',
      detail: `HTTP ${res.status} (${ms} ms). Returned presence labels only for ${SERVER_DIAGNOSTIC_ENV_ENTRIES.length} allowlisted server variables.`,
    })
  } catch (e) {
    rows.push({
      id: 'env-server-probe',
      category: 'api',
      severity: 'critical',
      title: 'GET /api/diagnostics/env-keys unreachable',
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  return rows
}

export type RunDiagnosticsOptions = {
  /**
   * When true, probes RSS aggregation and optional YouTube / Gemini / OpenAI routes (may hit third-party APIs).
   * Background refresh uses `false` to avoid hammering feeds or quotas every 90s.
   */
  extendedApiSmoke?: boolean
}

function probeDevSettingsScratchSummary(): DiagnosticCheck {
  const s = summarizeDevSettingsScratch()
  const preview =
    s.scratchFilledKeys.length === 0
      ? 'none'
      : `${s.scratchFilledKeys.slice(0, 16).join(', ')}${s.scratchFilledKeys.length > 16 ? '…' : ''}`
  return {
    id: 'dev-settings-documented-keys',
    category: 'runtime',
    severity: 'ok',
    title: 'Dev Settings documented keys (local scratch)',
    detail: `${s.totalDocRows} rows (${s.builtInRows} built-in, ${s.customRows} custom). localStorage scratch present for: ${preview}. Secret values are never logged.`,
  }
}

export async function runDashboardDiagnostics(opts?: RunDiagnosticsOptions): Promise<DiagnosticsReport> {
  const extendedApiSmoke = opts?.extendedApiSmoke === true
  const checks: DiagnosticCheck[] = []
  let bffLatencyMs: number | null
  let config: ConfigStatus | null = null

  const clientOrigin =
    typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '(unknown)'
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '(unknown)'
  const language = typeof navigator !== 'undefined' ? navigator.language : '(unknown)'

  const t0 = performance.now()
  let bffReachable = false
  try {
    const { fetchWithKeys } = await import('./api-keys')
    const res = await fetchWithKeys('/api/config/status', { cache: 'no-store', credentials: 'same-origin' })
    bffLatencyMs = Math.round(performance.now() - t0)

    if (!res.ok) {
      checks.push({
        id: 'bff-http',
        category: 'bff',
        severity: 'critical',
        title: 'BFF configuration endpoint error',
        detail: `GET /api/config/status returned HTTP ${res.status}.`,
        fix: 'Ensure `npm run dev` is running this Vite app (middleware provides /api/*). Check terminal for server errors.',
      })
    } else {
      bffReachable = true
      config = parseConfigStatusPayload(await res.json())
      checks.push({
        id: 'bff-ok',
        category: 'bff',
        severity: 'ok',
        title: 'BFF reachable',
        detail: `/api/config/status OK (${bffLatencyMs} ms).`,
      })
      const hint = integrationHint(config)
      if (hint) checks.push(hint)
    }
  } catch (e) {
    bffLatencyMs = Math.round(performance.now() - t0)
    checks.push({
      id: 'bff-network',
      category: 'bff',
      severity: 'critical',
      title: 'Cannot reach the dev BFF',
      detail: e instanceof Error ? e.message : String(e),
      fix: 'Start the dev server from this project (`npm run dev`). If using a preview build, /api routes may be missing — use dev or deploy server middleware.',
    })
  }

  const [idb, audio, ls, ss, online, healthCk, unknownCk, integCk] = await Promise.all([
    probeIndexedDb(),
    probeAudioContext(),
    Promise.resolve(probeLocalStorage()),
    Promise.resolve(probeSessionStorage()),
    Promise.resolve(probeOnline()),
    probeApiHealth(bffReachable),
    probeApiUnknownRoute(bffReachable),
    probeIntegrationsStatusEndpoint(bffReachable),
  ])

  checks.push(idb, audio, ls, ss, online, healthCk, unknownCk, integCk)

  if (!extendedApiSmoke) {
    checks.push({
      id: 'api-smoke-extended-skipped',
      category: 'api',
      severity: 'ok',
      title: 'Extended API smoke not run (scheduled refresh)',
      detail:
        'RSS / YouTube / Gemini / OpenAI probes and the env-key audit (VITE_* + allowlisted server vars) are skipped on automatic refresh to avoid feed traffic, API quotas, and extra routes. Click “Run full checks” on Diagnostics for a full pass.',
    })
  } else {
    const heavy = await Promise.all([
      probeRssQuick(bffReachable),
      probeYoutubeQuick(config, bffReachable),
      probeGeminiPingQuick(config, bffReachable),
      probeOpenAiPing(bffReachable),
    ])
    for (const row of heavy) {
      if (row) checks.push(row)
    }
    for (const row of await probeEnvKeyRows(true, bffReachable)) {
      checks.push(row)
    }
  }

  checks.push(probeDevSettingsScratchSummary())

  checks.push({
    id: 'vite-mode',
    category: 'runtime',
    severity: 'ok',
    title: 'Vite environment',
    detail: `MODE=${import.meta.env.MODE}, DEV=${String(import.meta.env.DEV)}, secure=${String(window.isSecureContext)}.`,
  })

  return {
    generatedAt: Date.now(),
    checks,
    bffLatencyMs,
    config,
    clientOrigin,
    userAgent,
    language,
  }
}

export function summarizeDiagnostics(report: DiagnosticsReport | null): {
  critical: number
  warn: number
  ok: number
  openIssueCount: number
} {
  if (!report) return { critical: 0, warn: 0, ok: 0, openIssueCount: 0 }
  let critical = 0
  let warn = 0
  let ok = 0
  for (const c of report.checks) {
    if (c.severity === 'critical') critical++
    else if (c.severity === 'warn') warn++
    else ok++
  }
  const openIssueCount = critical + warn
  return { critical, warn, ok, openIssueCount }
}

export function formatDiagnosticsMarkdown(report: DiagnosticsReport, clientErrors: readonly ClientDiagError[]): string {
  const lines: string[] = []
  const sum = summarizeDiagnostics(report)

  lines.push('# Dashboard diagnostics')
  lines.push('')
  lines.push('## Summary')
  lines.push(`- **Generated:** ${new Date(report.generatedAt).toISOString()}`)
  lines.push(`- **Healthy / warnings / critical:** ${sum.ok} ok · ${sum.warn} warn · ${sum.critical} critical`)
  lines.push(`- **Open issues (checks):** ${sum.openIssueCount}`)
  lines.push(`- **Captured JS errors this session:** ${clientErrors.length}`)
  lines.push(`- **BFF** \`/api/config/status\` latency: ${report.bffLatencyMs ?? 'n/a'} ms`)
  const lite = report.checks.some(c => c.id === 'api-smoke-extended-skipped')
  lines.push(`- **API probe tier:** ${lite ? 'lightweight (RSS / optional upstream pings skipped)' : 'full (RSS and upstream pings may have run)'}`)
  lines.push('')

  lines.push('## Client environment')
  lines.push(`- **Page:** ${report.clientOrigin}`)
  lines.push(`- **Language:** ${report.language}`)
  lines.push(`- **User-Agent:** ${report.userAgent}`)
  const ds = summarizeDevSettingsScratch()
  lines.push(
    `- **Dev Settings documented rows:** ${ds.totalDocRows} (${ds.builtInRows} built-in, ${ds.customRows} custom); localStorage scratch set for **${ds.scratchFilledKeys.length}** key(s) (names only in exports).`,
  )
  if (ds.scratchFilledKeys.length > 0) {
    lines.push(`  - Scratch keys: ${ds.scratchFilledKeys.join(', ')}`)
  }
  lines.push('')

  if (report.config) {
    lines.push('## Integration keys (from BFF — booleans only)')
    lines.push(
      `- **YOUTUBE_API_KEY:** ${report.config.YOUTUBE_API_KEY ? 'set' : 'missing'} · **GOOGLE_API_KEY:** ${report.config.GOOGLE_API_KEY ? 'set' : 'missing'} · **GEMINI_API_KEY:** ${report.config.GEMINI_API_KEY ? 'set' : 'missing'} · **RSS_FEED_URLS:** ${report.config.RSS_FEED_URLS ? 'set' : 'missing'}`,
    )
    lines.push('')
  }

  const envRows = report.checks.filter(
    c =>
      c.id.startsWith('env-client-') ||
      c.id.startsWith('env-server-') ||
      c.id === 'api-diagnostics-env-keys' ||
      c.id === 'env-server-probe',
  )
  if (envRows.length) {
    lines.push('## Environment variables (full checks only)')
    lines.push(
      '- **Classification:** present / missing / placeholder (heuristic). Secret values are never exported.',
    )
    lines.push(
      '- **Client:** `import.meta.env` for documented `VITE_*` keys only. **Server:** `GET /api/diagnostics/env-keys` (allowlisted names, booleans/presence labels).',
    )
    for (const c of envRows.sort((a, b) => a.id.localeCompare(b.id))) {
      lines.push(`- **${c.severity.toUpperCase()}** \`${c.id}\` — ${c.title}`)
      lines.push(`  - ${c.detail}`)
      if (c.fix) lines.push(`  - *Fix:* ${c.fix}`)
    }
    lines.push('')
  }

  const catOrder: DiagnosticCategory[] = ['bff', 'api', 'integrations', 'browser', 'runtime']
  const sevRank: Record<DiagnosticSeverity, number> = { critical: 0, warn: 1, ok: 2 }

  lines.push('## Automated checks (grouped)')
  for (const cat of catOrder) {
    const subset = report.checks.filter(c => c.category === cat)
    if (!subset.length) continue
    subset.sort((a, b) => {
      const d = sevRank[a.severity] - sevRank[b.severity]
      return d !== 0 ? d : a.id.localeCompare(b.id)
    })
    lines.push(`### ${cat}`)
    for (const c of subset) {
      lines.push(`- **${c.severity.toUpperCase()}** \`${c.id}\` — ${c.title}`)
      lines.push(`  - ${c.detail}`)
      if (c.fix) lines.push(`  - *Fix:* ${c.fix}`)
    }
    lines.push('')
  }

  const leftover = report.checks.filter(c => !catOrder.includes(c.category))
  if (leftover.length) {
    lines.push('### other')
    for (const c of leftover) {
      lines.push(`- **${c.severity.toUpperCase()}** \`${c.id}\` — ${c.title}`)
      lines.push(`  - ${c.detail}`)
      if (c.fix) lines.push(`  - *Fix:* ${c.fix}`)
    }
    lines.push('')
  }

  if (clientErrors.length) {
    lines.push(`## Recent client errors (${clientErrors.length})`)
    for (const e of clientErrors.slice(-15)) {
      const src = e.source ? ` (${e.source})` : ''
      lines.push(`- ${new Date(e.ts).toISOString()} **${e.kind}**${src}: ${e.message}`)
    }
    lines.push('')
  }

  lines.push('## Manual follow-ups (not automated here)')
  lines.push(
    '- **Network audit:** In Cursor browser after exercising the dashboard, review requests for 4xx/5xx, duplicate calls, slow waterfalls, and sensitive query params (`awesome-network-request-auditing` skill).',
  )
  lines.push(
    '- **Console:** Confirm no unexpected errors after navigation (`awesome-verifying-in-browser` / `awesome-visual-qa-testing`).',
  )
  lines.push(
    '- **Accessibility:** Run an aria snapshot pass for labels, landmarks, and keyboard flow (`awesome-accessibility-auditing`).',
  )
  lines.push(
    '- **Performance:** Bundle / runtime profiling when investigating slowness (`awesome-auditing-performance`; e.g. `npx vite-bundle-visualizer`).',
  )
  lines.push(
    '- **Security / dependencies:** `npm audit`, secret scanning in repo, review BFF error payloads in production (`awesome-auditing-security`).',
  )
  lines.push(
    '- **Dev Settings:** Custom documented rows live in `localStorage` under `dev-settings-custom-doc-rows`; Diagnostics summarizes counts and scratch key names only (`src/lib/dev-documented-env-keys.ts`).',
  )
  lines.push('')

  return lines.join('\n').trimEnd() + '\n'
}

export type ClientDiagError = {
  ts: number
  kind: 'error' | 'rejection'
  message: string
  source?: string
}

const MAX_CLIENT_ERRORS = 28

export function appendClientError(prev: ClientDiagError[], entry: Omit<ClientDiagError, 'ts'> & { ts?: number }): ClientDiagError[] {
  const row: ClientDiagError = {
    ts: entry.ts ?? Date.now(),
    kind: entry.kind,
    message: entry.message.slice(0, 500),
    source: entry.source?.slice(0, 200),
  }
  const next = [...prev, row]
  return next.slice(-MAX_CLIENT_ERRORS)
}
