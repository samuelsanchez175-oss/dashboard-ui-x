import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  BatteryCharging,
  ChevronRight,
  Compass,
  Cog,
  Crosshair,
  Gauge,
  Layers,
  Lock,
  LockOpen,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  MapPin,
  Search,
  ShieldCheck,
  Snowflake,
  Thermometer,
  X,
  Zap,
} from 'lucide-react'

import { getApiKey, subscribeApiKeys } from '../../lib/api-keys'
import type { TeslaUnits, TeslaVehicleRow } from './useTeslaFleetData'

/* ── Color palette (intentional — Tesla map view has its own visual identity) ──── */
const ACCENT_ORANGE = '#ff9900'
const ACCENT_GREEN = '#00aa00'
const ACCENT_RED = '#ef4444'

/* ── Topo background pattern (matches the source design exactly) ──────────────── */
const TOPO_BG_DATA_URL =
  "url(\"data:image/svg+xml,%3Csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='topo' width='200' height='200' viewBox='0 0 200 200' patternUnits='userSpaceOnUse'%3E%3Cpath d='M-100 100 Q 0 50 100 100 T 300 100' fill='none' stroke='%23e2e8f0' stroke-width='1'/%3E%3Cpath d='M-100 150 Q 0 100 100 150 T 300 150' fill='none' stroke='%23e2e8f0' stroke-width='1'/%3E%3Cpath d='M-100 50 Q 0 0 100 50 T 300 50' fill='none' stroke='%23e2e8f0' stroke-width='1'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='url(%23topo)'/%3E%3C/svg%3E\")"

const GLASS_PANEL_STYLE = {
  background: 'rgba(247, 247, 247, 0.65)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 0.9)',
  boxShadow: '0 12px 40px -12px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 1)',
} as const

const GLASS_BUBBLE_STYLE = {
  background: 'rgba(247, 247, 247, 0.7)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 0.9)',
  boxShadow: '0 8px 24px -8px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 1)',
  transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
} as const

/* ── Tesla data helpers ───────────────────────────────────────────────────────── */

/** Tesla VIN position 4 encodes the model line — cheap display heuristic. */
function modelFromVin(vin: string | undefined): string {
  const c = (vin ?? '').charAt(3).toUpperCase()
  if (c === '3') return 'Model 3'
  if (c === 'S') return 'Model S'
  if (c === 'X') return 'Model X'
  if (c === 'Y') return 'Model Y'
  if (c === 'C') return 'Cybertruck'
  return 'Tesla'
}

function vinSuffix(vin: string): string {
  const v = vin.replace(/\s/g, '').toUpperCase()
  return v.length <= 5 ? v : v.slice(-5)
}

function formatRange(miles: number, units: TeslaUnits): { value: string; unit: string } {
  if (units === 'km') return { value: Math.round(miles * 1.60934).toLocaleString(), unit: 'km' }
  return { value: Math.round(miles).toLocaleString(), unit: 'mi' }
}

function formatOdometer(miles: number, units: TeslaUnits): string {
  if (units === 'km') return `${Math.round(miles * 1.60934).toLocaleString()} km`
  return `${Math.round(miles).toLocaleString()} mi`
}

function batteryColor(pct: number, charging: boolean): string {
  if (charging) return ACCENT_ORANGE
  if (pct > 50) return ACCENT_GREEN
  if (pct > 20) return ACCENT_ORANGE
  return ACCENT_RED
}

function formatMinutesToEta(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return ''
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function deriveStateLabel(v: TeslaVehicleRow): { label: string; color: string } {
  if (v.charging || v.chargingState === 'Charging') return { label: 'Charging', color: ACCENT_ORANGE }
  if (v.chargingState === 'Complete') return { label: 'Charge complete', color: ACCENT_GREEN }
  if (v.shiftState && v.shiftState !== 'P') return { label: 'Driving', color: ACCENT_ORANGE }
  if (v.online) return { label: 'Online', color: ACCENT_GREEN }
  return { label: 'Asleep', color: '#94a3b8' }
}

/* ── SOC ring ─────────────────────────────────────────────────────────────────── */

function BatteryRing({
  percent,
  size = 48,
  strokeWidth = 3.5,
  color,
  showLabel = true,
}: {
  percent: number
  size?: number
  strokeWidth?: number
  color: string
  showLabel?: boolean
}) {
  const clamped = Math.max(0, Math.min(100, percent))
  // Path is the same arc used in the source design.
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90 drop-shadow-sm">
        <path
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <path
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth + 0.5}
          strokeDasharray={`${clamped}, 100`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.4s ease' }}
        />
      </svg>
      {showLabel ? (
        <span className="text-[13px] font-bold tabular-nums text-gray-800">{Math.round(clamped)}%</span>
      ) : null}
    </div>
  )
}

/* ── Right-side stat bubble ───────────────────────────────────────────────────── */

function StatBubble({
  icon,
  label,
  value,
  tooltipDetail,
  onClick,
  badgeColor,
}: {
  icon: React.ReactNode
  label: string
  value: string | React.ReactNode
  tooltipDetail?: string
  onClick?: () => void
  badgeColor?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex h-14 w-14 items-center justify-center rounded-full text-gray-600 hover:scale-105"
      style={GLASS_BUBBLE_STYLE}
      aria-label={label}
    >
      <span className="flex items-center justify-center" style={{ color: badgeColor ?? '#4b5563' }}>
        {icon}
      </span>
      {/* Hover tooltip — slides in from the right */}
      <span className="pointer-events-none absolute right-full mr-4 translate-x-2 transform whitespace-nowrap rounded-2xl px-4 py-2 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" style={GLASS_PANEL_STYLE}>
        <span className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</span>
          <span className="text-sm font-semibold text-gray-800">{value}</span>
          {tooltipDetail ? <span className="text-[10px] text-gray-500">{tooltipDetail}</span> : null}
        </span>
      </span>
    </button>
  )
}

/* ── Detail slide-over (replaces the source's "Point Telemetry") ──────────────── */

function VehicleDetailPanel({
  v,
  units,
  onClose,
}: {
  v: TeslaVehicleRow
  units: TeslaUnits
  onClose: () => void
}) {
  const { label: stateLabel, color: stateColor } = deriveStateLabel(v)
  const battColor = batteryColor(v.batteryPercent, v.charging)
  return (
    <>
      <div
        className="absolute inset-0 z-40 opacity-100 transition-opacity duration-500"
        style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="absolute right-0 top-0 z-50 flex h-full w-[min(460px,90vw)] flex-col overflow-hidden rounded-l-[40px] border-l border-white"
        style={{
          ...GLASS_PANEL_STYLE,
          boxShadow: '-24px 0 64px -12px rgba(0,0,0,0.1)',
        }}
      >
        <header
          className="flex items-center justify-between border-b border-white/60 bg-white/30 p-8 pb-6"
        >
          <div className="flex flex-col">
            <span className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: stateColor }}>
              <span className="size-1.5 animate-pulse rounded-full" style={{ background: stateColor }} aria-hidden />
              {stateLabel}
            </span>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">{v.displayName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/80 bg-white/60 text-gray-500 shadow-sm transition-all hover:scale-105 hover:bg-white hover:text-gray-900 active:scale-95"
            aria-label="Close detail panel"
          >
            <X className="size-5" />
          </button>
        </header>

        <div
          className="flex flex-1 flex-col gap-6 overflow-y-auto bg-gradient-to-b from-transparent to-white/20 p-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* Identity */}
          <div
            className="flex items-center gap-4 rounded-3xl border border-white bg-white/50 p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-900 text-white shadow-md">
              <MapPin className="size-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold text-gray-900">{modelFromVin(v.vin)}</span>
              <span className="font-mono text-xs font-medium tracking-tight text-gray-500">
                VIN …{vinSuffix(v.vin)} · v{v.softwareVersion}
              </span>
            </div>
          </div>

          {/* Battery + charging */}
          <div className="rounded-[28px] border border-white bg-white/60 p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)] backdrop-blur-md">
            <div className="mb-6">
              <h3 className="mb-3 flex items-center justify-between text-sm font-bold text-gray-800">
                <span className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: battColor, boxShadow: `0 0 8px ${battColor}80` }}
                    aria-hidden
                  />
                  State of Charge
                </span>
                <span className="font-mono" style={{ color: battColor }}>
                  {Math.round(v.batteryPercent)}%
                </span>
              </h3>
              <div className="relative h-3 overflow-hidden rounded-full border border-gray-300/50 bg-gray-200/80 shadow-inner">
                <div
                  className="absolute left-0 top-0 h-full rounded-full"
                  style={{
                    width: `${Math.max(0, Math.min(100, v.batteryPercent))}%`,
                    background: v.charging
                      ? 'linear-gradient(to right, #fde047, #ff9900, #ef4444)'
                      : v.batteryPercent > 50
                        ? '#00aa00'
                        : v.batteryPercent > 20
                          ? '#ff9900'
                          : '#ef4444',
                  }}
                />
                {v.chargeLimitPct != null ? (
                  <div
                    className="absolute top-0 h-full w-px bg-gray-700"
                    style={{ left: `${v.chargeLimitPct}%` }}
                    title={`Charge limit ${v.chargeLimitPct}%`}
                  />
                ) : null}
              </div>
            </div>

            <hr className="mb-6 border-gray-200/60" />

            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Projected range
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold tracking-tighter text-gray-900">
                    {formatRange(v.rangeMiles, units).value}
                  </span>
                  <span className="text-lg font-bold text-gray-500">{formatRange(v.rangeMiles, units).unit}</span>
                </div>
              </div>
              <BatteryRing
                percent={v.batteryPercent}
                size={64}
                strokeWidth={4}
                color={battColor}
                showLabel={false}
              />
            </div>

            {v.charging && (v.chargerPowerKw ?? 0) > 0 ? (
              <div className="mt-5 flex items-center gap-3 rounded-2xl border border-orange-200/60 bg-orange-50/60 p-3">
                <BatteryCharging className="size-5 shrink-0 text-orange-500" />
                <div className="flex flex-1 flex-col">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-orange-900">
                    Charging now
                  </span>
                  <span className="font-mono text-sm font-bold text-gray-900">
                    {(v.chargerPowerKw ?? 0).toFixed(1)} kW
                    {v.chargeLimitPct != null ? (
                      <span className="text-gray-500"> → {v.chargeLimitPct}% limit</span>
                    ) : null}
                  </span>
                </div>
                {v.minutesToFullCharge != null && v.minutesToFullCharge > 0 ? (
                  <span className="font-mono text-xs font-bold text-orange-900">
                    {formatMinutesToEta(v.minutesToFullCharge)} to full
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Climate + cabin */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col rounded-2xl border border-white bg-white/80 p-4 shadow-sm">
              <span className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                <Thermometer className="size-3" /> Cabin
              </span>
              <span className="font-mono text-lg font-bold tracking-tight text-gray-900">
                {v.interiorTempF != null ? `${Math.round(v.interiorTempF)}°F` : '—'}
              </span>
            </div>
            <div className="flex flex-col rounded-2xl border border-white bg-white/80 p-4 shadow-sm">
              <span className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                <Snowflake className="size-3" /> Outside
              </span>
              <span className="font-mono text-lg font-bold tracking-tight text-gray-900">
                {v.outsideTempF != null ? `${Math.round(v.outsideTempF)}°F` : '—'}
              </span>
            </div>
          </div>

          {/* Security + odometer */}
          <div className="rounded-[28px] border border-white bg-white/60 p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)] backdrop-blur-md">
            <h3 className="mb-4 text-sm font-bold text-gray-800">Vehicle status</h3>
            <dl className="grid grid-cols-2 gap-4 text-[12px]">
              <div className="flex flex-col">
                <dt className="font-mono text-[9px] uppercase tracking-wide text-gray-400">Odometer</dt>
                <dd className="mt-0.5 font-mono text-base font-bold tabular-nums text-gray-900">
                  {formatOdometer(v.odometerMiles, units)}
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="font-mono text-[9px] uppercase tracking-wide text-gray-400">Software</dt>
                <dd className="mt-0.5 font-mono text-base font-bold text-gray-900">v{v.softwareVersion}</dd>
              </div>
              {v.locked != null ? (
                <div className="flex flex-col">
                  <dt className="font-mono text-[9px] uppercase tracking-wide text-gray-400">Locks</dt>
                  <dd
                    className="mt-0.5 flex items-center gap-1.5 font-mono text-base font-bold"
                    style={{ color: v.locked ? '#0f766e' : '#dc2626' }}
                  >
                    {v.locked ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
                    {v.locked ? 'Locked' : 'Unlocked'}
                  </dd>
                </div>
              ) : null}
              {v.sentryMode != null ? (
                <div className="flex flex-col">
                  <dt className="font-mono text-[9px] uppercase tracking-wide text-gray-400">Sentry</dt>
                  <dd
                    className="mt-0.5 flex items-center gap-1.5 font-mono text-base font-bold"
                    style={{ color: v.sentryMode ? '#0f766e' : '#6b7280' }}
                  >
                    <ShieldCheck className="size-4" />
                    {v.sentryMode ? 'On' : 'Off'}
                  </dd>
                </div>
              ) : null}
              {v.shiftState ? (
                <div className="flex flex-col">
                  <dt className="font-mono text-[9px] uppercase tracking-wide text-gray-400">Shift</dt>
                  <dd className="mt-0.5 font-mono text-base font-bold text-gray-900">{v.shiftState}</dd>
                </div>
              ) : null}
              <div className="flex flex-col">
                <dt className="font-mono text-[9px] uppercase tracking-wide text-gray-400">Coordinates</dt>
                <dd className="mt-0.5 font-mono text-[11px] tabular-nums leading-tight text-gray-700">
                  {v.lat.toFixed(4)}°<br />
                  {v.lng.toFixed(4)}°
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </aside>
    </>
  )
}

/* ── Main map view ────────────────────────────────────────────────────────────── */

type MapType = 'roadmap' | 'satellite' | 'hybrid' | 'terrain'
const MAP_TYPE_CYCLE: readonly MapType[] = ['roadmap', 'satellite', 'hybrid', 'terrain']
const MAP_TYPE_LABEL: Record<MapType, string> = {
  roadmap: 'Road',
  satellite: 'Satellite',
  hybrid: 'Hybrid',
  terrain: 'Terrain',
}

/** Google Maps Embed API URL builder. Uses `view` mode when no search query is
 *  active; switches to `search` mode (handles addresses, POIs, lat/lng strings)
 *  when the user submits a search. The same Embed API key works for both. */
function mapEmbedUrl(opts: {
  apiKey: string
  lat: number
  lng: number
  zoom: number
  mapType: MapType
  searchQuery: string
}): string {
  const t = opts.mapType
  if (opts.searchQuery.trim()) {
    return `https://www.google.com/maps/embed/v1/search?key=${encodeURIComponent(opts.apiKey)}&q=${encodeURIComponent(opts.searchQuery)}&center=${opts.lat},${opts.lng}&zoom=${opts.zoom}&maptype=${t}`
  }
  return `https://www.google.com/maps/embed/v1/view?key=${encodeURIComponent(opts.apiKey)}&center=${opts.lat},${opts.lng}&zoom=${opts.zoom}&maptype=${t}`
}

/** Short relative-time formatter — "12s ago" / "5 min ago" / "2h ago". */
function relativeAgo(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 5) return 'Just synced'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function TeslaFleetMap({
  v,
  units,
  isDemoData,
}: {
  v: TeslaVehicleRow
  units: TeslaUnits
  isDemoData: boolean
}) {
  const [detailOpen, setDetailOpen] = useState(false)
  const [mapType, setMapType] = useState<MapType>('satellite')
  const [zoom, setZoom] = useState<number>(14)
  const [searchDraft, setSearchDraft] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false)
  const [syncedAt, setSyncedAt] = useState<number>(() => Date.now())
  const [nowTick, setNowTick] = useState<number>(() => Date.now())
  const sectionRef = useRef<HTMLDivElement>(null)
  const [googleKey, setGoogleKey] = useState<string>(
    () => getApiKey('GOOGLE_MAPS_API_KEY') || getApiKey('GOOGLE_API_KEY') || '',
  )

  // Keep Maps key reactive to Settings changes — no full reload needed.
  useEffect(() => {
    return subscribeApiKeys(snapshot => {
      const next = snapshot['GOOGLE_MAPS_API_KEY'] || snapshot['GOOGLE_API_KEY'] || ''
      setGoogleKey(prev => (prev === next ? prev : next))
    })
  }, [])

  // Bump the "synced at" timestamp whenever a meaningful Tesla field changes —
  // gives the user honest feedback that data is fresh.
  useEffect(() => {
    setSyncedAt(Date.now())
  }, [v.batteryPercent, v.rangeMiles, v.charging, v.lat, v.lng, v.chargingState])

  // Tick once every 30s so the "X min ago" chip stays current without re-renders elsewhere.
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30000)
    return () => window.clearInterval(id)
  }, [])

  const cycleMapType = useCallback(() => {
    setMapType(t => MAP_TYPE_CYCLE[(MAP_TYPE_CYCLE.indexOf(t) + 1) % MAP_TYPE_CYCLE.length]!)
  }, [])

  const zoomIn = useCallback(() => setZoom(z => Math.min(21, z + 1)), [])
  const zoomOut = useCallback(() => setZoom(z => Math.max(1, z - 1)), [])

  const recenter = useCallback(() => {
    setSearchQuery('')
    setSearchDraft('')
    setZoom(14)
  }, [])

  const submitSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const q = searchDraft.trim()
      setSearchQuery(q)
    },
    [searchDraft],
  )

  const toggleFullscreen = useCallback(() => {
    const el = sectionRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }, [])

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const model = modelFromVin(v.vin)
  const range = formatRange(v.rangeMiles, units)
  const battColor = batteryColor(v.batteryPercent, v.charging)
  const state = deriveStateLabel(v)
  const isCharging = v.charging || v.chargingState === 'Charging'

  // Default center: vehicle lat/lng if non-zero, else a sensible fallback so
  // the iframe still renders something useful.
  const hasCoords = Number.isFinite(v.lat) && Number.isFinite(v.lng) && (v.lat !== 0 || v.lng !== 0)
  const centerLat = hasCoords ? v.lat : 37.4419
  const centerLng = hasCoords ? v.lng : -122.143

  // Recompute the iframe URL whenever any input changes.
  const iframeSrc = useMemo(
    () =>
      googleKey
        ? mapEmbedUrl({ apiKey: googleKey, lat: centerLat, lng: centerLng, zoom, mapType, searchQuery })
        : '',
    [googleKey, centerLat, centerLng, zoom, mapType, searchQuery],
  )

  const lastSyncLabel = relativeAgo(nowTick - syncedAt)

  return (
    <section
      ref={sectionRef}
      className="relative w-full overflow-hidden rounded-3xl border text-[#333333]"
      style={{
        borderColor: 'var(--border-soft)',
        height: isFullscreen ? '100vh' : 'min(820px, 88vh)',
        minHeight: 600,
        background: '#f0f4f8',
      }}
      aria-label={`Live map view for ${v.displayName}`}
    >
      {/* Map base layer — real Google Maps when a key is saved, topo fallback otherwise. */}
      <div className="absolute inset-0 z-0 cursor-default">
        {googleKey ? (
          <iframe
            title={`Live map of ${v.displayName}`}
            src={iframeSrc}
            className="h-full w-full"
            style={{ border: 0 }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        ) : (
          <div
            className="h-full w-full"
            style={{ backgroundColor: '#f0f4f8', backgroundImage: TOPO_BG_DATA_URL }}
          >
            {/* Subtle hill shapes + contour lines (fallback when no Google key) */}
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full opacity-40"
              viewBox="0 0 1440 900"
              preserveAspectRatio="xMidYMid slice"
              aria-hidden
            >
              <path
                d="M0 200 Q 300 150 500 350 T 1000 400 T 1500 200 L 1500 900 L 0 900 Z"
                fill="#e2e8f0"
                opacity="0.5"
              />
              <path
                d="M0 400 Q 400 300 600 500 T 1200 600 T 1500 450 L 1500 900 L 0 900 Z"
                fill="#cbd5e1"
                opacity="0.3"
              />
              <path d="M-100 150 C 200 100 400 300 700 250 S 1100 400 1500 300" fill="none" stroke="#94a3b8" strokeWidth="1" opacity="0.4" />
              <path d="M-100 180 C 200 130 400 330 700 280 S 1100 430 1500 330" fill="none" stroke="#94a3b8" strokeWidth="1" opacity="0.4" />
              <path d="M-100 210 C 200 160 400 360 700 310 S 1100 460 1500 360" fill="none" stroke="#94a3b8" strokeWidth="1" opacity="0.4" />
              <path d="M-100 550 C 300 500 500 700 800 650 S 1200 800 1500 700" fill="none" stroke="#94a3b8" strokeWidth="1" opacity="0.4" />
              <path d="M-100 580 C 300 530 500 730 800 680 S 1200 830 1500 730" fill="none" stroke="#94a3b8" strokeWidth="1" opacity="0.4" />
            </svg>
            {/* No-key hint — visible whenever the iframe can't render. */}
            <div
              className="absolute left-1/2 top-1/2 max-w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-2xl px-5 py-4 text-center text-[12px] text-gray-700"
              style={GLASS_PANEL_STYLE}
            >
              <p className="font-semibold">Add a Google Maps API key for the live map</p>
              <p className="mt-1 text-[11px] text-gray-500">
                Save <code className="font-mono">GOOGLE_MAPS_API_KEY</code> (or reuse{' '}
                <code className="font-mono">GOOGLE_API_KEY</code>) in Settings → API keys. Make sure{' '}
                <span className="font-semibold">Maps Embed API</span> is enabled on the key in Google Cloud Console.
              </p>
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(new CustomEvent('dashboard:set-route', { detail: { id: 'dev' } }))
                }
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm"
                style={{ background: ACCENT_ORANGE }}
              >
                Open Settings → API keys
              </button>
            </div>
          </div>
        )}

        {/* Vehicle location pin — overlaid on the map. Pulses faster + brighter while charging. */}
        <div
          className="pointer-events-none absolute z-10"
          style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
        >
          <span
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background: battColor,
              opacity: isCharging ? 0.55 : 0.4,
              width: isCharging ? 56 : 36,
              height: isCharging ? 56 : 36,
              animation: `ping ${isCharging ? '1.2s' : '2s'} cubic-bezier(0,0,0.2,1) infinite`,
            }}
            aria-hidden
          />
          <span
            className="relative block rounded-full border-2 border-white shadow-[0_2px_6px_rgba(0,0,0,0.35)]"
            style={{
              background: battColor,
              width: isCharging ? 22 : 20,
              height: isCharging ? 22 : 20,
            }}
            aria-hidden
          />
        </div>
      </div>

      {/* ── Search bar (top-left, glass) ─────────────────────────────────────── */}
      <form
        onSubmit={submitSearch}
        className="absolute left-4 top-4 z-40 sm:left-6"
        role="search"
      >
        <div
          className="flex h-11 items-center gap-2 rounded-full pl-4 pr-1.5"
          style={GLASS_PANEL_STYLE}
        >
          <Search className="size-4 shrink-0" aria-hidden style={{ color: '#6b7280' }} />
          <input
            type="search"
            value={searchDraft}
            onChange={e => setSearchDraft(e.target.value)}
            placeholder="Search places, addresses…"
            className="w-44 bg-transparent text-[12px] text-gray-800 placeholder:text-gray-400 focus:outline-none sm:w-56"
            aria-label="Search the map"
          />
          {searchDraft || searchQuery ? (
            <button
              type="button"
              onClick={() => {
                setSearchDraft('')
                setSearchQuery('')
              }}
              className="flex size-7 items-center justify-center rounded-full text-gray-500 hover:bg-white/80 hover:text-gray-900"
              aria-label="Clear search"
              title="Clear"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
          <button
            type="submit"
            className="flex h-8 items-center gap-1 rounded-full px-3 text-[11px] font-semibold text-white"
            style={{ background: ACCENT_ORANGE }}
            disabled={!googleKey}
            title={googleKey ? 'Go' : 'Add a Google Maps API key first'}
          >
            Go
          </button>
        </div>
        {searchQuery ? (
          <p
            className="ml-3 mt-1 inline-block rounded-full bg-white/80 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide shadow-sm"
            style={{ color: '#6b7280' }}
          >
            Searching: {searchQuery}
          </p>
        ) : null}
      </form>

      {/* ── Map controls cluster (top-right above the bubble stack) ─────────── */}
      <div className="absolute right-4 top-4 z-40 flex flex-col gap-2 sm:right-6">
        {/* Zoom in / zoom out — stacked pill */}
        <div
          className="flex flex-col overflow-hidden rounded-full"
          style={GLASS_PANEL_STYLE}
          aria-label="Map zoom controls"
        >
          <button
            type="button"
            onClick={zoomIn}
            className="flex h-10 w-10 items-center justify-center text-gray-700 transition hover:bg-white/80"
            aria-label="Zoom in"
            title={`Zoom in (current ${zoom})`}
            disabled={!googleKey || zoom >= 21}
          >
            <Plus className="size-4" />
          </button>
          <div className="mx-auto h-px w-7" style={{ background: 'rgba(0,0,0,0.08)' }} aria-hidden />
          <button
            type="button"
            onClick={zoomOut}
            className="flex h-10 w-10 items-center justify-center text-gray-700 transition hover:bg-white/80"
            aria-label="Zoom out"
            title={`Zoom out (current ${zoom})`}
            disabled={!googleKey || zoom <= 1}
          >
            <Minus className="size-4" />
          </button>
        </div>

        {/* Re-center on vehicle */}
        <button
          type="button"
          onClick={recenter}
          className="flex h-10 w-10 items-center justify-center rounded-full text-gray-700 transition hover:scale-105"
          style={GLASS_BUBBLE_STYLE}
          aria-label="Re-center on vehicle"
          title="Re-center on vehicle + reset search"
        >
          <Crosshair className="size-4" />
        </button>

        {/* Fullscreen toggle */}
        <button
          type="button"
          onClick={toggleFullscreen}
          className="flex h-10 w-10 items-center justify-center rounded-full text-gray-700 transition hover:scale-105"
          style={GLASS_BUBBLE_STYLE}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
      </div>

      {/* Top pill — vehicle hero. Pushed down on small screens so it doesn't
          collide with the search bar / zoom cluster at the corners. */}
      <div className="absolute left-1/2 top-20 z-30 -translate-x-1/2 px-4 sm:top-4">
        <div
          className="flex h-[72px] items-center rounded-full pl-2 pr-6 sm:pr-8"
          style={GLASS_PANEL_STYLE}
        >
          {/* Tesla-T metallic emblem */}
          <div className="ml-0.5 mr-3 flex h-14 w-14 items-center justify-center rounded-full border border-gray-200 bg-gradient-to-br from-white to-gray-100 shadow-[0_4px_12px_rgba(0,0,0,0.08),inset_0_2px_4px_rgba(255,255,255,1)] sm:mr-5">
            <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
              <defs>
                <linearGradient id="tesla-metallic" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#e0e0e0" />
                  <stop offset="40%" stopColor="#ffffff" />
                  <stop offset="60%" stopColor="#999999" />
                  <stop offset="100%" stopColor="#cccccc" />
                </linearGradient>
              </defs>
              <path
                fill="url(#tesla-metallic)"
                d="M12 2.5c-3.5 0-7 1.5-9.5 4l1.5 1.5c2-2 5-3 8-3s6 1 8 3l1.5-1.5c-2.5-2.5-6-4-9.5-4zm0 4.5c-2 0-4 1-5.5 2.5l1.5 1.5c1-1 2.5-1.5 4-1.5s3 .5 4 1.5l1.5-1.5c-1.5-1.5-3.5-2.5-5.5-2.5zm-2 5v9.5h4v-9.5l4-4-1.5-1.5-4 4-4-4-1.5 1.5 4 4z"
              />
            </svg>
          </div>

          {/* Model + name */}
          <div className="mr-4 flex h-10 flex-col justify-center border-r border-gray-300/40 pr-4 sm:mr-8 sm:pr-8">
            <span className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.25em] text-gray-400">
              {model}
            </span>
            <span className="truncate text-sm font-semibold tracking-tight text-gray-800">
              {v.displayName}
            </span>
          </div>

          {/* Battery ring */}
          <div className="mr-4 flex h-10 items-center gap-4 border-r border-gray-300/40 pr-4 sm:mr-8 sm:pr-8">
            <BatteryRing percent={v.batteryPercent} size={48} strokeWidth={3} color={battColor} />
          </div>

          {/* Range */}
          <div className="flex h-10 flex-col justify-center">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-bold leading-none tracking-tighter text-gray-900 tabular-nums">
                {range.value}
              </span>
              <span className="text-sm font-semibold leading-none text-gray-500">{range.unit}</span>
            </div>
            <span
              className="mt-1 text-[10px] font-bold uppercase tracking-widest"
              style={{ color: isCharging ? ACCENT_ORANGE : state.color }}
            >
              {isCharging ? 'Charging' : 'Proj. Range'}
            </span>
          </div>
        </div>
      </div>

      {/* Right-side stat bubbles */}
      <div className="absolute right-4 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-3 sm:right-6 sm:gap-4">
        {/* Map layer cycle — Roadmap → Satellite → Hybrid → Terrain */}
        <StatBubble
          icon={<Layers className="size-6" />}
          label="Map layer"
          value={MAP_TYPE_LABEL[mapType]}
          tooltipDetail={googleKey ? 'Tap to cycle layers' : 'Add GOOGLE_MAPS_API_KEY to enable'}
          onClick={cycleMapType}
        />

        {/* Online / state */}
        <StatBubble
          icon={<Activity className="size-6" />}
          label="Connection"
          value={state.label}
          tooltipDetail={`Last seen via Fleet API`}
          badgeColor={state.color}
        />

        {/* Charge limit ring */}
        <StatBubble
          icon={
            <div className="relative flex h-7 w-7 items-center justify-center">
              <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="4"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke={ACCENT_GREEN}
                  strokeWidth="4"
                  strokeDasharray={`${v.chargeLimitPct ?? 80}, 100`}
                  strokeLinecap="round"
                />
              </svg>
              <Zap className="size-3.5" style={{ color: ACCENT_GREEN }} />
            </div>
          }
          label="Charge limit"
          value={v.chargeLimitPct != null ? `${v.chargeLimitPct}%` : '—'}
          tooltipDetail={isCharging && v.minutesToFullCharge != null && v.minutesToFullCharge > 0
            ? `${formatMinutesToEta(v.minutesToFullCharge)} to full`
            : undefined}
          badgeColor={ACCENT_GREEN}
        />

        {/* Climate / temp */}
        <StatBubble
          icon={<Thermometer className="size-6" />}
          label="Climate"
          value={
            v.interiorTempF != null
              ? `${Math.round(v.interiorTempF)}°F inside`
              : 'Unavailable'
          }
          tooltipDetail={v.outsideTempF != null ? `${Math.round(v.outsideTempF)}°F outside` : undefined}
        />

        {/* Compass / heading (decorative; opens detail) */}
        <StatBubble
          icon={<Compass className="size-6" />}
          label="Vehicle detail"
          value="Open"
          tooltipDetail="VIN, security, software"
          onClick={() => setDetailOpen(true)}
        />

        {/* Settings */}
        <StatBubble
          icon={<Cog className="size-6" />}
          label="Settings"
          value="Configure"
          onClick={() => setDetailOpen(true)}
        />
      </div>

      {/* Bottom dock — model / status / odometer / demo flag */}
      <div className="absolute bottom-4 left-1/2 z-30 w-full max-w-[90vw] -translate-x-1/2 px-2 sm:bottom-8">
        <div
          className="flex items-center gap-2 overflow-x-auto rounded-[2.5rem] p-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={GLASS_PANEL_STYLE}
        >
          <div className="mr-1 flex flex-col justify-center border-r border-gray-300/40 px-4 py-2">
            <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-widest text-gray-400">
              Status
            </span>
            <span className="whitespace-nowrap text-sm font-semibold text-gray-800">
              {isDemoData ? 'Demo data' : 'Live Fleet API'}
            </span>
            <span
              className="mt-0.5 inline-flex items-center gap-1 whitespace-nowrap font-mono text-[9px] uppercase tracking-wide text-gray-500"
              title={`Last refreshed at ${new Date(syncedAt).toLocaleTimeString()}`}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ background: isCharging ? ACCENT_ORANGE : ACCENT_GREEN }}
                aria-hidden
              />
              Synced {lastSyncLabel}
            </span>
          </div>

          {/* Odometer chip */}
          <div className="flex cursor-default items-center gap-4 rounded-[2rem] border border-white/60 bg-white/50 p-2 pr-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-300 hover:bg-white/80">
            <div className="relative h-12 w-12 overflow-hidden rounded-[1.5rem] border border-gray-200 bg-gray-100">
              <Gauge className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-gray-500" />
            </div>
            <div className="flex flex-col justify-center">
              <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Odometer
              </span>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold tabular-nums text-gray-900">
                  {formatOdometer(v.odometerMiles, units)}
                </span>
              </div>
            </div>
          </div>

          {/* Cabin / outside chip */}
          {v.interiorTempF != null ? (
            <div className="flex cursor-default items-center gap-4 rounded-[2rem] border border-white/60 bg-white/50 p-2 pr-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-300 hover:bg-white/80">
              <div className="relative h-12 w-12 overflow-hidden rounded-[1.5rem] border border-gray-200 bg-gray-100">
                <Thermometer className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-gray-500" />
              </div>
              <div className="flex flex-col justify-center">
                <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Climate
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold tabular-nums text-gray-900">
                    {Math.round(v.interiorTempF)}°F
                  </span>
                  {v.outsideTempF != null ? (
                    <span className="rounded-full border border-gray-300 bg-gray-200/50 px-2 py-0.5 text-[10px] font-bold text-gray-600">
                      {Math.round(v.outsideTempF)}° out
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {/* Charging chip when applicable */}
          {isCharging ? (
            <div className="flex cursor-default items-center gap-4 rounded-[2rem] border border-orange-200/60 bg-orange-50/60 p-2 pr-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
              <div className="relative h-12 w-12 overflow-hidden rounded-[1.5rem] border border-orange-200 bg-orange-100">
                <BatteryCharging className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-orange-500" />
              </div>
              <div className="flex flex-col justify-center">
                <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-700">
                  Charging
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold tabular-nums text-gray-900">
                    {(v.chargerPowerKw ?? 0).toFixed(1)} kW
                  </span>
                  {v.minutesToFullCharge != null && v.minutesToFullCharge > 0 ? (
                    <span className="rounded-full border border-orange-200 bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-800">
                      {formatMinutesToEta(v.minutesToFullCharge)} to full
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {/* Open full detail */}
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            className="flex items-center gap-2 rounded-[2rem] border border-white/60 bg-white/70 px-4 py-2 text-[11px] font-semibold text-gray-800 shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all hover:bg-white"
          >
            Full detail <ChevronRight className="size-3" />
          </button>
        </div>
      </div>

      {detailOpen ? <VehicleDetailPanel v={v} units={units} onClose={() => setDetailOpen(false)} /> : null}
    </section>
  )
}
