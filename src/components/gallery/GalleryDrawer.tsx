import { useEffect, useMemo, useState } from 'react'
import { Download, ExternalLink, Trash2, X, Images } from 'lucide-react'

import {
  deleteFile, openFile, userCloseFilesDock, receiveDockOrFileDrop,
  type StoredFile,
} from '../files-dock/files-store'
import { getToolLabel, fileInputTools, toolAcceptsMime } from '../../lib/toolsRegistry'
import { startDropRun } from '../../lib/tool-drop-run'
import { useGalleryFiles } from './useGalleryFiles'

const fmtSize = (n: number) =>
  n < 1024 ? `${n} B` : n < 1_048_576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1_048_576).toFixed(1)} MB`
const fmtDate = (t: number) =>
  new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Human label for the tool that produced a file (falls back to its source text). */
function toolLabelFor(f: StoredFile): string | null {
  if (f.sourceTool) return getToolLabel(f.sourceTool) ?? f.sourceTool
  return f.source ?? null
}
/** Output-type chip text (explicit tag, else derived from lane / mime). */
function typeLabelFor(f: StoredFile): string | null {
  if (f.outputType) return f.outputType
  if (f.lane) return f.lane
  const [kind] = f.mime.split('/')
  return kind || null
}

function Preview({ file }: { file: StoredFile }) {
  const url = useMemo(() => URL.createObjectURL(file.blob), [file.blob])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  if (file.mime.startsWith('audio/')) return <audio controls src={url} className="mt-2 w-full" style={{ height: 34 }} />
  if (file.mime.startsWith('video/')) return <video controls src={url} className="mt-2 w-full rounded-md" style={{ maxHeight: 160 }} />
  if (file.mime.startsWith('image/')) return <img src={url} alt={file.name} className="mt-2 rounded-md" style={{ maxHeight: 150, objectFit: 'contain' }} />
  return null
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-2.5 py-1 text-[11px] font-medium transition"
      style={{
        background: active ? 'var(--accent)' : 'var(--bg-hover)',
        color: active ? '#fff' : 'var(--text-2)',
      }}
    >
      {children}
    </button>
  )
}

function Card({ file }: { file: StoredFile }) {
  const url = useMemo(() => URL.createObjectURL(file.blob), [file.blob])
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  const tool = toolLabelFor(file)
  const type = typeLabelFor(file)

  return (
    <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-app)' }}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium" style={{ color: 'var(--text-1)' }} title={file.name}>
            {file.name}
          </p>
          <p className="text-[11px]" style={{ color: 'var(--text-2)' }}>
            #{String(file.serial).padStart(3, '0')} · {fmtSize(file.size)} · {fmtDate(file.addedAt)}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {tool && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)' }}>
                {tool}
              </span>
            )}
            {type && (
              <span className="rounded-full px-2 py-0.5 text-[10px]"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-2)' }}>
                #{type}
              </span>
            )}
            {(file.tags ?? []).map(t => (
              <span key={t} className="rounded-full px-2 py-0.5 text-[10px]"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-2)' }}>{t}</span>
            ))}
          </div>
        </div>
      </div>

      <Preview file={file} />

      <div className="mt-2 flex items-center gap-2">
        {url && (
          <a href={url} download={file.path || file.name}
            className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium"
            style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}>
            <Download size={12} /> Download
          </a>
        )}
        <button onClick={() => openFile(file)}
          className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium"
          style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}>
          <ExternalLink size={12} /> Open
        </button>
        <button onClick={() => void deleteFile(file.id)}
          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[11px]"
          style={{ color: 'var(--text-2)' }} title="Delete">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

export default function GalleryDrawer() {
  const { files, open } = useGalleryFiles()
  const [toolFilter, setToolFilter] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [dropOver, setDropOver] = useState(false)

  const toolChips = useMemo(() => {
    const m = new Map<string, string>()
    for (const f of files) { const l = toolLabelFor(f); if (l) m.set(l, l) }
    return [...m.keys()]
  }, [files])
  const typeChips = useMemo(() => {
    const s = new Set<string>()
    for (const f of files) { const t = typeLabelFor(f); if (t) s.add(t) }
    return [...s]
  }, [files])

  const visible = files.filter(f =>
    (!toolFilter || toolLabelFor(f) === toolFilter) &&
    (!typeFilter || typeLabelFor(f) === typeFilter))

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setDropOver(false)
    const f = await receiveDockOrFileDrop(e)
    if (!f) return
    const mime = f.type || 'application/octet-stream'
    const tool = fileInputTools().find(t => toolAcceptsMime(t, mime))
    if (tool) await startDropRun(tool, f, f instanceof File ? f.name : undefined)
    // If no tool matches, it's already stored by the drop source; nothing else to do.
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.25)' }} onClick={userCloseFilesDock} />
      <aside
        className="fixed right-0 top-0 z-50 flex h-full flex-col border-l shadow-2xl"
        style={{ width: 'min(440px, 100vw)', background: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}
        onDragOver={(e) => { e.preventDefault(); setDropOver(true) }}
        onDragLeave={() => setDropOver(false)}
        onDrop={onDrop}
      >
        <header className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <Images size={16} style={{ color: 'var(--accent)' }} />
            <div>
              <h2 className="text-[13px] font-bold" style={{ color: 'var(--text-1)' }}>Gallery</h2>
              <p className="text-[11px]" style={{ color: 'var(--text-2)' }}>{files.length} files · stored on this dashboard</p>
            </div>
          </div>
          <button onClick={userCloseFilesDock} className="rounded-md p-1.5" style={{ color: 'var(--text-2)' }}>
            <X size={16} />
          </button>
        </header>

        {(toolChips.length > 0 || typeChips.length > 0) && (
          <div className="flex flex-wrap gap-1.5 border-b px-5 py-3" style={{ borderColor: 'var(--border)' }}>
            <Chip active={!toolFilter && !typeFilter} onClick={() => { setToolFilter(null); setTypeFilter(null) }}>All</Chip>
            {toolChips.map(t => (
              <Chip key={t} active={toolFilter === t} onClick={() => setToolFilter(toolFilter === t ? null : t)}>{t}</Chip>
            ))}
            {typeChips.map(t => (
              <Chip key={t} active={typeFilter === t} onClick={() => setTypeFilter(typeFilter === t ? null : t)}>#{t}</Chip>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4"
          style={dropOver ? { outline: '2px dashed var(--accent)', outlineOffset: -8 } : undefined}>
          {visible.length === 0 ? (
            <div className="mt-16 text-center" style={{ color: 'var(--text-2)' }}>
              <Images size={28} className="mx-auto opacity-50" />
              <p className="mt-2 text-[13px]">No files yet.</p>
              <p className="mt-1 text-[11px]">Drop a file on a tool or run one — outputs appear here, tagged by tool and type.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visible.map(f => <Card key={f.id} file={f} />)}
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
