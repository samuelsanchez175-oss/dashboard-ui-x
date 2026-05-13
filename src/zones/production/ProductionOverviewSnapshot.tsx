import { Grid2X2, TrendingUp } from 'lucide-react'
import { MockDataToggle } from '../../components/MockDataToggle'
import { useMockData } from '../../context/MockDataContext'
import { SURFACES } from '../../lib/design-tokens'

function StatCard({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div
      className="rounded-xl p-5"
      style={SURFACES.cardStyle}
    >
      <p
        className="text-xs uppercase tracking-wider font-medium"
        style={{ color: 'var(--text-3)' }}
      >
        {title}
      </p>
      <p
        className="text-2xl font-semibold mt-2 tabular-nums"
        style={{ color: 'var(--text-1)' }}
      >
        {value}
      </p>
      {hint && (
        <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>
          {hint}
        </p>
      )}
    </div>
  )
}

/**
 * High-level production metrics + mock toggle — shown at the top of Agent Farm’s Overview tab
 * (replaces the former standalone Production overview route).
 */
export default function ProductionOverviewSnapshot() {
  const { mockDataEnabled } = useMockData()

  return (
    <div
      className="rounded-xl border p-6 space-y-6"
      style={{
        borderColor: 'var(--border-strong)',
        background: 'var(--bg-card)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2
            className="text-sm font-semibold tracking-tight flex items-center gap-2"
            style={{ color: 'var(--text-1)' }}
          >
            <Grid2X2 className="size-4 shrink-0" style={{ color: 'var(--text-2)' }} aria-hidden />
            Production snapshot
          </h2>
          <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
            High-level snapshot — swap with live metrics when APIs are wired.
          </p>
        </div>
        <MockDataToggle variant="light" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Ship cadence"
          value={mockDataEnabled ? '3 / wk' : '—'}
          hint={
            mockDataEnabled
              ? 'Target: steady releases'
              : 'Sample values hidden — turn Mock data on for placeholders.'
          }
        />
        <StatCard
          title="Open incidents"
          value={mockDataEnabled ? '0' : '—'}
          hint={
            mockDataEnabled
              ? 'Placeholder health strip'
              : 'Connect monitoring for real incident counts.'
          }
        />
        <StatCard
          title="Focus"
          value={mockDataEnabled ? 'Vocals → Mix' : '—'}
          hint={
            mockDataEnabled
              ? 'Navigation matches zone order'
              : 'Define focus when wiring production APIs.'
          }
        />
      </div>

      <p className="text-xs flex items-start gap-2" style={{ color: 'var(--text-2)' }}>
        <TrendingUp className="size-4 shrink-0 mt-0.5" style={{ color: 'var(--text-3)' }} aria-hidden />
        Revenue and strategy tiles in other Agent Farm tabs will eventually mirror your real data sources.
      </p>
    </div>
  )
}
