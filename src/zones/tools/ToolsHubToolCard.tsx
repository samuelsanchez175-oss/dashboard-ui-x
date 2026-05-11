import { Clock, Star } from 'lucide-react'
import { useState } from 'react'
import { useTheme } from '../../context/ThemeContext'
import type { HubToolDef, HubToolStatus } from './toolsHubData'
import { TONE_DARK, TONE_LIGHT } from './toolsHubData'

function StatusBadge({ status }: { status: HubToolStatus }) {
  if (status === 'ready') return null
  if (status === 'beta') {
    return (
      <span
        className="mono rounded px-1 py-0.5 text-[9px] font-semibold tracking-wide"
        style={{
          background: 'var(--warn-soft)',
          color:      'var(--warn)',
          outline:    '1px solid color-mix(in oklab, var(--warn) 30%, transparent)',
        }}
      >
        BETA
      </span>
    )
  }
  return (
    <span
      className="mono rounded px-1 py-0.5 text-[9px] font-semibold tracking-wide"
      style={{
        background: 'var(--bg-muted)',
        color:      'var(--text-3)',
        outline:    '1px solid var(--border)',
      }}
    >
      SOON
    </span>
  )
}

interface ToolsHubToolCardProps {
  tool:    HubToolDef
  onOpen?: (routeId: string) => void
}

export default function ToolsHubToolCard({ tool, onOpen }: ToolsHubToolCardProps) {
  const { theme } = useTheme()
  const [hover, setHover] = useState(false)
  const tones = theme === 'dark' ? TONE_DARK : TONE_LIGHT
  const tone  = tones[tool.accentTone] ?? tones.slate
  const Icon  = tool.icon
  const isLive    = tool.status === 'ready' || tool.status === 'beta'
  const clickable = Boolean(tool.navigateRouteId && isLive)

  const handleClick = () => {
    if (clickable && tool.navigateRouteId) onOpen?.(tool.navigateRouteId)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={tool.status === 'soon'}
      className={[
        'relative flex flex-col gap-3.5 rounded-[14px] p-[var(--pad-card,14px)] text-left transition-all duration-150',
        tool.status === 'soon' ? 'cursor-not-allowed opacity-[0.55]' : '',
        clickable ? 'cursor-pointer' : isLive ? 'cursor-default' : 'cursor-not-allowed',
      ].join(' ')}
      style={{
        background:  'var(--bg-card)',
        border:      `1px solid ${hover && clickable ? 'var(--border-strong)' : 'var(--border)'}`,
        boxShadow:   hover && clickable
          ? '0 6px 20px -8px rgba(0,0,0,0.18), 0 0 0 1px var(--border-strong)'
          : 'var(--shadow-sm)',
        transform:   hover && clickable ? 'translateY(-1px)' : 'none',
      }}
    >
      {hover && clickable && (
        <div
          className="pointer-events-none absolute inset-0 rounded-[14px] opacity-60"
          style={{
            background: `radial-gradient(circle at 80% 0%, ${tone.bg}, transparent 60%)`,
          }}
        />
      )}

      <div className="relative flex items-start justify-between gap-2">
        <div
          className="grid size-10 shrink-0 place-items-center rounded-[10px]"
          style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}` }}
        >
          <Icon className="size-[18px]" strokeWidth={2} aria-hidden />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {tool.badge === 'Popular' && (
            <span
              className="mono flex items-center gap-1 rounded px-1 py-0.5 text-[9px] font-semibold tracking-wide"
              style={{
                background: 'var(--accent-soft)',
                color:      'var(--accent-fg)',
                outline:    '1px solid color-mix(in oklab, var(--accent) 30%, transparent)',
              }}
            >
              <Star className="size-2" strokeWidth={2.5} aria-hidden />
              POPULAR
            </span>
          )}
          <StatusBadge status={tool.status} />
        </div>
      </div>

      <div className="relative">
        <div className="mb-1 text-sm font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>
          {tool.name}
        </div>
        <p className="text-xs leading-relaxed text-pretty" style={{ color: 'var(--text-3)' }}>
          {tool.desc}
        </p>
      </div>

      <div className="relative mt-auto flex items-center justify-between text-[10px] mono" style={{ color: 'var(--text-4)' }}>
        <span className="inline-flex items-center gap-1">
          <Clock className="size-2.5" strokeWidth={2} aria-hidden />
          {tool.lastUsed}
        </span>
        <span
          className="rounded px-1.5 py-0.5 tracking-wide"
          style={{ background: 'var(--bg-muted)', color: 'var(--text-3)' }}
        >
          {tool.category}
        </span>
      </div>
    </button>
  )
}
