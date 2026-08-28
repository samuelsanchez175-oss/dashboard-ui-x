import { useCallback, useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { CdlQrCustomize, CdlQrDestinationFoot, CdlQrPreview, CdlQrStyleProvider, QrBrandProvider } from './CdlQrStudio'
import { CDL_QR_BRAND, type QrBoardBrand } from './qr-board-config'
import './CdlQrBoard.css'

type Place = {
  city: string
  region: string
  country: string
  lat: number | null
  lon: number | null
  count: number
}

type Scan = {
  id: number
  ts: string
  city: string
  region: string
  country: string
  device: string
  termsAccepted?: boolean
  locationGranted?: boolean
}

type Payload = {
  total: number
  uniquePlaces: number
  last: string | null
  destination: string
  recent: Scan[]
  places: Place[]
}

function emptyPayload(dest: string): Payload {
  return {
    total: 0,
    uniquePlaces: 0,
    last: null,
    destination: dest,
    recent: [],
    places: [],
  }
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function whereLine(s: { city: string; region: string; country: string }): string {
  const loc = [s.city, s.region].filter(Boolean).join(', ')
  if (s.country && s.country !== 'Local') return `${loc} · ${s.country}`
  return loc
}

function pinIcon(color: string, ring: string) {
  return L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid ${ring};box-shadow:0 0 0 3px ${color}59"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
}

export function QrScanBoard({ brand }: { brand: QrBoardBrand }) {
  const [data, setData] = useState<Payload>(() => emptyPayload(brand.defaultDest))
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${brand.apiPrefix}/scans`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`scans ${res.status}`)
      setData((await res.json()) as Payload)
    } catch {
      /* keep last good payload */
    }
  }, [brand.apiPrefix])

  useEffect(() => {
    const id = 'cdl-scan-fonts'
    if (!document.getElementById(id)) {
      const link = document.createElement('link')
      link.id = id
      link.rel = 'stylesheet'
      link.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Mono:wght@400;600&family=Outfit:wght@400;500;700&display=swap'
      document.head.appendChild(link)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- poll scan board
    void load()
    const id = window.setInterval(() => void load(), 4000)
    return () => window.clearInterval(id)
  }, [load])

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return
    const map = L.map(mapEl.current, { scrollWheelZoom: false }).setView([39.8, -98.5], 4)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    const t = window.setTimeout(() => map.invalidateSize(), 250)
    return () => {
      window.clearTimeout(t)
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const layer = layerRef.current
    const map = mapRef.current
    if (!layer || !map) return
    layer.clearLayers()
    const pts: [number, number][] = []
    for (const p of data.places) {
      if (p.lat == null || p.lon == null) continue
      L.marker([p.lat, p.lon], { icon: pinIcon(brand.frameColor, brand.fg) })
        .bindPopup(`<strong>${p.city}</strong><br>${p.region} ${p.country}<br>${p.count} scan${p.count === 1 ? '' : 's'}`)
        .addTo(layer)
      pts.push([p.lat, p.lon])
    }
    if (pts.length) map.fitBounds(pts, { padding: [28, 28], maxZoom: 6 })
  }, [brand.fg, brand.frameColor, data.places])

  const headline = brand.headline.split('\n')

  return (
    <QrBrandProvider brand={brand}>
    <CdlQrStyleProvider>
      <div className={`qr-scan-board ${brand.themeClass} flex min-h-0 flex-1 flex-col overflow-auto`}>
        <div className="wrap">
          <header className="mast">
            <p className="eyebrow">{brand.eyebrow}</p>
            <h1>{headline[0]}<br />{headline[1]}</h1>
            <p className="sub">{brand.sub}</p>
          </header>

          <div className="grid">
            <aside className="card qr-card">
              <CdlQrPreview />
            </aside>
            <section>
              <div className="stats">
                <div className="card stat">
                  <div className="n">{data.total}</div>
                  <div className="l">Scans</div>
                </div>
                <div className="card stat">
                  <div className="n">{data.uniquePlaces}</div>
                  <div className="l">Places</div>
                </div>
                <div className="card stat">
                  <div className="n compact">{formatWhen(data.last)}</div>
                  <div className="l">Last hit</div>
                </div>
              </div>
              <div className="card map-card">
                <div ref={mapEl} className="cdl-map" />
              </div>
            </section>
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Where</th>
                  <th>Device</th>
                  <th>Consent</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.length === 0 ? (
                  <tr>
                    <td className="empty" colSpan={4}>
                      No scans yet. Open the QR on your phone (same Wi-Fi) or tap Test scan. First ping lands here.
                    </td>
                  </tr>
                ) : (
                  data.recent.map(row => (
                    <tr key={row.id}>
                      <td>{formatWhen(row.ts)}</td>
                      <td>{whereLine(row)}</td>
                      <td>{row.device}</td>
                      <td>
                        {row.termsAccepted
                          ? row.locationGranted
                            ? 'Accepted · GPS'
                            : 'Declined / city estimate'
                          : 'Skipped'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <h2 className="customize-head">Customize QR code</h2>
            <div className="customize-body">
              <CdlQrCustomize />
            </div>
          </div>

          <CdlQrDestinationFoot fallback={data.destination} />
        </div>
      </div>
    </CdlQrStyleProvider>
    </QrBrandProvider>
  )
}

export default function CdlQrZone() {
  return <QrScanBoard brand={CDL_QR_BRAND} />
}
