import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, ExternalLink, QrCode, RefreshCw } from 'lucide-react'
import QRCode from 'qrcode'

import { CONTAINERS, SURFACES, TYPOGRAPHY } from '../../lib/design-tokens'
import { CDL_APP_STORE_URL } from './cdl-qr-shared'

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
}

type Payload = {
  total: number
  uniquePlaces: number
  last: string | null
  destination: string
  recent: Scan[]
  places: Place[]
}

const EMPTY: Payload = {
  total: 0,
  uniquePlaces: 0,
  last: null,
  destination: CDL_APP_STORE_URL,
  recent: [],
  places: [],
}

function trackingUrl(): string {
  return `${window.location.origin}/api/cdl-qr/go`
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

function whereLine(s: { city: string; region: string; country: string }): string {
  const loc = [s.city, s.region].filter(Boolean).join(', ')
  if (s.country && s.country !== 'Local') return `${loc} · ${s.country}`
  return loc
}

export default function CdlQrZone() {
  const [data, setData] = useState<Payload>(EMPTY)
  const [qrSrc, setQrSrc] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const track = useMemo(() => (typeof window === 'undefined' ? '' : trackingUrl()), [])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/cdl-qr/scans', { cache: 'no-store' })
      if (!res.ok) throw new Error(`scans ${res.status}`)
      setData((await res.json()) as Payload)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load scans')
    }
  }, [])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), 4000)
    return () => window.clearInterval(id)
  }, [load])

  useEffect(() => {
    if (!track) return
    let cancelled = false
    void QRCode.toDataURL(track, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 720,
      color: { dark: '#1F3F2A', light: '#F5F1E8' },
    }).then(url => {
      if (!cancelled) setQrSrc(url)
    })
    return () => {
      cancelled = true
    }
  }, [track])

  async function downloadPng() {
    if (!qrSrc) return
    setBusy(true)
    try {
      const qr = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('qr'))
        img.src = qrSrc
      })
      const truck = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('truck'))
        img.src = `${import.meta.env.BASE_URL}cdl-qr-truck.png`
      })
      const size = 1120
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#F5F1E8'
      ctx.fillRect(0, 0, size, size)
      ctx.drawImage(qr, 0, 0, size, size)
      const logo = Math.round(size * 0.28)
      const x = (size - logo) / 2
      const y = (size - logo) / 2
      ctx.beginPath()
      ctx.arc(size / 2, size / 2, logo / 2 + 8, 0, Math.PI * 2)
      ctx.fillStyle = '#F5F1E8'
      ctx.fill()
      ctx.lineWidth = 6
      ctx.strokeStyle = '#E8C45C'
      ctx.stroke()
      ctx.save()
      ctx.beginPath()
      ctx.arc(size / 2, size / 2, logo / 2, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(truck, x, y, logo, logo)
      ctx.restore()
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = 'cdl-test-prep-2027-qr.png'
      a.click()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="zone-canvas flex min-h-0 flex-1 flex-col overflow-auto" style={SURFACES.canvasStyle}>
      <header className="zone-topbar flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            <QrCode size={12} />
          </div>
          <span className="truncate text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>
            CDL QR code
          </span>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px]"
          style={{ color: 'var(--text-2)' }}
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </header>

      <div className={`${CONTAINERS.page} zone-inner flex flex-col gap-4 py-5`}>
        <div>
          <p className={TYPOGRAPHY.eyebrow} style={SURFACES.textMuted}>
            Harmony Stack · CDL One Stop
          </p>
          <h1 className={`${TYPOGRAPHY.pageTitle} mt-1`} style={SURFACES.textPrimary}>
            Scan board
          </h1>
          <p className={`${TYPOGRAPHY.pageDescription} mt-1 max-w-2xl`} style={SURFACES.textSecondary}>
            Print this QR. Each scan hits this dashboard, then the App Store. City is estimated from IP — not GPS.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_1fr]">
          <section className="rounded-xl p-4" style={SURFACES.cardStyle}>
            <div className="relative mx-auto w-full max-w-[240px]">
              {qrSrc ? (
                <img src={qrSrc} alt="CDL Test Prep 2027 QR code" className="h-auto w-full rounded-lg" />
              ) : (
                <div className="aspect-square rounded-lg" style={{ background: 'var(--bg-muted)' }} />
              )}
              <img
                src={`${import.meta.env.BASE_URL}cdl-qr-truck.png`}
                alt=""
                className="pointer-events-none absolute left-1/2 top-1/2 h-[28%] w-[28%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 object-cover"
                style={{ borderColor: '#E8C45C', background: '#F5F1E8' }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void downloadPng()}
                disabled={busy || !qrSrc}
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
            <p className="mono mt-3 break-all text-[11px]" style={SURFACES.textMuted}>
              {track || '…'}
            </p>
          </section>

          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { n: String(data.total), l: 'Scans' },
                { n: String(data.uniquePlaces), l: 'Places' },
                { n: formatWhen(data.last), l: 'Last hit' },
              ].map(stat => (
                <div key={stat.l} className="rounded-xl p-4" style={SURFACES.cardStyle}>
                  <div className="text-[28px] font-semibold leading-tight tracking-tight" style={SURFACES.textPrimary}>
                    {stat.n}
                  </div>
                  <div className={`${TYPOGRAPHY.cardLabel} mt-1`} style={SURFACES.textMuted}>
                    {stat.l}
                  </div>
                </div>
              ))}
            </div>

            <section className="rounded-xl p-4" style={SURFACES.cardStyle}>
              <h2 className={TYPOGRAPHY.sectionTitle} style={SURFACES.textPrimary}>
                Places
              </h2>
              {data.places.length === 0 ? (
                <p className="mt-2 text-[13px]" style={SURFACES.textSecondary}>
                  No locations yet. Scan from your phone on this Wi-Fi, or tap Test scan.
                </p>
              ) : (
                <ul className="mt-2 divide-y" style={{ borderColor: 'var(--border-soft)' }}>
                  {data.places.map(p => (
                    <li key={`${p.city}-${p.country}`} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
                      <span style={SURFACES.textPrimary}>{whereLine(p)}</span>
                      <span className="mono" style={SURFACES.textMuted}>
                        {p.count}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>

        <section className="rounded-xl overflow-hidden" style={SURFACES.cardStyle}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <th className={`${TYPOGRAPHY.cardLabel} px-4 py-2.5`} style={SURFACES.textMuted}>When</th>
                  <th className={`${TYPOGRAPHY.cardLabel} px-4 py-2.5`} style={SURFACES.textMuted}>Where</th>
                  <th className={`${TYPOGRAPHY.cardLabel} px-4 py-2.5`} style={SURFACES.textMuted}>Device</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6" style={SURFACES.textSecondary}>
                      No scans yet.
                    </td>
                  </tr>
                ) : (
                  data.recent.map(row => (
                    <tr key={row.id} className="border-b last:border-0" style={{ borderColor: 'var(--border-soft)' }}>
                      <td className="px-4 py-2.5" style={SURFACES.textPrimary}>{formatWhen(row.ts)}</td>
                      <td className="px-4 py-2.5" style={SURFACES.textPrimary}>{whereLine(row)}</td>
                      <td className="px-4 py-2.5" style={SURFACES.textSecondary}>{row.device}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {error ? (
          <p className="text-[13px]" style={{ color: 'var(--bad)' }}>
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
