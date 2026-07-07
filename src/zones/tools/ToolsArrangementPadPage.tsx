import { ArrowLeft, Download, LayoutList, Plus, Trash2 } from 'lucide-react'
import { useCallback, useState } from 'react'

import Button from '../../components/ui/Button'
import ZoneHeader from '../../components/ZoneHeader'
import { triggerDownload } from '../../lib/pcm-wav'
import StudioToolsHeader from './StudioToolsHeader'

interface ToolsArrangementPadPageProps {
  onNavigate: (routeId: string) => void
}

export type ArrangementPreset = 'Intro' | 'Verse' | 'Chorus' | 'Bridge' | 'Hook' | 'Outro' | 'Custom'

type SectionRow = { id: string; kind: ArrangementPreset | 'Custom'; customLabel?: string; bars: number }

const PRESETS: ArrangementPreset[] = ['Intro', 'Verse', 'Chorus', 'Bridge', 'Hook', 'Outro']

export default function ToolsArrangementPadPage({ onNavigate }: ToolsArrangementPadPageProps) {
  const [bpm, setBpm] = useState('')
  const [sections, setSections] = useState<SectionRow[]>([
    { id: crypto.randomUUID(), kind: 'Intro', bars: 4 },
    { id: crypto.randomUUID(), kind: 'Verse', bars: 16 },
    { id: crypto.randomUUID(), kind: 'Chorus', bars: 8 },
  ])

  const totalBars = sections.reduce((a, r) => a + Math.max(0, r.bars), 0)

  const addSection = useCallback(() => {
    setSections(prev => [...prev, { id: crypto.randomUUID(), kind: 'Verse', bars: 8 }])
  }, [])

  const updateRow = useCallback((id: string, patch: Partial<SectionRow>) => {
    setSections(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }, [])

  const removeRow = useCallback((id: string) => {
    setSections(prev => prev.filter(r => r.id !== id))
  }, [])

  const serializeText = useCallback(() => {
    const bpmBit = bpm.trim() ? `BPM reference: ${bpm.trim()}\n\n` : ''
    let out = `${bpmBit}Sections (${totalBars} bars total):\n`
    let acc = 0
    for (const s of sections) {
      const name = s.kind === 'Custom' && s.customLabel?.trim() ? s.customLabel.trim() : s.kind
      const b = Math.max(0, s.bars)
      out += `\n• ${name} · ${b} bars (timeline ${acc + 1}–${acc + b})\n`
      acc += b
    }
    out += `\nEstimated length @ 120 BPM: ~${Math.round(totalBars * 0.5)}s (vary by BPM)\n`
    return out
  }, [bpm, sections, totalBars])

  const serializeMd = useCallback(() => {
    const rows = sections.map((s, i) => {
      const name = s.kind === 'Custom' && s.customLabel?.trim() ? s.customLabel.trim() : s.kind
      return `${i + 1}. **${name}** — ${Math.max(0, s.bars)} bars`
    })

    let start = 0
    const withRange = sections.map((s, i) => {
      const b = Math.max(0, s.bars)
      const line = `${i + 1}. **${s.kind === 'Custom' && s.customLabel?.trim() ? s.customLabel!.trim() : s.kind}** — bars ${start + 1}–${start + b}`
      start += b
      return line
    })

    const bpmBit = bpm.trim() ? `**BPM (reference):** ${bpm.trim()}\n\n` : ''

    return [
      '# Song arrangement sketch',
      '',
      bpmBit + `Total bars — **${totalBars}**`,
      '',
      '## Outline',
      ...withRange.map(x => `- ${x}`),
      '',
      '## Ledger',
      ...rows.map(x => `- ${x}`),
      '',
    ].join('\n')
  }, [bpm, sections, totalBars])

  const dlTxt = useCallback(() => {
    triggerDownload(new Blob([serializeText()], { type: 'text/plain;charset=utf-8' }), 'arrangement_sketch.txt')
  }, [serializeText])

  const dlMd = useCallback(() => {
    triggerDownload(new Blob([serializeMd()], { type: 'text/markdown;charset=utf-8' }), 'arrangement_sketch.md')
  }, [serializeMd])

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas text-t1"
    >
      <StudioToolsHeader
        toolId="tools-arrangement-pad"
        crumbs={[{ label: 'Workspace' }, { label: 'Tools' }, { label: 'Arrangement pad', emphasis: true }]}
        leftExtra={
          <button
            type="button"
            onClick={() => onNavigate('tools-hub')}
            className="mr-2 rounded-lg border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition hover:bg-slate-50"
            aria-label="Back to Tools Hub"
          >
            <ArrowLeft className="size-4" strokeWidth={2} />
          </button>
        }
      />

      <div className="flex-1 overflow-auto px-8 pb-16 pt-8">
        <div className="mx-auto w-full max-w-3xl">
          <ZoneHeader
            eyebrow="PRODUCTION"
            title="Arrangement sketch pad"
            icon={LayoutList}
            description="Stack sections with bar lengths and optional BPM; export notes for rehearsals or collaborators."
            className="mb-6"
          />

          <label className="mb-6 block rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="mono text-[11px] uppercase tracking-wide text-slate-500">Optional BPM</span>
            <input
              value={bpm}
              onChange={e => setBpm(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 92"
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-violet-500 focus:ring-2"
            />
          </label>

          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-800">Sections</span>
            <button
              type="button"
              onClick={addSection}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700"
            >
              <Plus className="size-3.5" />
              Add row
            </button>
          </div>

          <div className="space-y-3">
            {sections.map(s => (
              <div
                key={s.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <select
                  value={s.kind}
                  onChange={e =>
                    updateRow(s.id, { kind: e.target.value as ArrangementPreset | 'Custom', customLabel: '' })
                  }
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-violet-500 focus:ring-2"
                >
                  {[...PRESETS, 'Custom' as const].map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>

                {(s.kind as string) === 'Custom' ? (
                  <input
                    value={s.customLabel ?? ''}
                    onChange={e => updateRow(s.id, { customLabel: e.target.value })}
                    placeholder="Custom section name…"
                    className="min-w-[160px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-violet-500 focus:ring-2"
                  />
                ) : null}

                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="mono shrink-0 text-[10px] uppercase tracking-wide text-slate-400">Bars</span>
                  <input
                    type="number"
                    min={1}
                    max={512}
                    value={s.bars}
                    onChange={e => updateRow(s.id, { bars: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                    className="w-24 rounded-lg border border-slate-200 px-2 py-2 text-sm tabular-nums"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => removeRow(s.id)}
                  aria-label={`Remove row ${s.kind}`}
                  className="ml-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>

          <p className="mt-6 text-xs text-slate-500 mono">Σ bars: {totalBars}</p>

          <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-6">
            <button
              type="button"
              onClick={dlTxt}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              <Download className="size-4" />
              Plain text
            </button>
            <Button
              variant="primary"
              onClick={dlMd}
              leading={<Download className="size-4" />}
            >
              Markdown
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
