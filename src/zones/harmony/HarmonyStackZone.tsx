import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react'
import {
  Check,
  ChevronDown,
  Circle,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react'

import UpdateDot from '../../components/ui/UpdateDot'
import { fetchWithKeys, getApiKey, setApiKey, subscribeApiKeys } from '../../lib/api-keys'

/* ── Types ─────────────────────────────────────────────────────────────────── */
type Tab = 'services' | 'projects' | 'portfolio'

const HARMONY_TAB_ORDER: Tab[] = ['services', 'projects', 'portfolio']

function tabLabel(t: Tab): string {
  if (t === 'services') return 'Services & Pricing'
  if (t === 'projects') return 'Client Projects'
  return 'Portfolio'
}

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

const HARMONY_CLIENT_PROJECTS_AI_KEY = 'HARMONY_CLIENT_PROJECTS_AI_KEY' as const

function buildClientProjectsGeminiPrompt(task: ClientTask): string {
  const dueLine = task.due
    ? `Due date: ${task.due}`
    : 'Due date: not set'
  return [
    'You help a web design studio (Harmony Stack) turn internal tasks into a single, copy-pasteable assistant prompt.',
    '',
    'Task context:',
    `- Title: ${task.title}`,
    `- Client / project: ${task.client}`,
    `- Current workflow status: ${task.status}`,
    `- Priority: ${task.priority}`,
    `- ${dueLine}`,
    '',
    'Write ONE cohesive block of instructions (no meta commentary, no surrounding quotes) that the designer can paste into an AI tool to execute or prepare this task well. Keep it under ~220 words.',
  ].join('\n')
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
      <div className="grid gap-[var(--grid-gap)]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(var(--tile-min), 1fr))' }}>
        {PACKAGES.map(pkg => (
          <div
            key={pkg.id}
            className="zone-card flex flex-col gap-[var(--grid-gap)] relative overflow-hidden"
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
        className="grid gap-[var(--grid-gap)] rounded-xl p-5"
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
          <div className="grid gap-2 px-5 pb-5 fade-in" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(var(--tile-min), 1fr))' }}>
            {ADDONS.map(a => (
              <div
                key={a.label}
                className="flex items-center justify-between rounded-lg px-[var(--pad-row)] py-[var(--pad-row)]"
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
  const harmonyKeyInputId = useId()
  const [tasks, setTasks] = useState<ClientTask[]>(INITIAL_TASKS)
  const [newTitle, setNewTitle] = useState('')
  const [newClient, setNewClient] = useState('')
  const [newDue, setNewDue] = useState('')
  const [harmonyAiKeyDraft, setHarmonyAiKeyDraft] = useState(() => getApiKey(HARMONY_CLIENT_PROJECTS_AI_KEY))
  const [showHarmonyAiKey, setShowHarmonyAiKey] = useState(false)
  const [promptModal, setPromptModal] = useState<
    null | { taskTitle: string; loading: boolean; text: string; error: string }
  >(null)
  const [copyFlash, setCopyFlash] = useState(false)

  useEffect(() => subscribeApiKeys(keys => {
    setHarmonyAiKeyDraft(keys[HARMONY_CLIENT_PROJECTS_AI_KEY] ?? '')
  }), [])

  const clientsGrouped = useMemo(() => {
    const map = new Map<string, ClientTask[]>()
    for (const t of tasks) {
      const key = t.client.trim() || 'Unknown'
      const arr = map.get(key) ?? []
      arr.push(t)
      map.set(key, arr)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [tasks])

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

  function setTaskStatus(id: string, status: ClientTask['status']) {
    setTasks(prev => prev.map(task => (task.id === id ? { ...task, status } : task)))
  }

  function removeTask(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  function isOverdue(due?: string) {
    if (!due) return false
    return new Date(due) < new Date()
  }

  async function runBuildPrompt(task: ClientTask) {
    setPromptModal({ taskTitle: task.title, loading: true, text: '', error: '' })
    const prompt = buildClientProjectsGeminiPrompt(task)
    try {
      const res = await fetchWithKeys('/api/harmony/client-projects/build-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxOutputTokens: 512 }),
      })
      const body = (await res.json()) as { ok?: boolean; preview?: string | null; message?: string }
      const failed = !res.ok || (body && typeof body === 'object' && 'ok' in body && body.ok === false)
      if (failed) {
        const msg = typeof body?.message === 'string' ? body.message : `HTTP ${res.status}`
        setPromptModal(m => (m ? { ...m, loading: false, error: msg, text: '' } : null))
        return
      }
      const text = typeof body.preview === 'string' ? body.preview : ''
      setPromptModal(m => (m ? { ...m, loading: false, text, error: '' } : null))
    } catch (e) {
      setPromptModal(m => (m
        ? { ...m, loading: false, error: e instanceof Error ? e.message : 'Request failed', text: '' }
        : null))
    }
  }

  async function copyModalText() {
    const text = promptModal?.text
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopyFlash(true)
      window.setTimeout(() => setCopyFlash(false), 1600)
    } catch {
      /* ignore */
    }
  }

  function renderTaskRow(
    task: ClientTask,
    mode: 'todo' | 'done',
  ) {
    const statusCol = STATUS_COLS.find(c => c.id === task.status)!
    const priCfg = PRIORITY_COLORS[task.priority]
    const overdue = isOverdue(task.due) && task.status !== 'done'
    return (
      <li
        key={task.id}
        className="flex flex-col gap-2 rounded-lg px-[var(--pad-row)] py-[var(--pad-row)] sm:flex-row sm:items-center sm:gap-3"
        style={{ background: 'var(--bg-muted)', border: '1px solid var(--border-soft)' }}
      >
        <div className="flex flex-1 min-w-0 items-start gap-2">
          <div
            className="mt-0.5 shrink-0 rounded-full p-1"
            style={{ background: 'color-mix(in oklab, ' + statusCol.color + ' 15%, transparent)', color: statusCol.color }}
            title={`Status: ${statusCol.label}`}
          >
            {task.status === 'done' ? <Check size={12} /> : <Circle size={12} />}
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-[13px] font-medium break-words"
              style={{
                color: 'var(--text-1)',
                textDecoration: task.status === 'done' ? 'line-through' : 'none',
              }}
            >
              {task.title}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {task.due && (
                <span
                  className="mono flex items-center gap-1 rounded px-2 py-0.5 text-[10px]"
                  style={{
                    background: overdue ? 'var(--bad-soft)' : 'var(--bg-card)',
                    color: overdue ? 'var(--bad)' : 'var(--text-4)',
                  }}
                >
                  <Clock size={9} />
                  {new Date(task.due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
              <span
                className="mono rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
                style={{ background: priCfg.bg, color: priCfg.fg }}
              >
                {task.priority}
              </span>
              <span
                className="mono rounded px-2 py-0.5 text-[9px] font-semibold"
                style={{ background: 'color-mix(in oklab, ' + statusCol.color + ' 15%, transparent)', color: statusCol.color }}
              >
                {statusCol.label}
              </span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:pl-2">
          {mode === 'todo' && (
            <>
              <button
                type="button"
                onClick={() => setTaskStatus(task.id, 'done')}
                className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors"
                style={{ background: 'var(--good-soft)', color: 'var(--good)' }}
              >
                Done
              </button>
              <button
                type="button"
                onClick={() => void runBuildPrompt(task)}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }}
              >
                <Sparkles size={12} />
                Build a prompt
              </button>
            </>
          )}
          {mode === 'done' && (
            <button
              type="button"
              onClick={() => setTaskStatus(task.id, 'todo')}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
            >
              <RotateCcw size={12} />
              Restore
            </button>
          )}
          <button
            type="button"
            onClick={() => removeTask(task.id)}
            className="rounded-lg p-1.5 transition-colors"
            style={{ color: 'var(--text-4)' }}
            title="Delete task"
            aria-label="Delete task"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </li>
    )
  }

  return (
    <div className="fade-in space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-[var(--grid-gap)]">
        <div className="min-w-0 flex-1">
          <h2 className="text-[22px] font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>
            Client Projects
          </h2>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--text-3)' }}>
            Track deliverables across all active Harmony Stack clients.
          </p>
        </div>
        <div className="flex w-full max-w-[min(100%,320px)] flex-col items-stretch gap-1 sm:w-auto sm:items-end">
          <label
            htmlFor={harmonyKeyInputId}
            className="mono text-[9px] font-semibold uppercase tracking-wider sm:self-end"
            style={{ color: 'var(--text-4)' }}
          >
            HARMONY_CLIENT_PROJECTS_AI_KEY
          </label>
          <div className="flex items-center gap-1">
            <input
              id={harmonyKeyInputId}
              type={showHarmonyAiKey ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              value={harmonyAiKeyDraft}
              onChange={e => {
                const v = e.target.value
                setHarmonyAiKeyDraft(v)
                setApiKey(HARMONY_CLIENT_PROJECTS_AI_KEY, v)
              }}
              placeholder="Optional; falls back to GEMINI"
              className="mono min-w-0 flex-1 rounded-lg px-2 py-1.5 text-[11px]"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-1)', outline: 'none' }}
              onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
            <button
              type="button"
              onClick={() => setShowHarmonyAiKey(v => !v)}
              className="shrink-0 rounded-lg p-1.5 transition-colors"
              style={{ color: 'var(--text-3)', border: '1px solid var(--border)', background: 'var(--bg-card)' }}
              aria-label={showHarmonyAiKey ? 'Hide API key' : 'Show API key'}
            >
              {showHarmonyAiKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
      </div>

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
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
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
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
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

      {tasks.length === 0 ? (
        <div className="zone-card py-10 text-center" style={{ color: 'var(--text-4)' }}>
          <Circle size={24} className="mx-auto mb-3 opacity-30" />
          <p className="text-[13px]">No tasks yet. Add one above.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {clientsGrouped.map(([client, clientTasks]) => {
            const todo = clientTasks.filter(t => t.status !== 'done')
            const done = clientTasks.filter(t => t.status === 'done')
            return (
              <section key={client} className="zone-card space-y-5" style={{ padding: 'var(--pad-card)' }}>
                <h3 className="text-[15px] font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>{client}</h3>

                <div>
                  <p className="mono mb-2 text-[10px] font-semibold tracking-widest" style={{ color: 'var(--text-4)' }}>TO DO</p>
                  {todo.length === 0 ? (
                    <p className="text-[12px]" style={{ color: 'var(--text-4)' }}>No open tasks for this client.</p>
                  ) : (
                    <ul className="space-y-2">
                      {todo.map(task => renderTaskRow(task, 'todo'))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="mono mb-2 text-[10px] font-semibold tracking-widest" style={{ color: 'var(--text-4)' }}>DONE</p>
                  {done.length === 0 ? (
                    <p className="text-[12px]" style={{ color: 'var(--text-4)' }}>Nothing completed yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {done.map(task => renderTaskRow(task, 'done'))}
                    </ul>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {promptModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          role="presentation"
          onClick={e => {
            if (e.target === e.currentTarget && !promptModal.loading) setPromptModal(null)
          }}
        >
          <div
            className="zone-card flex max-h-[min(80vh,520px)] w-full max-w-lg flex-col gap-3"
            role="dialog"
            aria-modal="true"
            aria-labelledby="harmony-prompt-modal-title"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p id="harmony-prompt-modal-title" className="text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>
                  Generated prompt
                </p>
                <p className="mt-0.5 truncate text-[11px]" style={{ color: 'var(--text-4)' }}>{promptModal.taskTitle}</p>
              </div>
              <button
                type="button"
                disabled={promptModal.loading}
                onClick={() => setPromptModal(null)}
                className="shrink-0 rounded p-1 transition-colors"
                style={{ color: 'var(--text-3)' }}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div
              className="mono min-h-[120px] flex-1 overflow-y-auto whitespace-pre-wrap rounded-lg p-3 text-[12px] leading-relaxed"
              style={{ background: 'var(--bg-muted)', border: '1px solid var(--border-soft)', color: 'var(--text-2)' }}
            >
              {promptModal.loading && (
                <span className="inline-flex items-center gap-2" style={{ color: 'var(--text-4)' }}>
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                  Generating…
                </span>
              )}
              {promptModal.error && (
                <span style={{ color: 'var(--bad)' }}>{promptModal.error}</span>
              )}
              {!promptModal.loading && !promptModal.error && (
                promptModal.text || <span style={{ color: 'var(--text-4)' }}>(empty response)</span>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={!promptModal.text || promptModal.loading}
                onClick={() => void copyModalText()}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors"
                style={{
                  background: promptModal.text && !promptModal.loading ? 'var(--accent)' : 'var(--bg-muted)',
                  color: promptModal.text && !promptModal.loading ? 'white' : 'var(--text-4)',
                  cursor: promptModal.text && !promptModal.loading ? 'pointer' : 'not-allowed',
                }}
              >
                <Copy size={13} />
                {copyFlash ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                disabled={promptModal.loading}
                onClick={() => setPromptModal(null)}
                className="rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-2)', background: 'var(--bg-card)' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Portfolio tab ──────────────────────────────────────────────────────────── */
/** Latest public Harmony Stack site (synced from harmony-stack-productions). */
const HARMONY_PORTFOLIO_URL = `${import.meta.env.BASE_URL}harmony/index.html`

function PortfolioTab() {
  return (
    <div className="fade-in m-0 flex min-h-0 min-w-0 flex-1 flex-col p-0">
      <div className="m-0 flex min-h-0 min-w-0 w-full flex-1 flex-col p-0">
        <iframe
          title="Harmony Stack — portfolio, packages, and products"
          src={HARMONY_PORTFOLIO_URL}
          className="m-0 block min-h-0 min-w-0 h-full w-full flex-1 border-0 bg-[var(--bg-canvas)] p-0 align-top"
        />
      </div>
    </div>
  )
}

/* ── Root component ─────────────────────────────────────────────────────────── */
export default function HarmonyStackZone({ defaultTab = 'services' }: { defaultTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(defaultTab)
  const idRoot = useId()

  const tabIds = useMemo(() => ({
    services:  `${idRoot}-tab-services`,
    projects:  `${idRoot}-tab-projects`,
    portfolio: `${idRoot}-tab-portfolio`,
  }), [idRoot])

  const panelIds = useMemo(() => ({
    services:  `${idRoot}-panel-services`,
    projects:  `${idRoot}-panel-projects`,
    portfolio: `${idRoot}-panel-portfolio`,
  }), [idRoot])

  function focusTabButton(next: Tab) {
    const el = document.getElementById(tabIds[next])
    if (el instanceof HTMLElement) el.focus()
  }

  function handleTabListKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const cur = HARMONY_TAB_ORDER.indexOf(tab)
    if (cur < 0) return

    let next: Tab | null = null
    if (e.key === 'ArrowRight') {
      next = HARMONY_TAB_ORDER[(cur + 1) % HARMONY_TAB_ORDER.length]!
    } else if (e.key === 'ArrowLeft') {
      next = HARMONY_TAB_ORDER[(cur - 1 + HARMONY_TAB_ORDER.length) % HARMONY_TAB_ORDER.length]!
    } else if (e.key === 'Home') {
      next = HARMONY_TAB_ORDER[0]!
    } else if (e.key === 'End') {
      next = HARMONY_TAB_ORDER[HARMONY_TAB_ORDER.length - 1]!
    }

    if (!next) return

    e.preventDefault()
    setTab(next)
    requestAnimationFrame(() => focusTabButton(next))
  }

  return (
    <div className="zone-canvas flex min-h-0 flex-1 flex-col">
      {/* Topbar */}
      <header className="zone-topbar">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'var(--accent)', color: 'white' }}>
            <Globe size={12} />
          </div>
          <span className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>Harmony Stack</span>
          <span className="inline-flex shrink-0 items-center self-center">
            <UpdateDot zoneId="harmony-services" className="h-2 w-2" />
          </span>
          <span className="mono text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--good-soft)', color: 'var(--good)' }}>
            ● ACTIVE
          </span>
        </div>
      </header>

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Harmony Stack sections"
        onKeyDown={handleTabListKeyDown}
        className="flex px-8 pt-6 gap-1"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        {HARMONY_TAB_ORDER.map(t => {
          const isActive = t === tab
          return (
            <button
              key={t}
              type="button"
              role="tab"
              id={tabIds[t]}
              aria-selected={isActive}
              aria-controls={panelIds[t]}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setTab(t)}
              className="px-4 py-2 text-[13px] font-medium transition-all rounded-t-lg"
              style={{
                color:       isActive ? 'var(--accent-fg)' : 'var(--text-3)',
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {tabLabel(t)}
            </button>
          )
        })}
      </div>

      <div
        className={
          tab === 'portfolio'
            ? 'zone-inner zone-inner--harmony-portfolio flex min-h-0 min-w-0 flex-1 flex-col'
            : 'zone-inner'
        }
      >
        <div
          role="tabpanel"
          id={panelIds.services}
          aria-labelledby={tabIds.services}
          hidden={tab !== 'services'}
          tabIndex={tab === 'services' ? 0 : -1}
        >
          {tab === 'services' ? <ServicesTab /> : null}
        </div>
        <div
          role="tabpanel"
          id={panelIds.projects}
          aria-labelledby={tabIds.projects}
          hidden={tab !== 'projects'}
          tabIndex={tab === 'projects' ? 0 : -1}
        >
          {tab === 'projects' ? <ProjectsTab /> : null}
        </div>
        <div
          role="tabpanel"
          id={panelIds.portfolio}
          aria-labelledby={tabIds.portfolio}
          hidden={tab !== 'portfolio'}
          tabIndex={tab === 'portfolio' ? 0 : -1}
          className={tab === 'portfolio' ? 'flex min-h-0 min-w-0 flex-1 flex-col' : undefined}
        >
          {tab === 'portfolio' ? <PortfolioTab /> : null}
        </div>
      </div>
    </div>
  )
}
