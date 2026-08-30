import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { RefreshCw, RotateCcw, Upload } from 'lucide-react'
import QRCodeStyling, { type Options } from 'qr-code-styling'

import { safeHttpUrl } from './cdl-qr-shared'
import { CDL_QR_BRAND, type QrBoardBrand } from './qr-board-config'
import {
  CORNER_OPTIONS,
  FRAME_OPTIONS,
  FRAME_SLOTS,
  FrameChrome,
  FrameSketch,
  RESTAURANT_IDS,
  RESTAURANT_OPTIONS,
  REST_SLOTS,
  RestaurantChrome,
  SHAPE_OPTIONS,
  ShapeSketch,
  CornerSketch,
  type CornerId,
  type FrameId,
  type LogoId,
  type ShapeId,
} from './qr-design-options'

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

const BrandContext = createContext<QrBoardBrand>(CDL_QR_BRAND)

function useQrBrand(): QrBoardBrand {
  return useContext(BrandContext)
}

export function QrBrandProvider({ brand, children }: { brand: QrBoardBrand; children: ReactNode }) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>
}

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

const SCAN_TEXT =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text x="32" y="28" text-anchor="middle" font-size="14" font-family="sans-serif" font-weight="800">SCAN</text><text x="32" y="48" text-anchor="middle" font-size="14" font-family="sans-serif" font-weight="800">ME</text></svg>',
  )

const DEFAULT_STYLE: Style = {
  frame: 'pill',
  frameColor: '#1F3F2A',
  frameText: 'SCAN ME',
  logo: 'truck',
  shape: 'rounded',
  fg: '#1F3F2A',
  bg: '#F5F1E8',
  corner: 'eye-round',
}

function brandDefaults(brand: QrBoardBrand): Style {
  return {
    ...DEFAULT_STYLE,
    frameColor: brand.frameColor,
    fg: brand.fg,
    bg: brand.bg,
    frameText: brand.frameText,
  }
}

function loadStyle(brand: QrBoardBrand): Style {
  const base = brandDefaults(brand)
  try {
    const raw = localStorage.getItem(brand.styleStorage)
    if (!raw) return base
    const next = { ...base, ...(JSON.parse(raw) as Partial<Style>) }
    const frames = [...FRAME_OPTIONS, ...RESTAURANT_OPTIONS]
    if (!frames.some(f => f.id === next.frame)) next.frame = base.frame
    if (!CORNER_OPTIONS.some(c => c.id === next.corner)) next.corner = base.corner
    return next
  } catch {
    return base
  }
}

function loadDest(brand: QrBoardBrand): string {
  try {
    return safeHttpUrl(localStorage.getItem(brand.destStorage)) || brand.defaultDest
  } catch {
    return brand.defaultDest
  }
}

function trackingLink(brand: QrBoardBrand, destination: string): string {
  if (typeof window === 'undefined') return ''
  const base = `${window.location.origin}${brand.apiPrefix}/go`
  const dest = safeHttpUrl(destination)
  if (!dest) return base
  const canon = dest.replace(/\/$/, '')
  const store = brand.defaultDest.replace(/\/$/, '')
  if (canon === store) return base
  return `${base}?to=${encodeURIComponent(dest)}`
}

function logoSrc(brand: QrBoardBrand, logo: LogoId, upload: string | null): string | undefined {
  if (logo === 'none') return undefined
  if (upload) return upload
  if (logo === 'truck') return brand.logoSrc
  if (logo === 'globe') return GLOBE
  if (logo === 'scan') return SCAN_MARK
  if (logo === 'scanText') return SCAN_TEXT
  return undefined
}

function cornerPair(id: CornerId) {
  return CORNER_OPTIONS.find(c => c.id === id) ?? CORNER_OPTIONS[0]!
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
      aria-label={title}
      aria-pressed={selected}
      onClick={onSelect}
      className={selected ? 'cdl-picker is-on' : 'cdl-picker'}
    >
      {children}
    </button>
  )
}

type StyleCtx = {
  style: Style
  patch: (p: Partial<Style>) => void
  upload: string | null
  setUpload: (v: string | null) => void
  destinationUrl: string
  setDestinationUrl: (v: string) => void
  trackUrl: string
  resetDesign: () => void
  refreshBoard: () => void
  qrEpoch: number
}

const StyleContext = createContext<StyleCtx | null>(null)

function useStyle(): StyleCtx {
  const ctx = useContext(StyleContext)
  if (!ctx) throw new Error('CdlQrStyleProvider required')
  return ctx
}

export function CdlQrStyleProvider({ children }: { children: ReactNode }) {
  const brand = useQrBrand()
  const [style, setStyle] = useState<Style>(() => loadStyle(brand))
  const [upload, setUpload] = useState<string | null>(null)
  const [destinationUrl, setDestState] = useState(() => loadDest(brand))
  const [qrEpoch, setQrEpoch] = useState(0)
  function persistStyle(next: Style) {
    try {
      localStorage.setItem(brand.styleStorage, JSON.stringify(next))
    } catch { /* ignore */ }
  }
  function patch(p: Partial<Style>) {
    setStyle(s => {
      const next = { ...s, ...p }
      persistStyle(next)
      return next
    })
  }
  function setDestinationUrl(v: string) {
    setDestState(v)
    try {
      localStorage.setItem(brand.destStorage, v)
    } catch { /* ignore */ }
  }
  function resetDesign() {
    const next = brandDefaults(brand)
    setStyle(next)
    persistStyle(next)
    setUpload(null)
    setDestinationUrl(brand.defaultDest)
    setQrEpoch(n => n + 1)
  }
  function refreshBoard() {
    setQrEpoch(n => n + 1)
    window.dispatchEvent(new Event(`qr-board-refresh-${brand.id}`))
  }
  const trackUrl = useMemo(() => trackingLink(brand, destinationUrl), [brand, destinationUrl])
  const value = useMemo(
    () => ({
      style,
      patch,
      upload,
      setUpload,
      destinationUrl,
      setDestinationUrl,
      trackUrl,
      resetDesign,
      refreshBoard,
      qrEpoch,
    }),
    [style, upload, destinationUrl, trackUrl, qrEpoch],
  )
  return <StyleContext.Provider value={value}>{children}</StyleContext.Provider>
}

function FramedQr({
  host,
  style,
}: {
  host: RefObject<HTMLDivElement | null>
  style: Style
}) {
  const restaurant = RESTAURANT_IDS.has(style.frame)
  const slot = restaurant ? REST_SLOTS[style.frame] : FRAME_SLOTS[style.frame]
  const vbW = restaurant ? 160 : 200
  const vbH = restaurant ? 200 : 270

  if (style.frame === 'none' || !slot) {
    return (
      <div className="qr-live mx-auto w-fit" data-frame="none">
        <div ref={host} className="leading-none" />
      </div>
    )
  }

  return (
    <div
      className={restaurant ? 'cdl-rest-stage' : 'cdl-frame-stage'}
      data-frame={style.frame}
    >
      {restaurant
        ? <RestaurantChrome id={style.frame} color={style.frameColor} />
        : <FrameChrome id={style.frame} color={style.frameColor} text={style.frameText} />}
      <div
        className={restaurant ? 'cdl-rest-qr' : 'cdl-frame-qr'}
        style={{
          left: `${(slot.x / vbW) * 100}%`,
          top: `${(slot.y / vbH) * 100}%`,
          width: `${(slot.w / vbW) * 100}%`,
          height: `${(slot.h / vbH) * 100}%`,
        }}
      >
        <div ref={host} className="cdl-rest-host" />
      </div>
    </div>
  )
}

function useQrEngine(trackUrl: string, size = 280) {
  const brand = useQrBrand()
  const { style, upload, qrEpoch } = useStyle()
  const host = useRef<HTMLDivElement>(null)
  const qr = useRef<QRCodeStyling | null>(null)
  const [busy, setBusy] = useState(false)

  const options: Options = useMemo(() => {
    const corner = cornerPair(style.corner)
    const image = logoSrc(brand, style.logo, upload)
    return {
      width: size,
      height: size,
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
  }, [brand, style, trackUrl, upload, size])

  useEffect(() => {
    if (qrEpoch === 0) return
    if (!host.current) return
    host.current.innerHTML = ''
    qr.current = new QRCodeStyling(options)
    qr.current.append(host.current)
    // Refresh remounts the canvas; options effect keeps later tweaks in sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrEpoch])

  useEffect(() => {
    if (!host.current) return
    if (!qr.current || host.current.childElementCount === 0) {
      host.current.innerHTML = ''
      qr.current = new QRCodeStyling(options)
      qr.current.append(host.current)
    } else {
      qr.current.update(options)
    }
  }, [options, style.frame])

  async function downloadPng() {
    if (!host.current) return
    setBusy(true)
    try {
      const qrCanvas = host.current.querySelector('canvas')
      const stage = host.current.closest('.cdl-frame-stage, .cdl-rest-stage') as HTMLElement | null
      const out = document.createElement('canvas')
      const ctx = out.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#ffffff'

      const loadImg = (url: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image()
          el.onload = () => resolve(el)
          el.onerror = () => reject(new Error('png'))
          el.src = url
        })

      if (!stage || !qrCanvas) {
        const raw = await qr.current?.getRawData('png')
        if (!raw) return
        const blob = raw instanceof Blob ? raw : new Blob([raw as unknown as BlobPart])
        const url = URL.createObjectURL(blob)
        try {
          const img = await loadImg(url)
          const pad = 40
          out.width = img.width + pad * 2
          out.height = img.height + pad * 2
          ctx.fillRect(0, 0, out.width, out.height)
          ctx.drawImage(img, pad, pad)
        } finally {
          URL.revokeObjectURL(url)
        }
      } else {
        const scale = 4
        const rect = stage.getBoundingClientRect()
        out.width = Math.max(1, Math.round(rect.width * scale))
        out.height = Math.max(1, Math.round(rect.height * scale))
        ctx.fillRect(0, 0, out.width, out.height)
        const svgEl = stage.querySelector('svg')
        if (svgEl) {
          const clone = svgEl.cloneNode(true) as SVGElement
          clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
          clone.setAttribute('width', String(out.width))
          clone.setAttribute('height', String(out.height))
          const xml = new XMLSerializer().serializeToString(clone)
          const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }))
          try {
            const img = await loadImg(url)
            ctx.drawImage(img, 0, 0, out.width, out.height)
          } finally {
            URL.revokeObjectURL(url)
          }
        }
        const slotEl = host.current.closest('.cdl-frame-qr, .cdl-rest-qr') as HTMLElement | null
        if (slotEl) {
          const sr = slotEl.getBoundingClientRect()
          ctx.drawImage(
            qrCanvas,
            (sr.left - rect.left) * scale,
            (sr.top - rect.top) * scale,
            sr.width * scale,
            sr.height * scale,
          )
        }
      }

      const a = document.createElement('a')
      a.href = out.toDataURL('image/png')
      a.download = brand.downloadName
      a.click()
    } finally {
      setBusy(false)
    }
  }

  return { host, style, busy, downloadPng }
}

export function CdlQrPreview() {
  const brand = useQrBrand()
  const { trackUrl, resetDesign, refreshBoard } = useStyle()
  const { host, style, busy, downloadPng } = useQrEngine(trackUrl, 280)
  return (
    <>
          <FramedQr host={host} style={style} />
          <h2>Print this</h2>
          <p className="hint">{brand.printHint}</p>
          <div className="actions">
            <button type="button" className="btn gold" onClick={() => void downloadPng()} disabled={busy}>
              Download PNG
            </button>
            <a className="btn" href={trackUrl || `${brand.apiPrefix}/go`}>Test scan</a>
          </div>
          <div className="actions" style={{ marginTop: 8 }}>
            <button type="button" className="btn" onClick={resetDesign}>
              <RotateCcw size={14} /> Reset
            </button>
            <button type="button" className="btn" onClick={refreshBoard}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
          <p className="hint" style={{ marginTop: 14 }}>Tracking link</p>
          <p className="link">{trackUrl || '…'}</p>
    </>
  )
}

export function CdlQrCustomize() {
  const brand = useQrBrand()
  const {
    style, patch, upload, setUpload, destinationUrl, setDestinationUrl, trackUrl,
    resetDesign, refreshBoard,
  } = useStyle()
  const live = useQrEngine(trackUrl, 220)
  return (
        <div className="customize-grid">
          <aside className="customize-preview" data-testid="qr-customize-preview">
            <p className="live-label">Live preview</p>
            <FramedQr host={live.host} style={style} />
            <p className="live-url">{trackUrl || '…'}</p>
            <div className="actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn gold" onClick={() => void live.downloadPng()} disabled={live.busy}>
                Download PNG
              </button>
              <a className="btn" href={trackUrl || `${brand.apiPrefix}/go`}>Test scan</a>
            </div>
            <div className="actions" style={{ marginTop: 8 }}>
              <button type="button" className="btn" onClick={resetDesign}>
                <RotateCcw size={14} /> Reset
              </button>
              <button type="button" className="btn" onClick={refreshBoard}>
                <RefreshCw size={14} /> Refresh
              </button>
            </div>
          </aside>
        <div className="flex min-w-0 flex-col gap-5">
          <div className="actions" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="btn" onClick={resetDesign}>
              <RotateCcw size={14} /> Reset
            </button>
            <button type="button" className="btn" onClick={refreshBoard}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
          <label className="cdl-field">
            Destination URL
            <input
              type="url"
              value={destinationUrl}
              placeholder={brand.defaultDest}
              onChange={e => setDestinationUrl(e.target.value)}
              onBlur={() => {
                const next = safeHttpUrl(destinationUrl) || brand.defaultDest
                setDestinationUrl(next)
              }}
            />
          </label>
          <p className="hint" style={{ margin: 0 }}>
            Scans still hit the tracker first, then go to this URL. Change it to send people somewhere else.
          </p>
          <fieldset>
            <legend className="cdl-legend">Frames</legend>
            <div className="flex flex-wrap gap-2">
              {FRAME_OPTIONS.map(f => (
                <Picker key={f.id} title={f.label} selected={style.frame === f.id} onSelect={() => patch({ frame: f.id })}>
                  <FrameSketch id={f.id} color={style.frameColor} />
                </Picker>
              ))}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="cdl-field">
                Frame color
                <input
                  type="color"
                  value={style.frameColor}
                  onChange={e => patch({ frameColor: e.target.value })}
                />
              </label>
              <label className="cdl-field">
                Frame text
                <input
                  type="text"
                  value={style.frameText}
                  onChange={e => patch({ frameText: e.target.value.slice(0, 18) })}
                />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend className="cdl-legend">Restaurants & Bars</legend>
            <div className="flex flex-wrap gap-2">
              {RESTAURANT_OPTIONS.map(f => (
                <Picker key={f.id} title={f.label} selected={style.frame === f.id} onSelect={() => patch({ frame: f.id })}>
                  <FrameSketch id={f.id} color={style.frameColor} />
                </Picker>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="cdl-legend">Logos</legend>
            <div className="flex flex-wrap gap-2">
              <Picker title="No logo" selected={style.logo === 'none' && !upload} onSelect={() => { setUpload(null); patch({ logo: 'none' }) }}>
                <span style={{ color: '#8a9488' }}>⊘</span>
              </Picker>
              <Picker title={brand.logoLabel} selected={style.logo === 'truck' && !upload} onSelect={() => { setUpload(null); patch({ logo: 'truck' }) }}>
                <img src={brand.logoSrc} alt="" className="h-10 w-10 rounded-full object-cover" />
              </Picker>
              <Picker title="Globe" selected={style.logo === 'globe' && !upload} onSelect={() => { setUpload(null); patch({ logo: 'globe' }) }}>
                <img src={GLOBE} alt="" className="h-8 w-8" />
              </Picker>
              <Picker title="Scan me mark" selected={style.logo === 'scan' && !upload} onSelect={() => { setUpload(null); patch({ logo: 'scan' }) }}>
                <img src={SCAN_MARK} alt="" className="h-10 w-10" />
              </Picker>
              <Picker title="Scan me type" selected={style.logo === 'scanText' && !upload} onSelect={() => { setUpload(null); patch({ logo: 'scanText' }) }}>
                <span className="text-[9px] font-extrabold leading-tight" style={{ color: '#1a1f1a' }}>SCAN<br />ME</span>
              </Picker>
              <label className={upload ? 'cdl-picker-upload is-on' : 'cdl-picker-upload'}>
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
                      patch({ logo: 'truck' })
                    }
                    reader.readAsDataURL(file)
                  }}
                />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend className="cdl-legend">Shapes</legend>
            <div className="flex flex-wrap gap-2">
              {SHAPE_OPTIONS.map(s => (
                <Picker key={s.id} title={s.label} selected={style.shape === s.id} onSelect={() => patch({ shape: s.id })}>
                  <ShapeSketch id={s.id} />
                </Picker>
              ))}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="cdl-field">
                QR code color
                <input
                  type="color"
                  value={style.fg}
                  onChange={e => patch({ fg: e.target.value })}
                />
              </label>
              <label className="cdl-field">
                Background color
                <input
                  type="color"
                  value={style.bg}
                  onChange={e => patch({ bg: e.target.value })}
                />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend className="cdl-legend">Corners</legend>
            <div className="flex flex-wrap gap-2">
              {CORNER_OPTIONS.map(c => (
                <Picker key={c.id} title={c.label} selected={style.corner === c.id} onSelect={() => patch({ corner: c.id })}>
                  <CornerSketch spec={c} />
                </Picker>
              ))}
            </div>
          </fieldset>
        </div>
        </div>
  )
}

export function CdlQrDestinationFoot({ fallback }: { fallback: string }) {
  const { destinationUrl } = useStyle()
  return (
    <p className="foot">
      Destination {destinationUrl || fallback} · Scan counts and locations are saved permanently. Location is estimated from IP unless they Accept on the banner. Local scans show as this device.
    </p>
  )
}


