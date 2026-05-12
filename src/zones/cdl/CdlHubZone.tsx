import { Biohazard, Bus, ChevronRight, Container, Disc, Droplets, Fuel, GraduationCap, School, Workflow } from 'lucide-react'
import { SectionHeader } from '../../components/ui'
import { zoneAccent } from '../../styles/tokens'

interface CdlHubZoneProps {
  onNavigate: (routeId: string) => void
}

interface CdlTile {
  routeId:  string
  label:    string
  desc:     string
  count:    number
  endorse:  string
  accent:   string
  accentSoft: string
  icon:     typeof Biohazard
}

const TILES: CdlTile[] = [
  {
    routeId:    'cdl-hazmat',
    label:      'Hazmat (H)',
    desc:       'Hazardous Materials endorsement — placards, shipping papers, leaks, segregation. 66 questions.',
    count:      66,
    endorse:    'H',
    accent:     zoneAccent.hazmat,
    accentSoft: `color-mix(in oklab, ${zoneAccent.hazmat} 12%, var(--bg-card))`,
    icon:       Biohazard,
  },
  {
    routeId:    'cdl-air-brakes',
    label:      'Air Brakes',
    desc:       'Service / parking / emergency systems, slack adjusters, pressure warnings. 66 questions.',
    count:      66,
    endorse:    'AB',
    accent:     zoneAccent.airBrakes,
    accentSoft: `color-mix(in oklab, ${zoneAccent.airBrakes} 14%, var(--bg-card))`,
    icon:       Disc,
  },
  {
    routeId:    'cdl-tanker',
    label:      'Tanker (N)',
    desc:       'Liquid surge, outage, baffled vs smooth-bore tanks, rollover physics, loading and unloading. 66 questions.',
    count:      66,
    endorse:    'N',
    accent:     zoneAccent.tanker,
    accentSoft: `color-mix(in oklab, ${zoneAccent.tanker} 12%, var(--bg-card))`,
    icon:       Droplets,
  },
  {
    routeId:    'cdl-doubles-triples',
    label:      'Doubles / Triples (T)',
    desc:       'Coupling, converter dollies, off-tracking, crack-the-whip amplification, brake lag across multiple trailers. 66 questions.',
    count:      66,
    endorse:    'T',
    accent:     zoneAccent.doubles,
    accentSoft: `color-mix(in oklab, ${zoneAccent.doubles} 13%, var(--bg-card))`,
    icon:       Container,
  },
  {
    routeId:    'cdl-tanker-hazmat',
    label:      'Tanker + HazMat (X)',
    desc:       'Combination N + H — cargo-tank specs, bonding/grounding, fuel hauling, vapor recovery, retest dates, placarding. 66 questions.',
    count:      66,
    endorse:    'X',
    accent:     zoneAccent.tankerHazmat,
    accentSoft: `color-mix(in oklab, ${zoneAccent.tankerHazmat} 13%, var(--bg-card))`,
    icon:       Fuel,
  },
  {
    routeId:    'cdl-passenger',
    label:      'Passenger (P)',
    desc:       '16+ passenger vehicles — compartment inspection, RR crossings, fueling rules, disruptive passengers, after-trip checks. 66 questions.',
    count:      66,
    endorse:    'P',
    accent:     zoneAccent.passenger,
    accentSoft: `color-mix(in oklab, ${zoneAccent.passenger} 13%, var(--bg-card))`,
    icon:       Bus,
  },
  {
    routeId:    'cdl-school-bus',
    label:      'School Bus (S)',
    desc:       'Danger zones, 10-step crossing procedure, mirror types, evacuation drills, post-trip child check. Requires P. 66 questions.',
    count:      66,
    endorse:    'S',
    accent:     zoneAccent.schoolBus,
    accentSoft: `color-mix(in oklab, ${zoneAccent.schoolBus} 13%, var(--bg-card))`,
    icon:       School,
  },
  {
    routeId:    'cdl-tanker-doubles',
    label:      'Tanker Doubles / Triples',
    desc:       'Bonus combo — liquid surge × multiple trailers, LCV rules, compounded rollover, vapor recovery across tanks. 66 questions.',
    count:      66,
    endorse:    'N+T',
    accent:     zoneAccent.combination,
    accentSoft: `color-mix(in oklab, ${zoneAccent.combination} 13%, var(--bg-card))`,
    icon:       Workflow,
  },
]

export default function CdlHubZone({ onNavigate }: CdlHubZoneProps) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-auto"
      style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}
    >
      <div className="mx-auto w-full max-w-[1080px] px-8 pb-20 pt-10">
        <SectionHeader
          size="sm"
          className="mb-2"
        >
          <span className="inline-flex items-center gap-2">
            <GraduationCap className="size-4" aria-hidden />
            CDL practice tests
          </span>
        </SectionHeader>
        <h1 className="mb-2 text-[32px] font-semibold leading-tight tracking-tight" style={{ color: 'var(--text-1)' }}>
          CDL PRAC
        </h1>
        <p className="mb-8 max-w-2xl text-sm leading-relaxed" style={{ color: 'var(--text-3)' }}>
          Commercial Driver&apos;s License endorsement prep — pick a quiz to drill against the same 80% pass threshold the
          state exam uses. Each set tracks your answers, highlights misses, and lets you review just the questions you
          got wrong before retaking.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {TILES.map(tile => {
            const Icon = tile.icon
            return (
              <button
                key={tile.routeId}
                type="button"
                onClick={() => onNavigate(tile.routeId)}
                className="group flex flex-col items-start gap-4 rounded-2xl p-6 text-left transition hover:-translate-y-px"
                style={{
                  background: tile.accentSoft,
                  border:     '1px solid var(--border)',
                  boxShadow:  'var(--shadow-sm)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = tile.accent }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
              >
                <div className="flex w-full items-start justify-between gap-3">
                  <div
                    className="grid size-12 shrink-0 place-items-center rounded-xl shadow-lg"
                    style={{
                      background: tile.accent,
                      color:      '#000',
                      boxShadow:  `0 10px 24px -10px color-mix(in oklab, ${tile.accent} 50%, transparent)`,
                    }}
                    aria-hidden
                  >
                    <Icon className="size-5" strokeWidth={2} />
                  </div>
                  <span
                    className="mono rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{ background: 'var(--bg-muted)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
                  >
                    {tile.endorse}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="mb-1 text-[18px] font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>
                    {tile.label}
                  </div>
                  <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-3)' }}>{tile.desc}</p>
                </div>
                <div className="flex w-full items-center justify-between pt-1">
                  <span className="mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-4)' }}>
                    {tile.count} questions · 80% to pass
                  </span>
                  <span
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition"
                    style={{ background: 'var(--text-1)', color: 'var(--bg-canvas)' }}
                  >
                    Open
                    <ChevronRight className="size-4" strokeWidth={2} aria-hidden />
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
