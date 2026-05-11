import { Car, Gauge, Zap } from 'lucide-react'
import { MockDataToggle } from '../../components/MockDataToggle'
import { useMockData } from '../../context/MockDataContext'
import { TeslaFleetGroundTruthChecklist } from './TeslaFleetGroundTruth'
import {
  BatterySocChart,
  DriveScoreTrendChart,
  TripEnergySplitDiagram,
  TripRouteMapPreview,
  WeeklyHomeChargingChart,
} from './TeslaMockVisuals'

function Card({
  title,
  value,
  sub,
  icon: Icon,
}: {
  title: string
  value: string
  sub?: string
  icon: typeof Car
}) {
  return (
    <div className="flex gap-4 rounded-xl border border-gray-200 bg-gray-50/80 p-5 shadow-sm">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white">
        <Icon className="size-5 text-gray-700" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{title}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{value}</p>
        {sub ? <p className="mt-1 text-xs text-gray-500">{sub}</p> : null}
      </div>
    </div>
  )
}

export default function TeslaMock() {
  const { mockDataEnabled } = useMockData()

  return (
    <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}>
      <div className="mx-auto max-w-5xl space-y-8 p-8 pb-16">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <Car className="size-5 text-gray-700" aria-hidden />
              Tesla (mock)
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Charts mirror shapes Fleet Telemetry / vehicle polling returns — swap mock series for live ingestion when connected.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700">
              Not connected
            </span>
            <MockDataToggle variant="light" />
          </div>
        </div>

        {mockDataEnabled ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Card icon={Gauge} title="Odometer" value="12,480 mi" sub="Rolling mock reading" />
              <Card icon={Zap} title="Battery" value="78%" sub="~182 mi est. range" />
              <Card icon={Car} title="Drive score" value="94" sub="Last 7 days (mock)" />
            </div>

            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-600">
              <p className="font-medium text-gray-800">Usage snapshot</p>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>Last trip: 14.2 mi, 3.2 kWh (mock)</li>
                <li>Home charging sessions this week: 4 (mock)</li>
                <li>Supercharging: $0.00 (placeholder)</li>
              </ul>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <BatterySocChart />
              <WeeklyHomeChargingChart />
              <TripEnergySplitDiagram />
              <DriveScoreTrendChart />
            </div>

            <TripRouteMapPreview />
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/80 px-6 py-14 text-center text-sm text-gray-600">
            <p className="font-medium text-gray-800">Mock data is off</p>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-gray-500">
              Tesla visuals are hidden. Turn <strong className="text-gray-700">Mock data</strong> on (toggle above or on Production overview)
              to see sample charts and trip map again.
            </p>
          </div>
        )}

        <TeslaFleetGroundTruthChecklist />
      </div>
    </div>
  )
}
