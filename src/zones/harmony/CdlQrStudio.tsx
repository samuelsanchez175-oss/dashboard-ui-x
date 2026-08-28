import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Download, ExternalLink, Upload } from 'lucide-react'
import QRCodeStyling, { type CornerDotType, type CornerSquareType, type DotType, type Options } from 'qr-code-styling'

import { SURFACES, TYPOGRAPHY } from '../../lib/design-tokens'

type FrameId =
  | 'none'
  | 'pill'
  | 'bar'
  | 'caption'
  | 'balloon'
  | 'pointer'
  | 'ribbon'
  | 'torn'
  | 'bag'
  | 'box'
  | 'phone'
  | 'arrow'

type LogoId = 'none' | 'truck' | 'globe' | 'scan'
type ShapeId = DotType
type CornerId = 'extra-rounded' | 'square' | 'dot' | 'rounded' | 'classy' | 'leaf'

type Style = {
  frame: FrameId
  frameColor: string
  frameText: string
  logo: LogoId
  shape: ShapeId
  fg: string
  bg: string
  corner: CornerId
}

const STORAGE = 'cdl-qr-style-v1'
const TRUCK = `${import.meta.env.BASE_URL}cdl-qr-truck.png`

const GLOBE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="none" stroke="#111" stroke-width="4"/><ellipse cx="32" cy="32" rx="12" ry="28" fill="none" stroke="#111" stroke-width="4"/><path d="M6 32h52M12 18h40M12 46h40" fill="none" stroke="#111" stroke-width="4"/></svg>',
  )

const SCAN_MARK =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M8 20V8h12M44 8h12v12M56 44v12H44M20 56H8V44" fill="none" stroke="#111" stroke-width="6" stroke-linecap="square"/><text x="32" y="38" text-anchor="middle" font-size="11" font-family="sans-serif" font-weight="700">SCAN ME</text></svg>',
  )

const DEFAULT_STYLE: Style = {
  frame: 'pill',
  frameColor: '#1F3F2A',
  frameText: 'SCAN ME',
  logo: 'truck',
  shape: 'rounded',
  fg: '#1F3F2A',
  bg: '#F5F1E8',
  corner: 'extra-rounded',
}

const FRAMES: { id: FrameId; label: string }[] = [
  { id: 'none', label: 'No frame' },
  { id: 'pill', label: 'Pill' },
  { id: 'bar', label: 'Bar' },
  { id: 'caption', label: 'Caption' },
  { id: 'balloon', label: 'Balloon' },
  { id: 'pointer', label: 'Pointer' },
  { id: 'ribbon', label: 'Ribbon' },
  { id: 'torn', label: 'Torn' },
  { id: 'bag', label: 'Bag' },
  { id: 'box', label: 'Box' },
  { id: 'phone', label: 'Phone' },
  { id: 'arrow', label: 'Arrow' },
]

const SHAPES: { id: ShapeId; label: string }[] = [
  { id: 'square', label: 'Square' },
  { id: 'dots', label: 'Dots' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'extra-rounded', label: 'Soft' },
  { id: 'classy', label: 'Classy' },
  { id: 'classy-rounded', label: 'Classy round' },
]

const CORNERS: { id: CornerId; label: string; square: CornerSquareType; dot: CornerDotType }[] = [
  { id: 'extra-rounded', label: 'Round eye', square: 'extra-rounded', dot: 'dot' },
  { id: 'square', label: 'Square', square: 'square', dot: 'square' },
  { id: 'dot', label: 'Dot', square: 'dot', dot: 'dot' },
  { id: 'rounded', label: 'Rounded', square: 'rounded', dot: 'rounded' },
  { id: 'classy', label: 'Classy', square: 'classy', dot: 'classy' },
  { id: 'leaf', label: 'Leaf', square: 'classy-rounded', dot: 'classy-rounded' },
]

function loadStyle(): Style {
  try {
    const raw = localStorage.getItem(STORAGE)
    if (!raw) return DEFAULT_STYLE
    return { ...DEFAULT_STYLE, ...(JSON.parse(raw) as Partial<Style>) }
  } catch {
    return DEFAULT_STYLE
  }
}

function logoSrc(logo: LogoId, upload: string | null): string | undefined {
  if (logo === 'none') return undefined
  if (logo === 'truck') return TRUCK
  if (logo === 'globe') return GLOBE
  if (logo === 'scan') return upload || SCAN_MARK
  return upload || undefined
}

function cornerPair(id: CornerId) {
  return CORNERS.find(c => c.id === id) ?? CORNERS[0]!
}

function Picker({
  selected,
  onSelect,
  children,
  title,
}: {
  selected: boolean
  onSelect: () => void
  children: ReactNode
  title: string
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onSelect}
      className="flex h-16 w-16 items-center justify-center rounded-lg border-2 bg-[var(--bg-card)] p-1"
      style={{
        borderColor: selected ? 'var(--accent)' : 'var(--border)',
        boxShadow: selected ? '0 0 0 1px var(--accent)' : 'none',
      }}
    >
      {children}
    </button>
  )
}

function FrameSketch({ id, color }: { id: FrameId; color: string }) {
  const c = color
  if (id === 'none') {
    return <span className="text-[18px] leading-none" style={{ color: 'var(--text-4)' }}>⊘</span>
  }
  return (
    <div className="relative h-12 w-10">
      <div className="absolute inset-x-1 top-1 h-7 border" style={{ borderColor: c }} />
      {id === 'pill' || id === 'bar' || id === 'caption' || id === 'pointer' ? (
        <div
          className={id === 'pill' ? 'absolute bottom-0 left-1/2 h-2 w-7 -translate-x-1/2 rounded-full' : 'absolute bottom-0 left-1 right-1 h-2'}
          style={{ background: c }}
        />
      ) : null}
      {id === 'balloon' ? (
        <div className="absolute left-1/2 top-0 h-2 w-6 -translate-x-1/2 rounded-sm" style={{ background: c }} />
      ) : null}
      {id === 'bag' ? (
        <div className="absolute left-2 right-2 top-0 h-2 rounded-t-full border-t-2" style={{ borderColor: c }} />
      ) : null}
      {id === 'phone' ? (
        <div className="absolute inset-0 rounded-md border-2" style={{ borderColor: c }} />
      ) : null}
      {id === 'ribbon' || id === 'torn' ? (
        <div className="absolute bottom-0 left-0 right-0 h-2" style={{ background: c }} />
      ) : null}
    </div>
  )
}

function ShapeSketch({ id }: { id: ShapeId }) {
  const cell = (r: number) => {
    if (id === 'dots') return 'rounded-full'
    if (id === 'rounded' || id === 'extra-rounded') return 'rounded-[3px]'
    if (id === 'classy' || id === 'classy-rounded') return r === 0 ? 'rounded-tl-md' : 'rounded-br-md'
    return ''
  }
  return (
    <div className="grid grid-cols-3 gap-[2px]">
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className={`h-2.5 w-2.5 bg-[var(--text-1)] ${cell(i % 3)}`} />
      ))}
    </div>
  )
}

function liveFrameClass(frame: FrameId): string {
  if (frame === 'phone') return 'rounded-[28px] border-[10px] p-2'
  if (frame === 'box' || frame === 'bag') return 'rounded-md border-[6px] p-2'
  if (frame === 'torn') return 'rounded-t-md border-[4px] border-b-0 p-2'
  return 'p-1'
}

export default function CdlQrStudio({ trackUrl }: { trackUrl: string }) {
  const host = useRef<HTMLDivElement>(null)
  const qr = useRef<QRCodeStyling | null>(null)
  const [style, setStyle] = useState<Style>(loadStyle)
  const [upload, setUpload] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function patch(p: Partial<Style>) {
    setStyle(s => {
      const next = { ...s, ...p }
      try {
        localStorage.setItem(STORAGE, JSON.stringify(next))
      } catch { /* ignore */ }
      return next
    })
  }

  const options: Options = useMemo(() => {
    const corner = cornerPair(style.corner)
    const image = logoSrc(style.logo, upload)
    return {
      width: 280,
      height: 280,
      type: 'canvas',
      data: trackUrl || 'https://example.com',
      margin: 8,
      qrOptions: { errorCorrectionLevel: 'H' },
      image,
      imageOptions: {
        hideBackgroundDots: true,
        imageSize: 0.28,
        margin: 4,
        crossOrigin: 'anonymous',
      },
      dotsOptions: { type: style.shape, color: style.fg },
      backgroundOptions: { color: style.bg },
      cornersSquareOptions: { type: corner.square, color: style.fg },
      cornersDotOptions: { type: corner.dot, color: style.fg },
    }
  }, [style, trackUrl, upload])

  useEffect(() => {
    if (!host.current) return
    if (!qr.current) {
      qr.current = new QRCodeStyling(options)
      qr.current.append(host.current)
    } else {
      qr.current.update(options)
    }
  }, [options])

  async function downloadPng() {
    if (!qr.current) return
    setBusy(true)
    try {
      const blob = await qr.current.getRawData('png')
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error('png'))
        el.src = url
      })
      const extra =
        style.frame === 'none' ? 40
          : style.frame === 'phone' ? 120
            : 160
      const qrSize = 900
      const canvas = document.createElement('canvas')
      canvas.width = qrSize + 80
      canvas.height = qrSize + extra
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      const x = 40
      const y = style.frame === 'balloon' ? 70 : 40
      if (style.frame === 'phone') {
        roundRect(ctx, 16, 16, canvas.width - 32, canvas.height - 32, 48)
        ctx.strokeStyle = style.frameColor
        ctx.lineWidth = 22
        ctx.stroke()
      }
      ctx.drawImage(img, x, y, qrSize, qrSize)
      ctx.fillStyle = style.frameColor
      ctx.font = 'bold 42px Outfit, sans-serif'
      ctx.textAlign = 'center'
      const label = style.frameText || 'SCAN ME'
      const cx = canvas.width / 2
      const by = y + qrSize + 56
      if (style.frame === 'pill') {
        const w = ctx.measureText(label).width + 64
        roundRect(ctx, cx - w / 2, by - 40, w, 64, 32)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.fillText(label, cx, by + 8)
      } else if (style.frame === 'bar' || style.frame === 'pointer' || style.frame === 'ribbon' || style.frame === 'box') {
        ctx.fillRect(x, y + qrSize - 8, qrSize, 72)
        ctx.fillStyle = '#fff'
        ctx.fillText(label, cx, y + qrSize + 40)
      } else if (style.frame === 'caption' || style.frame === 'arrow' || style.frame === 'torn' || style.frame === 'bag') {
        ctx.fillText(label, cx, by + 8)
      } else if (style.frame === 'balloon') {
        roundRect(ctx, cx - 140, 16, 280, 48, 8)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 28px Outfit, sans-serif'
        ctx.fillText(label, cx, 48)
      }
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = 'cdl-test-prep-2027-qr.png'
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-xl p-4" style={SURFACES.cardStyle}>
      <h2 className={TYPOGRAPHY.sectionTitle} style={SURFACES.textPrimary}>
        Customize QR code
      </h2>
      <p className="mt-1 text-[13px]" style={SURFACES.textSecondary}>
        Frames, module shapes, corners, colors, and logo — same knobs as QR Code Generator Pro. The scan URL stays this dashboard.
      </p>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,280px)_1fr]">
        <div>
          <div
            className={`mx-auto flex w-fit flex-col items-center ${liveFrameClass(style.frame)}`}
            style={
              style.frame === 'none'
                ? undefined
                : { borderColor: style.frameColor, background: style.bg }
            }
          >
            {style.frame === 'balloon' ? (
              <div
                className="mb-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                style={{ background: style.frameColor }}
              >
                {style.frameText}
              </div>
            ) : null}
            {style.frame === 'bag' ? (
              <div className="mb-1 h-3 w-16 rounded-t-full border-2 border-b-0" style={{ borderColor: style.frameColor }} />
            ) : null}
            <div ref={host} className="overflow-hidden rounded-sm" />
            {style.frame !== 'none' && style.frame !== 'balloon' && style.frame !== 'phone' ? (
              <div
                className={
                  style.frame === 'pill'
                    ? 'mt-1 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white'
                    : style.frame === 'caption' || style.frame === 'arrow'
                      ? 'mt-1 text-[11px] font-semibold uppercase tracking-wide'
                      : 'mt-0 w-full px-2 py-1 text-center text-[10px] font-bold uppercase tracking-wide text-white'
                }
                style={
                  style.frame === 'caption' || style.frame === 'arrow'
                    ? { color: style.frameColor }
                    : { background: style.frameColor }
                }
              >
                {style.frame === 'pointer' ? (
                  <span className="relative">
                    {style.frameText}
                    <span
                      className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-8 border-t-8 border-x-transparent"
                      style={{ borderTopColor: style.frameColor }}
                    />
                  </span>
                ) : (
                  style.frameText
                )}
              </div>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void downloadPng()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-white"
              style={{ background: 'var(--accent)' }}
            >
              <Download size={14} />
              Download PNG
            </button>
            <a
              href="/api/cdl-qr/go"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-medium"
              style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
            >
              <ExternalLink size={14} />
              Test scan
            </a>
          </div>
          <p className="mono mt-2 break-all text-[11px]" style={SURFACES.textMuted}>
            {trackUrl || '…'}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <fieldset>
            <legend className={`${TYPOGRAPHY.cardLabel} mb-2`} style={SURFACES.textMuted}>Frames</legend>
            <div className="flex flex-wrap gap-2">
              {FRAMES.map(f => (
                <Picker key={f.id} title={f.label} selected={style.frame === f.id} onSelect={() => patch({ frame: f.id })}>
                  <FrameSketch id={f.id} color={style.frameColor} />
                </Picker>
              ))}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-[12px]" style={SURFACES.textSecondary}>
                Frame color
                <input
                  type="color"
                  value={style.frameColor}
                  onChange={e => patch({ frameColor: e.target.value })}
                  className="mt-1 h-9 w-full cursor-pointer rounded border bg-transparent"
                  style={{ borderColor: 'var(--border)' }}
                />
              </label>
              <label className="text-[12px]" style={SURFACES.textSecondary}>
                Frame text
                <input
                  type="text"
                  value={style.frameText}
                  onChange={e => patch({ frameText: e.target.value.slice(0, 18) })}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-[13px]"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-muted)', color: 'var(--text-1)' }}
                />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend className={`${TYPOGRAPHY.cardLabel} mb-2`} style={SURFACES.textMuted}>Logos</legend>
            <div className="flex flex-wrap gap-2">
              <Picker title="No logo" selected={style.logo === 'none'} onSelect={() => patch({ logo: 'none' })}>
                <span style={{ color: 'var(--text-4)' }}>⊘</span>
              </Picker>
              <Picker title="CDL truck" selected={style.logo === 'truck'} onSelect={() => patch({ logo: 'truck' })}>
                <img src={TRUCK} alt="" className="h-10 w-10 rounded-full object-cover" />
              </Picker>
              <Picker title="Globe" selected={style.logo === 'globe'} onSelect={() => patch({ logo: 'globe' })}>
                <img src={GLOBE} alt="" className="h-8 w-8" />
              </Picker>
              <Picker title="Scan me mark" selected={style.logo === 'scan' && !upload} onSelect={() => { setUpload(null); patch({ logo: 'scan' }) }}>
                <span className="text-[9px] font-bold leading-tight">SCAN<br />ME</span>
              </Picker>
              <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-[10px]" style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
                <Upload size={14} />
                Upload
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = () => {
                      setUpload(String(reader.result))
                      patch({ logo: 'scan' })
                    }
                    reader.readAsDataURL(file)
                  }}
                />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend className={`${TYPOGRAPHY.cardLabel} mb-2`} style={SURFACES.textMuted}>Shapes</legend>
            <div className="flex flex-wrap gap-2">
              {SHAPES.map(s => (
                <Picker key={s.id} title={s.label} selected={style.shape === s.id} onSelect={() => patch({ shape: s.id })}>
                  <ShapeSketch id={s.id} />
                </Picker>
              ))}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-[12px]" style={SURFACES.textSecondary}>
                QR code color
                <input
                  type="color"
                  value={style.fg}
                  onChange={e => patch({ fg: e.target.value })}
                  className="mt-1 h-9 w-full cursor-pointer rounded border bg-transparent"
                  style={{ borderColor: 'var(--border)' }}
                />
              </label>
              <label className="text-[12px]" style={SURFACES.textSecondary}>
                Background color
                <input
                  type="color"
                  value={style.bg}
                  onChange={e => patch({ bg: e.target.value })}
                  className="mt-1 h-9 w-full cursor-pointer rounded border bg-transparent"
                  style={{ borderColor: 'var(--border)' }}
                />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend className={`${TYPOGRAPHY.cardLabel} mb-2`} style={SURFACES.textMuted}>Corners</legend>
            <div className="flex flex-wrap gap-2">
              {CORNERS.map(c => (
                <Picker key={c.id} title={c.label} selected={style.corner === c.id} onSelect={() => patch({ corner: c.id })}>
                  <div
                    className="h-8 w-8 border-4"
                    style={{
                      borderColor: 'var(--text-1)',
                      borderRadius:
                        c.id === 'square' ? '2px'
                          : c.id === 'dot' ? '999px'
                            : '8px',
                    }}
                  >
                    <div
                      className="m-[3px] h-[10px] w-[10px]"
                      style={{
                        background: 'var(--text-1)',
                        borderRadius: c.id === 'square' ? '1px' : '999px',
                      }}
                    />
                  </div>
                </Picker>
              ))}
            </div>
          </fieldset>
        </div>
      </div>
    </section>
  )
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}
