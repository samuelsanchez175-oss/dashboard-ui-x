import { ArrowLeft, Crosshair, Download, ImageUp } from 'lucide-react'
import { dispatchFileDownload } from '../../components/files-dock/files-store'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

import StudioToolsHeader from './StudioToolsHeader'

interface ToolsDeviceMockupPageProps {
  onNavigate: (routeId: string) => void
}

type FitMode = 'cover' | 'contain'
type Offset = { x: number; y: number }

/* ── iPhone 17 geometry — everything derives from the screen width SW (canvas px),
   so the whole device scales as one unit and the export stays crisp. ── */
const SW = 1180                            // screen width
const SH = Math.round((SW * 19.5) / 9)     // 19.5:9 display
const BEZEL = Math.round(SW * 0.033)       // uniform black bezel around the screen
const RAIL = Math.round(SW * 0.020)        // metal side rail beyond the bezel
const MARGIN = Math.round(SW * 0.085)      // backdrop padding (room for side buttons + shadow)
const SCREEN_R = Math.round(SW * 0.135)    // screen corner radius
const BEZEL_R = SCREEN_R + BEZEL
const BODY_R = BEZEL_R + RAIL
const BODY_W = SW + 2 * (BEZEL + RAIL)
const BODY_H = SH + 2 * (BEZEL + RAIL)
const CW = BODY_W + 2 * MARGIN             // full canvas width (the exported PNG)
const CH = BODY_H + 2 * MARGIN
const BODY_X = MARGIN
const BODY_Y = MARGIN
const OX = MARGIN + BEZEL + RAIL           // screen origin x
const OY = MARGIN + BEZEL + RAIL           // screen origin y

const ISLAND_W = Math.round(SW * 0.33)
const ISLAND_H = Math.round(SW * 0.082)
const ISLAND_TOP = OY + Math.round(SW * 0.028)

type Frame = { name: string; rail: [string, string]; edge: string; btn: string }
/** Frame finishes — the metallic side rail colour. First is the default. */
const FRAMES: Frame[] = [
  { name: 'Black',         rail: ['#48484a', '#1b1b1d'], edge: '#0a0a0b', btn: '#2c2c2e' },
  { name: 'Silver',        rail: ['#f4f4f6', '#bcbcc2'], edge: '#9b9ba1', btn: '#cdcdd2' },
  { name: 'Deep Blue',     rail: ['#3c4d68', '#1d2940'], edge: '#141d2e', btn: '#2b3a52' },
  { name: 'Cosmic Orange', rail: ['#ff9d5c', '#d56f2c'], edge: '#b25820', btn: '#e67e36' },
]

const BG_PRESETS = ['transparent', '#FFFFFF', '#F5F5F7', '#0B0B0F', '#000000'] as const

/** Light/dark checkerboard so the user can see where the PNG is transparent. */
const CHECKER: React.CSSProperties = {
  backgroundColor: 'var(--bg-card)',
  backgroundImage:
    'linear-gradient(45deg, var(--bg-hover) 25%, transparent 25%), linear-gradient(-45deg, var(--bg-hover) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--bg-hover) 75%), linear-gradient(-45deg, transparent 75%, var(--bg-hover) 75%)',
  backgroundSize: '22px 22px',
  backgroundPosition: '0 0, 0 11px, 11px -11px, -11px 0',
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/** Scale that makes the screenshot cover (max) or fit-inside (min) the SW×SH screen. */
function screenScale(img: HTMLImageElement, fit: FitMode): number {
  const sx = SW / img.naturalWidth
  const sy = SH / img.naturalHeight
  return fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy)
}

/** Keep 'cover' from ever revealing the black screen while panning. 'fit' pans freely. */
function clampOffset(off: Offset, img: HTMLImageElement, fit: FitMode, zoom: number): Offset {
  if (fit !== 'cover') return off
  const s = screenScale(img, fit) * zoom
  const dw = img.naturalWidth * s
  const dh = img.naturalHeight * s
  return { x: Math.min(0, Math.max(SW - dw, off.x)), y: Math.min(0, Math.max(SH - dh, off.y)) }
}

function drawButtons(ctx: CanvasRenderingContext2D, frame: Frame): void {
  ctx.fillStyle = frame.btn
  const w = Math.round(RAIL * 1.6)
  const r = w * 0.4
  // Right rail: side/power button (upper) + Camera Control (lower)
  const rx = BODY_X + BODY_W - 2
  const powerLen = Math.round(SH * 0.115)
  const powerY = BODY_Y + Math.round(BODY_H * 0.30)
  roundRect(ctx, rx, powerY, w, powerLen, r); ctx.fill()
  const camLen = Math.round(SH * 0.06)
  const camY = powerY + powerLen + Math.round(SH * 0.05)
  roundRect(ctx, rx, camY, w, camLen, r); ctx.fill()
  // Left rail: Action button (top) + volume up + volume down
  const lx = BODY_X - w + 2
  const actLen = Math.round(SH * 0.05)
  const actY = BODY_Y + Math.round(BODY_H * 0.22)
  roundRect(ctx, lx, actY, w, actLen, r); ctx.fill()
  const volLen = Math.round(SH * 0.075)
  const vUpY = actY + actLen + Math.round(SH * 0.04)
  roundRect(ctx, lx, vUpY, w, volLen, r); ctx.fill()
  const vDnY = vUpY + volLen + Math.round(SH * 0.025)
  roundRect(ctx, lx, vDnY, w, volLen, r); ctx.fill()
}

/** Paint the whole device. The canvas backing store IS the downloaded PNG. */
function paintDevice(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement | null,
  fit: FitMode,
  zoom: number,
  off: Offset,
  frame: Frame,
  bg: string,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, CW, CH)
  if (bg !== 'transparent') {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, CW, CH)
  }

  // Metal rail body, with a soft drop shadow so the device floats.
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.30)'
  ctx.shadowBlur = Math.round(SW * 0.07)
  ctx.shadowOffsetY = Math.round(SW * 0.022)
  const rail = ctx.createLinearGradient(BODY_X, BODY_Y, BODY_X, BODY_Y + BODY_H)
  rail.addColorStop(0, frame.rail[0])
  rail.addColorStop(1, frame.rail[1])
  ctx.fillStyle = rail
  roundRect(ctx, BODY_X, BODY_Y, BODY_W, BODY_H, BODY_R)
  ctx.fill()
  ctx.restore()

  drawButtons(ctx, frame)

  // Thin outer edge highlight on the rail.
  const lw = Math.max(2, Math.round(SW * 0.004))
  ctx.lineWidth = lw
  ctx.strokeStyle = frame.edge
  roundRect(ctx, BODY_X + lw / 2, BODY_Y + lw / 2, BODY_W - lw, BODY_H - lw, BODY_R)
  ctx.stroke()

  // Black bezel.
  ctx.fillStyle = '#08080a'
  roundRect(ctx, BODY_X + RAIL, BODY_Y + RAIL, BODY_W - 2 * RAIL, BODY_H - 2 * RAIL, BEZEL_R)
  ctx.fill()

  // Screen: clip to the rounded screen, fill black, then drop the screenshot in.
  ctx.save()
  roundRect(ctx, OX, OY, SW, SH, SCREEN_R)
  ctx.clip()
  ctx.fillStyle = '#000'
  ctx.fillRect(OX, OY, SW, SH)
  if (img) {
    const s = screenScale(img, fit) * zoom
    const dw = img.naturalWidth * s
    const dh = img.naturalHeight * s
    const x = OX + (SW - dw) / 2 + off.x
    const y = OY + (SH - dh) / 2 + off.y
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, x, y, dw, dh)
  }
  ctx.restore()

  // Dynamic Island, painted over the screenshot like real OS chrome.
  const ix = OX + (SW - ISLAND_W) / 2
  ctx.fillStyle = '#000'
  roundRect(ctx, ix, ISLAND_TOP, ISLAND_W, ISLAND_H, ISLAND_H / 2)
  ctx.fill()
  const cx = ix + ISLAND_W - ISLAND_H * 0.62
  const cy = ISLAND_TOP + ISLAND_H / 2
  ctx.fillStyle = '#0c0c12'
  ctx.beginPath()
  ctx.arc(cx, cy, ISLAND_H * 0.22, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(48,70,104,0.55)'
  ctx.beginPath()
  ctx.arc(cx, cy, ISLAND_H * 0.1, 0, Math.PI * 2)
  ctx.fill()
}

export default function ToolsDeviceMockupPage({ onNavigate }: ToolsDeviceMockupPageProps) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [fit, setFit] = useState<FitMode>('cover')
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 })
  const [frameName, setFrameName] = useState<string>(FRAMES[0].name)
  const [bg, setBg] = useState<string>('transparent')
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const panRef = useRef<{ sx: number; sy: number; bx: number; by: number; ratio: number } | null>(null)

  const frame = FRAMES.find(f => f.name === frameName) ?? FRAMES[0]

  // Pure draw — no setState, so no render cascade.
  useEffect(() => {
    const c = canvasRef.current
    if (c) paintDevice(c, img, fit, zoom, offset, frame, bg)
  }, [img, fit, zoom, offset, frame, bg])

  const loadFile = useCallback((file: File | null | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('That file isn’t an image — drop a PNG, JPG, or WebP screenshot.')
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
      panRef.current = { sx: e.clientX, sy: e.clientY, bx: offset.x, by: offset.y, ratio: CW / rect.width }
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
    c.toBlob(blob => {
      if (!blob) return
      const base = (fileName ?? 'screenshot').replace(/\.[^.]+$/, '').trim() || 'screenshot'
      const a = document.createElement('a')
      a.download = `${base}-iphone17.png`
      a.href = URL.createObjectURL(blob)
      a.click()
      URL.revokeObjectURL(a.href)
      dispatchFileDownload({ blob, name: `${base}-iphone17.png`, sourceTool: 'tools-device-mockup', outputType: 'mockup', tags: ['image', 'png'] })
    }, 'image/png')
  }, [fileName, img])

  const draggable = img != null && (fit === 'cover' || zoom > 1)

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}
    >
      <StudioToolsHeader
        toolId="tools-device-mockup"
        crumbs={[{ label: 'Workspace' }, { label: 'Tools' }, { label: 'iPhone 17 Mockup', emphasis: true }]}
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
              iPhone 17 mockup
            </h1>
            <p className="mt-1 text-sm leading-snug" style={{ color: 'var(--text-3)' }}>
              Drop a screenshot and it’s placed inside a clean iPhone 17 frame so it looks like it’s running on the
              device. Export a transparent PNG to drop onto any background.
            </p>
          </header>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
            {/* ── Preview / drop target ── */}
            <div>
              <div
                onDragOver={e => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className="relative grid h-[58vh] max-h-[620px] min-h-[420px] w-full place-items-center overflow-hidden rounded-2xl p-4 transition"
                style={{
                  ...(bg === 'transparent' ? CHECKER : { background: 'var(--bg-card)' }),
                  border: `1.5px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
                  boxShadow: dragOver ? '0 0 0 3px color-mix(in oklab, var(--accent) 25%, transparent)' : 'none',
                }}
              >
                {img ? (
                  <canvas
                    ref={canvasRef}
                    width={CW}
                    height={CH}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    className="h-full w-auto max-w-full select-none"
                    style={{ cursor: draggable ? 'grab' : 'default', touchAction: 'none' }}
                    aria-label="iPhone mockup preview — drag to reposition the screenshot"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl p-6 text-center"
                    style={{ background: 'transparent', color: 'var(--text-3)' }}
                  >
                    <span
                      className="grid size-12 place-items-center rounded-xl"
                      style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-soft)' }}
                    >
                      <ImageUp className="size-6" strokeWidth={1.6} style={{ color: 'var(--text-2)' }} />
                    </span>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
                      Drop a screenshot to place it in the iPhone
                    </span>
                    <span className="text-xs leading-snug" style={{ color: 'var(--text-4)' }}>
                      or click to choose a file · PNG, JPG, or WebP
                    </span>
                  </button>
                )}
              </div>

              <div className="mt-2 flex items-center justify-between px-1">
                <span className="text-xs" style={{ color: 'var(--text-4)' }}>
                  {img ? 'Drag the screenshot to line it up' : 'iPhone 17 · 19.5 : 9 screen'}
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
              {/* Screenshot fit */}
              <Section label="Screenshot fit">
                <div className="grid grid-cols-2 gap-2">
                  <SegButton active={fit === 'cover'} onClick={() => onFitChange('cover')} label="Fill the screen" />
                  <SegButton active={fit === 'contain'} onClick={() => onFitChange('contain')} label="Fit whole image" />
                </div>
                <Hint>
                  <strong style={{ color: 'var(--text-2)', fontWeight: 600 }}>Fill the screen</strong> crops the edges so
                  the screenshot fills edge to edge. <strong style={{ color: 'var(--text-2)', fontWeight: 600 }}>Fit
                  whole image</strong> shows all of it and pads the rest with black. A real phone screenshot fills
                  perfectly.
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
                <Hint>Scale the screenshot up to crop in tighter, then drag it in the preview to line it up.</Hint>
              </Section>

              {/* Frame finish */}
              <Section label="Frame finish">
                <div className="flex flex-wrap items-center gap-2">
                  {FRAMES.map(f => (
                    <button
                      key={f.name}
                      type="button"
                      onClick={() => setFrameName(f.name)}
                      className="size-7 rounded-full transition"
                      style={{
                        background: `linear-gradient(160deg, ${f.rail[0]}, ${f.rail[1]})`,
                        border: frameName === f.name ? '2px solid var(--accent)' : '1px solid var(--border-strong)',
                        boxShadow:
                          frameName === f.name ? '0 0 0 2px color-mix(in oklab, var(--accent) 30%, transparent)' : 'none',
                      }}
                      aria-label={`${f.name} frame`}
                      aria-pressed={frameName === f.name}
                      title={f.name}
                    />
                  ))}
                  <span className="ml-1 text-xs" style={{ color: 'var(--text-3)' }}>
                    {frame.name}
                  </span>
                </div>
                <Hint>The colour of the phone’s side rail. Just the look of the frame — it doesn’t touch your image.</Hint>
              </Section>

              {/* Background */}
              <Section label="Background">
                <div className="flex flex-wrap items-center gap-2">
                  {BG_PRESETS.map(c => {
                    const selected = bg.toUpperCase() === c.toUpperCase()
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setBg(c)}
                        className="size-7 overflow-hidden rounded-full transition"
                        style={{
                          ...(c === 'transparent' ? CHECKER : { background: c }),
                          border: selected ? '2px solid var(--accent)' : '1px solid var(--border-strong)',
                          boxShadow: selected ? '0 0 0 2px color-mix(in oklab, var(--accent) 30%, transparent)' : 'none',
                        }}
                        aria-label={c === 'transparent' ? 'Transparent background' : `Background ${c}`}
                        aria-pressed={selected}
                        title={c === 'transparent' ? 'Transparent' : c}
                      />
                    )
                  })}
                  <label
                    className="flex size-7 cursor-pointer items-center justify-center overflow-hidden rounded-full"
                    style={{ border: '1px dashed var(--border-strong)' }}
                    title="Pick a custom background colour"
                  >
                    <input
                      type="color"
                      value={bg === 'transparent' ? '#ffffff' : bg}
                      onChange={e => setBg(e.target.value)}
                      className="size-9 cursor-pointer border-0 bg-transparent p-0"
                      aria-label="Custom background colour"
                    />
                  </label>
                </div>
                <Hint>What sits behind the phone. Transparent by default, so you can drop the mockup onto any backdrop.</Hint>
              </Section>

              {/* Reset */}
              <Section label="Position">
                <button
                  type="button"
                  onClick={recenter}
                  disabled={!img}
                  className="inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
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
                  Download mockup PNG
                </button>
                <div className="flex items-center justify-between gap-2 px-1">
                  <span className="text-xs leading-snug" style={{ color: 'var(--text-4)' }}>
                    {img
                      ? bg === 'transparent'
                        ? 'Transparent PNG — drops onto any background.'
                        : 'PNG with your chosen background baked in.'
                      : 'Drop a screenshot to enable download.'}
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

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-4)' }}>
        {label}
      </span>
      {children}
    </section>
  )
}

function Hint({ children }: { children: ReactNode }) {
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
