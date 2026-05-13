import { useId, useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  BatteryCharging,
  ChevronRight,
  ExternalLink,
  Gauge,
  Lock,
  MapPin,
  Radio,
  Thermometer,
  Zap,
} from 'lucide-react'

import TeslaFleetMap from './TeslaFleetMap'

import { EmptyState, ErrorState, LoadingState } from '../../components/ui/states'
import type {
  TeslaChargingSession,
  TeslaFleetDataStatus,
  TeslaKpis,
  TeslaSocSeries,
  TeslaTelemetryEvent,
  TeslaUnits,
  TeslaVehicleRow,
} from './useTeslaFleetData'

const CARD_BORDER = { border: '1px solid var(--border-strong)', background: 'var(--bg-card)' } as const

function formatRangeMiles(miles: number, units: TeslaUnits): string {
  if (units === 'km') {
    const km = miles * 1.60934
    return `${Math.round(km)} km`
  }
  return `${Math.round(miles)} mi`
}

function formatMiles(miles: number, units: TeslaUnits): string {
  if (units === 'km') return `${(miles * 1.60934).toFixed(0)} km`
  return `${miles.toFixed(0)} mi`
}

function vinSuffix(vin: string): string {
  const v = vin.replace(/\s/g, '').toUpperCase()
  return v.length <= 5 ? v : v.slice(-5)
}

function MiniSparkline({ values }: { values: number[] }) {
  const pad = 1
  const W = 56
  const H = 18
  const w = W - pad * 2
  const h = H - pad * 2
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(max - min, 1e-6)
  const d = values
    .map((v, i) => {
      const x = pad + (i / Math.max(values.length - 1, 1)) * w
      const y = pad + (1 - (v - min) / span) * h
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-4 w-14 shrink-0" aria-hidden style={{ color: 'var(--accent)' }}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function KpiTile({
  label,
  value,
  sub,
  extra,
}: {
  label: string
  value: string
  sub?: string
  extra?: ReactNode
}) {
  return (
    <div
      className="relative flex min-h-[104px] flex-col justify-between overflow-hidden rounded-xl p-4 shadow-[var(--shadow-sm)]"
      style={CARD_BORDER}
    >
      <span className="absolute inset-y-2 left-0 w-1 rounded-full" style={{ background: 'var(--accent)' }} aria-hidden />
      <div className="pl-3">
        <p className="font-mono text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
          {label}
        </p>
        <p className="mt-2 font-mono text-2xl font-semibold tabular-nums leading-none" style={{ color: 'var(--text-1)' }}>
          {value}
        </p>
        {sub ? (
          <p className="mt-1 font-mono text-[10px] tabular-nums" style={{ color: 'var(--text-4)' }}>
            {sub}
          </p>
        ) : null}
      </div>
      {extra ? <div className="mt-2 flex justify-end pl-3">{extra}</div> : null}
    </div>
  )
}

function FleetKpiStrip({ kpis, units }: { kpis: TeslaKpis; units: TeslaUnits }) {
  return (
    <div className="col-span-12 grid grid-cols-2 gap-[var(--grid-gap)] md:grid-cols-2 lg:grid-cols-4">
      <KpiTile
        label="Vehicles online"
        value={String(kpis.vehiclesOnline)}
        sub="Fleet presence"
        extra={<MiniSparkline values={kpis.vehiclesOnlineTrend} />}
      />
      <KpiTile label="Total miles today" value={formatMiles(kpis.totalMilesToday, units)} sub="Rolling 24h est." />
      <KpiTile label="Avg battery level" value={`${kpis.avgBatteryPercent}%`} sub="State of charge" />
      <KpiTile label="Active charging" value={String(kpis.activeChargingSessions)} sub="Sessions in progress" />
    </div>
  )
}

function SocMultiChart({ series }: { series: TeslaSocSeries[] }) {
  if (series.length === 0) {
    return (
      <div className="rounded-xl p-4 shadow-[var(--shadow-sm)]" style={CARD_BORDER}>
        <EmptyState
          icon={Activity}
          title="No battery traces"
          description="Live Fleet data did not include SOC series for these vehicles yet."
        />
      </div>
    )
  }
  const cap = 5
  const shown = series.slice(0, cap)
  const more = series.length - shown.length
  const padL = 36
  const padR = 12
  const padT = 10
  const padB = 28
  const W = 400
  const H = 160
  const iw = W - padL - padR
  const ih = H - padT - padB

  const { paths, areaFirst } = useMemo(() => {
    const allSoc = shown.flatMap(s => s.points.map(p => p.soc))
    const minSoc = Math.min(...allSoc, 0)
    const maxSoc = Math.max(...allSoc, 100)
    const span = Math.max(maxSoc - minSoc, 1e-6)
    const linePaths: { d: string; opacity: number }[] = []
    shown.forEach((s, vi) => {
      const pts = s.points.map((p, i) => {
        const x = padL + (i / 23) * iw
        const y = padT + (1 - (p.soc - minSoc) / span) * ih
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
      })
      linePaths.push({ d: pts.join(' '), opacity: 1 - vi * 0.14 })
    })
    let area = ''
    if (shown[0]) {
      const s0 = shown[0].points
      const top = s0
        .map((p, i) => {
          const x = padL + (i / 23) * iw
          const y = padT + (1 - (p.soc - minSoc) / span) * ih
          return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
        })
        .join(' ')
      const lastX = padL + iw
      const baseY = padT + ih
      const firstX = padL
      area = `${top} L ${lastX.toFixed(1)} ${baseY.toFixed(1)} L ${firstX.toFixed(1)} ${baseY.toFixed(1)} Z`
    }
    return { paths: linePaths, areaFirst: area }
  }, [shown])

  const gridYs = [0, 0.25, 0.5, 0.75, 1].map(t => padT + t * ih)

  return (
    <div className="rounded-xl p-4 shadow-[var(--shadow-sm)]" style={CARD_BORDER}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            Battery / charge (24h)
          </h3>
          <p className="mt-0.5 text-[11px] font-mono uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
            One trace per vehicle · local hour axis
          </p>
        </div>
        {more > 0 ? (
          <span
            className="rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide"
            style={{ borderColor: 'var(--border-soft)', color: 'var(--text-3)' }}
          >
            +{more} more
          </span>
        ) : null}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-h-52" aria-hidden>
        {gridYs.map((y, i) => (
          <line key={i} x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--border-soft)" strokeWidth={1} />
        ))}
        {[0, 6, 12, 18, 23].map(h => {
          const x = padL + (h / 23) * iw
          return (
            <text key={h} x={x} y={H - 6} textAnchor="middle" className="fill-[color:var(--text-4)]" style={{ fontSize: 9, fontFamily: 'ui-monospace, monospace' }}>
              {h === 23 ? 'Now' : `${String(h).padStart(2, '0')}:00`}
            </text>
          )
        })}
        {areaFirst ? (
          <path d={areaFirst} fill="var(--accent)" fillOpacity={0.12} stroke="none" />
        ) : null}
        {paths.map((p, i) => (
          <path
            key={i}
            d={p.d}
            fill="none"
            stroke="var(--accent)"
            strokeOpacity={p.opacity}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-2 border-t pt-2" style={{ borderColor: 'var(--border-soft)' }}>
        {shown.map((s, i) => (
          <li key={s.vin} className="font-mono text-[10px]" style={{ color: 'var(--text-3)', opacity: 1 - i * 0.12 }}>
            <span style={{ color: 'var(--accent)' }}>●</span> {s.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

function TripMapSketch({
  route,
  isDemo,
}: {
  route: { lat: number; lng: number }[]
  isDemo: boolean
}) {
  const uid = useId().replace(/:/g, '')
  const patternId = `trip-grid-${uid}`

  const layout = useMemo(() => {
    if (route.length < 2) return null
    const lats = route.map(p => p.lat)
    const lngs = route.map(p => p.lng)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)
    const wLng = maxLng - minLng || 0.01
    const hLat = maxLat - minLat || 0.01
    const W = 640
    const H = 200
    const innerPad = 24
    const iw = W - innerPad * 2
    const ih = H - innerPad * 2
    const toX = (lng: number) => innerPad + ((lng - minLng) / wLng) * iw
    const toY = (lat: number) => innerPad + (1 - (lat - minLat) / hLat) * ih
    const pathD = route
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.lng).toFixed(1)} ${toY(p.lat).toFixed(1)}`)
      .join(' ')
    const start = route[0]!
    const end = route[route.length - 1]!
    const mapsUrl = `https://www.google.com/maps/dir/${start.lat},${start.lng}/${end.lat},${end.lng}`
    return {
      pathD,
      mapsUrl,
      start,
      end,
      sx: toX(start.lng),
      sy: toY(start.lat),
      ex: toX(end.lng),
      ey: toY(end.lat),
    }
  }, [route])

  return (
    <div className="rounded-xl p-4 shadow-[var(--shadow-sm)]" style={CARD_BORDER}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            Recent trip path
          </h3>
          <p className="mt-0.5 text-[11px] font-mono uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
            Sketch projection {isDemo ? '(DEMO trace)' : ''}
          </p>
        </div>
        {layout?.mapsUrl ? (
          <a
            href={layout.mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide transition hover:bg-[color:var(--bg-hover)]"
            style={{ borderColor: 'var(--border-strong)', color: 'var(--accent)' }}
          >
            OPEN IN MAPS
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null}
      </div>
      <div className="relative overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-card-soft)' }}>
        <svg viewBox="0 0 640 200" className="h-auto w-full" role="img" aria-label="Trip route sketch">
          <defs>
            <pattern id={patternId} width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="var(--border-soft)" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="640" height="200" fill={`url(#${patternId})`} opacity={0.45} />
          {layout ? (
            <>
              <path
                d={layout.pathD}
                fill="none"
                stroke="var(--accent)"
                strokeOpacity={0.2}
                strokeWidth={10}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={layout.pathD}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx={layout.sx} cy={layout.sy} r={7} fill="var(--accent)" fillOpacity={0.35} stroke="var(--accent)" strokeWidth={2} />
              <circle cx={layout.ex} cy={layout.ey} r={7} fill="var(--text-1)" fillOpacity={0.2} stroke="var(--accent)" strokeWidth={2} />
            </>
          ) : (
            <text x="320" y="100" textAnchor="middle" style={{ fill: 'var(--text-3)', fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>
              No route points
            </text>
          )}
        </svg>
      </div>
      {layout ? (
        <p className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[10px]" style={{ color: 'var(--text-3)' }}>
          <MapPin className="size-3.5 shrink-0" style={{ color: 'var(--accent)' }} aria-hidden />
          <span>
            START {layout.start.lat.toFixed(4)}, {layout.start.lng.toFixed(4)} → END {layout.end.lat.toFixed(4)}, {layout.end.lng.toFixed(4)}
          </span>
        </p>
      ) : null}
    </div>
  )
}

function ChargingTimeline({
  vehicles,
  sessions,
  onSelect,
  selectedId,
}: {
  vehicles: TeslaVehicleRow[]
  sessions: TeslaChargingSession[]
  onSelect: (id: string | null) => void
  selectedId: string | null
}) {
  const picked = sessions.find(s => s.id === selectedId)
  return (
    <div className="rounded-xl p-4 shadow-[var(--shadow-sm)]" style={CARD_BORDER}>
      <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
        Charging sessions (today)
      </h3>
      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        Rows = vehicles · axis = hour (local)
      </p>
      <div className="mt-4 space-y-2">
        {vehicles.map(v => {
          const rowSessions = sessions.filter(s => s.vin === v.vin)
          return (
            <div key={v.vin} className="flex flex-col gap-1">
              <div className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                {v.displayName}
              </div>
              <div
                className="relative h-7 rounded-md border"
                style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-card-soft)' }}
              >
                {[0, 6, 12, 18].map(h => (
                  <span
                    key={h}
                    className="pointer-events-none absolute top-0 h-full border-l"
                    style={{ left: `${(h / 24) * 100}%`, borderColor: 'var(--border-soft)', opacity: 0.5 }}
                  />
                ))}
                {rowSessions.map(s => {
                  const left = (s.startHour / 24) * 100
                  const width = Math.max(((s.endHour - s.startHour) / 24) * 100, 1.2)
                  const powerMix = Math.min(1, s.powerKw / 80)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      title={`${s.startHour.toFixed(2)}h–${s.endHour.toFixed(2)}h · ${s.powerKw.toFixed(0)} kW`}
                      onClick={() => onSelect(selectedId === s.id ? null : s.id)}
                      className="absolute top-1 h-5 rounded-sm border transition hover:brightness-110"
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        borderColor: 'var(--border-strong)',
                        background: `color-mix(in oklab, var(--accent) ${28 + powerMix * 55}%, var(--bg-canvas))`,
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      {picked ? (
        <div
          className="mt-3 rounded-lg border p-3 font-mono text-[11px]"
          style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-card-soft)', color: 'var(--text-2)' }}
        >
          <p className="font-semibold uppercase tracking-wide" style={{ color: 'var(--text-1)' }}>
            Session {picked.id}
          </p>
          <p className="mt-1 tabular-nums">
            kWh added: {picked.kWhAdded != null ? picked.kWhAdded.toFixed(1) : '—'} · Cost:{' '}
            {picked.costUsd != null ? `$${picked.costUsd.toFixed(2)}` : '—'}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-[11px]" style={{ color: 'var(--text-4)' }}>
          Tap a block for kWh / cost (when provided by Fleet / utility feeds).
        </p>
      )}
    </div>
  )
}

function telemetryColor(kind: TeslaTelemetryEvent['kind']): string {
  switch (kind) {
    case 'charging_start':
    case 'charging_stop':
      return 'var(--accent)'
    case 'driving':
      return 'color-mix(in oklab, var(--accent) 65%, var(--text-1) 35%)'
    case 'sentry':
      return 'color-mix(in oklab, var(--text-1) 55%, var(--accent) 45%)'
    default:
      return 'var(--text-3)'
  }
}

function TelemetryPanel({ events }: { events: TeslaTelemetryEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl shadow-[var(--shadow-sm)]" style={CARD_BORDER}>
        <EmptyState icon={Radio} title="No telemetry yet" description="State changes from Fleet streaming will appear here once the BFF forwards events." />
      </div>
    )
  }
  return (
    <div className="rounded-xl p-4 shadow-[var(--shadow-sm)]" style={CARD_BORDER}>
      <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
        Telemetry stream
      </h3>
      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        Last {Math.min(events.length, 40)} events
      </p>
      <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2 font-mono text-[10px] leading-relaxed" style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-card-soft)' }}>
        {events.slice(0, 40).map(ev => (
          <li key={ev.id} className="flex gap-2 border-b py-1.5 last:border-b-0" style={{ borderColor: 'var(--border-soft)' }}>
            <span className="w-1 shrink-0 rounded-full" style={{ background: telemetryColor(ev.kind) }} aria-hidden />
            <span className="shrink-0 tabular-nums" style={{ color: 'var(--text-4)' }}>
              {new Date(ev.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span style={{ color: 'var(--text-2)' }}>{ev.message}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── Vehicle hero cards (Tesla-app-style per-vehicle hero strip) ────────── */

function BatteryGauge({ percent, charging, size = 64 }: { percent: number; charging?: boolean; size?: number }) {
  const clamped = Math.max(0, Math.min(100, percent))
  const r = size / 2 - 4
  const c = 2 * Math.PI * r
  const offset = c * (1 - clamped / 100)
  const color = charging
    ? 'var(--accent)'
    : clamped > 50
      ? 'var(--good)'
      : clamped > 20
        ? 'var(--warn)'
        : 'var(--bad)'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--border-soft)" strokeWidth={4} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-base font-semibold tabular-nums leading-none" style={{ color: 'var(--text-1)' }}>
          {Math.round(clamped)}%
        </span>
        {charging ? (
          <BatteryCharging className="mt-0.5 size-3" aria-hidden style={{ color }} />
        ) : null}
      </div>
    </div>
  )
}

function formatMinutesToEta(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return ''
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h === 0) return `${m} min to full`
  if (m === 0) return `${h} hr to full`
  return `${h}h ${m}m to full`
}

function deriveStateLabel(v: TeslaVehicleRow): { label: string; color: string } {
  // Use rich `chargingState` when present (Disconnected / Charging / Complete / Stopped).
  // Otherwise fall back to online/asleep heuristic.
  if (v.charging || v.chargingState === 'Charging') {
    return { label: 'Charging', color: 'var(--accent)' }
  }
  if (v.chargingState === 'Complete') {
    return { label: 'Complete', color: 'var(--good)' }
  }
  if (v.chargingState === 'Stopped') {
    return { label: 'Stopped', color: 'var(--warn)' }
  }
  if (v.shiftState && v.shiftState !== 'P') {
    return { label: 'Driving', color: 'var(--accent)' }
  }
  if (v.online) {
    return { label: 'Online', color: 'var(--good)' }
  }
  return { label: 'Asleep', color: 'var(--text-4)' }
}

function VehicleHeroCard({
  v,
  units,
  isDemoData,
}: {
  v: TeslaVehicleRow
  units: TeslaUnits
  isDemoData: boolean
}) {
  const { label: stateLabel, color: stateColor } = deriveStateLabel(v)
  const showChargeLine =
    v.charging && (v.chargerPowerKw ?? 0) > 0
  const showEta = v.charging && v.minutesToFullCharge != null && v.minutesToFullCharge > 0
  return (
    <div
      className="flex flex-col rounded-xl border p-4 shadow-[var(--shadow-sm)]"
      style={CARD_BORDER}
      aria-label={`Vehicle ${v.displayName}, ${stateLabel}, ${v.batteryPercent}% battery`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            {v.displayName}
          </h3>
          <p
            className="mt-0.5 font-mono text-[10px] uppercase tracking-wide"
            style={{ color: 'var(--text-3)' }}
          >
            …{vinSuffix(v.vin)} · v{v.softwareVersion}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide"
            style={{ borderColor: stateColor, color: stateColor }}
          >
            <span className="size-1.5 rounded-full" style={{ background: stateColor }} aria-hidden />
            {stateLabel}
          </span>
          {v.locked === false ? (
            <span
              className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wide"
              style={{ color: 'var(--warn)' }}
              aria-label="Vehicle unlocked"
            >
              <Lock className="size-2.5" aria-hidden />
              Unlocked
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <BatteryGauge percent={v.batteryPercent} charging={v.charging} />
        <dl className="min-w-0 flex-1 space-y-1.5 text-[12px]">
          <div className="flex items-center gap-2">
            <Gauge className="size-3.5 shrink-0" aria-hidden style={{ color: 'var(--text-3)' }} />
            <dt className="sr-only">Range</dt>
            <dd className="font-mono font-medium tabular-nums" style={{ color: 'var(--text-1)' }}>
              {formatRangeMiles(v.rangeMiles, units)}
            </dd>
          </div>
          {showChargeLine ? (
            <div className="flex items-center gap-2">
              <Zap className="size-3.5 shrink-0" aria-hidden style={{ color: 'var(--accent)' }} />
              <dt className="sr-only">Charging power</dt>
              <dd className="font-mono tabular-nums" style={{ color: 'var(--accent)' }}>
                {(v.chargerPowerKw ?? 0).toFixed(1)} kW
                {v.chargeLimitPct != null ? (
                  <span className="ml-1" style={{ color: 'var(--text-3)' }}>
                    → {v.chargeLimitPct}%
                  </span>
                ) : null}
              </dd>
            </div>
          ) : null}
          {v.interiorTempF != null ? (
            <div className="flex items-center gap-2">
              <Thermometer className="size-3.5 shrink-0" aria-hidden style={{ color: 'var(--text-3)' }} />
              <dt className="sr-only">Cabin temperature</dt>
              <dd className="font-mono tabular-nums" style={{ color: 'var(--text-2)' }}>
                {Math.round(v.interiorTempF)}°F
                {v.outsideTempF != null ? (
                  <span className="ml-1" style={{ color: 'var(--text-4)' }}>
                    · {Math.round(v.outsideTempF)}° out
                  </span>
                ) : null}
              </dd>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <Activity className="size-3.5 shrink-0" aria-hidden style={{ color: 'var(--text-3)' }} />
            <dt className="sr-only">Odometer</dt>
            <dd className="font-mono tabular-nums" style={{ color: 'var(--text-2)' }}>
              {formatMiles(v.odometerMiles, units)} total
            </dd>
          </div>
        </dl>
      </div>

      {showEta ? (
        <p
          className="mt-3 font-mono text-[10px]"
          style={{ color: 'var(--text-2)' }}
        >
          {formatMinutesToEta(v.minutesToFullCharge as number)}
        </p>
      ) : null}

      {isDemoData ? (
        <p
          className="mt-3 font-mono text-[9px] uppercase tracking-wide"
          style={{ color: 'var(--text-4)' }}
        >
          Demo data
        </p>
      ) : null}
    </div>
  )
}

function VehicleHeroGrid({
  vehicles,
  units,
  isDemoData,
}: {
  vehicles: TeslaVehicleRow[]
  units: TeslaUnits
  isDemoData: boolean
}) {
  if (!vehicles.length) return null
  return (
    <section className="space-y-3" aria-labelledby="tesla-vehicles-hero">
      <header className="flex items-center justify-between">
        <h2
          id="tesla-vehicles-hero"
          className="text-sm font-semibold tracking-tight"
          style={{ color: 'var(--text-1)' }}
        >
          Vehicles
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
          {vehicles.length} vehicle{vehicles.length === 1 ? '' : 's'}
        </span>
      </header>
      <div className="grid grid-cols-1 gap-[var(--grid-gap)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {vehicles.map(v => (
          <VehicleHeroCard key={v.vin} v={v} units={units} isDemoData={isDemoData} />
        ))}
      </div>
    </section>
  )
}

// Per-vehicle hero card + REST-command UI was removed when the user opted into
// read-only Tesla data only. The new `TeslaFleetMap` (Apple-style topo view)
// replaces it for single-vehicle accounts; multi-vehicle accounts fall back to
// `VehicleHeroGrid` above. The /api/tesla/command BFF endpoint is still wired
// — flip the user preference and re-add a UI consumer when needed.

export type TeslaFleetVisualsProps = {
  loading: boolean
  isDemoData: boolean
  status: TeslaFleetDataStatus
  liveFallbackToDemo: boolean
  lastError: string | null
  /** When BFF returns `needs_authorization`, open in a new tab to complete OAuth. */
  authorizeUrl: string | null
  units: TeslaUnits
  vehicles: TeslaVehicleRow[]
  kpis: TeslaKpis
  charging: TeslaChargingSession[]
  telemetry: TeslaTelemetryEvent[]
  socSeriesByVehicle: TeslaSocSeries[]
  lastTripRoute: { lat: number; lng: number }[]
}

export function TeslaFleetVisuals(props: TeslaFleetVisualsProps) {
  const {
    loading,
    isDemoData,
    status,
    liveFallbackToDemo,
    lastError,
    authorizeUrl,
    units,
    vehicles,
    kpis,
    charging,
    telemetry,
    socSeriesByVehicle,
    lastTripRoute,
  } = props

  const [expandedVin, setExpandedVin] = useState<string | null>(null)
  const [sessionPick, setSessionPick] = useState<string | null>(null)

  if (loading) {
    return <LoadingState label="Syncing fleet…" />
  }

  const showLegacyDemoBanner = isDemoData && status !== 'needs_authorization' && status !== 'error'

  return (
    <div className="space-y-[var(--grid-gap)]">
      {status === 'needs_authorization' && authorizeUrl ? (
        <div
          className="rounded-xl border p-4 shadow-[var(--shadow-sm)]"
          style={{ borderColor: 'var(--accent)', background: 'color-mix(in oklab, var(--accent) 8%, var(--bg-card))' }}
        >
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            Connect Tesla
          </h3>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
            After connecting, Tesla redirects to the dev callback with a code. The dashboard saves your refresh token to
            scratch storage. Then refresh this page.
          </p>
          <a
            href={authorizeUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:opacity-95"
            style={{ background: 'var(--accent)' }}
          >
            Connect Tesla
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
      ) : null}

      {status === 'error' && lastError ? (
        <div className="rounded-xl border shadow-[var(--shadow-sm)]" style={{ borderColor: 'var(--border-strong)', background: 'var(--bg-card)' }}>
          <ErrorState title="Tesla Fleet error" message={lastError} />
        </div>
      ) : null}

      {showLegacyDemoBanner && (
        <div
          className="flex flex-wrap items-start gap-2 rounded-xl border px-4 py-3 font-mono text-[11px] leading-relaxed shadow-[var(--shadow-sm)]"
          style={{
            borderColor: 'var(--border-strong)',
            background: 'var(--bg-card-soft)',
            color: 'var(--text-2)',
          }}
        >
          <Activity className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--accent)' }} aria-hidden />
          <div>
            <p className="font-semibold uppercase tracking-wide" style={{ color: 'var(--text-1)' }}>
              {liveFallbackToDemo ? 'Live fleet unavailable' : status === 'no-credentials' ? 'Credentials incomplete' : 'DEMO'}
            </p>
            <p className="mt-1">
              {liveFallbackToDemo
                ? lastError ?? 'BFF did not return live Fleet JSON. Showing illustrative series until GET /api/tesla/fleet is wired.'
                : status === 'no-credentials'
                  ? 'Add both Tesla Fleet client ID and client secret above to attempt a live BFF pull (demo shapes shown meanwhile).'
                  : 'Demo charts are on, or live data is unavailable — metrics below are labeled DEMO where noted.'}
            </p>
          </div>
        </div>
      )}

      {vehicles.length === 1 ? (
        <TeslaFleetMap v={vehicles[0]!} units={units} isDemoData={isDemoData} />
      ) : (
        <VehicleHeroGrid vehicles={vehicles} units={units} isDemoData={isDemoData} />
      )}

      <div className="grid grid-cols-12 gap-[var(--grid-gap)]">
        {vehicles.length > 1 ? <FleetKpiStrip kpis={kpis} units={units} /> : null}

        {vehicles.length > 1 ? (
        <div className="col-span-12 lg:col-span-7">
          <div className="rounded-xl shadow-[var(--shadow-sm)]" style={CARD_BORDER}>
            <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border-soft)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                Fleet vehicles
              </h3>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                {isDemoData ? 'DEMO roster' : 'Live roster'} · {vehicles.length} vehicle{vehicles.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className="max-h-[min(420px,55vh)] overflow-y-auto">
              {vehicles.map(v => {
                const open = expandedVin === v.vin
                return (
                  <div key={v.vin} className="border-b last:border-b-0" style={{ borderColor: 'var(--border-soft)' }}>
                    <button
                      type="button"
                      onClick={() => setExpandedVin(open ? null : v.vin)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[color:var(--bg-hover)]"
                      style={{ background: 'transparent' }}
                    >
                      <ChevronRight
                        className={`size-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
                        style={{ color: 'var(--text-3)' }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium" style={{ color: 'var(--text-1)' }}>
                            {v.displayName}
                          </span>
                          <span className="font-mono text-[10px] tabular-nums" style={{ color: 'var(--text-4)' }}>
                            …{vinSuffix(v.vin)}
                          </span>
                          <span
                            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide"
                            style={{
                              borderColor: 'var(--border-soft)',
                              color: 'var(--text-2)',
                            }}
                          >
                            <span
                              className="size-1.5 rounded-full"
                              style={{ background: v.online ? '#22c55e' : '#ef4444' }}
                              aria-hidden
                            />
                            {v.online ? 'Online' : 'Offline'}
                          </span>
                          {v.charging ? (
                            <span className="font-mono text-[9px] uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
                              Charging
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full" style={{ background: 'var(--bg-muted)' }}>
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${clampPct(v.batteryPercent)}%`, background: 'var(--accent)' }}
                            />
                          </div>
                          <span className="font-mono text-[10px] tabular-nums" style={{ color: 'var(--text-3)' }}>
                            {v.batteryPercent}% · {formatRangeMiles(v.rangeMiles, units)}
                          </span>
                          <span className="font-mono text-[10px] tabular-nums" style={{ color: 'var(--text-4)' }}>
                            SW {v.softwareVersion}
                          </span>
                        </div>
                      </div>
                    </button>
                    {open ? (
                      <div
                        className="border-t px-4 py-3 font-mono text-[10px] leading-relaxed"
                        style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-card-soft)', color: 'var(--text-3)' }}
                      >
                        <p>
                          Interior temp:{' '}
                          {v.interiorTempF != null ? `${v.interiorTempF.toFixed(0)} °F` : '—'} · Odometer:{' '}
                          {formatMiles(v.odometerMiles, units)}
                        </p>
                        <p className="mt-1">
                          Last known: {v.lat.toFixed(3)}, {v.lng.toFixed(3)}
                        </p>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        ) : null}

        <div className={vehicles.length === 1 ? 'col-span-12' : 'col-span-12 lg:col-span-5'}>
          <SocMultiChart series={socSeriesByVehicle} />
        </div>

        <div className="col-span-12">
          <TripMapSketch route={lastTripRoute} isDemo={isDemoData} />
        </div>

        <div className="col-span-12">
          <ChargingTimeline
            vehicles={vehicles}
            sessions={charging}
            onSelect={setSessionPick}
            selectedId={sessionPick}
          />
        </div>

        <div className="col-span-12">
          <TelemetryPanel events={telemetry} />
        </div>
      </div>
    </div>
  )
}

function clampPct(n: number): number {
  return Math.min(100, Math.max(0, n))
}
