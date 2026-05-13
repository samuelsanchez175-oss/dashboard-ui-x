import { X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'

import { TOOLS_REGISTRY } from '../../lib/toolsRegistry'

export interface ShortcutOverlayProps {
  open:    boolean
  onClose: () => void
}

const GLOBAL_SHORTCUTS: { keys: string; description: string }[] = [
  { keys: '?', description: 'Open or close this shortcuts help (Shift + /).' },
  { keys: 'Escape', description: 'Close this overlay, file preview, profile settings, or the API quick-keys modal when open.' },
  {
    keys: 'Space',
    description:
      'On the Tempo Tap tool, registers a tempo tap when focus is not in an input, button, or editable field.',
  },
]

export default function ShortcutOverlay({ open, onClose }: ShortcutOverlayProps) {
  const titleId   = useId()
  const closeRef  = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const id = window.requestAnimationFrame(() => {
      closeRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(id)
  }, [open])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[9400] flex items-center justify-center p-4"
      style={{
        background: 'color-mix(in oklab, var(--bg-app) 55%, black)',
        backdropFilter: 'blur(6px)',
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="relative flex max-h-[min(640px,85vh)] w-full max-w-lg flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{
          background:    'var(--bg-card)',
          border:        '1px solid var(--border-soft)',
          color:         'var(--text-1)',
          boxShadow:     'var(--shadow-sm)',
        }}
      >
        <div
          className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: 'var(--border-soft)' }}
        >
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            Keyboard shortcuts
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg transition outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              background:   'var(--bg-hover)',
              color:        'var(--text-2)',
              outlineColor: 'var(--accent)',
            }}
            aria-label="Close shortcuts help"
            onClick={onClose}
          >
            <X className="size-4" strokeWidth={2} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <section aria-labelledby={`${titleId}-tools`}>
            <h3 id={`${titleId}-tools`} className="mb-3 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
              Tools
            </h3>
            <p className="mb-3 text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>
              Open the sidebar, expand the <strong style={{ color: 'var(--text-1)' }}>TOOLS</strong> group, and choose a tool.
              Each entry uses the same route id as navigation.
            </p>
            <ul className="space-y-2">
              {TOOLS_REGISTRY.map(tool => {
                const Icon = tool.icon
                return (
                  <li
                    key={tool.id}
                    className="flex items-start gap-3 rounded-xl px-3 py-2.5"
                    style={{ background: 'var(--bg-muted)', border: '1px solid var(--border-soft)' }}
                  >
                    <span
                      className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg"
                      style={{ background: 'var(--bg-card)', color: 'var(--accent-fg)' }}
                      aria-hidden
                    >
                      <Icon className="size-4" strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{tool.longLabel ?? tool.label}</div>
                      <div className="mono mt-0.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
                        route: {tool.routeId}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>

          <section aria-labelledby={`${titleId}-global`}>
            <h3 id={`${titleId}-global`} className="mb-3 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
              Global
            </h3>
            <ul className="space-y-2">
              {GLOBAL_SHORTCUTS.map(row => (
                <li
                  key={row.keys}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-xl px-3 py-2.5 text-sm"
                  style={{ background: 'var(--bg-muted)', border: '1px solid var(--border-soft)' }}
                >
                  <kbd
                    className="mono shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-soft)', color: 'var(--text-1)' }}
                  >
                    {row.keys}
                  </kbd>
                  <span className="min-w-0 flex-1 leading-snug" style={{ color: 'var(--text-2)' }}>
                    {row.description}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
