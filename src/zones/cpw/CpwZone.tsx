import { useCallback, useEffect, useMemo, useState } from 'react'

import UpdateDot from '../../components/ui/UpdateDot'
import {
  Check, ChevronRight, Circle, FolderKanban, ListTodo, RefreshCw, X,
} from 'lucide-react'

/* ── Types (shape of public/data/projects.json, built by scripts/build-projects.mjs) ── */
type ProjStatus = 'planning' | 'active' | 'blocked' | 'shipped' | 'idle'

interface VTask { id: string; title: string; done: boolean }

interface VProject {
  id:         string
  name:       string
  emoji:      string
  summary:    string
  status:     ProjStatus
  statusRaw:  string
  deadline:   string | null
  accent:     string
  tasks:      VTask[]
  doneCount:  number
  totalCount: number
}

interface ProjectsPayload { generatedAt: string; count: number; projects: VProject[] }

const STATUS_CONFIG: Record<ProjStatus, { label: string; color: string }> = {
  planning: { label: 'Planning', color: 'var(--text-4)' },
  active:   { label: 'Active',   color: 'var(--accent)' },
  blocked:  { label: 'Blocked',  color: 'var(--bad)'    },
  shipped:  { label: 'Shipped',  color: 'var(--good)'   },
  idle:     { label: 'Idle',     color: 'var(--text-4)' },
}

/* ── Local check-off overrides — lets you tick tasks in the dashboard and have it
   stick across reloads/refreshes, on top of the vault's committed state. ── */
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
    <span
      className="mono text-[10px] font-semibold px-2 py-0.5 rounded"
      style={{ background: `color-mix(in oklab, ${c.color} 15%, transparent)`, color: c.color }}
    >
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
function ProjectCard({ project, active, onClick }: { project: VProject; active: boolean; onClick: () => void }) {
  const pending = project.tasks.filter(t => !t.done)
  return (
    <button
      onClick={onClick}
      className="zone-card text-left w-full transition-all hover:shadow-md flex flex-col gap-4"
      style={{ borderColor: active ? project.accent : 'var(--border)' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = project.accent)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = active ? project.accent : 'var(--border)')}
    >
      <div className="flex items-start gap-3">
        <div
          className="grid size-9 shrink-0 place-items-center rounded-xl text-[18px] leading-none"
          style={{ background: `${project.accent}22` }}
          aria-hidden
        >
          {project.emoji || '📁'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold leading-tight truncate" style={{ color: 'var(--text-1)' }}>
            {project.name}
          </p>
          {project.summary && (
            <p className="mt-0.5 text-[11px] leading-snug line-clamp-2" style={{ color: 'var(--text-4)' }}>
              {project.summary}
            </p>
          )}
        </div>
        <ChevronRight size={14} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <StatusPill status={project.status} />
        <span className="mono text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--bg-muted)', color: 'var(--text-4)' }}>
          {pending.length} open
        </span>
      </div>

      <Progress done={project.doneCount} total={project.totalCount} accent={project.accent} />

      {pending.slice(0, 3).map(t => (
        <div key={t.id} className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
          <Circle size={9} className="shrink-0" style={{ color: 'var(--text-4)' }} />
          <span className="truncate">{t.title}</span>
        </div>
      ))}
    </button>
  )
}

/* ── Detail panel ──────────────────────────────────────────────────────────────── */
function ProjectPanel({ project, onToggle, onClose }: {
  project: VProject
  onToggle: (taskId: string) => void
  onClose: () => void
}) {
  const sorted = [...project.tasks].sort((a, b) => Number(a.done) - Number(b.done))
  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-start justify-between p-5 shrink-0"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card-soft)' }}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl text-[20px] leading-none" style={{ background: `${project.accent}22` }} aria-hidden>
            {project.emoji || '📁'}
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-tight" style={{ color: 'var(--text-1)' }}>{project.name}</h2>
            {project.statusRaw && (
              <p className="mt-0.5 text-[11px] leading-snug" style={{ color: 'var(--text-4)' }}>{project.statusRaw}</p>
            )}
            <div className="mt-2"><StatusPill status={project.status} /></div>
          </div>
        </div>
        <button onClick={onClose} style={{ color: 'var(--text-3)' }} aria-label="Close panel"><X size={16} /></button>
      </div>

      <div className="px-5 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <Progress done={project.doneCount} total={project.totalCount} accent={project.accent} />
      </div>

      <div className="flex-1 overflow-auto px-5 py-3 space-y-1.5">
        {sorted.length === 0 && (
          <p className="text-center py-8 text-[12px]" style={{ color: 'var(--text-4)' }}>
            No checkbox tasks found in this project’s notes yet.
          </p>
        )}
        {sorted.map(task => (
          <button
            key={task.id}
            onClick={() => onToggle(task.id)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors"
            style={{ background: 'var(--bg-muted)', opacity: task.done ? 0.55 : 1 }}
            title={task.done ? 'Mark as not done' : 'Mark as done'}
          >
            <span className="shrink-0" style={{ color: task.done ? 'var(--good)' : 'var(--text-4)' }}>
              {task.done ? <Check size={15} /> : <Circle size={15} />}
            </span>
            <span
              className="flex-1 text-[12px]"
              style={{ color: 'var(--text-1)', textDecoration: task.done ? 'line-through' : 'none' }}
            >
              {task.title}
            </span>
          </button>
        ))}
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
  const [activeId, setActiveId]     = useState<string | null>(null)
  const [filter, setFilter]         = useState<ProjStatus | 'all'>('all')

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch(`/data/projects.json?t=${Date.now()}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setPayload((await r.json()) as ProjectsPayload)
      setError(null)
    } catch {
      setError('Could not load projects.json — run `node scripts/build-projects.mjs`, or hit Refresh.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot fetch of projects.json on mount
    void fetchData()
  }, [fetchData])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    // Ask the dev BFF to re-run the extractor against the live vault; ignore if the
    // route isn't available (e.g. production), then re-pull the snapshot either way.
    try {
      await fetch('/api/local/projects/build', { method: 'POST' })
    } catch { /* offline / route absent (e.g. production) */ }
    await fetchData()
    setRefreshing(false)
  }, [fetchData])

  // Vault's committed done-state, before local overrides.
  const baseDone = useMemo(() => {
    const m: Record<string, boolean> = {}
    for (const p of payload?.projects ?? []) for (const t of p.tasks) m[t.id] = t.done
    return m
  }, [payload])

  const toggleTask = useCallback((taskId: string) => {
    setOverrides(prev => {
      const base = baseDone[taskId] ?? false
      const current = prev[taskId] ?? base
      const next = { ...prev }
      if (!current === base) delete next[taskId]   // back to vault default → drop override
      else next[taskId] = !current
      saveOverrides(next)
      return next
    })
  }, [baseDone])

  // Apply overrides → effective projects.
  const projects = useMemo<VProject[]>(() => (payload?.projects ?? []).map(p => {
    const tasks = p.tasks.map(t => ({ ...t, done: overrides[t.id] ?? t.done }))
    return { ...p, tasks, doneCount: tasks.filter(t => t.done).length, totalCount: tasks.length }
  }), [payload, overrides])

  const presentStatuses = useMemo(
    () => (['all', ...Object.keys(STATUS_CONFIG)] as Array<ProjStatus | 'all'>)
      .filter(s => s === 'all' || projects.some(p => p.status === s)),
    [projects],
  )
  const filtered = filter === 'all' ? projects : projects.filter(p => p.status === filter)
  const activeProject = projects.find(p => p.id === activeId) ?? null

  const totalOpen = projects.reduce((n, p) => n + (p.totalCount - p.doneCount), 0)

  return (
    <div className="zone-canvas flex flex-col" style={{ minHeight: 0 }}>
      <header className="zone-topbar">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)', color: 'white' }}>
            <FolderKanban size={12} />
          </div>
          <span className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>Projects</span>
          <span className="inline-flex shrink-0 items-center self-center">
            <UpdateDot zoneId="cpw-projects" className="h-2 w-2" />
          </span>
          <span className="mono text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }}>
            {projects.length} projects
          </span>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-60"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
          title="Re-read the Obsidian vault and rebuild this overview"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 overflow-auto">
          <div className="zone-inner">
            <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
              <div>
                <p className="mono text-[10px] mb-1" style={{ color: 'var(--text-4)', letterSpacing: '0.12em' }}>
                  VAULT PROJECT WORKSPACE
                </p>
                <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>
                  Projects Overview
                </h1>
                <p className="mt-1 flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-4)' }}>
                  <ListTodo size={12} />
                  {totalOpen} open tasks across {projects.length} projects
                  {payload?.generatedAt && <span> · synced {timeAgo(payload.generatedAt)}</span>}
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {presentStatuses.map(s => {
                  const active = filter === s
                  const color = s === 'all' ? 'var(--accent)' : STATUS_CONFIG[s].color
                  return (
                    <button
                      key={s}
                      onClick={() => setFilter(s)}
                      className="mono text-[10px] px-2.5 py-1 rounded-full transition-all"
                      style={{
                        background: active ? color : 'var(--bg-muted)',
                        color:      active ? 'white' : 'var(--text-3)',
                        border:     '1px solid ' + (active ? 'transparent' : 'var(--border)'),
                      }}
                    >
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
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                {filtered.map(p => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    active={p.id === activeId}
                    onClick={() => setActiveId(p.id === activeId ? null : p.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {activeProject && (
          <div
            className="shrink-0 overflow-hidden flex flex-col"
            style={{ width: 380, borderLeft: '1px solid var(--border)', background: 'var(--bg-card)', animation: 'fadeIn 0.2s ease forwards' }}
          >
            <ProjectPanel project={activeProject} onToggle={toggleTask} onClose={() => setActiveId(null)} />
          </div>
        )}
      </div>
    </div>
  )
}
