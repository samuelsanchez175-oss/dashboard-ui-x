import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Flame,
  FolderOpen,
  ListChecks,
  MessagesSquare,
  RefreshCw,
  Sunrise,
  Undo2,
  X,
  Play,
  Terminal,
  FileText,
  PlusCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { LoadingState } from '../../components/ui/states'
import Button from '../../components/ui/Button'
import ZoneHeader from '../../components/ZoneHeader'
import { CONTAINERS } from '../../lib/design-tokens'

/**
 * Daily Brief zone — the morning command center. Rendered from the snapshot the
 * Obsidian vault routine (OB CLAUDE vault, launchd @ 7:00) bakes into
 * `public/data/daily-brief.json` via `dashboard-ui/build.py`. This zone only
 * consumes; it never re-derives.
 *
 * Interactive state (notification, dismissed tools/handoffs, plan checkboxes)
 * is keyed by brief date in localStorage — a fresh morning brief resets it.
 */

type BriefTool = { name: string; desc: string }
type BriefHandoff = { name: string; note: string }
type BriefTrack = { title: string; bpm: string; key: string; scale: string }
type BriefResurface = { name: string; note: string }
type PlanItem = { title: string; note: string; priority: string; done: boolean }

interface AiSession {
  title: string
  source: string
  project: string
  status: string
  updated: string
  started_with: string
  file: string
  obsidian_uri: string
  resume_prompt: string
}

interface Pipeline {
  last_run: string
  last_status: string
  model: string
  next_run: string
  streak: number
  chat_ingest: string
  chat_ingest_last: string
}

interface Delta {
  vs_date: string
  tools_added: string[]
  tools_removed: string[]
  handoffs_added: string[]
  handoffs_resolved: string[]
  counts_changed: Record<string, number>
}

interface VaultInfo {
  name: string
  brief_file: string
  obsidian_uri: string
  generated_at: string
  counts: Record<string, number>
  recent_briefs: string[]
}

interface BriefWorkflow {
  name: string
  activation_tools: string[]
  used_with: string[]
  steps: string[]
  file: string
  obsidian_uri: string
}

interface BriefJson {
  date: string
  active_project: string
  synthesis: string[]
  plan?: PlanItem[]
  tools: BriefTool[]
  tracks: BriefTrack[]
  handoffs: BriefHandoff[]
  resurface: BriefResurface[]
  vault?: VaultInfo
  ai_sessions?: AiSession[]
  pipeline?: Pipeline
  delta?: Delta | null
  workflows?: BriefWorkflow[]
}

const DATA_URL = '/data/daily-brief.json'
const NOTIF_KEY = 'daily-brief:notif-dismissed'
const DISMISS_PREFIX = 'daily-brief:dismissed:'
const PLAN_PREFIX = 'daily-brief:plan:'

type Dismissed = { tools: string[]; handoffs: string[] }
const EMPTY_DISMISSED: Dismissed = { tools: [], handoffs: [] }

function lsGetJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function lsSetJson(key: string, value: unknown, sweepPrefix?: string) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    if (sweepPrefix) {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i)
        if (k && k.startsWith(sweepPrefix) && k !== key) localStorage.removeItem(k)
      }
    }
  } catch {
    /* private mode — state just won't persist */
  }
}

function loadDismissed(date: string): Dismissed {
  const parsed = lsGetJson<Partial<Dismissed>>(DISMISS_PREFIX + date, {})
  return {
    tools: Array.isArray(parsed.tools) ? parsed.tools : [],
    handoffs: Array.isArray(parsed.handoffs) ? parsed.handoffs : [],
  }
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso || '—'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso || '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function initials(name: string): string {
  const parts = name.split(/[\s\-—]+/).filter(Boolean)
  if (parts.length === 0) return '•'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

const SOURCE_BADGE: Record<string, string> = {
  claude: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25',
  'claude-code': 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25',
  antigravity: 'bg-violet-500/10 text-violet-600 border-violet-500/25',
  gemini: 'bg-sky-500/10 text-sky-600 border-sky-500/25',
}

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-rose-500',
  med: 'bg-amber-500',
  low: 'bg-sky-500',
}



function RestoreLine({ count, onRestore }: { count: number; onRestore: () => void }) {
  if (count === 0) return null
  return (
    <button
      type="button"
      onClick={onRestore}
      className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium underline underline-offset-2 opacity-80 hover:opacity-100"
      style={{ color: 'var(--text-3)' }}
    >
      <Undo2 className="size-3.5" aria-hidden />
      {count} dismissed — restore
    </button>
  )
}

function SectionCard({
  title,
  count,
  right,
  children,
}: {
  title: string
  count?: number
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section
      className="rounded-2xl border p-5 sm:p-6"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-soft)' }}
    >
      <div className="mb-4 flex items-center gap-2">
        <h2
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--text-3)' }}
        >
          {title}
        </h2>
        {right}
        {count != null ? (
          <span className="ml-auto rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
            {count}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function StatTile({
  icon,
  value,
  label,
  accent,
}: {
  icon: React.ReactNode
  value: React.ReactNode
  label: string
  accent?: boolean
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl border px-4 py-3.5"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-soft)' }}
    >
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-xl ${
          accent ? 'bg-emerald-500/15 text-emerald-600' : 'bg-emerald-500/10 text-emerald-600'
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>
          {value}
        </span>
        <span className="block text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
          {label}
        </span>
      </span>
    </div>
  )
}

const VAULT_COUNT_LABELS: [string, string][] = [
  ['briefs', 'briefs'],
  ['clippings', 'clippings'],
  ['tools', 'tool notes'],
  ['handoffs', 'handoffs'],
  ['tracks', 'tracks'],
]

export default function DailyBriefZone() {
  const [data, setData] = useState<BriefJson | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState<Dismissed>(EMPTY_DISMISSED)
  const [notifDismissed, setNotifDismissed] = useState(true)
  const [planDone, setPlanDone] = useState<string[]>([])
  const [copiedFile, setCopiedFile] = useState<string | null>(null)
  const copyTimer = useRef<number | undefined>(undefined)

  // Local Dev Controls State — vault scripts only exist on the host Mac.
  const [isLocalHost] = useState<boolean>(() => {
    try {
      const h = window.location.hostname
      return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost')
    } catch {
      return false
    }
  })
  const [workflowSearch, setWorkflowSearch] = useState('')
  const [runningAction, setRunningAction] = useState<string | null>(null)
  const [actionLogs, setActionLogs] = useState<string>('')
  const [showLogConsole, setShowLogConsole] = useState(false)
  const [activeLogType, setActiveLogType] = useState<'brief' | 'ingest' | 'action' | null>(null)

  // Handoff Form State
  const [showHandoffForm, setShowHandoffForm] = useState(false)
  const [handoffProject, setHandoffProject] = useState('general')
  const [handoffSource, setHandoffSource] = useState('manual')
  const [handoffContent, setHandoffContent] = useState('')
  const [handoffSubmitting, setHandoffSubmitting] = useState(false)
  const [handoffStatusMsg, setHandoffStatusMsg] = useState('')

  // Handoff File Viewer State
  const [viewingFile, setViewingFile] = useState<{ path: string; title: string } | null>(null)
  const [viewingFileContent, setViewingFileContent] = useState<string>('')
  const [viewingFileLoading, setViewingFileLoading] = useState(false)

  const runLocalAction = async (action: 'generate' | 'ingest' | 'build') => {
    const url = action === 'generate' 
      ? '/api/local/brief/generate' 
      : action === 'ingest' 
        ? '/api/local/chat-ingest/run'
        : '/api/local/brief/build'
    
    setRunningAction(action)
    setActionLogs(`Running ${action}... Please wait.`)
    setShowLogConsole(true)
    setActiveLogType('action')

    try {
      const res = await fetch(url, { method: 'POST' })
      const json = await res.json()
      if (res.ok && json.ok) {
        setActionLogs(`[SUCCESS] Output:\n${json.stdout || ''}\n${json.stderr || ''}`)
        void load()
      } else {
        setActionLogs(`[ERROR] ${json.error || 'Failed'}:\n${json.stderr || ''}\n${json.stdout || ''}`)
      }
    } catch (err: unknown) {
      setActionLogs(`[NETWORK ERROR] ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setRunningAction(null)
    }
  }

  const fetchLocalLogs = async (type: 'brief' | 'ingest') => {
    setShowLogConsole(true)
    setActiveLogType(type)
    setActionLogs('Fetching logs...')
    try {
      const res = await fetch(`/api/local/vault/logs?type=${type}`)
      const json = await res.json()
      if (res.ok && json.ok) {
        setActionLogs(json.logs || '(Empty)')
      } else {
        setActionLogs(`[ERROR] Failed to load logs: ${json.message || 'Unknown error'}`)
      }
    } catch (err: unknown) {
      setActionLogs(`[NETWORK ERROR] ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const submitHandoff = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!handoffContent.trim()) {
      setHandoffStatusMsg('Please write some content first.')
      return
    }
    setHandoffSubmitting(true)
    setHandoffStatusMsg('Writing handoff file to vault...')
    try {
      const res = await fetch('/api/local/vault/write-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: handoffProject,
          source: handoffSource,
          content: handoffContent.trim()
        })
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        setHandoffStatusMsg(`Successfully wrote handoff note: ${json.filename}!`)
        setHandoffContent('')
        void runLocalAction('ingest')
      } else {
        setHandoffStatusMsg(`Error: ${json.message || 'Write failed'}`)
      }
    } catch (err: unknown) {
      setHandoffStatusMsg(`Network error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setHandoffSubmitting(false)
    }
  }

  const viewHandoffFile = async (filePath: string, title: string) => {
    setViewingFile({ path: filePath, title })
    setViewingFileContent('Loading file content...')
    setViewingFileLoading(true)
    try {
      const res = await fetch(`/api/local/vault/file?path=${encodeURIComponent(filePath)}`)
      if (res.ok) {
        const text = await res.text()
        setViewingFileContent(text)
      } else {
        const json = await res.json()
        setViewingFileContent(`Error loading file: ${json.message || 'Not found'}`)
      }
    } catch (err: unknown) {
      setViewingFileContent(`Network error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setViewingFileLoading(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as BriefJson
      setData(json)
      setDismissed(loadDismissed(json.date))
      const mdDone = (json.plan ?? []).filter(p => p.done).map(p => p.title)
      const localDone = lsGetJson<string[]>(PLAN_PREFIX + json.date, [])
      setPlanDone([...new Set([...mdDone, ...localDone])])
      try {
        setNotifDismissed(localStorage.getItem(NOTIF_KEY) === json.date)
      } catch {
        setNotifDismissed(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load brief')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return () => window.clearTimeout(copyTimer.current)
  }, [load])

  /**
   * The Refresh button. On the vault Mac (localhost) it re-runs the pipeline —
   * regenerate the brief from the vault, rebuild the dashboard snapshot — then
   * reloads the page data. Off-localhost (e.g. Vercel) it just re-fetches.
   */
  const deepRefresh = useCallback(async () => {
    if (!isLocalHost) {
      await load()
      return
    }
    setLoading(true)
    setShowLogConsole(true)
    setActiveLogType('action')
    setActionLogs('① Regenerating the daily brief from the vault…')
    try {
      const g = await fetch('/api/local/brief/generate', { method: 'POST' })
        .then(r => r.json())
        .catch(() => ({ ok: false }))
      const gMsg = g?.ok ? '✓ brief regenerated' : '⚠ brief regen skipped/failed'
      setActionLogs(`${gMsg}\n② Rebuilding the dashboard snapshot…`)
      const b = await fetch('/api/local/brief/build', { method: 'POST' })
        .then(r => r.json())
        .catch(() => ({ ok: false }))
      const bMsg = b?.ok ? '✓ snapshot rebuilt' : '⚠ snapshot rebuild skipped/failed'
      setActionLogs(`${gMsg}\n${bMsg}\n③ Reloading…`)
    } catch (err) {
      setActionLogs(`[ERROR] ${err instanceof Error ? err.message : 'refresh failed'}`)
    }
    await load()
  }, [isLocalHost, load])

  const dismissNotif = () => {
    setNotifDismissed(true)
    try {
      if (data) localStorage.setItem(NOTIF_KEY, data.date)
    } catch {
      /* fine */
    }
  }

  const updateDismissed = (next: Dismissed) => {
    setDismissed(next)
    if (data) lsSetJson(DISMISS_PREFIX + data.date, next, DISMISS_PREFIX)
  }

  /** Best-effort write to the vault so a dismissal is "saved as seen" there too (localhost only). */
  const saveSeenToVault = (endpoint: string, body: unknown) => {
    if (!isLocalHost) return
    void fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => { /* vault write is local-only; off-localhost it just stays a local dismiss */ })
  }

  const dismissTool = (name: string) => {
    updateDismissed({ ...dismissed, tools: [...dismissed.tools, name] }) // hide for today, immediately
    saveSeenToVault('/api/local/vault/dismiss-tool', { path: name, familiar: true }) // mark seen in the vault
  }
  const dismissHandoff = (name: string) => {
    updateDismissed({ ...dismissed, handoffs: [...dismissed.handoffs, name] })
    saveSeenToVault('/api/local/vault/resolve-handoff', { path: `🤝 Handoffs/${name}.md` })
  }
  const restoreTools = () => updateDismissed({ ...dismissed, tools: [] })
  const restoreHandoffs = () => updateDismissed({ ...dismissed, handoffs: [] })

  const togglePlan = (title: string) => {
    const next = planDone.includes(title)
      ? planDone.filter(t => t !== title)
      : [...planDone, title]
    setPlanDone(next)
    if (data) lsSetJson(PLAN_PREFIX + data.date, next, PLAN_PREFIX)
  }

  const copyResume = async (s: AiSession) => {
    try {
      await navigator.clipboard.writeText(s.resume_prompt)
      setCopiedFile(s.file)
      window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopiedFile(null), 1600)
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  const visibleTools = data ? data.tools.filter(t => !dismissed.tools.includes(t.name)) : []
  const visibleHandoffs = data ? data.handoffs.filter(h => !dismissed.handoffs.includes(h.name)) : []
  const filteredWorkflows = (data?.workflows || []).filter(w => {
    const term = workflowSearch.toLowerCase()
    return (
      w.name.toLowerCase().includes(term) ||
      (w.steps || []).some(s => s.toLowerCase().includes(term)) ||
      (w.activation_tools || []).some(t => t.toLowerCase().includes(term)) ||
      (w.used_with || []).some(t => t.toLowerCase().includes(term))
    )
  })
  const plan = data?.plan ?? []
  const planDoneCount = plan.filter(p => planDone.includes(p.title)).length
  const pipe = data?.pipeline
  const sessions = data?.ai_sessions ?? []
  const delta = data?.delta
  const deltaHasContent = !!delta && (
    delta.tools_added.length > 0 || delta.tools_removed.length > 0 ||
    delta.handoffs_added.length > 0 || delta.handoffs_resolved.length > 0 ||
    Object.keys(delta.counts_changed).length > 0
  )

  return (
    <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}>
      <div className={`${CONTAINERS.narrow} py-8 space-y-5`}>
        <ZoneHeader
          title="Daily Brief"
          icon={Sunrise}
          description={
            data ? (
              <>
                {formatDate(data.date)} · focus{' '}
                <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
                  {data.active_project}
                </span>
              </>
            ) : (
              'Synthesized every morning at 7:00 from the Obsidian vault — plan, tools, handoffs, and tracks for the active project.'
            )
          }
          actions={
            <Button
              variant="secondary"
              onClick={() => void deepRefresh()}
              disabled={loading}
              leading={<RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />}
              title={isLocalHost ? 'Re-run the vault brief scripts, then reload' : 'Reload the latest brief snapshot'}
            >
              Refresh
            </Button>
          }
        />

        {loading && !data ? <LoadingState label="Loading brief…" /> : null}

        {error && !data ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-medium">No brief snapshot found</p>
            <p className="mt-1 text-amber-800/90">
              Run <code className="rounded bg-amber-100/80 px-1">python3 build.py</code> in the vault&apos;s{' '}
              <code className="rounded bg-amber-100/80 px-1">dashboard-ui/</code> folder to sync{' '}
              <code className="rounded bg-amber-100/80 px-1">public/data/daily-brief.json</code>, then redeploy. ({error})
            </p>
          </div>
        ) : null}

        {data ? (
          <>
            {/* Morning notification — dismiss persists until the next brief lands */}
            {!notifDismissed ? (
              <div
                className="flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3"
                role="status"
              >
                <Sunrise className="size-4 shrink-0 text-emerald-600" aria-hidden />
                <p className="min-w-0 text-sm" style={{ color: 'var(--text-1)' }}>
                  <span className="font-semibold">Fresh brief</span> for {formatDate(data.date)} — focus{' '}
                  <span className="font-semibold text-emerald-600">{data.active_project}</span>. Next update
                  tomorrow at 7:00 AM.
                </p>
                <button
                  type="button"
                  aria-label="Dismiss notification"
                  title="Dismiss notification"
                  onClick={dismissNotif}
                  className="ml-auto shrink-0 rounded-md p-1.5 text-emerald-600 opacity-70 transition-opacity hover:opacity-100 hover:bg-emerald-500/15"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ) : null}

            {/* Pipeline strip — the cron machinery, visible */}
            {pipe ? (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile
                  icon={<Flame className="size-4" aria-hidden />}
                  value={`${pipe.streak} day${pipe.streak === 1 ? '' : 's'}`}
                  label="Brief streak"
                  accent={pipe.streak >= 2}
                />
                <StatTile
                  icon={
                    <span
                      className={`size-2.5 rounded-full ${
                        pipe.last_status === 'ok'
                          ? 'bg-emerald-500'
                          : pipe.last_status === 'running'
                            ? 'animate-pulse bg-amber-500'
                            : 'bg-rose-500'
                      }`}
                      aria-hidden
                    />
                  }
                  value={pipe.last_run ? pipe.last_run.slice(0, 16) : 'never'}
                  label={`Last run · ${pipe.last_status}`}
                />
                <StatTile
                  icon={<Clock className="size-4" aria-hidden />}
                  value={pipe.next_run}
                  label="Next brief"
                />
                <StatTile
                  icon={<MessagesSquare className="size-4" aria-hidden />}
                  value={pipe.chat_ingest}
                  label="Chat ingest"
                />
              </div>
            ) : null}

            {/* Developer Console — dev/localhost only */}
            {isLocalHost ? (
              <section
                className="rounded-2xl border p-5 sm:p-6"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border-soft)' }}
              >
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <Terminal className="size-4 text-emerald-600" aria-hidden />
                  <h2
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text-3)' }}
                  >
                    Dev Automation Console
                  </h2>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="secondary"
                    disabled={runningAction !== null}
                    onClick={() => runLocalAction('ingest')}
                    leading={<RefreshCw className={`size-3.5 ${runningAction === 'ingest' ? 'animate-spin' : ''}`} />}
                  >
                    Sync Chat Ingest
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={runningAction !== null}
                    onClick={() => runLocalAction('generate')}
                    leading={<Play className={`size-3.5 ${runningAction === 'generate' ? 'animate-spin' : ''}`} />}
                  >
                    Regenerate Daily Brief
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={runningAction !== null}
                    onClick={() => runLocalAction('build')}
                    leading={<RefreshCw className={`size-3.5 ${runningAction === 'build' ? 'animate-spin' : ''}`} />}
                  >
                    Rebuild Dashboard JSON
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => fetchLocalLogs('brief')}
                    leading={<FileText className="size-3.5" />}
                  >
                    Brief Logs
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => fetchLocalLogs('ingest')}
                    leading={<FileText className="size-3.5" />}
                  >
                    Ingest Logs
                  </Button>
                </div>

                {/* Collapsible log view */}
                {showLogConsole && (
                  <div className="mt-4 rounded-xl border p-4 font-mono text-xs overflow-auto max-h-60 relative"
                       style={{ background: '#121214', borderColor: 'var(--border-soft)', color: '#a9b1d6' }}>
                    <button
                      onClick={() => setShowLogConsole(false)}
                      className="absolute top-2 right-2 p-1 rounded hover:bg-white/10"
                      style={{ color: 'var(--text-3)' }}
                    >
                      <X className="size-3.5" />
                    </button>
                    <div className="mb-2 border-b pb-1 font-semibold flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                      <span>Console Logs ({activeLogType === 'action' ? 'Command Output' : activeLogType === 'brief' ? 'brief run.log' : 'ingest.log'})</span>
                    </div>
                    <pre className="whitespace-pre-wrap leading-relaxed">{actionLogs}</pre>
                  </div>
                )}
              </section>
            ) : null}

            {/* Synthesis */}
            <section
              className="rounded-2xl border p-6 sm:p-7"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border-soft)' }}
            >
              <h2
                className="mb-3 text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-3)' }}
              >
                Today’s synthesis
              </h2>
              <div className="space-y-3 text-[17px] leading-relaxed" style={{ color: 'var(--text-1)' }}>
                {data.synthesis.length > 0 ? (
                  data.synthesis.map((p, i) => <p key={i}>{p}</p>)
                ) : (
                  <p className="text-sm italic" style={{ color: 'var(--text-3)' }}>
                    No synthesis yet — run the brief routine.
                  </p>
                )}
              </div>
            </section>

            {/* Today's Plan — the interactive part: check things off as you go */}
            {plan.length > 0 ? (
              <SectionCard
                title="Today’s plan"
                right={
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                    <ListChecks className="size-3.5" aria-hidden />
                    {planDoneCount}/{plan.length} done
                  </span>
                }
              >
                <div
                  className="mb-4 h-1.5 overflow-hidden rounded-full"
                  style={{ background: 'var(--bg-muted)' }}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={plan.length}
                  aria-valuenow={planDoneCount}
                >
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${plan.length ? (planDoneCount / plan.length) * 100 : 0}%` }}
                  />
                </div>
                <ul className="space-y-1">
                  {plan.map(item => {
                    const done = planDone.includes(item.title)
                    return (
                      <li key={item.title}>
                        <button
                          type="button"
                          onClick={() => togglePlan(item.title)}
                          aria-pressed={done}
                          className="flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition-colors hover:[background:var(--bg-muted)]"
                        >
                          <span
                            className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors ${
                              done ? 'border-emerald-500 bg-emerald-500 text-white' : ''
                            }`}
                            style={done ? undefined : { borderColor: 'var(--border)' }}
                            aria-hidden
                          >
                            {done ? <Check className="size-3.5" /> : null}
                          </span>
                          <span className="min-w-0">
                            <span
                              className={`block text-sm font-semibold ${done ? 'line-through opacity-50' : ''}`}
                              style={{ color: 'var(--text-1)' }}
                            >
                              {item.title}
                            </span>
                            {item.note ? (
                              <span
                                className={`block text-xs leading-relaxed ${done ? 'line-through opacity-40' : ''}`}
                                style={{ color: 'var(--text-3)' }}
                              >
                                {item.note}
                              </span>
                            ) : null}
                          </span>
                          <span
                            className={`ml-auto mt-1.5 size-2 shrink-0 rounded-full ${PRIORITY_DOT[item.priority] ?? PRIORITY_DOT.med} ${done ? 'opacity-30' : ''}`}
                            title={`priority: ${item.priority}`}
                            aria-label={`priority ${item.priority}`}
                          />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </SectionCard>
            ) : null}

            {/* Create Handoff Note Form */}
            {isLocalHost ? (
              <section
                className="rounded-2xl border p-5 sm:p-6"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border-soft)' }}
              >
                <button
                  type="button"
                  onClick={() => setShowHandoffForm(!showHandoffForm)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <span className="flex items-center gap-2">
                    <PlusCircle className="size-4 text-emerald-600" aria-hidden />
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                      Quick-submit Session Handoff
                    </span>
                  </span>
                  {showHandoffForm ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </button>

                {showHandoffForm && (
                  <form onSubmit={submitHandoff} className="mt-4 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-3)' }}>Project Taxonomy</label>
                        <select
                          value={handoffProject}
                          onChange={e => setHandoffProject(e.target.value)}
                          className="w-full rounded-lg border p-2 text-sm"
                          style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-card-soft)', color: 'var(--text-1)' }}
                        >
                          <option value="general">general (Fallback)</option>
                          <option value="XJournal AI">XJournal AI (Music/Rap)</option>
                          <option value="Polymarket Bot">Polymarket Bot</option>
                          <option value="CDL">CDL (Commercial Driving)</option>
                          <option value="AI Toolkit">AI Toolkit (Bases/MCP/Automation)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-3)' }}>Source Handoff Type</label>
                        <select
                          value={handoffSource}
                          onChange={e => setHandoffSource(e.target.value)}
                          className="w-full rounded-lg border p-2 text-sm"
                          style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-card-soft)', color: 'var(--text-1)' }}
                        >
                          <option value="manual">Manual Note</option>
                          <option value="antigravity">Antigravity Handoff</option>
                          <option value="gemini">Gemini Handoff</option>
                          <option value="claude">Claude Code Handoff</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-3)' }}>Handoff details (Started with, Left off, Next steps)</label>
                      <textarea
                        rows={6}
                        required
                        value={handoffContent}
                        onChange={e => setHandoffContent(e.target.value)}
                        placeholder="Provide details about where you left off, uncommitted work, and resume prompt details..."
                        className="w-full rounded-lg border p-3 text-sm font-mono"
                        style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-card-soft)', color: 'var(--text-1)' }}
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <Button type="submit" disabled={handoffSubmitting} variant="primary">
                        {handoffSubmitting ? 'Writing file...' : 'Submit to Handoffs Folder'}
                      </Button>
                      {handoffStatusMsg && (
                        <span className="text-xs font-medium text-emerald-600">{handoffStatusMsg}</span>
                      )}
                    </div>
                  </form>
                )}
              </section>
            ) : null}

            {/* Tools + Handoffs — each row dismissible for today's brief */}
            <div className="grid gap-5 md:grid-cols-2">
              <SectionCard title="Today’s tools" count={visibleTools.length}>
                <ul className="space-y-1">
                  {visibleTools.length > 0 ? (
                    visibleTools.map(t => (
                      <li
                        key={t.name}
                        className="group flex items-start gap-3 rounded-xl p-2.5 transition-colors hover:[background:var(--bg-muted)]"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-xs font-semibold text-emerald-600">
                          {initials(t.name)}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                            {t.name}
                          </span>
                          <span className="block text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
                            {t.desc}
                          </span>
                        </span>
                        <div className="ml-auto shrink-0 self-start flex items-center gap-1 opacity-60 transition-opacity hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-60 sm:focus-within:opacity-100">
                          <button
                            type="button"
                            title="Dismiss for today (local)"
                            aria-label={`Dismiss ${t.name}`}
                            onClick={() => dismissTool(t.name)}
                            className="rounded-md p-1.5 hover:[background:var(--bg-muted)] transition-colors"
                            style={{ color: 'var(--text-3)' }}
                          >
                            <X className="size-3.5" aria-hidden />
                          </button>
                        </div>
                      </li>
                    ))
                  ) : (
                    <li className="text-sm italic" style={{ color: 'var(--text-3)' }}>
                      {data.tools.length > 0 ? 'All tools dismissed for today.' : 'No tools surfaced.'}
                    </li>
                  )}
                </ul>
                <RestoreLine count={dismissed.tools.length} onRestore={restoreTools} />
              </SectionCard>

              <SectionCard title="Pending handoffs" count={visibleHandoffs.length}>
                <ul className="space-y-1">
                  {visibleHandoffs.length > 0 ? (
                    visibleHandoffs.map(h => (
                      <li
                        key={h.name}
                        className="group flex items-start gap-3 rounded-xl p-2.5 transition-colors hover:[background:var(--bg-muted)]"
                      >
                        <span className="mt-0.5 shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600">
                          open
                        </span>
                        <span className="min-w-0">
                          <span
                            className="block text-sm font-semibold cursor-pointer hover:underline"
                            style={{ color: 'var(--text-1)' }}
                            onClick={() => viewHandoffFile(`🤝 Handoffs/${h.name}.md`, h.name)}
                          >
                            {h.name}
                          </span>
                          <span className="block text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
                            {h.note}
                          </span>
                        </span>
                        <div className="ml-auto shrink-0 self-start flex items-center gap-1 opacity-60 transition-opacity hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-60 sm:focus-within:opacity-100">
                          <button
                            type="button"
                            title="Dismiss for today (local)"
                            aria-label={`Dismiss ${h.name}`}
                            onClick={() => dismissHandoff(h.name)}
                            className="rounded-md p-1.5 hover:[background:var(--bg-muted)] transition-colors"
                            style={{ color: 'var(--text-3)' }}
                          >
                            <X className="size-3.5" aria-hidden />
                          </button>
                        </div>
                      </li>
                    ))
                  ) : (
                    <li className="text-sm italic" style={{ color: 'var(--text-3)' }}>
                      {data.handoffs.length > 0 ? 'All handoffs dismissed for today.' : 'No open handoffs.'}
                    </li>
                  )}
                </ul>
                <RestoreLine count={dismissed.handoffs.length} onRestore={restoreHandoffs} />
              </SectionCard>
            </div>

            {/* AI Sessions — Claude Code auto-ingest + Antigravity handoff notes */}
            {sessions.length > 0 ? (
              <SectionCard title="AI sessions" count={sessions.length}>
                <ul className="space-y-1.5">
                  {sessions.map(s => (
                    <li
                      key={s.file}
                      className="group flex flex-wrap items-start gap-3 rounded-xl border px-3.5 py-3 sm:flex-nowrap"
                      style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-card-soft)' }}
                    >
                      <span
                        className={`mt-0.5 shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                          SOURCE_BADGE[s.source] ?? 'opacity-70'
                        }`}
                        style={SOURCE_BADGE[s.source] ? undefined : { borderColor: 'var(--border-soft)', color: 'var(--text-2)' }}
                      >
                        {s.source}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span
                            className="text-sm font-semibold cursor-pointer hover:underline"
                            style={{ color: 'var(--text-1)' }}
                            onClick={() => viewHandoffFile(s.file, s.title)}
                          >
                            {s.title}
                          </span>
                          <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-4)' }}>
                            {shortDate(s.updated)}
                          </span>
                        </span>
                        {s.started_with ? (
                          <span className="block text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
                            {s.started_with}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void copyResume(s)}
                          title="Copy a resume prompt for this session"
                          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors hover:[background:var(--bg-muted)]"
                          style={{ borderColor: 'var(--border-soft)', color: copiedFile === s.file ? undefined : 'var(--text-1)' }}
                        >
                          {copiedFile === s.file ? (
                            <>
                              <Check className="size-3.5 text-emerald-600" aria-hidden />
                              <span className="text-emerald-600">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="size-3.5" aria-hidden />
                              Resume
                            </>
                          )}
                        </button>
                        <a
                          href={s.obsidian_uri}
                          title="Open the handoff note in Obsidian (on the vault Mac)"
                          className="rounded-lg border p-1.5 transition-colors hover:[background:var(--bg-muted)]"
                          style={{ borderColor: 'var(--border-soft)', color: 'var(--text-3)' }}
                        >
                          <ExternalLink className="size-3.5" aria-hidden />
                        </a>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs" style={{ color: 'var(--text-4)' }}>
                  Claude Code sessions auto-ingest every 2h · Antigravity/Gemini sessions join by writing a
                  handoff note — see <code className="rounded px-1" style={{ background: 'var(--bg-muted)' }}>automation/chat-ingest/ANTIGRAVITY.md</code>
                </p>
              </SectionCard>
            ) : null}

            {/* Since yesterday — the daily pulse */}
            {delta ? (
              <SectionCard
                title={`Since ${shortDate(delta.vs_date)}`}
                right={<Activity className="size-3.5 text-emerald-600" aria-hidden />}
              >
                {deltaHasContent ? (
                  <div className="flex flex-wrap gap-2">
                    {delta.handoffs_resolved.map(n => (
                      <span key={`hr-${n}`} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600">
                        <Check className="size-3" aria-hidden /> {n} resolved
                      </span>
                    ))}
                    {delta.handoffs_added.map(n => (
                      <span key={`ha-${n}`} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium" style={{ borderColor: 'var(--border-soft)', color: 'var(--text-2)' }}>
                        + {n}
                      </span>
                    ))}
                    {delta.tools_added.map(n => (
                      <span key={`ta-${n}`} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium" style={{ borderColor: 'var(--border-soft)', color: 'var(--text-2)' }}>
                        + {n} <span style={{ color: 'var(--text-4)' }}>(tool)</span>
                      </span>
                    ))}
                    {delta.tools_removed.map(n => (
                      <span key={`tr-${n}`} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium line-through opacity-60" style={{ borderColor: 'var(--border-soft)', color: 'var(--text-3)' }}>
                        {n}
                      </span>
                    ))}
                    {Object.entries(delta.counts_changed).map(([k, v]) => (
                      <span
                        key={`c-${k}`}
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tabular-nums ${
                          v > 0 ? 'bg-emerald-500/10 text-emerald-600' : 'border opacity-70'
                        }`}
                        style={v > 0 ? undefined : { borderColor: 'var(--border-soft)', color: 'var(--text-2)' }}
                      >
                        {v > 0 ? `+${v}` : v} {k}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm italic" style={{ color: 'var(--text-3)' }}>
                    Steady state — nothing changed since the last brief.
                  </p>
                )}
              </SectionCard>
            ) : null}

            {/* Tracks */}
            <SectionCard title="Recent tracks" count={data.tracks.length}>
              <ul className="space-y-2">
                {data.tracks.length > 0 ? (
                  data.tracks.map(t => (
                    <li
                      key={t.title}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
                      style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-card-soft)' }}
                    >
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                        {t.title}
                      </span>
                      <span className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-emerald-600">
                          {t.bpm} BPM
                        </span>
                        <span
                          className="rounded-full border px-2.5 py-0.5 text-xs tabular-nums"
                          style={{ borderColor: 'var(--border-soft)', color: 'var(--text-2)' }}
                        >
                          {t.key}
                        </span>
                        <span
                          className="rounded-full border px-2.5 py-0.5 text-xs"
                          style={{ borderColor: 'var(--border-soft)', color: 'var(--text-2)' }}
                        >
                          {t.scale}
                        </span>
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="text-sm italic" style={{ color: 'var(--text-3)' }}>
                    No tracks synced yet — wire the YouTube playlist into media-sync.
                  </li>
                )}
              </ul>
            </SectionCard>

            {/* Workflows & Orchestrations */}
            {data.workflows && data.workflows.length > 0 ? (
              <SectionCard title="Workflows & Orchestrations" count={filteredWorkflows.length}>
                <div className="mb-4">
                  <input
                    type="text"
                    placeholder="Search workflows, tools, or steps..."
                    value={workflowSearch}
                    onChange={e => setWorkflowSearch(e.target.value)}
                    className="w-full sm:w-80 rounded-lg border p-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-card-soft)', color: 'var(--text-1)' }}
                  />
                </div>
                {filteredWorkflows.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {filteredWorkflows.map(w => (
                      <div
                        key={w.name}
                        className="rounded-xl border p-4 flex flex-col justify-between transition-all hover:border-emerald-500/50"
                        style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-card-soft)' }}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h3 className="text-sm font-semibold leading-snug" style={{ color: 'var(--text-1)' }}>
                              {w.name}
                            </h3>
                            <a
                              href={w.obsidian_uri}
                              title="Open workflow note in Obsidian"
                              className="rounded-lg border p-1 transition-colors hover:[background:var(--bg-muted)] shrink-0"
                              style={{ borderColor: 'var(--border-soft)', color: 'var(--text-3)' }}
                            >
                              <ExternalLink className="size-3" aria-hidden />
                            </a>
                          </div>

                          {/* Connections / Tags */}
                          <div className="flex flex-wrap gap-1 mb-2">
                            {w.activation_tools.map(tool => (
                              <span
                                key={`act-${tool}`}
                                className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 border border-emerald-500/20"
                                title="Activation tool (input)"
                              >
                                Input: {tool}
                              </span>
                            ))}
                            {w.used_with.map(tool => (
                              <span
                                key={`with-${tool}`}
                                className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-600 border border-blue-500/20"
                                title="Used in tandem with"
                              >
                                Co-tool: {tool}
                              </span>
                            ))}
                          </div>

                          {/* Step-by-step pipeline */}
                          {w.steps.length > 0 ? (
                            <div className="mt-3 space-y-2 border-t pt-3" style={{ borderColor: 'var(--border-soft)' }}>
                              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>
                                Sequence Pipeline
                              </p>
                              <ol className="space-y-2 text-xs">
                                {w.steps.map((step, idx) => (
                                  <li key={idx} className="flex gap-2" style={{ color: 'var(--text-2)' }}>
                                    <span className="font-semibold text-emerald-600 tabular-nums shrink-0">{idx + 1}.</span>
                                    <span className="leading-relaxed">{step}</span>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          ) : (
                            <p className="text-xs italic mt-2" style={{ color: 'var(--text-4)' }}>
                              Tandem relationships tagged, no step sequence documented.
                            </p>
                          )}
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t pt-2.5 text-[10px]" style={{ borderColor: 'var(--border-soft)', color: 'var(--text-4)' }}>
                          <span>{w.file.split('/').pop()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm italic" style={{ color: 'var(--text-3)' }}>
                    No workflows match your search term.
                  </p>
                )}
              </SectionCard>
            ) : null}

            {/* Resurface */}
            {data.resurface.length > 0 ? (
              <SectionCard title="Worth resurfacing">
                <ul className="space-y-1">
                  {data.resurface.map(r => (
                    <li key={r.name} className="flex items-start gap-3 rounded-xl p-2.5">
                      <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                          {r.name}
                        </span>
                        <span className="block text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
                          {r.note}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            ) : null}

            {/* From the Vault — OB CLAUDE vault stats + deep links */}
            {data.vault ? (
              <section
                className="rounded-2xl border p-5 sm:p-6"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border-soft)' }}
              >
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <FolderOpen className="size-4 text-emerald-600" aria-hidden />
                  <h2
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text-3)' }}
                  >
                    From the vault · {data.vault.name}
                  </h2>
                  <a
                    href={data.vault.obsidian_uri}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:[background:var(--bg-muted)]"
                    style={{ borderColor: 'var(--border-soft)', color: 'var(--text-1)' }}
                    title="Opens today's brief in Obsidian (on the Mac that hosts the vault)"
                  >
                    <ExternalLink className="size-3.5" aria-hidden />
                    Open in Obsidian
                  </a>
                </div>

                <div className="flex flex-wrap gap-2">
                  {VAULT_COUNT_LABELS.map(([key, label]) =>
                    data.vault && data.vault.counts[key] != null ? (
                      <span
                        key={key}
                        className="rounded-full border px-3 py-1 text-xs tabular-nums"
                        style={{ borderColor: 'var(--border-soft)', color: 'var(--text-2)' }}
                      >
                        <span className="font-semibold" style={{ color: 'var(--text-1)' }}>
                          {data.vault.counts[key]}
                        </span>{' '}
                        {label}
                      </span>
                    ) : null,
                  )}
                </div>

                {data.vault.recent_briefs.length > 0 ? (
                  <div className="mt-4">
                    <p className="mb-1.5 text-xs font-medium" style={{ color: 'var(--text-3)' }}>
                      Recent briefs
                    </p>
                    <ul className="space-y-1">
                      {data.vault.recent_briefs.map(b => (
                        <li
                          key={b}
                          className="flex items-center gap-2 text-sm tabular-nums"
                          style={{ color: 'var(--text-2)' }}
                        >
                          <span
                            className={`size-1.5 rounded-full ${b === data.date ? 'bg-emerald-500' : ''}`}
                            style={b === data.date ? undefined : { background: 'var(--border)' }}
                            aria-hidden
                          />
                          {formatDate(b)}
                          {b === data.date ? (
                            <span className="text-xs font-semibold text-emerald-600">today</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <p className="mt-4 text-xs" style={{ color: 'var(--text-4)' }}>
                  Snapshot generated {new Date(data.vault.generated_at).toLocaleString()} · brief note:{' '}
                  <code className="rounded px-1" style={{ background: 'var(--bg-muted)' }}>
                    {data.vault.brief_file}
                  </code>
                </p>
              </section>
            ) : null}

            <p className="px-1 text-xs" style={{ color: 'var(--text-4)' }}>
              Updated every morning at 7:00 by the vault routine · snapshot synced via{' '}
              <code className="rounded px-1" style={{ background: 'var(--bg-muted)' }}>
                dashboard-ui/build.py
              </code>{' '}
              · signal up, rules down
            </p>
          </>
        ) : null}
      </div>

      {/* Handoff File Viewer Modal */}
      {viewingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-3xl rounded-2xl border flex flex-col max-h-[85vh]"
               style={{ background: 'var(--bg-card)', borderColor: 'var(--border-soft)' }}>
            <div className="flex items-center justify-between border-b p-4 sm:p-5" style={{ borderColor: 'var(--border-soft)' }}>
              <h3 className="text-base font-bold truncate" style={{ color: 'var(--text-1)' }}>
                Viewing: {viewingFile.title}
              </h3>
              <button
                onClick={() => setViewingFile(null)}
                className="rounded-md p-1.5 hover:bg-white/10"
                style={{ color: 'var(--text-3)' }}
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-5 sm:p-6 overflow-auto flex-1 font-mono text-xs whitespace-pre-wrap leading-relaxed"
                 style={{ background: 'var(--bg-card-soft)', color: 'var(--text-2)' }}>
              {viewingFileLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="size-6 animate-spin text-emerald-600" />
                </div>
              ) : (
                viewingFileContent
              )}
            </div>
            <div className="border-t p-4 flex justify-end gap-2" style={{ borderColor: 'var(--border-soft)' }}>
              <a
                href={`obsidian://open?vault=OB%20CLAUDE%20vault&file=${encodeURIComponent(viewingFile.path.replace(/\.md$/, ''))}`}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:[background:var(--bg-muted)]"
                style={{ borderColor: 'var(--border-soft)', color: 'var(--text-1)' }}
              >
                <ExternalLink className="size-3.5" />
                Open in Obsidian
              </a>
              <Button variant="secondary" onClick={() => setViewingFile(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
