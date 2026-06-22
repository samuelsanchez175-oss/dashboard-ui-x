import { ArrowLeft, Check, Copy, Crosshair, Download, ImageUp, Loader2, Sparkles } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import { fetchWithKeys } from '../../lib/api-keys/fetch-with-keys'
import StudioToolsHeader from './StudioToolsHeader'

interface ToolsAppIconStudioPageProps {
  onNavigate: (routeId: string) => void
}

/** App Store Connect app icon size. The export is always exactly this, opaque. */
const SIZE = 1024

type FitMode = 'cover' | 'contain'
type Offset = { x: number; y: number }

const BG_PRESETS = ['#FFFFFF', '#000000', '#0B0B0F', '#F5F5F7', '#1D1D1F', '#F5A623'] as const

/** Scale that makes the image cover (max) or fit-inside (min) the SIZE×SIZE frame. */
function baseScaleFor(img: HTMLImageElement, fit: FitMode): number {
  const sx = SIZE / img.naturalWidth
  const sy = SIZE / img.naturalHeight
  return fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy)
}

/** Keep 'cover' from ever revealing the background while panning. 'fit' pans freely. */
function clampOffset(off: Offset, img: HTMLImageElement, fit: FitMode, zoom: number): Offset {
  if (fit !== 'cover') return off
  const scale = baseScaleFor(img, fit) * zoom
  const dw = img.naturalWidth * scale
  const dh = img.naturalHeight * scale
  const minX = SIZE - dw // ≤ 0
  const minY = SIZE - dh // ≤ 0
  return { x: Math.min(0, Math.max(minX, off.x)), y: Math.min(0, Math.max(minY, off.y)) }
}

/** Paint the opaque 1024² icon. The canvas backing store IS the downloaded file. */
function paint(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement | null,
  fit: FitMode,
  zoom: number,
  off: Offset,
  bg: string,
): void {
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, SIZE, SIZE)
  if (!img) return
  const scale = baseScaleFor(img, fit) * zoom
  const dw = img.naturalWidth * scale
  const dh = img.naturalHeight * scale
  const x = (SIZE - dw) / 2 + off.x
  const y = (SIZE - dh) / 2 + off.y
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, x, y, dw, dh)
}

/* ── App Store copy (AI) ─────────────────────────────────────────────────────── */

type AppStoreCopy = {
  appName: string
  subtitle: string
  promotionalText: string
  keywords: string
  description: string
  whatsNew: string
  primaryCategory: string
}

type GenState = 'idle' | 'loading' | 'done' | 'error'

/** App Store Connect fields + Apple's character limits (undefined = no limit). */
const COPY_FIELDS: { key: keyof AppStoreCopy; label: string; limit?: number; rows: number; hint?: string }[] = [
  { key: 'appName', label: 'App name', limit: 30, rows: 1 },
  { key: 'subtitle', label: 'Subtitle', limit: 30, rows: 1, hint: 'Shown under the name on your product page.' },
  { key: 'promotionalText', label: 'Promotional text', limit: 170, rows: 3, hint: 'You can change this anytime without a new review.' },
  { key: 'keywords', label: 'Keywords', limit: 100, rows: 2, hint: 'Hidden search terms — comma-separated, no spaces.' },
  { key: 'description', label: 'Description', limit: 4000, rows: 8 },
  { key: 'whatsNew', label: 'What’s New', limit: 4000, rows: 5, hint: 'Release notes for this update.' },
  { key: 'primaryCategory', label: 'Suggested category', rows: 1 },
]

/** Downscale the source image to a small JPEG for the vision model (keeps the request light). */
function makeAiImage(img: HTMLImageElement): { base64: string; mime: string } | null {
  const maxEdge = 1024
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, w, h)
  const base64 = c.toDataURL('image/jpeg', 0.85).split(',')[1] ?? ''
  return base64 ? { base64, mime: 'image/jpeg' } : null
}

export default function ToolsAppIconStudioPage({ onNavigate }: ToolsAppIconStudioPageProps) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [fit, setFit] = useState<FitMode>('cover')
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 })
  const [bg, setBg] = useState<string>('#FFFFFF')
  const [rounded, setRounded] = useState(true)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [aiImage, setAiImage] = useState<{ base64: string; mime: string } | null>(null)
  const [copy, setCopy] = useState<AppStoreCopy | null>(null)
  const [genState, setGenState] = useState<GenState>('idle')
  const [genError, setGenError] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const panRef = useRef<{ sx: number; sy: number; bx: number; by: number; ratio: number } | null>(null)

  // Repaint whenever any input changes. Pure draw — no setState, so no render cascade.
  useEffect(() => {
    const c = canvasRef.current
    if (c) paint(c, img, fit, zoom, offset, bg)
  }, [img, fit, zoom, offset, bg])

  const loadFile = useCallback((file: File | null | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('That file isn’t an image — drop a PNG, JPG, or WebP.')
      return
    }
    setError(null)
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      setImg(image)
      setFileName(file.name)
      setFit('cover')
      setZoom(1)
      setOffset({ x: 0, y: 0 })
      setAiImage(makeAiImage(image))
      setCopy(null)
      setGenState('idle')
      setGenError(null)
      URL.revokeObjectURL(url)
    }
    image.onerror = () => {
      setError('Couldn’t read that image. Try a different file.')
      URL.revokeObjectURL(url)
    }
    image.src = url
  }, [])

  const onDrop = useCallback(
    (e: ReactDragEvent<HTMLElement>) => {
      e.preventDefault()
      setDragOver(false)
      loadFile(e.dataTransfer.files?.[0])
    },
    [loadFile],
  )

  const onZoomChange = useCallback(
    (z: number) => {
      setZoom(z)
      if (img) setOffset(o => clampOffset(o, img, fit, z))
    },
    [img, fit],
  )

  const onFitChange = useCallback((f: FitMode) => {
    setFit(f)
    setOffset({ x: 0, y: 0 })
  }, [])

  const recenter = useCallback(() => {
    setOffset({ x: 0, y: 0 })
    setZoom(1)
  }, [])

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!img) return
      const rect = e.currentTarget.getBoundingClientRect()
      panRef.current = { sx: e.clientX, sy: e.clientY, bx: offset.x, by: offset.y, ratio: SIZE / rect.width }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [img, offset.x, offset.y],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const p = panRef.current
      if (!p || !img) return
      const nx = p.bx + (e.clientX - p.sx) * p.ratio
      const ny = p.by + (e.clientY - p.sy) * p.ratio
      setOffset(clampOffset({ x: nx, y: ny }, img, fit, zoom))
    },
    [img, fit, zoom],
  )

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLCanvasElement>) => {
    panRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* pointer already released */
    }
  }, [])

  const download = useCallback(() => {
    const c = canvasRef.current
    if (!c || !img) return
    c.toBlob(
      blob => {
        if (!blob) return
        const base = (fileName ?? 'app-icon').replace(/\.[^.]+$/, '').trim() || 'app-icon'
        const a = document.createElement('a')
        a.download = `${base}-1024.png`
        a.href = URL.createObjectURL(blob)
        a.click()
        URL.revokeObjectURL(a.href)
      },
      'image/png',
    )
  }, [fileName, img])

  const generateCopy = useCallback(async () => {
    if (!aiImage) return
    setGenState('loading')
    setGenError(null)
    try {
      const res = await fetchWithKeys('/api/appstore/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: aiImage.base64, imageMime: aiImage.mime, notes }),
      })
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: AppStoreCopy }
        | { ok: false; error?: string; message?: string }
        | null
      if (!res.ok || !json || json.ok !== true) {
        setGenError(json && 'message' in json && json.message ? json.message : `Generation failed (HTTP ${res.status}).`)
        setGenState('error')
        return
      }
      setCopy(json.data)
      setGenState('done')
    } catch {
      setGenError('Couldn’t reach the generator. Make sure the dashboard dev server is running.')
      setGenState('error')
    }
  }, [aiImage, notes])

  const copyField = useCallback((key: string, value: string) => {
    void navigator.clipboard?.writeText(value)
    setCopiedKey(key)
    window.setTimeout(() => setCopiedKey(k => (k === key ? null : k)), 1400)
  }, [])

  const previewRadius = rounded ? '22.5%' : '14px'

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}
    >
      <StudioToolsHeader
        toolId="tools-app-icon"
        crumbs={[{ label: 'Workspace' }, { label: 'Tools' }, { label: 'App Store Icon', emphasis: true }]}
        leftExtra={
          <button
            type="button"
            onClick={() => onNavigate('tools-hub')}
            className="mr-1 grid size-8 place-items-center rounded-lg transition"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-3)' }}
            aria-label="Back to Tools"
          >
            <ArrowLeft className="size-4" strokeWidth={2} />
          </button>
        }
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-5xl px-6 py-8">
          <header className="mb-6">
            <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>
              App Store icon
            </h1>
            <p className="mt-1 text-sm leading-snug" style={{ color: 'var(--text-3)' }}>
              Drop a square-ish image, line it up inside the 1024 × 1024 frame, and download a flattened,
              opaque PNG that App Store Connect will accept.
            </p>
          </header>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,400px)_1fr]">
            {/* ── Preview / drop target ── */}
            <div>
              <div
                onDragOver={e => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-2xl transition"
                style={{
                  background: 'var(--bg-card)',
                  border: `1.5px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
                  boxShadow: dragOver ? '0 0 0 3px color-mix(in oklab, var(--accent) 25%, transparent)' : 'none',
                }}
              >
                {img ? (
                  <canvas
                    ref={canvasRef}
                    width={SIZE}
                    height={SIZE}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    className="h-full w-full select-none"
                    style={{
                      borderRadius: previewRadius,
                      cursor: fit === 'cover' || zoom > 1 ? 'grab' : 'default',
                      touchAction: 'none',
                    }}
                    aria-label="Icon preview — drag to reposition"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center"
                    style={{ background: 'transparent', color: 'var(--text-3)' }}
                  >
                    <span
                      className="grid size-12 place-items-center rounded-xl"
                      style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-soft)' }}
                    >
                      <ImageUp className="size-6" strokeWidth={1.6} style={{ color: 'var(--text-2)' }} />
                    </span>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
                      Drop a square image to start
                    </span>
                    <span className="text-xs leading-snug" style={{ color: 'var(--text-4)' }}>
                      or click to choose a file · PNG, JPG, or WebP
                    </span>
                  </button>
                )}
              </div>

              <div className="mt-2 flex items-center justify-between px-1">
                <span className="text-xs" style={{ color: 'var(--text-4)' }}>
                  {img ? '1024 × 1024 · drag to reposition' : '1024 × 1024 output'}
                </span>
                {fileName && (
                  <span className="max-w-[55%] truncate text-xs" style={{ color: 'var(--text-3)' }} title={fileName}>
                    {fileName}
                  </span>
                )}
              </div>
            </div>

            {/* ── Controls ── */}
            <div className="flex flex-col gap-5">
              {/* Framing */}
              <Section label="Framing">
                <div className="grid grid-cols-2 gap-2">
                  <SegButton active={fit === 'cover'} onClick={() => onFitChange('cover')} label="Crop to fill" />
                  <SegButton active={fit === 'contain'} onClick={() => onFitChange('contain')} label="Fit whole image" />
                </div>
                <Hint>
                  <strong style={{ color: 'var(--text-2)', fontWeight: 600 }}>Crop to fill</strong> covers the whole
                  square and trims the edges. <strong style={{ color: 'var(--text-2)', fontWeight: 600 }}>Fit whole
                  image</strong> shows everything and pads the gaps with the background.
                </Hint>
              </Section>

              {/* Zoom */}
              <Section label="Zoom">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={4}
                    step={0.01}
                    value={zoom}
                    disabled={!img}
                    onChange={e => onZoomChange(Number(e.target.value))}
                    className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ accentColor: 'var(--accent)', background: 'var(--border)' }}
                    aria-label="Zoom"
                  />
                  <span
                    className="w-12 text-right text-xs tabular-nums"
                    style={{ color: 'var(--text-2)', fontFamily: "'DM Mono', monospace" }}
                  >
                    {zoom.toFixed(2)}×
                  </span>
                </div>
                <Hint>Scale the image up to crop in tighter, then drag it in the preview to line it up.</Hint>
              </Section>

              {/* Background */}
              <Section label="Background">
                <div className="flex flex-wrap items-center gap-2">
                  {BG_PRESETS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setBg(c)}
                      className="size-7 rounded-full transition"
                      style={{
                        background: c,
                        border: bg.toUpperCase() === c ? '2px solid var(--accent)' : '1px solid var(--border-strong)',
                        boxShadow: bg.toUpperCase() === c ? '0 0 0 2px color-mix(in oklab, var(--accent) 30%, transparent)' : 'none',
                      }}
                      aria-label={`Background ${c}`}
                      aria-pressed={bg.toUpperCase() === c}
                    />
                  ))}
                  <label
                    className="flex size-7 cursor-pointer items-center justify-center overflow-hidden rounded-full"
                    style={{ border: '1px dashed var(--border-strong)' }}
                    title="Pick a custom background color"
                  >
                    <input
                      type="color"
                      value={bg}
                      onChange={e => setBg(e.target.value)}
                      className="size-9 cursor-pointer border-0 bg-transparent p-0"
                      aria-label="Custom background color"
                    />
                  </label>
                </div>
                <Hint>
                  Fills any padding behind the image. App Store icons can’t be transparent, so this is baked into the
                  file. White by default.
                </Hint>
              </Section>

              {/* Preview options */}
              <Section label="Preview">
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={rounded}
                    onChange={e => setRounded(e.target.checked)}
                    className="size-4 cursor-pointer"
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  <span className="text-sm" style={{ color: 'var(--text-2)' }}>
                    Show rounded corners
                  </span>
                </label>
                <Hint>
                  Previews how Apple masks the corners on device. The file you download is always the full square —
                  Apple rounds it for you.
                </Hint>
                <button
                  type="button"
                  onClick={recenter}
                  disabled={!img}
                  className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
                >
                  <Crosshair className="size-3.5" strokeWidth={2} />
                  Recenter &amp; reset zoom
                </button>
              </Section>

              {/* Actions */}
              <div className="mt-1 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={download}
                  disabled={!img}
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: 'var(--accent)', color: 'var(--accent-contrast, #fff)' }}
                >
                  <Download className="size-4" strokeWidth={2.2} />
                  Download 1024 × 1024 PNG
                </button>
                <div className="flex items-center justify-between gap-2 px-1">
                  <span className="text-xs leading-snug" style={{ color: 'var(--text-4)' }}>
                    {img
                      ? 'Opaque & flattened — ready for App Store Connect.'
                      : 'Drop an image to enable download.'}
                  </span>
                  {img && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="shrink-0 text-xs font-medium underline-offset-2 hover:underline"
                      style={{ color: 'var(--text-3)' }}
                    >
                      Replace image
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── App Store copy (AI) ── */}
          <section
            className="mt-8 rounded-2xl p-5"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <h2 className="flex items-center gap-2 text-base font-semibold" style={{ color: 'var(--text-1)' }}>
              <Sparkles className="size-4" strokeWidth={2} style={{ color: 'var(--accent)' }} />
              App Store copy
            </h2>
            <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--text-3)' }}>
              Reads your image and drafts the App Store Connect text — promotional text, description, keywords, and
              what’s new — so you can copy each field straight in. Uses Gemini; add a key in Dev → Settings if asked.
            </p>

            <label className="mt-4 flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>
                Add context <span style={{ color: 'var(--text-4)' }}>(optional)</span>
              </span>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="App name, what it does, key features, who it’s for…"
                className="w-full resize-y rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
              />
              <span className="text-xs leading-snug" style={{ color: 'var(--text-4)' }}>
                The image is analyzed automatically. A line or two here makes the copy much sharper.
              </span>
            </label>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={generateCopy}
                disabled={!aiImage || genState === 'loading'}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: 'var(--accent)', color: 'var(--accent-contrast, #fff)' }}
              >
                {genState === 'loading' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" strokeWidth={2.2} />
                )}
                {genState === 'loading' ? 'Generating…' : copy ? 'Regenerate' : 'Generate App Store copy'}
              </button>
              {!aiImage && (
                <span className="text-xs" style={{ color: 'var(--text-4)' }}>
                  Drop an image first.
                </span>
              )}
            </div>

            {genState === 'error' && genError && (
              <div
                className="mt-3 rounded-lg px-3 py-2 text-xs leading-snug"
                style={{
                  background: 'var(--danger-soft, color-mix(in oklab, var(--danger) 12%, transparent))',
                  border: '1px solid color-mix(in oklab, var(--danger) 35%, transparent)',
                  color: 'var(--danger)',
                }}
              >
                {genError}
                {/MISSING_CONFIG|GEMINI/i.test(genError) && (
                  <>
                    {' '}
                    <button
                      type="button"
                      onClick={() => onNavigate('dev')}
                      className="font-medium underline underline-offset-2"
                      style={{ color: 'inherit' }}
                    >
                      Open Settings
                    </button>{' '}
                    to add a Gemini key.
                  </>
                )}
              </div>
            )}

            {copy && (
              <div className="mt-4 grid gap-3">
                {COPY_FIELDS.map(f => (
                  <CopyField
                    key={f.key}
                    label={f.label}
                    value={copy[f.key] ?? ''}
                    limit={f.limit}
                    rows={f.rows}
                    hint={f.hint}
                    copied={copiedKey === f.key}
                    onCopy={() => copyField(f.key, copy[f.key] ?? '')}
                  />
                ))}
              </div>
            )}
          </section>

          {error && (
            <div
              className="mt-5 rounded-xl px-4 py-3 text-sm"
              style={{
                background: 'var(--danger-soft, color-mix(in oklab, var(--danger) 12%, transparent))',
                border: '1px solid color-mix(in oklab, var(--danger) 35%, transparent)',
                color: 'var(--danger)',
              }}
            >
              {error}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/*"
            className="hidden"
            onChange={e => {
              loadFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
      </div>
    </div>
  )
}

/* ── Internal layout helpers ─────────────────────────────────────────────────── */

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-4)' }}>
        {label}
      </span>
      {children}
    </section>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs leading-snug" style={{ color: 'var(--text-3)' }}>
      {children}
    </p>
  )
}

function SegButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="rounded-lg px-3 py-2 text-sm font-medium transition"
      style={{
        background: active ? 'color-mix(in oklab, var(--accent) 14%, transparent)' : 'var(--bg-card)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        color: active ? 'var(--accent)' : 'var(--text-2)',
      }}
    >
      {label}
    </button>
  )
}

function CopyField({
  label,
  value,
  limit,
  rows,
  hint,
  copied,
  onCopy,
}: {
  label: string
  value: string
  limit?: number
  rows: number
  hint?: string
  copied: boolean
  onCopy: () => void
}) {
  const over = limit != null && value.length > limit
  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border)' }}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
          {label}
        </span>
        <div className="flex items-center gap-2.5">
          {limit != null && (
            <span
              className="text-xs tabular-nums"
              style={{ color: over ? 'var(--danger)' : 'var(--text-4)', fontFamily: "'DM Mono', monospace" }}
            >
              {value.length}/{limit}
            </span>
          )}
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: copied ? 'var(--good)' : 'var(--text-2)',
            }}
          >
            {copied ? <Check className="size-3.5" strokeWidth={2.4} /> : <Copy className="size-3.5" strokeWidth={2} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <textarea
        readOnly
        value={value}
        rows={rows}
        onFocus={e => e.currentTarget.select()}
        className="w-full resize-y rounded-md px-2.5 py-2 text-sm leading-snug outline-none"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-soft)', color: 'var(--text-1)' }}
      />
      {hint && (
        <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--text-4)' }}>
          {hint}
        </p>
      )}
      {over && (
        <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--danger)' }}>
          Over Apple’s {limit}-character limit — trim before pasting.
        </p>
      )}
    </div>
  )
}
