import { MapPin } from 'lucide-react'
import type { ReactNode } from 'react'
import { useId, useMemo } from 'react'

import {
  buildTripDirectionsEmbedUrl,
  getGoogleMapsEmbedApiKey,
  routeToSvgPathD,
  routeToSvgPoints,
} from '../../lib/google-maps-trips'
import {
  MOCK_DRIVE_SCORE_SERIES,
  MOCK_HOME_CHARGE_KWH_WEEK,
  MOCK_SOC_BY_HOUR,
  MOCK_TRIP_ENERGY,
  MOCK_TRIP_POLYLINE,
  WEEKDAY_LABELS,
} from './tesla-mock-series'

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  )
}

export function BatterySocChart() {
  const { points, d } = useMemo(() => {
    const minSoc = Math.min(...MOCK_SOC_BY_HOUR.map(x => x.soc))
    const maxSoc = Math.max(...MOCK_SOC_BY_HOUR.map(x => x.soc))
    const pad = 8
    const W = 360
    const H = 128
    const w = W - pad * 2
    const h = H - pad * 2
    const span = Math.max(maxSoc - minSoc, 1e-6)
    const pts = MOCK_SOC_BY_HOUR.map((row, i) => {
      const x = pad + (i / (MOCK_SOC_BY_HOUR.length - 1)) * w
      const y = pad + (1 - (row.soc - minSoc) / span) * h
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    const pathD = `M ${pts.join(' L ')}`
    return { points: MOCK_SOC_BY_HOUR, d: pathD }
  }, [])

  return (
    <ChartCard title="Battery SOC (24h sample)" subtitle="Fleet Telemetry or charge logs would replace synthetic hourly samples.">
      <div className="relative">
        <svg viewBox="0 0 360 128" className="h-auto max-h-40 w-full text-violet-600" aria-hidden>
          <defs>
            <linearGradient id="tesla-soc-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(139 92 246 / 0.35)" />
              <stop offset="100%" stopColor="rgb(139 92 246 / 0.02)" />
            </linearGradient>
          </defs>
          <line x1="8" y1="112" x2="352" y2="112" stroke="rgb(229 231 235)" strokeWidth="1" />
          <path d={`${d} L 352 112 L 8 112 Z`} fill="url(#tesla-soc-fill)" />
          <path d={d} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="mt-2 flex justify-between text-[10px] font-medium uppercase tracking-wide text-gray-400">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>Now</span>
        </div>
        <p className="mt-2 text-xs text-gray-600">
          Range{' '}
          <span className="font-semibold tabular-nums text-gray-900">
            {Math.min(...points.map(p => p.soc)).toFixed(0)}–{Math.max(...points.map(p => p.soc)).toFixed(0)}%
          </span>{' '}
          sample window.
        </p>
      </div>
    </ChartCard>
  )
}

export function WeeklyHomeChargingChart() {
  const maxKwh = Math.max(...MOCK_HOME_CHARGE_KWH_WEEK, 1)
  return (
    <ChartCard
      title="Home charging energy"
      subtitle="kWh per weekday (sample) — utility-style weekly buckets."
    >
      <div className="flex h-36 items-end justify-between gap-2 px-1">
        {MOCK_HOME_CHARGE_KWH_WEEK.map((kwh, i) => (
          <div key={WEEKDAY_LABELS[i]} className="flex flex-1 flex-col items-center gap-2">
            <div className="relative flex w-full flex-1 items-end justify-center">
              <div
                className="w-[72%] rounded-t-md bg-gradient-to-t from-emerald-700/90 to-emerald-500/80 transition-all"
                style={{ height: `${(kwh / maxKwh) * 100}%`, minHeight: kwh > 0 ? 10 : 4 }}
                title={`${WEEKDAY_LABELS[i]}: ${kwh} kWh`}
              />
            </div>
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{WEEKDAY_LABELS[i]}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-600">
        Total week (sample):{' '}
        <span className="font-semibold tabular-nums text-gray-900">
          {MOCK_HOME_CHARGE_KWH_WEEK.reduce((a, b) => a + b, 0).toFixed(1)} kWh
        </span>
      </p>
    </ChartCard>
  )
}

export function TripEnergySplitDiagram() {
  const total = MOCK_TRIP_ENERGY.motiveKwh + MOCK_TRIP_ENERGY.regenKwh + MOCK_TRIP_ENERGY.preconditionKwh
  const seg = [
    { label: 'Propulsion', kwh: MOCK_TRIP_ENERGY.motiveKwh, className: 'bg-slate-700' },
    { label: 'Regen captured', kwh: MOCK_TRIP_ENERGY.regenKwh, className: 'bg-teal-500' },
    { label: 'Climate / precon.', kwh: MOCK_TRIP_ENERGY.preconditionKwh, className: 'bg-sky-500' },
  ] as const

  return (
    <ChartCard title="Last trip energy flow (sample)" subtitle="Trip diagnostics often expose motive vs regen vs HVAC overhead.">
      <div className="flex h-10 w-full overflow-hidden rounded-lg ring-1 ring-gray-200">
        {seg.map(s => (
          <div
            key={s.label}
            className={`${s.className} flex items-center justify-center text-[10px] font-semibold text-white`}
            style={{ width: `${(s.kwh / total) * 100}%` }}
            title={`${s.label}: ${s.kwh.toFixed(2)} kWh`}
          >
            {s.kwh >= 0.35 ? `${s.kwh.toFixed(1)}` : ''}
          </div>
        ))}
      </div>
      <ul className="mt-4 grid gap-2 text-xs text-gray-600 sm:grid-cols-3">
        {seg.map(s => (
          <li key={s.label} className="flex items-center gap-2">
            <span className={`inline-block size-2.5 shrink-0 rounded-sm ${s.className}`} aria-hidden />
            <span>
              <span className="font-medium text-gray-800">{s.label}</span>{' '}
              <span className="tabular-nums text-gray-600">{s.kwh.toFixed(2)} kWh</span>
            </span>
          </li>
        ))}
      </ul>
    </ChartCard>
  )
}

export function DriveScoreTrendChart() {
  const max = Math.max(...MOCK_DRIVE_SCORE_SERIES)
  const min = Math.min(...MOCK_DRIVE_SCORE_SERIES)
  const pad = 10
  const W = 280
  const H = 96
  const w = W - pad * 2
  const h = H - pad * 2
  const span = Math.max(max - min, 1)
  const d = MOCK_DRIVE_SCORE_SERIES.map((score, i) => {
    const x = pad + (i / (MOCK_DRIVE_SCORE_SERIES.length - 1)) * w
    const y = pad + (1 - (score - min) / span) * h
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')

  return (
    <ChartCard title="Drive score trend" subtitle="Seven-day sample spark — scoring APIs vary by region / partner.">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto max-h-28 w-full text-amber-600" aria-hidden>
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {MOCK_DRIVE_SCORE_SERIES.map((score, i) => {
          const x = pad + (i / (MOCK_DRIVE_SCORE_SERIES.length - 1)) * w
          const y = pad + (1 - (score - min) / span) * h
          return <circle key={i} cx={x} cy={y} r={3.5} className="fill-white stroke-current" strokeWidth={2} />
        })}
      </svg>
      <p className="mt-2 text-xs text-gray-600">
        Latest (sample):{' '}
        <span className="font-semibold tabular-nums text-gray-900">{MOCK_DRIVE_SCORE_SERIES.at(-1)}</span>
      </p>
    </ChartCard>
  )
}

/** Offline preview styled like Google Maps Web (terrain tint, #4285F4 route, markers). */
function GoogleMapsFallbackRoute({
  svgPath,
  svgPts,
}: {
  svgPath: string
  svgPts: { x: number; y: number }[]
}) {
  const uid = useId().replace(/:/g, '')
  const clipId = `tesla-map-clip-${uid}`
  const filterId = `tesla-route-glow-${uid}`
  const GOOGLE_BLUE = '#4285F4'
  const START_GREEN = '#34A853'
  const END_RED = '#EA4335'
  const MAP_BASE = '#e8e4df'
  const MAP_GRID = '#dad6d0'
  const WATER = '#a8c8e0'

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-[#f8f9fa] shadow-[0_1px_3px_rgba(60,64,67,0.22)]">
      <div className="relative aspect-[320/200] w-full max-h-[280px]">
        <svg viewBox="0 0 320 200" className="absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <clipPath id={clipId}>
              <rect width="320" height="200" rx="2" />
            </clipPath>
            <filter id={filterId} x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#3c4043" floodOpacity="0.22" />
            </filter>
          </defs>

          <g clipPath={`url(#${clipId})`}>
            <rect width="320" height="200" fill={MAP_BASE} />
            <ellipse cx="258" cy="36" rx="88" ry="52" fill={WATER} opacity={0.42} />
            <ellipse cx="28" cy="168" rx="64" ry="38" fill={WATER} opacity={0.36} />
            <ellipse cx="180" cy="190" rx="100" ry="28" fill={WATER} opacity={0.22} />

            {Array.from({ length: 11 }, (_, i) => (
              <line
                key={`gv-${i}`}
                x1={i * 32}
                y1={0}
                x2={i * 32}
                y2={200}
                stroke={MAP_GRID}
                strokeWidth={0.9}
                opacity={0.55}
              />
            ))}
            {Array.from({ length: 7 }, (_, i) => (
              <line
                key={`gh-${i}`}
                x1={0}
                y1={i * 32}
                x2={320}
                y2={i * 32}
                stroke={MAP_GRID}
                strokeWidth={0.9}
                opacity={0.55}
              />
            ))}

            <path
              d="M -20 108 C 40 104 90 118 140 108 S 260 98 340 104"
              fill="none"
              stroke="#ffffff"
              strokeWidth={10}
              strokeOpacity={0.55}
              strokeLinecap="round"
            />
            <path
              d="M 20 44 Q 120 52 200 36 T 300 28"
              fill="none"
              stroke="#f1f3f4"
              strokeWidth={7}
              strokeOpacity={0.65}
              strokeLinecap="round"
            />
            <path
              d="M 0 168 Q 100 158 200 172 Q 260 178 330 162"
              fill="none"
              stroke="#ffffff"
              strokeWidth={9}
              strokeOpacity={0.45}
              strokeLinecap="round"
            />

            <path
              d={svgPath}
              fill="none"
              stroke="#ffffff"
              strokeWidth={11}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.92}
            />
            <path
              d={svgPath}
              fill="none"
              stroke={GOOGLE_BLUE}
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter={`url(#${filterId})`}
            />

            {svgPts.map((p, i) => {
              const isStart = i === 0
              const isEnd = i === svgPts.length - 1
              if (isStart) {
                return (
                  <g key={`m-${i}`} transform={`translate(${p.x}, ${p.y - 18})`}>
                    <circle cx="0" cy="-17" r="12" fill={START_GREEN} stroke="#fff" strokeWidth={2.2} />
                    <circle cx="0" cy="-17" r="4" fill="#fff" />
                    <path
                      d="M0,-7 L-10,10 Q0,18 10,10 Z"
                      fill={START_GREEN}
                      stroke="#fff"
                      strokeWidth={1.8}
                      strokeLinejoin="round"
                    />
                  </g>
                )
              }
              if (isEnd) {
                return (
                  <g key={`m-${i}`} transform={`translate(${p.x}, ${p.y - 18})`}>
                    <circle cx="0" cy="-17" r="12" fill={END_RED} stroke="#fff" strokeWidth={2.2} />
                    <circle cx="0" cy="-17" r="4" fill="#fff" />
                    <path
                      d="M0,-7 L-10,10 Q0,18 10,10 Z"
                      fill={END_RED}
                      stroke="#fff"
                      strokeWidth={1.8}
                      strokeLinejoin="round"
                    />
                  </g>
                )
              }
              return (
                <circle
                  key={`m-${i}`}
                  cx={p.x}
                  cy={p.y}
                  r={3.5}
                  fill="#fff"
                  stroke={GOOGLE_BLUE}
                  strokeWidth={2}
                />
              )
            })}
          </g>
        </svg>
      </div>

      <div className="flex items-center gap-2 border-t border-gray-200 bg-white px-3 py-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded bg-[#4285F4] text-[10px] font-bold text-white">
          G
        </span>
        <p className="text-[11px] leading-snug text-gray-600">
          Static preview using Maps colors & route styling. Add{' '}
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[10px] text-gray-800">
            VITE_GOOGLE_MAPS_EMBED_API_KEY
          </code>{' '}
          for live Google tiles (Maps Embed API · HTTP referrer restricted key).
        </p>
      </div>
    </div>
  )
}

export function TripRouteMapPreview() {
  const apiKey = useMemo(() => getGoogleMapsEmbedApiKey(), [])
  const embedUrl = useMemo(
    () => (apiKey ? buildTripDirectionsEmbedUrl({ apiKey, route: MOCK_TRIP_POLYLINE }) : null),
    [apiKey],
  )
  const svgPath = useMemo(() => routeToSvgPathD(MOCK_TRIP_POLYLINE, 320, 200), [])
  const svgPts = useMemo(() => routeToSvgPoints(MOCK_TRIP_POLYLINE, 320, 200), [])

  return (
    <ChartCard
      title="Trip route preview"
      subtitle="Live Google Maps directions embed with API key; offline preview matches Maps web styling."
    >
      {embedUrl ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50 shadow-[0_1px_3px_rgba(60,64,67,0.22)]">
          <iframe
            title="Mock trip — Google Maps directions"
            src={embedUrl}
            className="h-[260px] w-full border-0"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
          <p className="flex items-center gap-1.5 border-t border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-600">
            <MapPin className="size-3.5 shrink-0 text-[#4285F4]" aria-hidden />
            Live Google Maps embed — swap polyline with Fleet trip data when connected.
          </p>
        </div>
      ) : (
        <GoogleMapsFallbackRoute svgPath={svgPath} svgPts={svgPts} />
      )}
    </ChartCard>
  )
}
