import {
  ExternalLink,
  File as FileIcon,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  addDownloadedFile,
  clearAllFiles,
  deleteFile,
  DOCK_DRAG_MIME,
  subscribeFiles,
  type StoredFile,
} from './files-store'
import FilePreview from './FilePreview'

/* ── macOS-style magnification config ────────────────────────────────────── */

const BASE_ICON_SIZE = 52
const MAX_SCALE      = 1.6
const MIN_SCALE      = 1.0
const BASE_SPACING   = 6
const EFFECT_WIDTH   = 240

function cosineMag(mouseX: number | null, count: number): number[] {
  if (mouseX === null) return Array.from({ length: count }, () => MIN_SCALE)
  return Array.from({ length: count }, (_, i) => {
    const center = i * (BASE_ICON_SIZE + BASE_SPACING) + BASE_ICON_SIZE / 2
    const minX   = mouseX - EFFECT_WIDTH / 2
    const maxX   = mouseX + EFFECT_WIDTH / 2
    if (center < minX || center > maxX) return MIN_SCALE
    const theta  = ((center - minX) / EFFECT_WIDTH) * 2 * Math.PI
    const t      = (1 - Math.cos(Math.min(Math.max(theta, 0), 2 * Math.PI))) / 2
    return MIN_SCALE + t * (MAX_SCALE - MIN_SCALE)
  })
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function iconForMime(mime: string): typeof FileIcon {
  if (mime.startsWith('audio/')) return FileAudio
  if (mime.startsWith('image/')) return FileImage
  if (mime.startsWith('video/')) return FileVideo
  if (mime.startsWith('text/') || mime === 'application/pdf') return FileText
  return FileIcon
}

function tintForMime(mime: string): { bg: string; fg: string } {
  if (mime.startsWith('audio/')) return { bg: 'rgba(124,58,237,0.18)',  fg: '#a78bfa' }   // violet
  if (mime.startsWith('image/')) return { bg: 'rgba(16,185,129,0.18)',  fg: '#34d399' }   // emerald
  if (mime.startsWith('video/')) return { bg: 'rgba(244,63,94,0.18)',   fg: '#fb7185' }   // rose
  if (mime.startsWith('text/'))  return { bg: 'rgba(14,165,233,0.18)',  fg: '#7dd3fc' }   // sky
  if (mime === 'application/pdf') return { bg: 'rgba(245,158,11,0.18)', fg: '#fbbf24' }   // amber
  return { bg: 'rgba(148,163,184,0.18)', fg: '#cbd5e1' }                                   // slate
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

/* ── Component ───────────────────────────────────────────────────────────── */

export default function FilesDock() {
  const [files,   setFiles]   = useState<StoredFile[]>([])
  const [mouseX,  setMouseX]  = useState<number | null>(null)
  const [scales,  setScales]  = useState<number[]>([])
  const [active,  setActive]  = useState<string | null>(null)
  const [dragOver,setDragOver]= useState(false)
  /** id of the file the cursor is hovering — drives the floating name label. */
  const [hoverId, setHoverId] = useState<string | null>(null)
  /** Center-X of the hovered tile in viewport coords (for the floating label). */
  const [hoverCenterX, setHoverCenterX] = useState<number | null>(null)
  /** Top of the hovered tile in viewport coords. */
  const [hoverTopY, setHoverTopY] = useState<number | null>(null)
  /** id of the file shown in the in-app preview modal (separate from `active`). */
  const [previewId, setPreviewId] = useState<string | null>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const rafRef  = useRef<number | null>(null)
  const lastMoveRef = useRef(0)

  /* subscribe to file store */
  useEffect(() => subscribeFiles(setFiles), [])

  /* magnification animation loop */
  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const tick = () => {
      const target = cosineMag(mouseX, files.length)
      setScales(prev => {
        if (prev.length !== target.length) return target
        const lerp = mouseX !== null ? 0.25 : 0.16
        return prev.map((s, i) => s + (target[i]! - s) * lerp)
      })
      const still = scales.some((s, i) => Math.abs(s - (target[i] ?? 1)) > 0.003)
      if (still || mouseX !== null) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [mouseX, files.length, scales])

  /* ── Pointer handlers ─────────────────────────────────────────────────── */

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const now = performance.now()
    if (now - lastMoveRef.current < 16) return
    lastMoveRef.current = now
    const r = dockRef.current?.getBoundingClientRect()
    if (!r) return
    setMouseX(e.clientX - r.left - 12)
  }, [])

  const onMouseLeave = useCallback(() => setMouseX(null), [])

  /* ── Drag-and-drop ────────────────────────────────────────────────────── */

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.types.includes('Files')) setDragOver(true)
  }, [])

  const onDragLeave = useCallback(() => setDragOver(false), [])

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = Array.from(e.dataTransfer.files ?? [])
    for (const f of dropped) {
      try {
        await addDownloadedFile({ blob: f, name: f.name, source: 'Dropped' })
      } catch {
        /* ignore individual failures */
      }
    }
  }, [])

  /* ── Render ───────────────────────────────────────────────────────────── */

  // Don't render the dock chrome if no files AND nothing is being dragged.
  // (Dock still shows during a global dragover; below.)
  const [globalDragHint, setGlobalDragHint] = useState(false)
  useEffect(() => {
    const onWinOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) setGlobalDragHint(true)
    }
    const onWinLeave = (e: DragEvent) => {
      // Only clear when leaving the window
      if (!e.relatedTarget) setGlobalDragHint(false)
    }
    const onWinDrop = () => setGlobalDragHint(false)
    window.addEventListener('dragover',  onWinOver)
    window.addEventListener('dragleave', onWinLeave)
    window.addEventListener('drop',      onWinDrop)
    return () => {
      window.removeEventListener('dragover',  onWinOver)
      window.removeEventListener('dragleave', onWinLeave)
      window.removeEventListener('drop',      onWinDrop)
    }
  }, [])

  const visible = files.length > 0 || globalDragHint

  /* Resolve the preview file from the current list — if it was deleted while open, close. */
  const previewFile = previewId ? files.find(f => f.id === previewId) ?? null : null
  useEffect(() => {
    if (previewId && !previewFile) setPreviewId(null)
  }, [previewId, previewFile])

  if (!visible && !previewFile) return null

  return (
    <>
    {previewFile && (
      <FilePreview file={previewFile} onClose={() => setPreviewId(null)} />
    )}
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[8500] flex flex-col items-center"
      style={{ gap: 10 }}
    >
      {/* Hover popover for the active file */}
      {active && (() => {
        const idx = files.findIndex(f => f.id === active)
        if (idx < 0) return null
        const f = files[idx]!
        const tint = tintForMime(f.mime)
        return (
          <div
            className="pointer-events-auto rounded-xl px-3.5 py-2.5 shadow-xl backdrop-blur-md"
            style={{
              background: 'rgba(20,21,27,0.92)',
              border:     '1px solid rgba(255,255,255,0.10)',
              color:      '#f3f4f6',
              maxWidth:   'min(440px, calc(100vw - 32px))',
            }}
          >
            <div className="flex items-center gap-2.5">
              <span
                className="grid size-8 shrink-0 place-items-center rounded-lg"
                style={{ background: tint.bg, color: tint.fg }}
                aria-hidden
              >
                {(() => { const I = iconForMime(f.mime); return <I className="size-4" strokeWidth={2} /> })()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{f.name}</p>
                <p className="mono truncate text-[10px] uppercase tracking-wide" style={{ color: '#9ca3af' }}>
                  {f.mime || 'binary'} · {formatSize(f.size)}{f.source ? ` · ${f.source}` : ''}
                </p>
              </div>
            </div>
            <p className="mono mt-1.5 truncate text-[10px]" style={{ color: '#6b7280' }} title={f.path}>
              path: {f.path}
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setPreviewId(f.id); setActive(null) }}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition"
                style={{ background: 'rgba(167,139,250,0.18)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.30)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(167,139,250,0.28)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(167,139,250,0.18)')}
              >
                <ExternalLink className="size-3.5" aria-hidden />
                Open
              </button>
              <button
                type="button"
                onClick={() => { void deleteFile(f.id); setActive(null) }}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition"
                style={{ background: 'rgba(248,113,113,0.18)', color: '#fb7185' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.28)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.18)')}
              >
                <Trash2 className="size-3.5" aria-hidden />
                Delete
              </button>
              <button
                type="button"
                onClick={() => setActive(null)}
                className="ml-auto inline-flex size-7 items-center justify-center rounded-md transition"
                style={{ color: '#9ca3af', background: 'rgba(255,255,255,0.06)' }}
                aria-label="Close details"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          </div>
        )
      })()}

      {/* Hover label — surfaces the file name immediately while clicking still opens the full popover with actions. */}
      {hoverId && hoverCenterX !== null && hoverTopY !== null && !active && (() => {
        const f = files.find(x => x.id === hoverId)
        if (!f) return null
        return (
          <div
            className="pointer-events-none rounded-md px-2.5 py-1 shadow-lg backdrop-blur-md"
            style={{
              position:     'fixed',
              left:         hoverCenterX,
              top:          hoverTopY - 16,
              transform:    'translate(-50%, -100%)',
              background:   'rgba(20,21,27,0.94)',
              color:        '#f3f4f6',
              border:       '1px solid rgba(255,255,255,0.10)',
              fontSize:     12,
              fontWeight:   500,
              maxWidth:     'min(70vw, 480px)',
              whiteSpace:   'nowrap',
              overflow:     'hidden',
              textOverflow: 'ellipsis',
              zIndex:       9000,
            }}
            aria-hidden
          >
            <span className="mono mr-1.5" style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10 }}>
              #{String(f.serial ?? 0).padStart(3, '0')}
            </span>
            {f.name}
          </div>
        )
      })()}

      {/* The dock itself */}
      <div
        ref={dockRef}
        onMouseMove={onMouseMove}
        onMouseLeave={() => { onMouseLeave(); setHoverId(null) }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={e => void onDrop(e)}
        className="pointer-events-auto backdrop-blur-md transition"
        style={{
          background:   dragOver
            ? 'linear-gradient(rgba(124,58,237,0.22), rgba(45,45,45,0.85))'
            : 'rgba(45,45,45,0.75)',
          borderRadius: 22,
          border:       dragOver
            ? '1px dashed rgba(167,139,250,0.85)'
            : '1px solid rgba(255,255,255,0.15)',
          boxShadow:    '0 8px 32px rgba(0,0,0,0.45), 0 2px 10px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
          padding:      12,
          minWidth:     files.length === 0 ? 280 : undefined,
        }}
      >
        {files.length === 0 ? (
          <div className="flex items-center gap-2.5 text-[12px] font-medium" style={{ color: '#d1d5db' }}>
            <Upload className="size-4" style={{ color: '#a78bfa' }} aria-hidden />
            Drop files here to add them to the dock
          </div>
        ) : (
          <div className="relative flex items-end" style={{ height: BASE_ICON_SIZE * MAX_SCALE, gap: BASE_SPACING }}>
            {files.map((f, i) => {
              const scale = scales[i] ?? MIN_SCALE
              const size  = BASE_ICON_SIZE * scale
              const tint  = tintForMime(f.mime)
              const Icon  = iconForMime(f.mime)
              const isActive = active === f.id
              return (
                <button
                  key={f.id}
                  type="button"
                  title={`${f.name} — drag onto a "drop audio" zone to send it there`}
                  onClick={() => setActive(prev => (prev === f.id ? null : f.id))}
                  onMouseEnter={(e) => {
                    setHoverId(f.id)
                    const r = e.currentTarget.getBoundingClientRect()
                    setHoverCenterX(r.left + r.width / 2)
                    setHoverTopY(r.top)
                  }}
                  onMouseLeave={() => {
                    setHoverId(prev => (prev === f.id ? null : prev))
                  }}
                  draggable
                  onDragStart={(e) => {
                    // Internal payload: dock id (receiver looks up the blob via getFileById).
                    e.dataTransfer.setData(DOCK_DRAG_MIME, f.id)
                    // Best-effort plain-text payload for non-aware consumers.
                    e.dataTransfer.setData('text/plain', f.name)
                    // For dropping onto OS-level targets, hint a URL.
                    try {
                      const url = URL.createObjectURL(f.blob)
                      e.dataTransfer.setData('text/uri-list', url)
                      // Best-effort revoke after the drag operation has plenty of time to finish.
                      window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
                    } catch {
                      /* createObjectURL can throw on stale blobs */
                    }
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  className="group/icon shrink-0 cursor-grab active:cursor-grabbing"
                  style={{
                    width:           size,
                    height:          size,
                    transformOrigin: 'bottom center',
                    transition:      'transform 80ms ease-out',
                    transform:       isActive ? 'translateY(-6px)' : 'translateY(0)',
                  }}
                >
                  <span
                    className="relative grid size-full place-items-center rounded-xl"
                    style={{
                      background: tint.bg,
                      color:      tint.fg,
                      border:     '1px solid rgba(255,255,255,0.10)',
                      boxShadow:  scale > 1.2
                        ? `0 ${Math.max(2, size * 0.06)}px ${Math.max(6, size * 0.18)}px rgba(0,0,0,0.45)`
                        : '0 2px 6px rgba(0,0,0,0.35)',
                    }}
                  >
                    <Icon size={Math.max(18, size * 0.5)} strokeWidth={1.8} aria-hidden />
                    {/* Permanent ascending serial — survives deletes. */}
                    <span
                      className="mono pointer-events-none absolute"
                      style={{
                        right:        Math.max(2, size * 0.04),
                        bottom:       Math.max(2, size * 0.04),
                        fontSize:     Math.max(7, size * 0.16),
                        lineHeight:   1,
                        padding:      `${Math.max(1, size * 0.025)}px ${Math.max(2, size * 0.055)}px`,
                        borderRadius: Math.max(3, size * 0.07),
                        color:        'rgba(255,255,255,0.92)',
                        background:   'rgba(0,0,0,0.55)',
                        letterSpacing: 0.3,
                        fontWeight:   600,
                      }}
                    >
                      {String(f.serial ?? 0).padStart(3, '0')}
                    </span>
                  </span>
                  {/* Open-indicator dot */}
                  {isActive && (
                    <span
                      className="mx-auto mt-1 block"
                      style={{
                        width:   4,
                        height:  4,
                        borderRadius: 999,
                        background: 'rgba(255,255,255,0.85)',
                      }}
                    />
                  )}
                </button>
              )
            })}

            {files.length > 0 && (
              <>
                <span
                  aria-hidden
                  style={{
                    alignSelf: 'center',
                    width:     1,
                    height:    BASE_ICON_SIZE * 0.55,
                    margin:    '0 4px',
                    background: 'rgba(255,255,255,0.18)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => { void clearAllFiles(); setActive(null) }}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-semibold transition"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    color:      '#cbd5e1',
                    alignSelf:  'center',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                  title="Clear dock"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
    </>
  )
}
