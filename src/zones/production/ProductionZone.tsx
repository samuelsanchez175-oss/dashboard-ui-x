import { Cpu, Grid2X2, TrendingUp } from 'lucide-react'
import { MockDataToggle } from '../../components/MockDataToggle'
import { useMockData } from '../../context/MockDataContext'

function Card({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        background:   'var(--bg-card)',
        border:       '1px solid var(--border)',
        boxShadow:    'var(--shadow-sm)',
      }}
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

export default function ProductionZone() {
  const { mockDataEnabled } = useMockData()

  return (
    <div
      className="flex-1 overflow-auto"
      style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}
    >
      <div className="max-w-5xl mx-auto p-8 space-y-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1
              className="text-xl font-semibold tracking-tight flex items-center gap-2"
              style={{ color: 'var(--text-1)' }}
            >
              <Grid2X2 className="size-5" style={{ color: 'var(--text-2)' }} aria-hidden />
              Production overview
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
              High-level snapshot — swap with live metrics when APIs are wired.
            </p>
          </div>
          <MockDataToggle variant="light" />
        </div>

        {/* Stat cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card
            title="Ship cadence"
            value={mockDataEnabled ? '3 / wk' : '—'}
            hint={
              mockDataEnabled
                ? 'Target: steady releases'
                : 'Sample values hidden — turn Mock data on for placeholders.'
            }
          />
          <Card
            title="Open incidents"
            value={mockDataEnabled ? '0' : '—'}
            hint={
              mockDataEnabled
                ? 'Placeholder health strip'
                : 'Connect monitoring for real incident counts.'
            }
          />
          <Card
            title="Focus"
            value={mockDataEnabled ? 'Vocals → Mix' : '—'}
            hint={
              mockDataEnabled
                ? 'Navigation matches zone order'
                : 'Define focus when wiring production APIs.'
            }
          />
        </div>

        {/* Agent Farm callout */}
        <div
          className="rounded-xl p-6"
          style={{
            background:   'var(--bg-card)',
            border:       '1px dashed var(--border-strong)',
          }}
        >
          <h2
            className="text-sm font-semibold flex items-center gap-2"
            style={{ color: 'var(--text-1)' }}
          >
            <Cpu className="size-4" style={{ color: 'var(--text-2)' }} aria-hidden />
            Agent Farm
          </h2>
          <p className="text-sm mt-2" style={{ color: 'var(--text-2)' }}>
            Open{' '}
            <strong className="font-medium" style={{ color: 'var(--text-1)' }}>
              Agent Farm
            </strong>{' '}
            in the sidebar for the full multi-tab operations view with richer mock data (respects
            the same Mock data toggle).
          </p>
          <p className="text-sm mt-3 flex items-center gap-2" style={{ color: 'var(--text-2)' }}>
            <TrendingUp className="size-4 shrink-0" style={{ color: 'var(--text-3)' }} aria-hidden />
            Revenue and strategy tiles will eventually mirror your real data sources.
          </p>
        </div>
      </div>
    </div>
  )
}
