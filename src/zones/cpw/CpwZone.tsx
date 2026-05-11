import { useState } from 'react'
import {
  Calendar, Check, ChevronRight, Circle, Clock, Disc3, Flag,
  Music, Plus, X,
} from 'lucide-react'

/* ── Types ─────────────────────────────────────────────────────────────────── */
type TaskStatus = 'todo' | 'in-progress' | 'done'
type Priority   = 'low' | 'med' | 'high'

interface Task {
  id:       string
  title:    string
  status:   TaskStatus
  priority: Priority
  due?:     string
  notes?:   string
}

interface Project {
  id:          string
  name:        string
  artist:      string
  type:        'single' | 'ep' | 'album' | 'event' | 'mix'
  status:      'pre-prod' | 'recording' | 'mixing' | 'mastering' | 'released'
  deadline?:   string
  tasks:       Task[]
  accent:      string
}

/* ── Data ───────────────────────────────────────────────────────────────────── */
const INITIAL_PROJECTS: Project[] = [
  {
    id: 'rct',
    name: 'Red Cup Typa Nite',
    artist: 'CPW',
    type: 'single',
    status: 'mixing',
    deadline: '2026-05-25',
    accent: '#dc2626',
    tasks: [
      { id: 'rct1', title: 'Final mix revision',           status: 'in-progress', priority: 'high', due: '2026-05-20' },
      { id: 'rct2', title: 'Master to 14 LUFS',            status: 'todo',        priority: 'high', due: '2026-05-22' },
      { id: 'rct3', title: 'DistroKid upload',             status: 'todo',        priority: 'med',  due: '2026-05-24' },
      { id: 'rct4', title: 'Cover art finalize',           status: 'done',        priority: 'med'  },
      { id: 'rct5', title: 'Promo schedule social media',  status: 'todo',        priority: 'med',  due: '2026-05-25' },
    ],
  },
  {
    id: 'rr',
    name: 'Resha Roulette',
    artist: 'Caresha',
    type: 'single',
    status: 'recording',
    deadline: '2026-06-05',
    accent: '#7c3aed',
    tasks: [
      { id: 'rr1', title: 'Record final vocals',     status: 'in-progress', priority: 'high', due: '2026-05-28' },
      { id: 'rr2', title: 'Hook re-take session',    status: 'todo',        priority: 'high', due: '2026-05-29' },
      { id: 'rr3', title: 'Ad-lib stack',            status: 'todo',        priority: 'med'  },
      { id: 'rr4', title: 'Beat clearance',          status: 'done',        priority: 'high' },
    ],
  },
  {
    id: 'ggd',
    name: 'GirlsGone Drop',
    artist: 'GirlsGone Digital',
    type: 'ep',
    status: 'pre-prod',
    deadline: '2026-07-01',
    accent: '#059669',
    tasks: [
      { id: 'ggd1', title: 'Track selection (8 tracks)', status: 'in-progress', priority: 'med', due: '2026-06-01' },
      { id: 'ggd2', title: 'Sequencing approval',        status: 'todo',        priority: 'low' },
      { id: 'ggd3', title: 'Feature artist clearances',  status: 'todo',        priority: 'high', due: '2026-06-10' },
    ],
  },
]

const STATUS_CONFIG: Record<Project['status'], { label: string; color: string }> = {
  'pre-prod':  { label: 'Pre-Production', color: 'var(--text-4)' },
  'recording': { label: 'Recording',      color: 'var(--warn)'   },
  'mixing':    { label: 'Mixing',         color: 'var(--accent)' },
  'mastering': { label: 'Mastering',      color: '#a855f7'       },
  'released':  { label: 'Released',       color: 'var(--good)'   },
}

const TASK_STATUS_CONFIG: Record<TaskStatus, { label: string; color: string }> = {
  'todo':        { label: 'To Do',       color: 'var(--text-4)' },
  'in-progress': { label: 'In Progress', color: 'var(--warn)'   },
  'done':        { label: 'Done',        color: 'var(--good)'   },
}

const PRIORITY_CFG: Record<Priority, { bg: string; fg: string }> = {
  high: { bg: 'var(--bad-soft)',  fg: 'var(--bad)'    },
  med:  { bg: 'var(--warn-soft)', fg: 'var(--warn)'   },
  low:  { bg: 'var(--bg-muted)',  fg: 'var(--text-4)' },
}

const TYPE_ICONS: Record<Project['type'], typeof Music> = {
  single: Disc3,
  ep:     Music,
  album:  Music,
  event:  Calendar,
  mix:    Music,
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */
function daysUntil(date?: string): number | null {
  if (!date) return null
  const ms = new Date(date).getTime() - Date.now()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

function DeadlineBadge({ date }: { date?: string }) {
  const days = daysUntil(date)
  if (days === null) return null
  const overdue  = days < 0
  const urgent   = days >= 0 && days <= 3
  const soon     = days > 3 && days <= 7
  return (
    <span
      className="mono text-[10px] px-2 py-0.5 rounded flex items-center gap-1"
      style={{
        background: overdue ? 'var(--bad-soft)'  : urgent ? 'var(--bad-soft)'  : soon ? 'var(--warn-soft)' : 'var(--bg-muted)',
        color:      overdue ? 'var(--bad)'        : urgent ? 'var(--bad)'        : soon ? 'var(--warn)'      : 'var(--text-4)',
      }}
    >
      <Clock size={9} />
      {overdue
        ? `${Math.abs(days)}d overdue`
        : days === 0
          ? 'Due today'
          : `${days}d left`}
    </span>
  )
}

/* ── Project Detail Panel ───────────────────────────────────────────────────── */
function ProjectPanel({ project, onUpdate, onClose }: {
  project:  Project
  onUpdate: (p: Project) => void
  onClose:  () => void
}) {
  const [newTask,    setNewTask]    = useState('')
  const [newTaskDue, setNewTaskDue] = useState('')

  const taskOrderMap: Record<TaskStatus, number> = { 'in-progress': 0, todo: 1, done: 2 }
  const sorted = [...project.tasks].sort((a, b) => taskOrderMap[a.status] - taskOrderMap[b.status])

  function addTask() {
    if (!newTask.trim()) return
    const t: Task = {
      id:       `t${Date.now()}`,
      title:    newTask.trim(),
      status:   'todo',
      priority: 'med',
      due:      newTaskDue || undefined,
    }
    onUpdate({ ...project, tasks: [t, ...project.tasks] })
    setNewTask(''); setNewTaskDue('')
  }

  function cycleTaskStatus(id: string) {
    const order: TaskStatus[] = ['todo', 'in-progress', 'done']
    onUpdate({
      ...project,
      tasks: project.tasks.map(t => {
        if (t.id !== id) return t
        return { ...t, status: order[(order.indexOf(t.status) + 1) % order.length] }
      }),
    })
  }

  function removeTask(id: string) {
    onUpdate({ ...project, tasks: project.tasks.filter(t => t.id !== id) })
  }

  const done  = project.tasks.filter(t => t.status === 'done').length
  const total = project.tasks.length
  const pct   = total ? Math.round((done / total) * 100) : 0
  const sCfg  = STATUS_CONFIG[project.status]

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div
        className="flex items-start justify-between p-5 shrink-0"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card-soft)' }}
      >
        <div className="flex items-start gap-3">
          <div className="rounded-xl p-2.5 mt-0.5 shrink-0" style={{ background: project.accent + '22', color: project.accent }}>
            {(() => { const TIcon = TYPE_ICONS[project.type]; return <TIcon size={18} /> })()}
          </div>
          <div>
            <h2 className="text-[15px] font-semibold leading-tight" style={{ color: 'var(--text-1)' }}>
              {project.name}
            </h2>
            <p className="mono text-[10px] mt-0.5 uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>
              {project.artist} · {project.type}
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span
                className="mono text-[10px] font-semibold px-2 py-0.5 rounded"
                style={{ background: 'color-mix(in oklab, ' + sCfg.color + ' 15%, transparent)', color: sCfg.color }}
              >
                {sCfg.label}
              </span>
              <DeadlineBadge date={project.deadline} />
            </div>
          </div>
        </div>
        <button onClick={onClose} style={{ color: 'var(--text-3)' }}>
          <X size={16} />
        </button>
      </div>

      {/* Progress */}
      <div className="px-5 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>Progress</span>
          <span className="mono text-[11px] font-semibold" style={{ color: 'var(--text-2)' }}>{done}/{total} tasks</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: project.accent }}
          />
        </div>
      </div>

      {/* Add task */}
      <div className="flex gap-2 px-5 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <input
          value={newTask}
          onChange={e => setNewTask(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTask()}
          placeholder="Add task…"
          className="flex-1 rounded-lg px-3 py-2 text-[12px]"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-1)', outline: 'none' }}
          onFocus={e => (e.target.style.borderColor = project.accent)}
          onBlur={e  => (e.target.style.borderColor = 'var(--border)')}
        />
        <input
          type="date"
          value={newTaskDue}
          onChange={e => setNewTaskDue(e.target.value)}
          className="rounded-lg px-2 py-2 text-[12px] w-[130px]"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-1)', outline: 'none' }}
        />
        <button
          onClick={addTask}
          disabled={!newTask.trim()}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-white"
          style={{ background: newTask.trim() ? project.accent : 'var(--bg-muted)', color: newTask.trim() ? 'white' : 'var(--text-4)', cursor: newTask.trim() ? 'pointer' : 'not-allowed' }}
        >
          <Plus size={13} />
        </button>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-auto px-5 py-3 space-y-1.5">
        {sorted.length === 0 && (
          <p className="text-center py-8 text-[12px]" style={{ color: 'var(--text-4)' }}>No tasks yet — add one above.</p>
        )}
        {sorted.map(task => {
          const tCfg = TASK_STATUS_CONFIG[task.status]
          const pCfg = PRIORITY_CFG[task.priority]
          return (
            <div
              key={task.id}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2.5"
              style={{ background: 'var(--bg-muted)', opacity: task.status === 'done' ? 0.5 : 1 }}
            >
              <button
                onClick={() => cycleTaskStatus(task.id)}
                className="shrink-0 rounded-full p-0.5 transition-all"
                style={{ color: tCfg.color }}
                title={`${tCfg.label} — click to advance`}
              >
                {task.status === 'done' ? <Check size={14} /> : <Circle size={14} />}
              </button>

              <span
                className="flex-1 text-[12px] truncate"
                style={{ color: 'var(--text-1)', textDecoration: task.status === 'done' ? 'line-through' : 'none' }}
              >
                {task.title}
              </span>

              <DeadlineBadge date={task.due} />

              <span
                className="mono text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                style={{ background: pCfg.bg, color: pCfg.fg }}
              >
                {task.priority.toUpperCase()}
              </span>

              <button onClick={() => removeTask(task.id)} className="shrink-0" style={{ color: 'var(--text-4)' }}>
                <X size={12} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Project Card ───────────────────────────────────────────────────────────── */
function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  const done  = project.tasks.filter(t => t.status === 'done').length
  const total = project.tasks.length
  const pct   = total ? Math.round((done / total) * 100) : 0
  const sCfg  = STATUS_CONFIG[project.status]
  const TIcon = TYPE_ICONS[project.type]

  return (
    <button
      onClick={onClick}
      className="zone-card text-left w-full transition-all hover:shadow-md flex flex-col gap-4"
      style={{ '--hover-border': project.accent } as React.CSSProperties}
      onMouseEnter={e => (e.currentTarget.style.borderColor = project.accent)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="rounded-xl p-2.5 shrink-0" style={{ background: project.accent + '22', color: project.accent }}>
          <TIcon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold leading-tight truncate" style={{ color: 'var(--text-1)' }}>
            {project.name}
          </p>
          <p className="mono text-[10px] mt-0.5 uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>
            {project.artist}
          </p>
        </div>
        <ChevronRight size={14} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
      </div>

      {/* Status + deadline */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="mono text-[10px] font-semibold px-2 py-0.5 rounded"
          style={{ background: 'color-mix(in oklab, ' + sCfg.color + ' 15%, transparent)', color: sCfg.color }}
        >
          {sCfg.label}
        </span>
        <DeadlineBadge date={project.deadline} />
      </div>

      {/* Progress */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="mono text-[10px]" style={{ color: 'var(--text-4)' }}>TASKS</span>
          <span className="mono text-[10px]" style={{ color: 'var(--text-3)' }}>{done}/{total} done</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: project.accent }} />
        </div>
      </div>

      {/* Upcoming tasks */}
      {project.tasks.filter(t => t.status !== 'done').slice(0, 2).map(t => (
        <div key={t.id} className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
          <Flag size={10} className="shrink-0" style={{ color: PRIORITY_CFG[t.priority].fg }} />
          <span className="truncate">{t.title}</span>
        </div>
      ))}
    </button>
  )
}

/* ── Root component ─────────────────────────────────────────────────────────── */
export default function CpwZone() {
  const [projects,  setProjects]  = useState<Project[]>(INITIAL_PROJECTS)
  const [activeId,  setActiveId]  = useState<string | null>(null)
  const [statusFilter, setFilter] = useState<Project['status'] | 'all'>('all')

  const activeProject = projects.find(p => p.id === activeId) ?? null

  function updateProject(p: Project) {
    setProjects(prev => prev.map(x => x.id === p.id ? p : x))
  }

  const filteredProjects = statusFilter === 'all'
    ? projects
    : projects.filter(p => p.status === statusFilter)

  const allUpcoming = projects
    .flatMap(p => p.tasks.filter(t => t.status !== 'done' && t.due).map(t => ({ ...t, projectName: p.name, accent: p.accent })))
    .sort((a, b) => new Date(a.due!).getTime() - new Date(b.due!).getTime())
    .slice(0, 6)

  return (
    <div className="zone-canvas flex flex-col" style={{ minHeight: 0 }}>
      {/* Topbar */}
      <header className="zone-topbar">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #dc2626, #7c3aed)', color: 'white' }}>
            <Music size={12} />
          </div>
          <span className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>CPW Projects</span>
          <span className="mono text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }}>
            {projects.length} projects
          </span>
        </div>
      </header>

      {/* Two-column layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Main content */}
        <div className="flex-1 overflow-auto">
          <div className="zone-inner">
            <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
              <div>
                <p className="mono text-[10px] mb-1" style={{ color: 'var(--text-4)', letterSpacing: '0.12em' }}>
                  CLIENT PROJECT WORKSPACE
                </p>
                <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>
                  CPW Overview
                </h1>
              </div>

              {/* Status filter */}
              <div className="flex flex-wrap gap-1.5">
                {(['all', ...Object.keys(STATUS_CONFIG)] as Array<'all' | Project['status']>).map(s => {
                  const active = statusFilter === s
                  const color  = s === 'all' ? 'var(--accent)' : STATUS_CONFIG[s as Project['status']].color
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
                      {s === 'all' ? 'All' : STATUS_CONFIG[s as Project['status']].label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Project cards grid */}
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {filteredProjects.map(p => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onClick={() => setActiveId(p.id === activeId ? null : p.id)}
                />
              ))}
            </div>

            {/* Upcoming deadlines */}
            {allUpcoming.length > 0 && (
              <div className="mt-8">
                <p className="mono text-[10px] mb-3" style={{ color: 'var(--text-4)', letterSpacing: '0.1em' }}>
                  UPCOMING DEADLINES
                </p>
                <div className="zone-card overflow-hidden" style={{ padding: 0 }}>
                  {allUpcoming.map((t, i) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 px-4 py-3"
                      style={{ borderBottom: i < allUpcoming.length - 1 ? '1px solid var(--border)' : 'none' }}
                    >
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: t.accent }} />
                      <span className="flex-1 text-[12px] truncate" style={{ color: 'var(--text-1)' }}>{t.title}</span>
                      <span className="mono text-[10px]" style={{ color: 'var(--text-4)' }}>{t.projectName}</span>
                      <DeadlineBadge date={t.due} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Side panel */}
        {activeProject && (
          <div
            className="shrink-0 overflow-hidden flex flex-col"
            style={{
              width: 380,
              borderLeft: '1px solid var(--border)',
              background: 'var(--bg-card)',
              animation: 'fadeIn 0.2s ease forwards',
            }}
          >
            <ProjectPanel
              project={activeProject}
              onUpdate={updateProject}
              onClose={() => setActiveId(null)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
