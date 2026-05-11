import { ArrowLeft, Folder, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useCustomZones } from '../../context/CustomZonesContext'

interface Props {
  zoneId:     string
  onBack:     () => void
  onNavigate: (id: string) => void
}

export default function CustomZonePage({ zoneId, onBack, onNavigate }: Props) {
  const { zones, updateZone, removeZone } = useCustomZones()
  const zone = zones.find(z => z.id === zoneId)

  const [editing, setEditing] = useState(false)
  const [title,   setTitle]   = useState(zone?.title       ?? '')
  const [desc,    setDesc]    = useState(zone?.description ?? '')
  const [content, setContent] = useState(zone?.content     ?? '')

  if (!zone) {
    return (
      <div className="zone-canvas flex items-center justify-center" style={{ color: 'var(--text-3)' }}>
        <div className="text-center">
          <p className="text-[14px] font-medium mb-2" style={{ color: 'var(--text-2)' }}>Zone not found</p>
          <button onClick={onBack} className="text-[12px]" style={{ color: 'var(--accent-fg)' }}>← Go back</button>
        </div>
      </div>
    )
  }

  function saveEdits() {
    updateZone(zoneId, { title, description: desc, content })
    setEditing(false)
  }

  function handleDelete() {
    if (!confirm(`Delete zone "${zone!.title}"?`)) return
    removeZone(zoneId)
    onBack()
  }

  return (
    <div className="zone-canvas flex flex-col">
      <header className="zone-topbar">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-[12px] font-medium transition-colors"
            style={{ color: 'var(--text-3)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-1)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
          >
            <ArrowLeft size={13} />
            Back
          </button>
          <span style={{ color: 'var(--border-strong)' }}>·</span>
          <span className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>
            {zone.title}
          </span>
          <span className="mono text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--bg-muted)', color: 'var(--text-4)' }}>
            CUSTOM
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setEditing(v => !v); setTitle(zone.title); setDesc(zone.description); setContent(zone.content) }}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition-all"
            style={{ background: 'var(--bg-muted)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
          >
            <Pencil size={12} /> {editing ? 'Cancel' : 'Edit'}
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition-all"
            style={{ background: 'var(--bad-soft)', color: 'var(--bad)', border: '1px solid color-mix(in oklab, var(--bad) 20%, transparent)' }}
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      </header>

      <div className="zone-inner">
        {editing ? (
          <div className="space-y-5 fade-in">
            <div>
              <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                Title
              </label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5 text-[13px]"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-1)', outline: 'none' }}
                onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={e  => (e.target.style.borderColor = 'var(--border)')}
              />
            </div>
            <div>
              <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                Description
              </label>
              <input
                value={desc}
                onChange={e => setDesc(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5 text-[13px]"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-1)', outline: 'none' }}
                onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={e  => (e.target.style.borderColor = 'var(--border)')}
              />
            </div>
            <div>
              <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                Content / Notes
              </label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={10}
                className="w-full rounded-lg px-3 py-2.5 text-[13px] resize-y"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-1)', outline: 'none', lineHeight: 1.6 }}
                onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={e  => (e.target.style.borderColor = 'var(--border)')}
              />
            </div>
            <button
              onClick={saveEdits}
              className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white"
              style={{ background: 'var(--accent)' }}
            >
              Save changes
            </button>
          </div>
        ) : (
          <div className="fade-in">
            <div className="flex items-center gap-3 mb-6">
              <div className="rounded-xl p-3" style={{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }}>
                <Folder size={20} />
              </div>
              <div>
                <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>
                  {zone.title}
                </h1>
                {zone.description && (
                  <p className="mt-1 text-[13px]" style={{ color: 'var(--text-3)' }}>{zone.description}</p>
                )}
              </div>
            </div>

            {zone.content ? (
              <div
                className="zone-card"
                style={{ whiteSpace: 'pre-wrap', lineHeight: 1.75, fontSize: 14, color: 'var(--text-2)' }}
              >
                {zone.content}
              </div>
            ) : (
              <div className="zone-card text-center py-12" style={{ border: '1px dashed var(--border)' }}>
                <p className="text-[13px]" style={{ color: 'var(--text-4)' }}>
                  No content yet — click <strong style={{ color: 'var(--text-2)' }}>Edit</strong> to add notes,
                  or use <strong style={{ color: 'var(--accent-fg)' }}>Generate Code Prompt</strong> from the New Zone page to build a full component.
                </p>
                <button
                  onClick={() => onNavigate('zone-builder')}
                  className="mt-4 rounded-lg px-4 py-2 text-[12px] font-semibold transition-all"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent-fg)', border: '1px solid color-mix(in oklab, var(--accent) 30%, transparent)' }}
                >
                  Open Zone Builder
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
