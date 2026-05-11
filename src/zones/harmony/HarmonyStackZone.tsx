import { useState } from 'react'
import {
  Check, ChevronDown, Circle, Clock, Globe, Plus, Star, Trash2,
  TrendingUp, X, Zap,
} from 'lucide-react'

/* ── Types ─────────────────────────────────────────────────────────────────── */
type Tab = 'services' | 'projects'

interface ServicePackage {
  id:       string
  name:     string
  price:    string
  period:   string
  tagline:  string
  highlight?: boolean
  features: string[]
}

interface Addon {
  label: string
  price: string
}

interface ClientTask {
  id:       string
  title:    string
  client:   string
  status:   'todo' | 'active' | 'review' | 'done'
  priority: 'low' | 'med' | 'high'
  due?:     string
}

/* ── Data ───────────────────────────────────────────────────────────────────── */
const PACKAGES: ServicePackage[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$800',
    period: 'one-time',
    tagline: 'Perfect for landing pages & simple sites',
    features: [
      '5-page custom website',
      'Mobile-responsive design',
      'Contact form setup',
      'Basic SEO structure',
      '2 revision rounds',
      '14-day delivery',
    ],
  },
  {
    id: 'pro',
    name: 'Professional',
    price: '$1,800',
    period: 'one-time',
    tagline: 'Full brand presence + e-commerce ready',
    highlight: true,
    features: [
      'Up to 10 pages',
      'Custom design system',
      'Shopify / WooCommerce setup',
      'SEO + metadata + sitemap',
      'Google Analytics wiring',
      '4 revision rounds',
      '21-day delivery',
      'Dropbox asset handoff',
    ],
  },
  {
    id: 'scale',
    name: 'Scale',
    price: '$3,500',
    period: 'one-time',
    tagline: 'For established brands ready to level up',
    features: [
      'Unlimited pages',
      'Full branding package',
      'Custom animations',
      'Advanced e-commerce',
      'WhatsApp / CRM integrations',
      'Unlimited revisions',
      'Priority 14-day delivery',
      'Ongoing support (30 days)',
    ],
  },
]

const ADDONS: Addon[] = [
  { label: 'Rush delivery (7 days)',     price: '+$400' },
  { label: 'Logo / brand identity',      price: '+$350' },
  { label: 'Extra page',                 price: '+$80'  },
  { label: 'Bilingual (EN + ES)',        price: '+$200' },
  { label: 'Monthly retainer',           price: '$299/mo' },
  { label: 'Analytics dashboard',        price: '+$150' },
]

const INITIAL_TASKS: ClientTask[] = [
  { id: 't1', title: 'Send kickoff brief',       client: 'Caresha Please',    status: 'active', priority: 'high', due: '2026-05-14' },
  { id: 't2', title: 'Collect brand assets',     client: 'GirlsGone Digital', status: 'todo',   priority: 'high', due: '2026-05-16' },
  { id: 't3', title: 'Wireframe approval',       client: 'Luzid Productions', status: 'review', priority: 'med',  due: '2026-05-20' },
  { id: 't4', title: 'Dropbox handoff',          client: 'Ice Studios',       status: 'done',   priority: 'low'                    },
  { id: 't5', title: 'Deploy to Vercel',         client: 'Blank Square',      status: 'active', priority: 'high', due: '2026-05-18' },
  { id: 't6', title: 'Revision pass #2',         client: 'Caresha Please',    status: 'todo',   priority: 'med',  due: '2026-05-22' },
]

const STATUS_COLS: { id: ClientTask['status']; label: string; color: string }[] = [
  { id: 'todo',   label: 'To Do',      color: 'var(--text-4)' },
  { id: 'active', label: 'Active',     color: 'var(--accent)' },
  { id: 'review', label: 'In Review',  color: 'var(--warn)'   },
  { id: 'done',   label: 'Done',       color: 'var(--good)'   },
]

const PRIORITY_COLORS: Record<ClientTask['priority'], { bg: string; fg: string }> = {
  high: { bg: 'var(--bad-soft)',  fg: 'var(--bad)'  },
  med:  { bg: 'var(--warn-soft)', fg: 'var(--warn)' },
  low:  { bg: 'var(--bg-muted)',  fg: 'var(--text-4)' },
}

/* ── Services tab ───────────────────────────────────────────────────────────── */
function ServicesTab() {
  const [addonsOpen, setAddonsOpen] = useState(true)

  return (
    <div className="fade-in space-y-8">
      {/* Hero */}
      <div>
        <p className="mono text-[10px] mb-2" style={{ color: 'var(--text-4)', letterSpacing: '0.12em' }}>
          HARMONY STACK · WEB DESIGN SERVICES
        </p>
        <h2 className="text-[22px] font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>
          Service Packages
        </h2>
        <p className="mt-1 text-[13px]" style={{ color: 'var(--text-3)' }}>
          Fixed-scope deliverables. No hidden fees. Delivered on time.
        </p>
      </div>

      {/* Package cards */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {PACKAGES.map(pkg => (
          <div
            key={pkg.id}
            className="zone-card flex flex-col gap-4 relative overflow-hidden"
            style={pkg.highlight ? {
              borderColor: 'var(--accent)',
              boxShadow: '0 0 0 1px var(--accent), var(--shadow-md)',
            } : {}}
          >
            {pkg.highlight && (
              <div
                className="absolute top-0 right-0 mono text-[9px] font-bold px-3 py-1 rounded-bl-lg"
                style={{ background: 'var(--accent)', color: 'white', letterSpacing: '0.1em' }}
              >
                MOST POPULAR
              </div>
            )}

            <div>
              <p className="text-[12px] font-semibold mb-1" style={{ color: pkg.highlight ? 'var(--accent-fg)' : 'var(--text-3)' }}>
                {pkg.name}
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[28px] font-bold tracking-tight" style={{ color: 'var(--text-1)' }}>
                  {pkg.price}
                </span>
                <span className="text-[11px]" style={{ color: 'var(--text-4)' }}>{pkg.period}</span>
              </div>
              <p className="mt-1 text-[12px]" style={{ color: 'var(--text-3)' }}>{pkg.tagline}</p>
            </div>

            <ul className="space-y-2 flex-1">
              {pkg.features.map(f => (
                <li key={f} className="flex items-start gap-2 text-[12px]" style={{ color: 'var(--text-2)' }}>
                  <Check size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--good)' }} />
                  {f}
                </li>
              ))}
            </ul>

            <button
              className="w-full rounded-lg py-2.5 text-[12px] font-semibold transition-all"
              style={pkg.highlight ? {
                background: 'var(--accent)',
                color: 'white',
              } : {
                background: 'var(--bg-muted)',
                color: 'var(--text-2)',
                border: '1px solid var(--border)',
              }}
            >
              {pkg.highlight ? 'Book this package' : 'Select'}
            </button>
          </div>
        ))}
      </div>

      {/* Stats strip */}
      <div
        className="grid gap-4 rounded-xl p-5"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}
      >
        {[
          { icon: Globe,      label: 'Sites delivered',   value: '12' },
          { icon: Star,       label: 'Avg satisfaction',  value: '4.9★' },
          { icon: Clock,      label: 'Avg turnaround',    value: '18 days' },
          { icon: TrendingUp, label: 'Client retention',  value: '87%' },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="text-center">
            <Icon size={16} className="mx-auto mb-1.5" style={{ color: 'var(--text-4)' }} />
            <p className="text-[18px] font-bold" style={{ color: 'var(--text-1)' }}>{value}</p>
            <p className="mono text-[9px] mt-0.5" style={{ color: 'var(--text-4)', letterSpacing: '0.08em' }}>{label.toUpperCase()}</p>
          </div>
        ))}
      </div>

      {/* Add-ons collapsible */}
      <div className="zone-card overflow-hidden" style={{ padding: 0 }}>
        <button
          onClick={() => setAddonsOpen(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 transition-colors"
          style={{ color: 'var(--text-1)' }}
        >
          <div className="flex items-center gap-2">
            <Zap size={14} style={{ color: 'var(--accent)' }} />
            <span className="text-[13px] font-semibold">Add-ons</span>
            <span className="mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }}>
              {ADDONS.length}
            </span>
          </div>
          <ChevronDown
            size={15}
            style={{
              color: 'var(--text-3)',
              transform: addonsOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s ease',
            }}
          />
        </button>
        {addonsOpen && (
          <div className="grid gap-2 px-5 pb-5 fade-in" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {ADDONS.map(a => (
              <div
                key={a.label}
                className="flex items-center justify-between rounded-lg px-3 py-2.5"
                style={{ background: 'var(--bg-muted)', border: '1px solid var(--border-soft)' }}
              >
                <span className="text-[12px]" style={{ color: 'var(--text-2)' }}>{a.label}</span>
                <span className="mono text-[11px] font-semibold" style={{ color: 'var(--accent-fg)' }}>{a.price}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Projects tab ───────────────────────────────────────────────────────────── */
function ProjectsTab() {
  const [tasks, setTasks]         = useState<ClientTask[]>(INITIAL_TASKS)
  const [newTitle, setNewTitle]   = useState('')
  const [newClient, setNewClient] = useState('')
  const [newDue, setNewDue]       = useState('')
  const [filter, setFilter]       = useState<ClientTask['status'] | 'all'>('all')

  function addTask() {
    if (!newTitle.trim()) return
    const t: ClientTask = {
      id:       `t${Date.now()}`,
      title:    newTitle.trim(),
      client:   newClient.trim() || 'Unknown',
      status:   'todo',
      priority: 'med',
      due:      newDue || undefined,
    }
    setTasks(prev => [t, ...prev])
    setNewTitle(''); setNewClient(''); setNewDue('')
  }

  function cycleStatus(id: string) {
    const order: ClientTask['status'][] = ['todo', 'active', 'review', 'done']
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t
      const next = order[(order.indexOf(t.status) + 1) % order.length]
      return { ...t, status: next }
    }))
  }

  function remove(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  const visible = filter === 'all' ? tasks : tasks.filter(t => t.status === filter)
  const counts  = STATUS_COLS.reduce((acc, col) => {
    acc[col.id] = tasks.filter(t => t.status === col.id).length
    return acc
  }, {} as Record<ClientTask['status'], number>)

  function isOverdue(due?: string) {
    if (!due) return false
    return new Date(due) < new Date()
  }

  return (
    <div className="fade-in space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-[22px] font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>
          Client Projects
        </h2>
        <p className="mt-1 text-[13px]" style={{ color: 'var(--text-3)' }}>
          Track deliverables across all active Harmony Stack clients.
        </p>
      </div>

      {/* Status summary pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter('all')}
          className="mono px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all"
          style={{
            background: filter === 'all' ? 'var(--accent)' : 'var(--bg-muted)',
            color:      filter === 'all' ? 'white'         : 'var(--text-3)',
            border:     '1px solid ' + (filter === 'all' ? 'transparent' : 'var(--border)'),
          }}
        >
          All · {tasks.length}
        </button>
        {STATUS_COLS.map(col => (
          <button
            key={col.id}
            onClick={() => setFilter(col.id)}
            className="mono px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all"
            style={{
              background: filter === col.id ? col.color : 'var(--bg-muted)',
              color:      filter === col.id ? 'white'   : 'var(--text-3)',
              border:     '1px solid ' + (filter === col.id ? 'transparent' : 'var(--border)'),
            }}
          >
            {col.label} · {counts[col.id]}
          </button>
        ))}
      </div>

      {/* Add task */}
      <div className="zone-card flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[160px]">
          <label className="block mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>
            Task
          </label>
          <input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()}
            placeholder="New task…"
            className="w-full rounded-lg px-3 py-2 text-[12px]"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-1)', outline: 'none' }}
            onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={e  => (e.target.style.borderColor = 'var(--border)')}
          />
        </div>
        <div className="min-w-[130px]">
          <label className="block mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>
            Client
          </label>
          <input
            value={newClient}
            onChange={e => setNewClient(e.target.value)}
            placeholder="Client name"
            className="w-full rounded-lg px-3 py-2 text-[12px]"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-1)', outline: 'none' }}
            onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={e  => (e.target.style.borderColor = 'var(--border)')}
          />
        </div>
        <div className="min-w-[130px]">
          <label className="block mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>
            Due date
          </label>
          <input
            type="date"
            value={newDue}
            onChange={e => setNewDue(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-[12px]"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-1)', outline: 'none' }}
          />
        </div>
        <button
          onClick={addTask}
          disabled={!newTitle.trim()}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-white transition-all"
          style={{ background: newTitle.trim() ? 'var(--accent)' : 'var(--bg-muted)', color: newTitle.trim() ? 'white' : 'var(--text-4)', cursor: newTitle.trim() ? 'pointer' : 'not-allowed' }}
        >
          <Plus size={13} /> Add
        </button>
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {visible.length === 0 && (
          <div className="zone-card text-center py-10" style={{ color: 'var(--text-4)' }}>
            <Circle size={24} className="mx-auto mb-3 opacity-30" />
            <p className="text-[13px]">No tasks here yet.</p>
          </div>
        )}
        {visible.map(task => {
          const statusCol = STATUS_COLS.find(c => c.id === task.status)!
          const priCfg    = PRIORITY_COLORS[task.priority]
          const overdue   = isOverdue(task.due) && task.status !== 'done'
          return (
            <div
              key={task.id}
              className="zone-card flex items-center gap-3"
              style={{ padding: '12px 16px', opacity: task.status === 'done' ? 0.6 : 1 }}
            >
              {/* Status toggle */}
              <button
                onClick={() => cycleStatus(task.id)}
                className="rounded-full p-1 transition-all shrink-0"
                style={{ background: 'color-mix(in oklab, ' + statusCol.color + ' 15%, transparent)', color: statusCol.color }}
                title={`Status: ${statusCol.label} — click to advance`}
              >
                {task.status === 'done' ? <Check size={13} /> : <Circle size={13} />}
              </button>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p
                  className="text-[13px] font-medium truncate"
                  style={{ color: 'var(--text-1)', textDecoration: task.status === 'done' ? 'line-through' : 'none' }}
                >
                  {task.title}
                </p>
                <p className="mono text-[10px] mt-0.5" style={{ color: 'var(--text-4)' }}>{task.client}</p>
              </div>

              {/* Badges */}
              <div className="flex items-center gap-2 shrink-0">
                {task.due && (
                  <span
                    className="mono text-[10px] px-2 py-0.5 rounded flex items-center gap-1"
                    style={{
                      background: overdue ? 'var(--bad-soft)'  : 'var(--bg-muted)',
                      color:      overdue ? 'var(--bad)'       : 'var(--text-4)',
                    }}
                  >
                    <Clock size={9} />
                    {new Date(task.due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
                <span
                  className="mono text-[9px] font-bold px-1.5 py-0.5 rounded uppercase"
                  style={{ background: priCfg.bg, color: priCfg.fg }}
                >
                  {task.priority}
                </span>
                <span
                  className="mono text-[9px] font-semibold px-2 py-0.5 rounded"
                  style={{ background: 'color-mix(in oklab, ' + statusCol.color + ' 15%, transparent)', color: statusCol.color }}
                >
                  {statusCol.label}
                </span>
                <button onClick={() => remove(task.id)} style={{ color: 'var(--text-4)' }} className="transition-colors hover:text-red-500">
                  <X size={13} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Trash completed */}
      {tasks.some(t => t.status === 'done') && (
        <button
          onClick={() => setTasks(prev => prev.filter(t => t.status !== 'done'))}
          className="flex items-center gap-2 text-[11px] transition-colors"
          style={{ color: 'var(--text-4)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--bad)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-4)')}
        >
          <Trash2 size={12} /> Clear completed tasks
        </button>
      )}
    </div>
  )
}

/* ── Root component ─────────────────────────────────────────────────────────── */
export default function HarmonyStackZone({ defaultTab = 'services' }: { defaultTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(defaultTab)

  return (
    <div className="zone-canvas flex flex-col">
      {/* Topbar */}
      <header className="zone-topbar">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'var(--accent)', color: 'white' }}>
            <Globe size={12} />
          </div>
          <span className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>Harmony Stack</span>
          <span className="mono text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--good-soft)', color: 'var(--good)' }}>
            ● ACTIVE
          </span>
        </div>
      </header>

      {/* Tab bar */}
      <div className="flex px-8 pt-6 gap-1" style={{ borderBottom: '1px solid var(--border)' }}>
        {(['services', 'projects'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 text-[13px] font-medium capitalize transition-all rounded-t-lg"
            style={{
              color:       t === tab ? 'var(--accent-fg)' : 'var(--text-3)',
              borderBottom: t === tab ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t === 'services' ? 'Services & Pricing' : 'Client Projects'}
          </button>
        ))}
      </div>

      <div className="zone-inner">
        {tab === 'services' ? <ServicesTab /> : <ProjectsTab />}
      </div>
    </div>
  )
}
