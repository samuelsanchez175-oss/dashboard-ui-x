/**
 * Client for /api/vault/* second-brain BFF routes.
 */

export type VaultNoteHit = {
  path: string
  name: string
  folder: string
  mtime: number
  size: number
  snippet?: string
  score?: number
  bpm?: string | null
  key?: string | null
}

export type VaultStatus = {
  ok: boolean
  vaultDir: string
  exists: boolean
  candidates?: string[]
  noteCount: number
  handoffCount: number
  lastIngest: string | null
  lastBrief: string | null
  error?: string
  message?: string
}

export type VaultHandoff = VaultNoteHit & {
  project: string
  status: string
  source: string
  resume: string
  created: string | null
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: 'no-store' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { message?: string }).message || `HTTP ${res.status}`)
  }
  return data as T
}

export function vaultApi() {
  return {
    status: () => getJson<VaultStatus>('/api/vault/status'),
    themes: () =>
      getJson<{
        ok: boolean
        total: number
        folders: { folder: string; count: number }[]
        keywords: { word: string; count: number }[]
        insight: string
      }>('/api/vault/themes'),
    search: (q: string, opts?: { limit?: number; folder?: string }) => {
      const p = new URLSearchParams()
      if (q) p.set('q', q)
      if (opts?.limit) p.set('limit', String(opts.limit))
      if (opts?.folder) p.set('folder', opts.folder)
      return getJson<{ ok: boolean; hits: VaultNoteHit[]; totalScanned: number; mode: string }>(
        `/api/vault/search?${p}`,
      )
    },
    list: (prefix?: string, limit = 50) => {
      const p = new URLSearchParams({ limit: String(limit) })
      if (prefix) p.set('prefix', prefix)
      return getJson<{ ok: boolean; hits: VaultNoteHit[]; total: number }>(`/api/vault/list?${p}`)
    },
    handoffs: (limit = 40) =>
      getJson<{ ok: boolean; handoffs: VaultHandoff[] }>(`/api/vault/handoffs?limit=${limit}`),
    projects: () =>
      getJson<{
        ok: boolean
        projects: {
          name: string
          count: number
          lastMtime: number
          recent: VaultNoteHit[]
        }[]
        commandCenterExcerpt: string | null
      }>('/api/vault/projects'),
    clippings: () => getJson<{ ok: boolean; clippings: VaultNoteHit[] }>('/api/vault/clippings'),
    media: () => getJson<{ ok: boolean; media: VaultNoteHit[] }>('/api/vault/media'),
    lyrics: (q?: string) => {
      const p = q ? `?q=${encodeURIComponent(q)}` : ''
      return getJson<{ ok: boolean; notes: VaultNoteHit[] }>(`/api/vault/lyrics${p}`)
    },
    file: (path: string) =>
      getJson<{
        ok: boolean
        path: string
        content: string
        body: string
        frontmatter: Record<string, string>
        mtime: number
      }>(`/api/vault/file?path=${encodeURIComponent(path)}`),
    runIngest: () =>
      getJson<{ ok: boolean; stdout?: string; stderr?: string; error?: string }>('/api/vault/ingest/run', {
        method: 'POST',
      }),
    runBrief: () =>
      getJson<{ ok: boolean; stdout?: string; stderr?: string; error?: string }>('/api/vault/brief/run', {
        method: 'POST',
      }),
    logs: (type: 'ingest' | 'brief' = 'ingest') =>
      getJson<{ ok: boolean; logs: string; path?: string }>(`/api/vault/logs?type=${type}`),
    ragStatus: () =>
      getJson<{
        ok: boolean
        exists: boolean
        builtAt: string | null
        chunkCount: number
        vaultDir: string | null
        grokBin: string
      }>('/api/vault/rag/status'),
    ragRebuild: () =>
      getJson<{ ok: boolean; chunkCount: number; builtAt: string; vaultDir: string }>('/api/vault/rag/rebuild', {
        method: 'POST',
      }),
    ragChat: (question: string, opts?: { rebuild?: boolean; k?: number }) =>
      getJson<{
        ok: boolean
        answer?: string
        sources?: { path: string; title: string; score: number; snippet: string }[]
        error?: string
        indexMeta?: { chunkCount: number; builtAt: string; vaultDir: string }
      }>('/api/vault/rag/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, ...opts }),
      }),
    reachDraft: (body: { channel: string; project?: string; topic?: string }) =>
      getJson<{
        ok: boolean
        draft?: string | null
        error?: string
        sources?: { path: string; title: string; score: number }[]
      }>('/api/vault/rag/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    refreshSnapshots: (opts?: { noGrok?: boolean; skipIngest?: boolean }) =>
      getJson<{ ok: boolean; stdout?: string; stderr?: string; error?: string }>(
        '/api/vault/snapshots/refresh',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(opts ?? {}),
        },
      ),
  }
}

export function formatVaultDate(ms: number | string | null | undefined): string {
  if (ms == null) return '—'
  const d = typeof ms === 'number' ? new Date(ms) : new Date(ms)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function daysSince(isoOrMs: string | number | null | undefined): number | null {
  if (isoOrMs == null) return null
  const t = typeof isoOrMs === 'number' ? isoOrMs : new Date(isoOrMs).getTime()
  if (!Number.isFinite(t)) return null
  return Math.floor((Date.now() - t) / 86_400_000)
}

export function openInObsidian(vaultDir: string, relPath: string) {
  // Obsidian URI: obsidian://open?path=...
  const full = `${vaultDir.replace(/\/$/, '')}/${relPath}`
  const url = `obsidian://open?path=${encodeURIComponent(full)}`
  window.open(url, '_blank')
}
