import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import UpdateDot from '../../components/ui/UpdateDot'
import {
  loadProjectOrder, saveProjectOrder, clearProjectOrder, mergeProjectOrder, moveIdBefore,
} from '../../lib/cpwProjectOrder'
import { fetchCheckoffs, upsertCheckoff } from '../../lib/checkoffStore'
import {
  Bot, Check, ChevronRight, Circle, Copy, FolderKanban, ListTodo, RefreshCw, UserRound, X,
} from 'lucide-react'

/* ── Shape of public/data/projects.json (Opus doc-audit; see scripts/build-projects.mjs) ── */
type ProjStatus = 'planning' | 'active' | 'blocked' | 'shipped' | 'idle'
type Owner = 'agent' | 'human'

/**
 * `id` / `isNew` / `addedAt` are stamped by scripts/build-projects-claude.mjs.
 * `isNew` living in the FILE (not just in a client-side before/after diff) is what lets
 * the badge survive a reload and still appear for tasks the weekly cron added overnight.
 */
interface RawTask {
  title: string; done: boolean; owner: Owner; command: string
  id?: string; isNew?: boolean; addedAt?: string
}
interface Task extends RawTask { id: string; isNew?: boolean }

/**
 * Key a task's check-off state.
 *
 * Snapshots from build-projects-claude.mjs carry a title-derived `id` that survives a
 * re-audit reordering its tasks. Older snapshots have no id, so fall back to the array
 * index — correct for them precisely because they are never re-generated.
 */
const taskKey = (projectId: string, task: RawTask, index: number): string =>
  task.id ?? `${projectId}-${index}`

/** Every task id in a snapshot — used to diff before/after a Refresh so new work stands out. */
function allTaskIds(payload: ProjectsPayload | null): Set<string> {
  const ids = new Set<string>()
  for (const p of payload?.projects ?? []) p.tasks.forEach((t, i) => ids.add(taskKey(p.id, t, i)))
  return ids
}

interface VProject {
  id:      string
  name:    string
  emoji:   string
  status:  ProjStatus
  accent:  string
  summary: string
  nextUp:  string
  tasks:   RawTask[]
}
interface ProjectsPayload { generatedAt?: string; source?: string; count: number; projects: VProject[] }

/** A project whose raw tasks have been given stable ids + effective (override-applied) done state. */
type EnrichedProject = Omit<VProject, 'tasks'> & { tasks: Task[] }

const STATUS_CONFIG: Record<ProjStatus, { label: string; color: string }> = {
  planning: { label: 'Planning', color: 'var(--text-4)' },
  active:   { label: 'Active',   color: 'var(--accent)' },
  blocked:  { label: 'Blocked',  color: 'var(--bad)'    },
  shipped:  { label: 'Shipped',  color: 'var(--good)'   },
  idle:     { label: 'Idle',     color: 'var(--text-4)' },
}

/** Owner colours, used everywhere ownership is shown: the bot (AI) is purple, your tasks are green. */
const C_AI = '#8b5cf6'    // bot → purple
const C_ME = '#22c55e'    // me  → green

/* Local check-off overrides — tick in the dashboard, sticks across reloads, on top of the snapshot. */
const DONE_KEY = 'projects:done-overrides-v1'
function loadOverrides(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(DONE_KEY) ?? '{}') as Record<string, boolean> } catch { return {} }
}
function saveOverrides(o: Record<string, boolean>): void {
  try { localStorage.setItem(DONE_KEY, JSON.stringify(o)) } catch { /* ignore quota */ }
}

function timeAgo(iso?: string): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return ''
  const m = Math.round(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

function StatusPill({ status }: { status: ProjStatus }) {
  const c = STATUS_CONFIG[status]
  return (
    <span className="mono text-[10px] font-semibold px-2 py-0.5 rounded"
      style={{ background: `color-mix(in oklab, ${c.color} 15%, transparent)`, color: c.color }}>
      {c.label}
    </span>
  )
}

function Progress({ done, total, accent }: { done: number; total: number; accent: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="mono text-[10px]" style={{ color: 'var(--text-4)' }}>TASKS</span>
        <span className="mono text-[10px]" style={{ color: 'var(--text-3)' }}>{done}/{total} done</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: accent }} />
      </div>
    </div>
  )
}

/* ── Project card ──────────────────────────────────────────────────────────────── */
function ProjectCard({ project, active, onClick, draggable, dragging, onDragStart, onDragEnd, onDropBefore }: {
  project: EnrichedProject
  active: boolean
  onClick: () => void
  draggable?: boolean
  dragging?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
  onDropBefore?: () => void
}) {
  const done = project.tasks.filter(t => t.done).length
  const agentOpen = project.tasks.filter(t => !t.done && t.owner === 'agent').length
  const humanOpen = project.tasks.filter(t => !t.done && t.owner === 'human').length
  const newOpen = project.tasks.filter(t => t.isNew && !t.done).length
  return (
    <button
      onClick={onClick}
      draggable={draggable}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.() }}
      onDragEnd={onDragEnd}
      onDragOver={e => { if (draggable) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
      onDrop={e => { if (draggable) { e.preventDefault(); e.stopPropagation(); onDropBefore?.() } }}
      className="zone-card text-left w-full transition-all hover:shadow-md flex flex-col gap-4"
      style={{ borderColor: active ? project.accent : 'var(--border)', opacity: dragging ? 0.5 : 1, cursor: draggable ? 'grab' : undefined }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = project.accent)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = active ? project.accent : 'var(--border)')}
    >
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl text-[18px] leading-none" style={{ background: `${project.accent}22` }} aria-hidden>
          {project.emoji || '📁'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold leading-tight truncate" style={{ color: 'var(--text-1)' }}>{project.name}</p>
          {project.summary && (
            <p className="mt-0.5 text-[11px] leading-snug line-clamp-2" style={{ color: 'var(--text-4)' }}>{project.summary}</p>
          )}
        </div>
        <ChevronRight size={14} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <StatusPill status={project.status} />
        {newOpen > 0 && (
          <span className="mono inline-flex items-center gap-1 whitespace-nowrap text-[10px] px-2 py-0.5 rounded"
            style={{ background: 'color-mix(in oklab, var(--accent) 18%, transparent)', color: 'var(--accent)' }}>
            {newOpen} new
          </span>
        )}
        {(agentOpen > 0 || humanOpen > 0) && (
          <div className="flex items-center gap-2">
            {agentOpen > 0 && (
              <span className="mono inline-flex items-center gap-1 whitespace-nowrap text-[10px] px-2 py-0.5 rounded"
                style={{ background: `color-mix(in oklab, ${C_AI} 16%, transparent)`, color: C_AI }}>
                <Bot size={11} /> {agentOpen} AI-doable
              </span>
            )}
            {humanOpen > 0 && (
              <span className="mono inline-flex items-center gap-1 whitespace-nowrap text-[10px] px-2 py-0.5 rounded"
                style={{ background: `color-mix(in oklab, ${C_ME} 16%, transparent)`, color: C_ME }}>
                <UserRound size={11} /> {humanOpen} you
              </span>
            )}
          </div>
        )}
      </div>

      <Progress done={done} total={project.tasks.length} accent={project.accent} />
    </button>
  )
}

/* ── A single task row (shared by the AI / You / Done sections) ─────────────────── */
function TaskRow({ task, onToggle, onCopy, copied }: {
  task: Task
  onToggle: (id: string) => void
  onCopy?: (id: string, text: string) => void
  copied?: boolean
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg px-2.5 py-2" style={{ background: 'var(--bg-muted)', opacity: task.done ? 0.55 : 1 }}>
      <button onClick={() => onToggle(task.id)} className="mt-px shrink-0" style={{ color: task.done ? 'var(--good)' : 'var(--text-4)' }}
        title={task.done ? 'Mark as not done' : 'Mark as done'}>
        {task.done ? <Check size={15} /> : <Circle size={15} />}
      </button>
      <span className="flex-1 text-[12px] leading-snug" style={{ color: 'var(--text-1)', textDecoration: task.done ? 'line-through' : 'none' }}>
        {task.title}
        {task.isNew && (
          <span className="mono ml-1.5 align-middle text-[9px] font-semibold px-1.5 py-0.5 rounded"
            style={{ background: 'color-mix(in oklab, var(--accent) 18%, transparent)', color: 'var(--accent)' }}>
            NEW
          </span>
        )}
      </span>
      {onCopy && task.command && (
        <button
          onClick={() => onCopy(task.id, task.command)}
          className="shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: copied ? 'var(--good)' : 'var(--text-2)' }}
          title="Copy a paste-ready command for Claude Code / Codex / Antigravity"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      )}
    </div>
  )
}

/* ── Detail panel ──────────────────────────────────────────────────────────────── */
function ProjectPanel({ project, onToggle, onClose }: {
  project: EnrichedProject
  onToggle: (id: string) => void
  onClose: () => void
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const copy = useCallback((key: string, text: string) => {
    void navigator.clipboard?.writeText(text)
    setCopiedKey(key)
    window.setTimeout(() => setCopiedKey(k => (k === key ? null : k)), 1500)
  }, [])

  // Newly-surfaced work floats to the top of its section — the point of hitting Refresh
  // is to see what changed, not to hunt for it in a list of things you already knew.
  const newFirst = (a: Task, b: Task) => Number(Boolean(b.isNew)) - Number(Boolean(a.isNew))
  const aiTasks   = project.tasks.filter(t => !t.done && t.owner === 'agent').sort(newFirst)
  const youTasks  = project.tasks.filter(t => !t.done && t.owner === 'human').sort(newFirst)
  const doneTasks = project.tasks.filter(t => t.done)
  const done = doneTasks.length

  const copyAll = useCallback(() => {
    const text = aiTasks
      .map((t, i) => `# ${i + 1}. ${t.title}\n${t.command}`)
      .join('\n\n')
    copy('__all__', text)
  }, [aiTasks, copy])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between p-5 shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card-soft)' }}>
        <div className="flex items-start gap-3 min-w-0">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl text-[20px] leading-none" style={{ background: `${project.accent}22` }} aria-hidden>
            {project.emoji || '📁'}
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-tight" style={{ color: 'var(--text-1)' }}>{project.name}</h2>
            <div className="mt-1.5"><StatusPill status={project.status} /></div>
          </div>
        </div>
        <button onClick={onClose} style={{ color: 'var(--text-3)' }} aria-label="Close panel"><X size={16} /></button>
      </div>

      <div className="px-5 py-3 shrink-0 space-y-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <Progress done={done} total={project.tasks.length} accent={project.accent} />
        {project.nextUp && (
          <p className="text-[11px] leading-snug" style={{ color: 'var(--text-3)' }}>
            <span className="mono" style={{ color: 'var(--text-4)' }}>NEXT&nbsp;UP&nbsp;·&nbsp;</span>{project.nextUp}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-auto px-5 py-3 space-y-4">
        {/* AI-doable */}
        <section className="space-y-1.5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: C_AI }}>
              <Bot size={13} /> AI can run these ({aiTasks.length})
            </h3>
            {aiTasks.length > 0 && (
              <button onClick={copyAll}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: copiedKey === '__all__' ? 'var(--good)' : 'var(--text-2)' }}
                title="Copy all commands as one paste">
                {copiedKey === '__all__' ? <Check size={12} /> : <Copy size={12} />}
                {copiedKey === '__all__' ? 'Copied' : 'Copy all'}
              </button>
            )}
          </div>
          <p className="text-[10px] leading-snug" style={{ color: 'var(--text-4)' }}>
            Paste a command into Claude Code, Codex, or Antigravity to do it for you.
          </p>
          {aiTasks.length === 0
            ? <p className="text-[11px] py-1" style={{ color: 'var(--text-4)' }}>Nothing queued for the agent.</p>
            : aiTasks.map(t => <TaskRow key={t.id} task={t} onToggle={onToggle} onCopy={copy} copied={copiedKey === t.id} />)}
        </section>

        {/* Human-only */}
        {youTasks.length > 0 && (
          <section className="space-y-1.5">
            <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: C_ME }}>
              <UserRound size={13} /> You handle these ({youTasks.length})
            </h3>
            {youTasks.map(t => <TaskRow key={t.id} task={t} onToggle={onToggle} />)}
          </section>
        )}

        {/* Done */}
        {doneTasks.length > 0 && (
          <section className="space-y-1.5">
            <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--good)' }}>
              <Check size={13} /> Done ({doneTasks.length})
            </h3>
            {doneTasks.map(t => <TaskRow key={t.id} task={t} onToggle={onToggle} />)}
          </section>
        )}
      </div>
    </div>
  )
}

/* ── Root ──────────────────────────────────────────────────────────────────────── */
export default function CpwZone() {
  const [payload, setPayload]       = useState<ProjectsPayload | null>(null)
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [overrides, setOverrides]   = useState<Record<string, boolean>>(loadOverrides)
  const [newTaskIds, setNewTaskIds] = useState<Set<string>>(() => new Set())
  const [didRefresh, setDidRefresh] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [progress, setProgress]     = useState<string | null>(null)
  const [activeId, setActiveId]     = useState<string | null>(null)
  const [filter, setFilter]         = useState<ProjStatus | 'all'>('all')
  const [orderIds, setOrderIds]     = useState<string[]>(() => loadProjectOrder())
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const cardDragRef                 = useRef<string | null>(null)

  const fetchData = useCallback(async (): Promise<ProjectsPayload | null> => {
    try {
      const r = await fetch(`/data/projects.json?t=${Date.now()}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const next = (await r.json()) as ProjectsPayload
      setPayload(next)
      setError(null)
      return next
    } catch {
      setError('Could not load projects.json — run the project audit, or hit Refresh.')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot fetch of projects.json on mount
    void fetchData()
  }, [fetchData])

  // Pull cross-env check-offs (made on Vercel / another device) from the store on mount.
  useEffect(() => {
    void fetchCheckoffs().then(map => {
      if (!Object.keys(map).length) return
      setOverrides(prev => {
        const next = { ...prev, ...map }
        saveOverrides(next)
        return next
      })
    })
  }, [])

  /**
   * Refresh = re-audit the vault, then show what's new.
   *
   * The audit is one LLM call per project, so /build only *starts* it and we poll
   * /status until it settles. Previously this awaited a script that bailed out
   * immediately, which is why Refresh never surfaced new work.
   */
  const refresh = useCallback(async () => {
    setRefreshing(true)
    setAuditError(null)
    const before = allTaskIds(payload)

    try {
      const started = await fetch('/api/local/projects/build', { method: 'POST' })
      const info = await started.json().catch(() => ({}))

      if (info?.status === 'blocked') {
        setAuditError(info.message ?? 'Re-audit is blocked.')
      } else if (info?.status === 'started' || info?.status === 'already_running') {
        setProgress('Re-auditing your vault…')
        // Poll rather than await: a 15-project Opus pass runs for minutes.
        for (let i = 0; i < 300; i++) {
          await new Promise(r => setTimeout(r, 3000))
          const s = await fetch('/api/local/projects/status').then(r => r.json()).catch(() => null)
          if (!s) break
          if (!s.running) {
            if (s.ok === false && s.error) setAuditError(s.error)
            break
          }
          setProgress(`Re-auditing your vault… (${Math.round((i + 1) * 3)}s)`)
        }
      }
    } catch { /* route absent in prod — fall through to a plain reload */ }
    setProgress(null)

    try { await fetch('/api/local/projects/sync', { method: 'POST' }) } catch { /* route absent in prod */ }
    try {
      const map = await fetchCheckoffs()
      if (Object.keys(map).length) setOverrides(prev => { const n = { ...prev, ...map }; saveOverrides(n); return n })
    } catch { /* offline */ }

    const next = await fetchData()
    if (next) setNewTaskIds(new Set([...allTaskIds(next)].filter(id => !before.has(id))))
    setDidRefresh(true)
    setRefreshing(false)
  }, [fetchData, payload])

  // Vault/snapshot committed done-state, before local overrides (keyed by task id).
  const baseDone = useMemo(() => {
    const m: Record<string, boolean> = {}
    for (const p of payload?.projects ?? []) p.tasks.forEach((t, i) => { m[taskKey(p.id, t, i)] = t.done })
    return m
  }, [payload])

  const toggleTask = useCallback((taskId: string) => {
    setOverrides(prev => {
      const base = baseDone[taskId] ?? false
      const newVal = !(prev[taskId] ?? base)
      const next = { ...prev }
      if (newVal === base) delete next[taskId]
      else next[taskId] = newVal
      saveOverrides(next)
      void upsertCheckoff(taskId, newVal) // cross-env store (Supabase)
      return next
    })
  }, [baseDone])

  const projects = useMemo(() => {
    const mapped = (payload?.projects ?? []).map(p => ({
      ...p,
      tasks: p.tasks.map((t, i): Task => {
        const id = taskKey(p.id, t, i)
        // Union: the generator's stamp (durable) OR a task that appeared during this
        // session's Refresh (covers snapshots produced before isNew existed).
        return { ...t, id, done: overrides[id] ?? t.done, isNew: t.isNew || newTaskIds.has(id) }
      }),
    }))
    // Apply the user's saved card order; new projects append, deleted ones drop.
    return mergeProjectOrder(mapped, orderIds)
  }, [payload, overrides, newTaskIds, orderIds])

  const handleCardDragStart = useCallback((id: string) => {
    cardDragRef.current = id
    setDraggingId(id)
  }, [])

  const handleCardDragEnd = useCallback(() => {
    cardDragRef.current = null
    setDraggingId(null)
  }, [])

  const handleCardDropBefore = useCallback((beforeId: string | null) => {
    const dragId = cardDragRef.current
    cardDragRef.current = null
    setDraggingId(null)
    if (!dragId || dragId === beforeId) return
    const next = moveIdBefore(projects.map(p => p.id), dragId, beforeId)
    setOrderIds(next)
    saveProjectOrder(next)
  }, [projects])

  const handleResetOrder = useCallback(() => {
    clearProjectOrder()
    setOrderIds([])
  }, [])

  /** How many open tasks are flagged new right now — drives the header pill. */
  const newCount = useMemo(
    () => projects.reduce((n, p) => n + p.tasks.filter(t => t.isNew && !t.done).length, 0),
    [projects],
  )

  // Mirror check-off state into the vault note via the local BFF (no-ops on Vercel,
  // where the route is absent — those check-offs reach the vault through the cloud sync).
  useEffect(() => {
    if (!projects.length) return
    const id = window.setTimeout(() => {
      void fetch('/api/local/projects/checkoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projects: projects.map(p => ({
            name:  p.name,
            emoji: p.emoji,
            tasks: p.tasks.map(t => ({ title: t.title, done: t.done, owner: t.owner })),
          })),
        }),
      }).catch(() => { /* route absent (production) */ })
    }, 800)
    return () => window.clearTimeout(id)
  }, [projects])

  const presentStatuses = useMemo(
    () => (['all', ...Object.keys(STATUS_CONFIG)] as Array<ProjStatus | 'all'>)
      .filter(s => s === 'all' || projects.some(p => p.status === s)),
    [projects],
  )
  const filtered = filter === 'all' ? projects : projects.filter(p => p.status === filter)
  const activeProject = projects.find(p => p.id === activeId) ?? null

  const allTasks = projects.flatMap(p => p.tasks)
  const totalAgentOpen = allTasks.filter(t => !t.done && t.owner === 'agent').length
  const totalHumanOpen = allTasks.filter(t => !t.done && t.owner === 'human').length

  return (
    <div className="zone-canvas flex flex-col" style={{ minHeight: 0 }}>
      <header className="zone-topbar">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)', color: 'white' }}>
            <FolderKanban size={12} />
          </div>
          <span className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>Projects</span>
          <span className="inline-flex shrink-0 items-center self-center"><UpdateDot zoneId="cpw-projects" className="h-2 w-2" /></span>
          <span className="mono text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }}>
            {projects.length} projects
          </span>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          {progress && (
            <span className="mono text-[10px] truncate" style={{ color: 'var(--text-4)' }}>{progress}</span>
          )}
          {!refreshing && (newCount > 0 || didRefresh) && (
            <span className="mono text-[10px] px-2 py-0.5 rounded"
              style={newCount > 0
                ? { background: 'color-mix(in oklab, var(--accent) 18%, transparent)', color: 'var(--accent)' }
                : { background: 'var(--bg-muted)', color: 'var(--text-4)' }}>
              {newCount > 0 ? `${newCount} new task${newCount === 1 ? '' : 's'}` : 'no new tasks'}
            </span>
          )}
          <button onClick={() => void refresh()} disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-60"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            title="Re-audit your vault docs and surface any new tasks">
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Auditing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {auditError && (
        <div className="px-4 py-2 text-[11px] leading-snug shrink-0"
          style={{ background: 'color-mix(in oklab, var(--bad) 12%, transparent)', color: 'var(--text-1)', borderBottom: '1px solid var(--border)' }}>
          {auditError}
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 overflow-auto">
          <div className="zone-inner">
            <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
              <div>
                <p className="mono text-[10px] mb-1" style={{ color: 'var(--text-4)', letterSpacing: '0.12em' }}>VAULT PROJECT WORKSPACE</p>
                <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>Projects Overview</h1>
                <p className="mt-1 flex items-center gap-3 text-[11px]" style={{ color: 'var(--text-4)' }}>
                  <span className="inline-flex items-center gap-1.5"><ListTodo size={12} />{projects.length} projects</span>
                  <span className="inline-flex items-center gap-1" style={{ color: C_AI }}><Bot size={12} />{totalAgentOpen} AI-doable</span>
                  <span className="inline-flex items-center gap-1" style={{ color: C_ME }}><UserRound size={12} />{totalHumanOpen} for you</span>
                  {payload?.generatedAt && <span>· audited {timeAgo(payload.generatedAt)}</span>}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {orderIds.length > 0 && (
                  <button
                    onClick={handleResetOrder}
                    className="mono text-[10px] px-2.5 py-1 rounded-full transition-all"
                    style={{ background: 'var(--bg-muted)', color: 'var(--text-3)', border: '1px solid var(--border)' }}
                    title="Restore the default project order"
                  >
                    Reset order
                  </button>
                )}
                {presentStatuses.map(s => {
                  const active = filter === s
                  const color = s === 'all' ? 'var(--accent)' : STATUS_CONFIG[s].color
                  return (
                    <button key={s} onClick={() => setFilter(s)}
                      className="mono text-[10px] px-2.5 py-1 rounded-full transition-all"
                      style={{ background: active ? color : 'var(--bg-muted)', color: active ? 'white' : 'var(--text-3)', border: '1px solid ' + (active ? 'transparent' : 'var(--border)') }}>
                      {s === 'all' ? 'All' : STATUS_CONFIG[s].label}
                    </button>
                  )
                })}
              </div>
            </div>

            {loading ? (
              <p className="py-16 text-center text-[13px]" style={{ color: 'var(--text-4)' }}>Loading projects…</p>
            ) : error ? (
              <div className="rounded-2xl px-5 py-8 text-center" style={{ border: '1px dashed var(--border-strong)' }}>
                <p className="text-[13px]" style={{ color: 'var(--text-2)' }}>{error}</p>
              </div>
            ) : (
              <div
                className="grid gap-4"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
                onDragOver={e => { if (draggingId) e.preventDefault() }}
                onDrop={e => { if (draggingId) { e.preventDefault(); handleCardDropBefore(null) } }}
              >
                {filtered.map(p => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    active={p.id === activeId}
                    onClick={() => setActiveId(p.id === activeId ? null : p.id)}
                    draggable
                    dragging={draggingId === p.id}
                    onDragStart={() => handleCardDragStart(p.id)}
                    onDragEnd={handleCardDragEnd}
                    onDropBefore={() => handleCardDropBefore(p.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {activeProject && (
          <div className="shrink-0 overflow-hidden flex flex-col"
            style={{ width: 400, borderLeft: '1px solid var(--border)', background: 'var(--bg-card)', animation: 'fadeIn 0.2s ease forwards' }}>
            <ProjectPanel project={activeProject} onToggle={toggleTask} onClose={() => setActiveId(null)} />
          </div>
        )}
      </div>
    </div>
  )
}
