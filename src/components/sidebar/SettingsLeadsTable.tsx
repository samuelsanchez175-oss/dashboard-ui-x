import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { MoreHorizontal, X } from 'lucide-react'

const STORAGE_KEY = 'sidebar-profile-settings-leads-v1'

export interface Lead {
  id: string
  name: string
  email: string
  source: string
  sourceType: 'organic' | 'campaign'
  status: 'pre-sale' | 'closed' | 'lost' | 'closing' | 'new'
  size: number
  interest: number[]
  probability: 'low' | 'mid' | 'high'
  lastAction: string
  /** API token, snippet, or env line — persisted per row on Save. */
  integrationCode: string
}

export interface SettingsLeadsTableProps {
  title?: string
  leads?: Lead[]
  onLeadAction?: (leadId: string, action: string) => void
  className?: string
}

const defaultLeads: Lead[] = [
  {
    id: '1',
    name: 'Andy Shepard',
    email: 'a.shepard@gmail.com',
    source: 'ORGANIC',
    sourceType: 'organic',
    status: 'pre-sale',
    size: 120_000,
    interest: [45, 52, 48, 55, 58, 60, 57, 62, 65, 63],
    probability: 'mid',
    lastAction: 'Sep 12, 2024',
    integrationCode: '',
  },
  {
    id: '2',
    name: 'Emily Thompson',
    email: 'e.thompson@gmail.com',
    source: 'SB2024',
    sourceType: 'campaign',
    status: 'closed',
    size: 200_000,
    interest: [30, 35, 42, 48, 55, 62, 68, 70, 75, 78],
    probability: 'high',
    lastAction: 'Sep 13, 2024',
    integrationCode: '',
  },
  {
    id: '3',
    name: 'Michael Carter',
    email: 'm.carter@gmail.com',
    source: 'SUMMER2',
    sourceType: 'campaign',
    status: 'pre-sale',
    size: 45_000,
    interest: [70, 68, 65, 60, 58, 55, 52, 48, 45, 42],
    probability: 'low',
    lastAction: 'Sep 12, 2024',
    integrationCode: '',
  },
  {
    id: '4',
    name: 'David Anderson',
    email: 'd.anderson@gmail.com',
    source: 'DTJ25',
    sourceType: 'campaign',
    status: 'pre-sale',
    size: 80_000,
    interest: [25, 28, 32, 38, 45, 52, 58, 62, 68, 70],
    probability: 'high',
    lastAction: 'Sep 12, 2024',
    integrationCode: '',
  },
  {
    id: '5',
    name: 'Lily Hernandez',
    email: 'l.hernandez@gmail.com',
    source: 'ORGANIC',
    sourceType: 'organic',
    status: 'lost',
    size: 110_000,
    interest: [60, 58, 55, 50, 45, 42, 38, 35, 30, 28],
    probability: 'low',
    lastAction: 'Sep 12, 2024',
    integrationCode: '',
  },
  {
    id: '6',
    name: 'Christopher Wilson',
    email: 'c.wilson@gmail.com',
    source: 'SB2024',
    sourceType: 'campaign',
    status: 'closed',
    size: 2_120_000,
    interest: [40, 42, 45, 48, 50, 52, 55, 58, 60, 62],
    probability: 'mid',
    lastAction: 'Sep 12, 2024',
    integrationCode: '',
  },
  {
    id: '7',
    name: 'Isabella Lopez',
    email: 'i.lopez@gmail.com',
    source: 'ORGANIC',
    sourceType: 'organic',
    status: 'closing',
    size: 20_000,
    interest: [35, 38, 42, 46, 50, 55, 60, 65, 68, 72],
    probability: 'high',
    lastAction: 'Sep 12, 2024',
    integrationCode: '',
  },
  {
    id: '8',
    name: 'Sophia Morgan',
    email: 's.morgan@gmail.com',
    source: 'AFF20',
    sourceType: 'campaign',
    status: 'new',
    size: 95_000,
    interest: [55, 52, 48, 45, 40, 38, 35, 32, 30, 28],
    probability: 'low',
    lastAction: 'Sep 11, 2024',
    integrationCode: '',
  },
  {
    id: '9',
    name: 'John Davis',
    email: 'j.davis@gmail.com',
    source: 'ORGANIC',
    sourceType: 'organic',
    status: 'pre-sale',
    size: 200_000,
    interest: [30, 35, 40, 45, 50, 55, 60, 58, 62, 65],
    probability: 'mid',
    lastAction: 'Sep 11, 2024',
    integrationCode: '',
  },
]

function loadStoredLeads(): Lead[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultLeads
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return defaultLeads
    const byId = new Map(
      parsed
        .filter((row): row is Lead => !!row && typeof row === 'object' && 'id' in row)
        .map(row => [String((row as Lead).id), row as Lead]),
    )
    return defaultLeads.map(template => {
      const hit = byId.get(template.id)
      if (!hit) return { ...template, integrationCode: '' }
      return {
        ...template,
        ...hit,
        integrationCode: typeof hit.integrationCode === 'string' ? hit.integrationCode : '',
      }
    })
  } catch {
    return defaultLeads
  }
}

function persistLeads(next: Lead[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export function SettingsLeadsTable({
  title = 'Leads',
  leads: initialLeads,
  onLeadAction,
  className = '',
}: SettingsLeadsTableProps) {
  const [leads, setLeads] = useState<Lead[]>(() => initialLeads ?? loadStoredLeads())
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(() => new Set())
  const [hoveredAction, setHoveredAction] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [justSavedId, setJustSavedId] = useState<string | null>(null)
  const shouldReduceMotion = useReducedMotion()
  const selectAllRef = useRef<HTMLInputElement>(null)

  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => setIsDark(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const isAllSelected = useMemo(
    () => selectedLeads.size === leads.length && leads.length > 0,
    [selectedLeads.size, leads.length],
  )
  const isIndeterminate = selectedLeads.size > 0 && selectedLeads.size < leads.length

  useEffect(() => {
    const el = selectAllRef.current
    if (el) el.indeterminate = isIndeterminate
  }, [isIndeterminate])

  const handleLeadSelection = (leadId: string, selected: boolean) => {
    setSelectedLeads(prev => {
      const next = new Set(prev)
      if (selected) next.add(leadId)
      else next.delete(leadId)
      return next
    })
  }

  const handleSelectAll = (selected: boolean) => {
    if (selected) setSelectedLeads(new Set(leads.map(l => l.id)))
    else setSelectedLeads(new Set())
  }

  const isSelected = (leadId: string) => selectedLeads.has(leadId)

  const handleLeadAction = (leadId: string, action: string) => {
    onLeadAction?.(leadId, action)
  }

  const handleSort = () => {
    const newOrder = sortOrder === 'asc' ? 'desc' : 'asc'
    setSortOrder(newOrder)
    setLeads(prev => {
      const sorted = [...prev].sort((a, b) => {
        const aDate = new Date(a.lastAction)
        const bDate = new Date(b.lastAction)
        const aOk = !Number.isNaN(aDate.getTime())
        const bOk = !Number.isNaN(bDate.getTime())
        if (!aOk || !bOk) return 0
        return newOrder === 'asc' ? aDate.getTime() - bDate.getTime() : bDate.getTime() - aDate.getTime()
      })
      persistLeads(sorted)
      return sorted
    })
  }

  const updateIntegrationCode = (leadId: string, integrationCode: string) => {
    setLeads(prev => prev.map(l => (l.id === leadId ? { ...l, integrationCode } : l)))
  }

  const saveRow = useCallback((leadId: string) => {
    setLeads(prev => {
      persistLeads(prev)
      return prev
    })
    setJustSavedId(leadId)
    window.setTimeout(() => setJustSavedId(id => (id === leadId ? null : id)), 2000)
  }, [])

  const formatCurrency = (amount: number) => {
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`
    return `$${amount.toLocaleString()}`
  }

  const getSourcePill = (source: string, sourceType: 'organic' | 'campaign') => {
    const isOrganic = sourceType === 'organic'
    return (
      <div
        className={`px-2 py-1 rounded-lg text-xs font-medium ${
          isOrganic
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-blue-50 text-blue-700 border border-blue-200'
        }`}
      >
        {source}
        {!isOrganic && <span className="ml-1 text-xs opacity-60">↗</span>}
      </div>
    )
  }

  const getStatusPill = (status: Lead['status']) => {
    const statusConfig = {
      'pre-sale': {
        bg: 'bg-orange-50',
        text: 'text-orange-700',
        border: 'border-orange-200',
        label: 'PRE-SALE',
      },
      closed: {
        bg: 'bg-green-50',
        text: 'text-green-700',
        border: 'border-green-200',
        label: 'CLOSED',
      },
      lost: {
        bg: 'bg-red-50',
        text: 'text-red-700',
        border: 'border-red-200',
        label: 'LOST',
      },
      closing: {
        bg: 'bg-blue-50',
        text: 'text-blue-700',
        border: 'border-blue-200',
        label: 'CLOSING',
      },
      new: {
        bg: 'bg-purple-50',
        text: 'text-purple-700',
        border: 'border-purple-200',
        label: 'NEW',
      },
    }
    const config = statusConfig[status]
    return (
      <div className={`px-2 py-1 rounded-lg text-xs font-medium ${config.bg} ${config.text} border ${config.border}`}>
        {config.label}
      </div>
    )
  }

  const renderSparkline = (data: number[]) => {
    const min = Math.min(...data)
    const max = Math.max(...data)
    const range = max - min || 1
    const isUpTrend = data[data.length - 1] > data[0]
    const points = data
      .map((value, index) => {
        const x = (index / (data.length - 1)) * 60
        const y = 20 - ((value - min) / range) * 15
        return `${x},${y}`
      })
      .join(' ')
    const upColor = isDark ? '#22c55e' : '#16a34a'
    const downColor = isDark ? '#f87171' : '#dc2626'
    return (
      <div className="w-16 h-6">
        <svg width="60" height="20" viewBox="0 0 60 20" className="overflow-visible">
          <polyline
            points={points}
            fill="none"
            stroke={isUpTrend ? upColor : downColor}
            strokeWidth="2"
            className="drop-shadow-sm"
          />
          <circle
            cx={data.length === 1 ? 30 : ((data.length - 1) / (data.length - 1)) * 60}
            cy={20 - ((data[data.length - 1] - min) / range) * 15}
            r="2"
            fill={isUpTrend ? upColor : downColor}
          />
        </svg>
      </div>
    )
  }

  const getProbabilityIcon = (probability: Lead['probability']) => {
    const barCount = probability === 'low' ? 1 : probability === 'mid' ? 2 : 3
    const probabilityColors = {
      low: 'bg-orange-50 text-orange-700 border-orange-200',
      mid: 'bg-yellow-50 text-yellow-700 border-yellow-200',
      high: 'bg-green-50 text-green-700 border-green-200',
    }
    return (
      <div
        className={`px-2 py-1 rounded-lg text-xs font-medium border flex items-center gap-2 ${probabilityColors[probability]}`}
      >
        <div className="flex items-end gap-0.5">
          {[1, 2, 3].map(bar => (
            <div
              key={bar}
              className={`w-1 rounded-full ${bar <= barCount ? 'bg-current' : 'bg-current/30'}`}
              style={{ height: bar === 1 ? '4px' : bar === 2 ? '8px' : '12px' }}
            />
          ))}
        </div>
        <span className="uppercase tracking-wide">{probability}</span>
      </div>
    )
  }

  const containerVariants = {
    visible: {
      transition: { staggerChildren: shouldReduceMotion ? 0 : 0.04, delayChildren: shouldReduceMotion ? 0 : 0.1 },
    },
  }

  const rowVariants = shouldReduceMotion
    ? { hidden: { opacity: 1 }, visible: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 20, scale: 0.98, filter: 'blur(4px)' },
        visible: {
          opacity: 1,
          y: 0,
          scale: 1,
          filter: 'blur(0px)',
          transition: { type: 'spring' as const, stiffness: 400, damping: 25, mass: 0.7 },
        },
      }

  return (
    <div className={`w-full max-w-7xl mx-auto ${className}`}>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
      <p className="text-xs text-gray-500 mb-4 max-w-2xl">
        Type API keys, tokens, or one-line env snippets per row. <strong>Save</strong> writes this browser’s{' '}
        <code className="rounded bg-gray-100 px-1 font-mono text-[11px]">localStorage</code> (key{' '}
        <code className="rounded bg-gray-100 px-1 font-mono text-[11px]">{STORAGE_KEY}</code>).
      </p>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 px-4 sm:px-6 py-3 text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wide bg-gray-50/80 border-b border-gray-200 items-center">
          <div className="flex items-center gap-2 min-w-0 col-span-2 sm:col-span-1">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={isAllSelected}
              onChange={e => handleSelectAll(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500/30 shrink-0"
            />
            <span className="truncate">Lead</span>
          </div>
          <div className="hidden lg:flex items-center truncate">Source</div>
          <div className="hidden lg:flex items-center truncate">Status</div>
          <div className="flex items-center truncate">Size</div>
          <div className="hidden md:flex items-center">Interest</div>
          <div className="hidden xl:flex items-center">Prob.</div>
          <div className="col-span-2 lg:col-span-1 min-w-0 flex items-center">Code</div>
          <button
            type="button"
            onClick={handleSort}
            className="flex items-center justify-end lg:justify-center gap-1 cursor-pointer hover:text-gray-800 text-left"
          >
            Updated
            <span className="text-gray-400" aria-hidden>
              {sortOrder === 'asc' ? '↑' : '↓'}
            </span>
          </button>
        </div>

        <motion.div variants={containerVariants} initial="hidden" animate="visible">
          {leads.map((lead, index) => (
            <motion.div key={lead.id} variants={rowVariants}>
              <div
                className={`grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 sm:gap-3 px-4 sm:px-6 py-3 hover:bg-gray-50/80 transition-colors group relative items-center ${
                  isSelected(lead.id) ? 'bg-violet-50/60' : ''
                } ${index < leads.length - 1 ? 'border-b border-gray-100' : ''}`}
                onMouseEnter={() => setHoveredAction(lead.id)}
                onMouseLeave={() => setHoveredAction(null)}
              >
                <div className="flex items-center gap-2 min-w-0 col-span-2 sm:col-span-1">
                  <input
                    type="checkbox"
                    checked={isSelected(lead.id)}
                    onChange={e => handleLeadSelection(lead.id, e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500/30 shrink-0"
                  />
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center shrink-0 border border-gray-200">
                      <span className="text-sm font-medium text-gray-600">{lead.name.charAt(0)}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate text-sm">{lead.name}</div>
                      <div className="text-xs text-gray-500 truncate">{lead.email}</div>
                    </div>
                  </div>
                </div>

                <div className="hidden lg:flex items-center">{getSourcePill(lead.source, lead.sourceType)}</div>

                <div className="hidden lg:flex items-center">{getStatusPill(lead.status)}</div>

                <div className="flex items-center">
                  <span className="font-semibold text-gray-900 text-sm">{formatCurrency(lead.size)}</span>
                </div>

                <div className="hidden md:flex items-center">{renderSparkline(lead.interest)}</div>

                <div className="hidden xl:flex items-center">{getProbabilityIcon(lead.probability)}</div>

                <div className="col-span-2 lg:col-span-1 flex items-center min-w-0 w-full">
                  <input
                    type="password"
                    value={lead.integrationCode}
                    onChange={e => updateIntegrationCode(lead.id, e.target.value)}
                    placeholder="API key or env line…"
                    autoComplete="off"
                    className="w-full min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 col-span-2 lg:col-span-1">
                  <button
                    type="button"
                    onClick={() => saveRow(lead.id)}
                    className="px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-sm transition-colors whitespace-nowrap"
                  >
                    {justSavedId === lead.id ? 'Saved ✓' : 'Save'}
                  </button>
                  <AnimatePresence mode="wait">
                    {hoveredAction === lead.id ? (
                      <motion.button
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -6 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                        type="button"
                        onClick={() => handleLeadAction(lead.id, 'engage')}
                        className="hidden sm:flex items-center gap-1 px-2 py-1.5 bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200 rounded-lg text-xs font-medium"
                      >
                        Engage
                        <MoreHorizontal className="w-3 h-3" />
                      </motion.button>
                    ) : (
                      <span className="hidden lg:inline text-xs text-gray-400 whitespace-nowrap">{lead.lastAction}</span>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <AnimatePresence>
        {selectedLeads.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100]"
          >
            <div className="bg-white/95 backdrop-blur-md border border-gray-200 rounded-xl px-4 py-2 shadow-xl">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-medium text-gray-700">{selectedLeads.size} selected</span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-medium"
                    onClick={() => {
                      setLeads(prev => {
                        persistLeads(prev)
                        return prev
                      })
                    }}
                  >
                    Save all to storage
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-xs font-medium"
                    onClick={() => setSelectedLeads(new Set())}
                  >
                    Clear selection
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

interface ProfileSettingsModalProps {
  onClose: () => void
}

export function ProfileSettingsModal({ onClose }: ProfileSettingsModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-settings-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="relative w-full max-w-7xl max-h-[min(92vh,900px)] overflow-y-auto rounded-2xl bg-gray-50 shadow-2xl border border-gray-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-200 bg-white/90 backdrop-blur-md">
          <h2 id="profile-settings-title" className="text-base font-semibold text-gray-900">
            Profile & settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
            aria-label="Close settings"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="p-6">
          <SettingsLeadsTable title="Integrations table (local save per row)" />
        </div>
      </motion.div>
    </motion.div>
  )
}
