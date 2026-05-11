import { useEffect, useRef, useState } from 'react'
import { Check, SlidersHorizontal, X } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import type { Accent, Density, Theme } from '../context/ThemeContext'

const ACCENTS: { id: Accent; hex: string; label: string }[] = [
  { id: 'purple', hex: '#7c3aed', label: 'Purple' },
  { id: 'red',    hex: '#dc2626', label: 'Red'    },
  { id: 'blue',   hex: '#2563eb', label: 'Blue'   },
  { id: 'green',  hex: '#059669', label: 'Green'  },
]

function SegControl<T extends string>({
  value, options, onChange,
}: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div
      className="flex rounded-lg p-0.5 gap-0.5"
      style={{ background: 'var(--bg-muted)' }}
    >
      {options.map(o => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className="flex-1 rounded-md py-1.5 text-[11px] font-medium capitalize transition-all duration-150"
          style={{
            background: value === o.id ? 'var(--bg-card)' : 'transparent',
            color:      value === o.id ? 'var(--text-1)'  : 'var(--text-3)',
            boxShadow:  value === o.id ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function TweaksPanel() {
  const { theme, accent, density, setTheme, setAccent, setDensity } = useTheme()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div
      ref={rootRef}
      className="fixed bottom-4 right-4 z-[9000] flex flex-col items-end gap-2"
      style={{ pointerEvents: 'none' }}
    >
      {/* Panel */}
      {open && (
        <div
          className="w-[236px] rounded-2xl overflow-hidden fade-in"
          style={{
            pointerEvents: 'auto',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-2.5"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <span
              className="text-[11px] font-semibold uppercase tracking-widest"
              style={{ color: 'var(--text-4)', fontFamily: "'DM Mono', monospace" }}
            >
              Tweaks
            </span>
            <button
              onClick={() => setOpen(false)}
              className="flex items-center justify-center w-5 h-5 rounded-md transition-colors"
              style={{ color: 'var(--text-4)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-1)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-4)')}
            >
              <X size={11} />
            </button>
          </div>

          <div className="px-4 pt-3 pb-4 space-y-4">
            {/* Theme */}
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: 'var(--text-4)', fontFamily: "'DM Mono', monospace" }}
              >
                Theme
              </p>
              <SegControl<Theme>
                value={theme}
                options={[{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]}
                onChange={setTheme}
              />
            </div>

            {/* Accent */}
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: 'var(--text-4)', fontFamily: "'DM Mono', monospace" }}
              >
                Accent
              </p>
              <div className="grid grid-cols-4 gap-2">
                {ACCENTS.map(({ id, hex, label }) => (
                  <button
                    key={id}
                    onClick={() => setAccent(id)}
                    title={label}
                    className="relative h-8 rounded-xl transition-all duration-150"
                    style={{
                      background: hex,
                      outline: accent === id ? `2.5px solid ${hex}` : '2px solid transparent',
                      outlineOffset: '2px',
                      opacity: accent === id ? 1 : 0.45,
                      transform: accent === id ? 'scale(1.05)' : 'scale(1)',
                    }}
                    onMouseEnter={e => { if (accent !== id) (e.currentTarget as HTMLElement).style.opacity = '0.7' }}
                    onMouseLeave={e => { if (accent !== id) (e.currentTarget as HTMLElement).style.opacity = '0.45' }}
                  >
                    {accent === id && (
                      <Check
                        size={12}
                        strokeWidth={2.5}
                        className="absolute inset-0 m-auto"
                        style={{ color: '#fff', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' }}
                      />
                    )}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-2 mt-1.5">
                {ACCENTS.map(({ id, label }) => (
                  <p
                    key={id}
                    className="text-center text-[9px]"
                    style={{ color: accent === id ? 'var(--text-2)' : 'var(--text-4)' }}
                  >
                    {label}
                  </p>
                ))}
              </div>
            </div>

            {/* Density */}
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: 'var(--text-4)', fontFamily: "'DM Mono', monospace" }}
              >
                Density
              </p>
              <SegControl<Density>
                value={density}
                options={[{ id: 'comfy', label: 'Comfy' }, { id: 'compact', label: 'Compact' }]}
                onChange={setDensity}
              />
            </div>
          </div>
        </div>
      )}

      {/* FAB trigger */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-medium transition-all duration-150"
        style={{
          pointerEvents: 'auto',
          background: open ? 'var(--accent)' : 'var(--bg-card)',
          color:      open ? '#fff'          : 'var(--text-2)',
          border:     `1px solid ${open ? 'transparent' : 'var(--border)'}`,
          boxShadow:  '0 4px 16px rgba(0,0,0,0.14)',
        }}
        onMouseEnter={e => {
          if (!open) {
            e.currentTarget.style.background = 'var(--bg-hover)'
            e.currentTarget.style.color = 'var(--text-1)'
          }
        }}
        onMouseLeave={e => {
          if (!open) {
            e.currentTarget.style.background = 'var(--bg-card)'
            e.currentTarget.style.color = 'var(--text-2)'
          }
        }}
      >
        <SlidersHorizontal size={12} />
        Tweaks
      </button>
    </div>
  )
}
