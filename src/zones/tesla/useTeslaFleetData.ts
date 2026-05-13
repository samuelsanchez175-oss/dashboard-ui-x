import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useMockData } from '../../context/MockDataContext'
import { fetchWithKeys, getAllStoredApiKeys, subscribeApiKeys } from '../../lib/api-keys'
import { MOCK_TRIP_POLYLINE } from './tesla-mock-series'

export type TeslaFleetDataStatus = 'demo' | 'live' | 'no-credentials' | 'error' | 'needs_authorization'

export type TeslaUnits = 'mi' | 'km'

export type TeslaSocPoint = { hour: number; soc: number }

export type TeslaVehicleRow = {
  vin: string
  displayName: string
  online: boolean
  batteryPercent: number
  /** Canonical range stored in miles (UI converts for km). */
  rangeMiles: number
  softwareVersion: string
  interiorTempF: number | null
  odometerMiles: number
  lat: number
  lng: number
  charging: boolean
  // ── Richer Fleet API fields (added when BFF returns vehicle_data) ──
  /** Tesla `charging_state`: `Disconnected` | `Charging` | `Complete` | `Stopped` | … */
  chargingState?: string
  /** Live charger power in kW (0 when not charging). */
  chargerPowerKw?: number
  /** Target SOC % the car will charge to (charge_limit_soc). */
  chargeLimitPct?: number | null
  /** ETA in minutes to full (per charge limit). null when not charging. */
  minutesToFullCharge?: number | null
  /** `vehicle_state.locked`. null when unknown. */
  locked?: boolean | null
  /** `vehicle_state.sentry_mode`. null when unknown. */
  sentryMode?: boolean | null
  /** `drive_state.shift_state`: P | R | N | D | null. */
  shiftState?: string | null
  /** `climate_state.is_climate_on`. */
  climateOn?: boolean | null
  /** Outside air temperature in °F (converted server-side). */
  outsideTempF?: number | null
}

export type TeslaKpis = {
  vehiclesOnline: number
  totalMilesToday: number
  avgBatteryPercent: number
  activeChargingSessions: number
  vehiclesOnlineTrend: number[]
}

export type TeslaChargingSession = {
  id: string
  vin: string
  vehicleLabel: string
  startHour: number
  endHour: number
  powerKw: number
  kWhAdded?: number
  costUsd?: number
}

export type TeslaTelemetryEvent = {
  id: string
  at: string
  vin: string
  kind: 'parked' | 'driving' | 'charging_start' | 'charging_stop' | 'sentry'
  message: string
}

export type TeslaSocSeries = {
  vin: string
  label: string
  points: TeslaSocPoint[]
}

export type TeslaFleetLivePayload = {
  vehicles: TeslaVehicleRow[]
  kpis?: Partial<TeslaKpis>
  chargingSessions?: TeslaChargingSession[]
  telemetry?: TeslaTelemetryEvent[]
  socSeriesByVehicle?: TeslaSocSeries[]
  lastTripRoute?: { lat: number; lng: number }[]
}

const TESLA_CLIENT_ID = 'TESLA_CLIENT_ID'
const TESLA_CLIENT_SECRET = 'TESLA_CLIENT_SECRET'
const TESLA_REFRESH_TOKEN = 'TESLA_REFRESH_TOKEN'
const TESLA_VIN = 'TESLA_VIN'

function vinHash(v: string): number {
  return v.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function mockVehicles(): TeslaVehicleRow[] {
  // Most users have a single Tesla on their account — default to one mock vehicle
  // so demo mode mirrors the typical live shape. Multi-vehicle layout still
  // renders cleanly when live data returns multiple rows.
  const bases = [
    { name: 'My Tesla', vin: '5YJ3E1EA1KF123456', lat: 37.4419, lng: -122.143 },
  ] as const

  return bases.map((b, i) => {
    const h = vinHash(b.vin)
    const batteryPercent = clamp(58 + (h % 37) + i * 3, 45, 98)
    // Demo: when there's a single vehicle, default to "Charging" so the richer
    // UI (kW line, target SOC, ETA) is visible without needing real Fleet data.
    const charging = bases.length === 1 ? true : i === 1 || i === 4
    const online = i !== 3 || (h % 4 !== 0)
    const rangeMiles = Math.round(batteryPercent * 2.35 + (h % 12))
    const chargeLimitPct = i % 2 === 0 ? 80 : 90
    const chargerPowerKw = charging ? 7.4 + ((h % 4) * 2.5) : 0
    const minutesToFullCharge = charging
      ? Math.round(((chargeLimitPct - batteryPercent) / Math.max(chargerPowerKw, 1)) * 60)
      : null
    return {
      vin: b.vin,
      displayName: b.name,
      online,
      batteryPercent,
      rangeMiles,
      softwareVersion: `2024.${20 + (h % 8)}.${(h % 20) + 1}`,
      interiorTempF: 68 + (h % 8),
      odometerMiles: 8200 + h * 13 + i * 900,
      lat: b.lat + (h % 100) * 0.0001,
      lng: b.lng + (h % 100) * 0.0001,
      charging,
      // ── Mock richer-fleet fields so demo mode mirrors live UI ──
      chargingState: charging ? 'Charging' : 'Disconnected',
      chargerPowerKw,
      chargeLimitPct,
      minutesToFullCharge,
      locked: i === 3 ? false : true,
      sentryMode: i === 0 || i === 4,
      shiftState: 'P',
      climateOn: i === 1,
      outsideTempF: 62 + (h % 18),
    }
  })
}

function mockSocSeries(vehicles: TeslaVehicleRow[]): TeslaSocSeries[] {
  return vehicles.map((v, vi) => {
    const seed = vinHash(v.vin)
    const points = Array.from({ length: 24 }, (_, hour) => {
      const wave = Math.sin((hour - 6 + vi) / 4.2) * 11
      const drain = hour >= 17 && hour <= 22 ? -(hour - 16) * 0.85 : 0
      const charge = hour <= 5 ? (5 - hour) * (1.1 + vi * 0.05) : 0
      const soc = clamp(52 + (seed % 15) + wave + drain + charge, 40, 100)
      return { hour, soc: Math.round(soc * 10) / 10 }
    })
    return { vin: v.vin, label: v.displayName, points }
  })
}

function mockKpis(vehicles: TeslaVehicleRow[]): TeslaKpis {
  const online = vehicles.filter(x => x.online).length
  const trend = Array.from({ length: 7 }, (_, i) => clamp(online - 2 + ((i + vinHash(vehicles[0]?.vin ?? 'x')) % 3), 0, vehicles.length))
  const totalMilesToday = Math.round(vehicles.reduce((s, v, i) => s + 12 + (vinHash(v.vin) % 40) + i * 3, 0))
  const avgBattery =
    vehicles.length === 0 ? 0 : Math.round(vehicles.reduce((s, v) => s + v.batteryPercent, 0) / vehicles.length)
  const charging = vehicles.filter(v => v.charging).length
  return {
    vehiclesOnline: online,
    totalMilesToday,
    avgBatteryPercent: avgBattery,
    activeChargingSessions: charging,
    vehiclesOnlineTrend: trend,
  }
}

function mockChargingSessions(vehicles: TeslaVehicleRow[]): TeslaChargingSession[] {
  const out: TeslaChargingSession[] = []
  let id = 0
  for (const v of vehicles) {
    const h = vinHash(v.vin)
    const start = 6 + (h % 6) * 0.5
    const dur = 0.8 + (h % 5) * 0.35
    out.push({
      id: `mock-${id++}`,
      vin: v.vin,
      vehicleLabel: v.displayName,
      startHour: start,
      endHour: clamp(start + dur, 0, 24),
      powerKw: 7 + (h % 8) * 1.25,
      kWhAdded: 12 + (h % 20) * 0.4,
      costUsd: h % 3 === 0 ? undefined : Number((4.2 + (h % 10) * 0.35).toFixed(2)),
    })
    if (h % 2 === 0) {
      const start2 = 17.25
      out.push({
        id: `mock-${id++}`,
        vin: v.vin,
        vehicleLabel: v.displayName,
        startHour: start2,
        endHour: clamp(start2 + 1.1, 0, 24),
        powerKw: 48 + (h % 30),
        kWhAdded: 28 + (h % 12),
        costUsd: Number((11.5 + (h % 8)).toFixed(2)),
      })
    }
  }
  return out
}

function mockTelemetry(vehicles: TeslaVehicleRow[]): TeslaTelemetryEvent[] {
  const kinds: TeslaTelemetryEvent['kind'][] = ['parked', 'driving', 'charging_start', 'charging_stop', 'sentry']
  const now = Date.now()
  return Array.from({ length: 18 }, (_, i) => {
    const v = vehicles[i % vehicles.length]!
    const kind = kinds[(i + vinHash(v.vin)) % kinds.length]!
    const labels: Record<TeslaTelemetryEvent['kind'], string> = {
      parked: 'Parked · geofence home',
      driving: 'Driving · route confidence high',
      charging_start: 'Charging session started',
      charging_stop: 'Charging session ended',
      sentry: 'Sentry mode heartbeat',
    }
    return {
      id: `tel-${i}`,
      at: new Date(now - i * 7 * 60 * 1000).toISOString(),
      vin: v.vin,
      kind,
      message: `${v.displayName} · ${labels[kind]}`,
    }
  })
}

function buildDemoPayload(): TeslaFleetLivePayload {
  const vehicles = mockVehicles()
  return {
    vehicles,
    kpis: mockKpis(vehicles),
    chargingSessions: mockChargingSessions(vehicles),
    telemetry: mockTelemetry(vehicles),
    socSeriesByVehicle: mockSocSeries(vehicles),
    lastTripRoute: MOCK_TRIP_POLYLINE.map(p => ({ ...p })),
  }
}

function mergeKpis(vehicles: TeslaVehicleRow[], partial?: Partial<TeslaKpis>): TeslaKpis {
  const computed = mockKpis(vehicles)
  return {
    ...computed,
    ...partial,
    vehiclesOnlineTrend:
      partial?.vehiclesOnlineTrend && partial.vehiclesOnlineTrend.length > 0
        ? partial.vehiclesOnlineTrend
        : computed.vehiclesOnlineTrend,
  }
}

function normalizeLiveJson(raw: unknown): TeslaFleetLivePayload | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const inner = o.data && typeof o.data === 'object' ? (o.data as Record<string, unknown>) : o
  const vehiclesRaw = inner.vehicles
  if (!Array.isArray(vehiclesRaw)) return null

  if (vehiclesRaw.length === 0) {
    const kpis = inner.kpis && typeof inner.kpis === 'object' ? (inner.kpis as Partial<TeslaKpis>) : undefined
    return {
      vehicles: [],
      kpis,
      chargingSessions: Array.isArray(inner.chargingSessions) ? (inner.chargingSessions as TeslaChargingSession[]) : [],
      telemetry: Array.isArray(inner.telemetry) ? (inner.telemetry as TeslaTelemetryEvent[]) : [],
      socSeriesByVehicle: Array.isArray(inner.socSeriesByVehicle)
        ? (inner.socSeriesByVehicle as TeslaSocSeries[])
        : [],
      lastTripRoute: Array.isArray(inner.lastTripRoute)
        ? (inner.lastTripRoute as { lat: number; lng: number }[])
        : undefined,
    }
  }

  const vehicles: TeslaVehicleRow[] = vehiclesRaw.map((row, i) => {
    const r = row as Record<string, unknown>
    const vin = String(r.vin ?? r.VIN ?? `VIN${i}`).toUpperCase()
    const displayName = String(r.displayName ?? r.name ?? `Vehicle ${i + 1}`)
    return {
      vin,
      displayName,
      online: Boolean(r.online ?? r.state === 'online'),
      batteryPercent: Number(r.batteryPercent ?? r.battery_level ?? r.soc ?? 72),
      rangeMiles: Number(r.rangeMiles ?? r.battery_range ?? 180),
      softwareVersion: String(r.softwareVersion ?? r.car_version ?? '—'),
      interiorTempF: r.interiorTempF != null ? Number(r.interiorTempF) : r.inside_temp != null ? Number(r.inside_temp) : null,
      odometerMiles: Number(r.odometerMiles ?? r.odometer ?? 0),
      lat: Number(r.lat ?? r.latitude ?? 0),
      lng: Number(r.lng ?? r.longitude ?? 0),
      charging: Boolean(
        r.charging ??
          (typeof r.charge_state === 'object' &&
            r.charge_state !== null &&
            String((r.charge_state as { charging_state?: unknown }).charging_state ?? '') === 'Charging'),
      ),
      // ── Richer Fleet API fields (BFF passes these through from vehicle_data) ──
      chargingState: typeof r.chargingState === 'string' ? r.chargingState : undefined,
      chargerPowerKw: typeof r.chargerPowerKw === 'number' ? r.chargerPowerKw : undefined,
      chargeLimitPct: typeof r.chargeLimitPct === 'number' ? r.chargeLimitPct : null,
      minutesToFullCharge: typeof r.minutesToFullCharge === 'number' ? r.minutesToFullCharge : null,
      locked: typeof r.locked === 'boolean' ? r.locked : null,
      sentryMode: typeof r.sentryMode === 'boolean' ? r.sentryMode : null,
      shiftState: typeof r.shiftState === 'string' ? r.shiftState : null,
      climateOn: typeof r.climateOn === 'boolean' ? r.climateOn : null,
      outsideTempF: typeof r.outsideTempF === 'number' ? r.outsideTempF : null,
    }
  })

  const kpis = inner.kpis && typeof inner.kpis === 'object' ? (inner.kpis as Partial<TeslaKpis>) : undefined
  const chargingSessions = Array.isArray(inner.chargingSessions)
    ? (inner.chargingSessions as TeslaChargingSession[])
    : undefined
  const telemetry = Array.isArray(inner.telemetry) ? (inner.telemetry as TeslaTelemetryEvent[]) : undefined
  const socSeriesByVehicle = Array.isArray(inner.socSeriesByVehicle)
    ? (inner.socSeriesByVehicle as TeslaSocSeries[])
    : undefined
  const lastTripRoute = Array.isArray(inner.lastTripRoute)
    ? (inner.lastTripRoute as { lat: number; lng: number }[])
    : undefined

  return {
    vehicles,
    kpis,
    chargingSessions,
    telemetry,
    socSeriesByVehicle,
    lastTripRoute,
  }
}

export type UseTeslaFleetDataResult = {
  status: TeslaFleetDataStatus
  loading: boolean
  /** True whenever UI should watermark / label as DEMO (not live BFF payload). */
  isDemoData: boolean
  /** Present when the BFF returns `needs_authorization` — open in a new tab to complete Tesla OAuth. */
  authorizeUrl: string | null
  /** Random `state` from the BFF authorize URL (optional client-side validation later). */
  oauthState: string | null
  units: TeslaUnits
  vehicles: TeslaVehicleRow[]
  kpis: TeslaKpis
  charging: TeslaChargingSession[]
  telemetry: TeslaTelemetryEvent[]
  socSeriesByVehicle: TeslaSocSeries[]
  lastTripRoute: { lat: number; lng: number }[]
  lastError: string | null
  /** True when live fetch failed and demo shapes are shown instead. */
  liveFallbackToDemo: boolean
  /** Scratch keys mirrored for diagnostics (never log secrets). */
  scratchMeta: {
    hasClientId: boolean
    hasClientSecret: boolean
    hasRefreshToken: boolean
    hasVin: boolean
  }
}

export function useTeslaFleetData(): UseTeslaFleetDataResult {
  const { mockDataEnabled } = useMockData()
  const [keys, setKeys] = useState<Record<string, string>>(getAllStoredApiKeys)
  const [loading, setLoading] = useState(false)
  const [livePayload, setLivePayload] = useState<TeslaFleetLivePayload | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [liveFallbackToDemo, setLiveFallbackToDemo] = useState(false)
  const [status, setStatus] = useState<TeslaFleetDataStatus>('demo')
  const [authorizeUrl, setAuthorizeUrl] = useState<string | null>(null)
  const [oauthState, setOAuthState] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => subscribeApiKeys(setKeys), [])

  const clientId = keys[TESLA_CLIENT_ID] ?? ''
  const clientSecret = keys[TESLA_CLIENT_SECRET] ?? ''
  const refreshToken = keys[TESLA_REFRESH_TOKEN] ?? ''
  const vinFocus = keys[TESLA_VIN] ?? ''

  const hasFullCredentials = clientId.trim().length > 0 && clientSecret.trim().length > 0

  const scratchMeta = useMemo(
    () => ({
      hasClientId: clientId.trim().length > 0,
      hasClientSecret: clientSecret.trim().length > 0,
      hasRefreshToken: refreshToken.trim().length > 0,
      hasVin: vinFocus.trim().length > 0,
    }),
    [clientId, clientSecret, refreshToken, vinFocus],
  )

  const demoPayload = useMemo(() => buildDemoPayload(), [])

  const runLiveFetch = useCallback(async () => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true)
    setLastError(null)
    setLiveFallbackToDemo(false)
    setAuthorizeUrl(null)
    setOAuthState(null)

    try {
      const res = await fetchWithKeys('/api/tesla/fleet', {
        method: 'GET',
        signal: ac.signal,
        headers: { Accept: 'application/json' },
      })

      if (res.status === 404 || res.status === 501) {
        setLivePayload(null)
        setStatus('demo')
        setLiveFallbackToDemo(true)
        setLastError(
          res.status === 404
            ? 'No Tesla Fleet route on the dev BFF (GET /api/tesla/fleet). Showing DEMO data.'
            : 'Tesla Fleet route not implemented (501). Showing DEMO data.',
        )
        return
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        setLivePayload(null)
        setStatus('demo')
        setLiveFallbackToDemo(true)
        setLastError(`Fleet request failed (${res.status}). ${text.slice(0, 120)}`.trim())
        return
      }

      const json: unknown = await res.json().catch(() => null)
      if (json && typeof json === 'object') {
        const top = json as Record<string, unknown>
        if (top.status === 'needs_authorization') {
          setLivePayload(null)
          setStatus('needs_authorization')
          setAuthorizeUrl(typeof top.authorizeUrl === 'string' ? top.authorizeUrl : null)
          setOAuthState(typeof top.oauthState === 'string' ? top.oauthState : null)
          setLiveFallbackToDemo(false)
          setLastError(null)
          return
        }
        if (top.status === 'error') {
          setLivePayload(null)
          setStatus('error')
          setLiveFallbackToDemo(false)
          setLastError(typeof top.message === 'string' ? top.message : 'Tesla Fleet returned an error.')
          return
        }
      }

      const normalized = normalizeLiveJson(json)
      if (!normalized) {
        setLivePayload(null)
        setStatus('demo')
        setLiveFallbackToDemo(true)
        setLastError('Live response did not include a usable `vehicles` array. Showing DEMO data.')
        return
      }

      setLivePayload(normalized)
      setStatus('live')
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setLivePayload(null)
      setStatus('demo')
      setLiveFallbackToDemo(true)
      setLastError(e instanceof Error ? e.message : 'Network error while contacting the BFF.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (mockDataEnabled) {
      abortRef.current?.abort()
      setLoading(false)
      setLivePayload(null)
      setLiveFallbackToDemo(false)
      setLastError(null)
      setAuthorizeUrl(null)
      setOAuthState(null)
      setStatus('demo')
      return
    }

    if (!hasFullCredentials) {
      abortRef.current?.abort()
      setLoading(false)
      setLivePayload(null)
      setLiveFallbackToDemo(false)
      setLastError(null)
      setAuthorizeUrl(null)
      setOAuthState(null)
      setStatus('no-credentials')
      return
    }

    void runLiveFetch()
    return () => abortRef.current?.abort()
  }, [mockDataEnabled, hasFullCredentials, clientId, clientSecret, runLiveFetch])

  const merged = useMemo(() => {
    const base = demoPayload
    if (status === 'live' && livePayload) {
      const vehicles = livePayload.vehicles
      const kpis = mergeKpis(vehicles, livePayload.kpis)
      const charging = livePayload.chargingSessions?.length ? livePayload.chargingSessions : mockChargingSessions(vehicles)
      const telemetry = livePayload.telemetry?.length ? livePayload.telemetry : mockTelemetry(vehicles)
      const socSeriesByVehicle =
        livePayload.socSeriesByVehicle?.length === vehicles.length
          ? livePayload.socSeriesByVehicle
          : mockSocSeries(vehicles)
      const lastTripRoute =
        livePayload.lastTripRoute && livePayload.lastTripRoute.length > 1
          ? livePayload.lastTripRoute
          : base.lastTripRoute ?? MOCK_TRIP_POLYLINE
      return { vehicles, kpis, charging, telemetry, socSeriesByVehicle, lastTripRoute }
    }

    return {
      vehicles: base.vehicles,
      kpis: mockKpis(base.vehicles),
      charging: base.chargingSessions ?? mockChargingSessions(base.vehicles),
      telemetry: base.telemetry ?? mockTelemetry(base.vehicles),
      socSeriesByVehicle: base.socSeriesByVehicle ?? mockSocSeries(base.vehicles),
      lastTripRoute: base.lastTripRoute ?? MOCK_TRIP_POLYLINE,
    }
  }, [status, livePayload, demoPayload])

  const isDemoData = status !== 'live'

  return {
    status,
    loading,
    isDemoData,
    authorizeUrl,
    oauthState,
    units: 'mi',
    vehicles: merged.vehicles,
    kpis: merged.kpis,
    charging: merged.charging,
    telemetry: merged.telemetry,
    socSeriesByVehicle: merged.socSeriesByVehicle,
    lastTripRoute: merged.lastTripRoute,
    lastError,
    liveFallbackToDemo,
    scratchMeta,
  }
}
