import { useState } from 'react'
import {
  ArrowLeft, Check, Copy, FileText, Folder, Layers, Music, Radio,
  Sparkles, Star, Wrench, X, Zap,
} from 'lucide-react'
import { useCustomZones } from '../../context/CustomZonesContext'

const ICON_OPTIONS = [
  { name: 'Folder',    Icon: Folder },
  { name: 'Layers',    Icon: Layers },
  { name: 'FileText',  Icon: FileText },
  { name: 'Star',      Icon: Star },
  { name: 'Sparkles',  Icon: Sparkles },
  { name: 'Music',     Icon: Music },
  { name: 'Radio',     Icon: Radio },
  { name: 'Zap',       Icon: Zap },
  { name: 'Wrench',    Icon: Wrench },
]

interface Props {
  onBack:     () => void
  onNavigate: (id: string) => void
}

export default function NewZonePage({ onBack, onNavigate }: Props) {
  const { addZone } = useCustomZones()

  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [content,     setContent]     = useState('')
  const [iconName,    setIconName]    = useState('Folder')
  const [promptOpen,  setPromptOpen]  = useState(false)
  const [copied,      setCopied]      = useState(false)
  const [saved,       setSaved]       = useState(false)

  const isValid = title.trim().length > 0

  function buildPrompt() {
    const slug    = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const pascal  = title.replace(/(?:^|\s)\S/g, c => c.toUpperCase()).replace(/\s+/g, '')
    return `I'm building a new dashboard zone called "${title}" for my UI Dashboard X app (React 19 + TypeScript + Tailwind CSS v4 + Vite 8).

Zone description: ${description || '(no description provided)'}
Additional notes / context:
${content || '(none)'}

Please create a production-ready React component at:
  src/zones/${slug}/${pascal}Zone.tsx

Requirements:
- TypeScript with proper types, no \`any\`
- Tailwind CSS v4 classes for styling (the project uses Sora + DM Mono fonts)
- Use the global CSS variables already defined: var(--bg-card), var(--border), var(--text-1), var(--text-3), var(--accent), etc.
- Follows existing dashboard patterns — a \`<div className="zone-canvas">\` outer wrapper, \`<div className="zone-inner">\` inner container (max 1100 px, padded)
- Mobile-responsive

After creating the component, also:
1. Add it to \`src/components/sidebar/navigation.ts\` under a new or appropriate section
2. Import it in \`src/components/MainContent.tsx\` and add a \`case '${slug}'\` to the switch

Reference existing zones for patterns:
- src/zones/production/ProductionZone.tsx (simple overview with cards)
- src/zones/harmony/HarmonyStackZone.tsx (tabs + todo list)
- src/zones/cpw/CpwZone.tsx (kanban project board)
`
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(buildPrompt())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleCreate() {
    if (!isValid) return
    const id = addZone({ title: title.trim(), description, iconName, content })
    setSaved(true)
    setTimeout(() => onNavigate(id), 800)
  }

  const SelectedIcon = ICON_OPTIONS.find(o => o.name === iconName)?.Icon ?? Folder

  return (
    <div className="zone-canvas flex flex-col">
      {/* Topbar */}
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
            New Zone
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Generate Prompt */}
          <button
            onClick={() => setPromptOpen(true)}
            disabled={!isValid}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold transition-all"
            style={{
              background: isValid ? 'var(--accent-soft)' : 'var(--bg-muted)',
              color:      isValid ? 'var(--accent-fg)'   : 'var(--text-4)',
              border:     '1px solid ' + (isValid ? 'color-mix(in oklab, var(--accent) 30%, transparent)' : 'var(--border)'),
              cursor:     isValid ? 'pointer' : 'not-allowed',
            }}
          >
            <Sparkles size={13} />
            Generate Code Prompt
          </button>

          {/* Create Zone */}
          <button
            onClick={handleCreate}
            disabled={!isValid}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-[12px] font-semibold text-white transition-all"
            style={{
              background: isValid ? (saved ? 'var(--good)' : 'var(--accent)') : 'var(--bg-muted)',
              color:      isValid ? 'white' : 'var(--text-4)',
              cursor:     isValid ? 'pointer' : 'not-allowed',
              opacity:    saved ? 0.8 : 1,
            }}
          >
            {saved ? <><Check size={13} /> Saved!</> : <>Create Zone</>}
          </button>
        </div>
      </header>

      {/* Form */}
      <div className="zone-inner" style={{ maxWidth: 680 }}>
        <div className="mb-8">
          <p className="mono text-[10px] mb-2" style={{ color: 'var(--text-4)', letterSpacing: '0.1em' }}>
            NEW ZONE
          </p>
          <h1 className="text-[26px] font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>
            Add a zone to your workspace
          </h1>
          <p className="mt-2 text-[13px]" style={{ color: 'var(--text-3)' }}>
            Fill in the details, then use <strong style={{ color: 'var(--accent-fg)' }}>Generate Code Prompt</strong> to get a ready-to-paste prompt for Claude to build the full zone.
          </p>
        </div>

        <div className="space-y-5">
          {/* Title */}
          <div>
            <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
              Zone Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Client Hub, Release Tracker, Beat Library…"
              className="w-full rounded-lg px-3 py-2.5 text-[13px] transition-colors"
              style={{
                background: 'var(--bg-input)',
                border:     '1px solid var(--border)',
                color:      'var(--text-1)',
                outline:    'none',
              }}
              onFocus={e  => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={e   => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          {/* Icon picker */}
          <div>
            <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
              Icon
            </label>
            <div className="flex flex-wrap gap-2">
              {ICON_OPTIONS.map(({ name, Icon }) => {
                const active = iconName === name
                return (
                  <button
                    key={name}
                    onClick={() => setIconName(name)}
                    className="flex flex-col items-center gap-1 rounded-lg p-2.5 transition-all"
                    style={{
                      background: active ? 'var(--accent-soft)' : 'var(--bg-muted)',
                      border:     '1px solid ' + (active ? 'color-mix(in oklab, var(--accent) 40%, transparent)' : 'var(--border)'),
                      color:      active ? 'var(--accent-fg)' : 'var(--text-3)',
                      minWidth:   52,
                    }}
                    title={name}
                  >
                    <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                    <span className="mono text-[9px]">{name}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="One sentence about what this zone does…"
              className="w-full rounded-lg px-3 py-2.5 text-[13px] transition-colors"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-1)', outline: 'none' }}
              onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={e  => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          {/* Content notes */}
          <div>
            <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
              Content / Notes
              <span className="ml-2 font-normal normal-case" style={{ color: 'var(--text-4)' }}>
                (included verbatim in the Claude prompt)
              </span>
            </label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder={`Describe what this zone should contain, show, or do.\n\nExamples:\n- "A table of clients with name, project status, and next deadline"\n- "A kanban board with To Do / In Progress / Done columns"\n- "A feed that shows the latest YouTube videos from a channel"`}
              rows={8}
              className="w-full rounded-lg px-3 py-2.5 text-[13px] resize-y transition-colors"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-1)', outline: 'none', lineHeight: 1.6 }}
              onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={e  => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          {/* Preview pill */}
          {isValid && (
            <div className="flex items-center gap-3 rounded-xl p-4 fade-in" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="rounded-lg p-2.5" style={{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }}>
                <SelectedIcon size={18} />
              </div>
              <div>
                <p className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>{title}</p>
                {description && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>{description}</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Generate Prompt Modal */}
      {promptOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => setPromptOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl overflow-hidden fade-in"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <Sparkles size={15} style={{ color: 'var(--accent)' }} />
                <span className="text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>
                  Claude Code Prompt — "{title}"
                </span>
              </div>
              <button onClick={() => setPromptOpen(false)} style={{ color: 'var(--text-3)' }}>
                <X size={16} />
              </button>
            </div>

            {/* Prompt text */}
            <pre
              className="text-[11px] leading-relaxed p-5 overflow-auto"
              style={{ color: 'var(--text-2)', fontFamily: "'DM Mono', monospace", maxHeight: 420, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
            >
              {buildPrompt()}
            </pre>

            {/* Modal footer */}
            <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid var(--border)' }}>
              <p className="text-[11px]" style={{ color: 'var(--text-4)' }}>
                Paste this into Claude Code to generate the full zone component.
              </p>
              <button
                onClick={copyPrompt}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold transition-all"
                style={{ background: copied ? 'var(--good-soft)' : 'var(--accent)', color: copied ? 'var(--good)' : 'white' }}
              >
                {copied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy Prompt</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
