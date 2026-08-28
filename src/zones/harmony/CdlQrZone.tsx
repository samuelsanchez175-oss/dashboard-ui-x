import { useCallback, useEffect, useMemo, useState } from 'react'
import { QrCode, RefreshCw } from 'lucide-react'

import { CONTAINERS, SURFACES, TYPOGRAPHY } from '../../lib/design-tokens'
import { CDL_APP_STORE_URL } from './cdl-qr-shared'
import CdlQrStudio from './CdlQrStudio'

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
  locationSource?: 'gps' | 'ip' | 'denied' | 'pending'
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

export default function CdlQrZone() {
  const [data, setData] = useState<Payload>(EMPTY)
  const [error, setError] = useState<string | null>(null)

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

        <CdlQrStudio trackUrl={track} />

        <div className="grid gap-4 lg:grid-cols-[1fr]">
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { n: String(data.total), l: 'Scans', compact: false },
                { n: String(data.uniquePlaces), l: 'Places', compact: false },
                { n: formatWhen(data.last), l: 'Last hit', compact: true },
              ].map(stat => (
                <div key={stat.l} className="rounded-xl p-4" style={SURFACES.cardStyle}>
                  <div
                    className={stat.compact
                      ? 'text-[17px] font-semibold leading-snug tracking-tight'
                      : 'text-[28px] font-semibold leading-tight tracking-tight'}
                    style={SURFACES.textPrimary}
                  >
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
                  <th className={`${TYPOGRAPHY.cardLabel} px-4 py-2.5`} style={SURFACES.textMuted}>Consent</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6" style={SURFACES.textSecondary}>
                      No scans yet.
                    </td>
                  </tr>
                ) : (
                  data.recent.map(row => (
                    <tr key={row.id} className="border-b last:border-0" style={{ borderColor: 'var(--border-soft)' }}>
                      <td className="px-4 py-2.5" style={SURFACES.textPrimary}>{formatWhen(row.ts)}</td>
                      <td className="px-4 py-2.5" style={SURFACES.textPrimary}>{whereLine(row)}</td>
                      <td className="px-4 py-2.5" style={SURFACES.textSecondary}>{row.device}</td>
                      <td className="px-4 py-2.5" style={SURFACES.textSecondary}>
                        {row.termsAccepted
                          ? row.locationGranted
                            ? 'Terms + GPS'
                            : 'Terms · city estimate'
                          : 'Landing'}
                      </td>
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
