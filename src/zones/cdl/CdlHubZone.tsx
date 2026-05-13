import { Biohazard, Bus, ChevronRight, Container, Disc, Droplets, Fuel, GraduationCap, School, Workflow } from 'lucide-react'

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

/**
 * Per-tile metadata. `count` reflects the **official NJ MVC** question count
 * for the matching real exam — Hazmat (H) = 30, Tanker (N) = 20, etc. — not
 * the size of the underlying practice bank. Each quiz page also exposes an
 * "Extended (all N questions)" toggle that runs the full bank for drilling.
 *
 * Air Brakes is **core CDL knowledge**, not an endorsement; the eyebrow on
 * its tile says "CORE" instead of an endorsement letter.
 *
 * Combo tiles (X = Tanker+Hazmat, N+T = Tanker+Doubles) are combined-prep
 * decks, not real MVC exams. Their count is a sensible sum of the two
 * official counts and the description calls that out.
 */
const TILES: CdlTile[] = [
  {
    routeId:    'cdl-hazmat',
    label:      'Hazmat (H)',
    desc:       'Hazardous Materials endorsement — placards, shipping papers, leaks, segregation. 30-question NJ MVC test, 80% to pass.',
    count:      30,
    endorse:    'H',
    accent:     '#39ff14',
    accentSoft: 'color-mix(in oklab, #39ff14 12%, var(--bg-card))',
    icon:       Biohazard,
  },
  {
    routeId:    'cdl-air-brakes',
    label:      'Air Brakes',
    desc:       'Core CDL knowledge (not an endorsement) — service / parking / emergency systems, slack adjusters, pressure warnings. 25-question NJ MVC test, 80% to pass.',
    count:      25,
    endorse:    'CORE',
    accent:     '#f0c040',
    accentSoft: 'color-mix(in oklab, #f0c040 14%, var(--bg-card))',
    icon:       Disc,
  },
  {
    routeId:    'cdl-tanker',
    label:      'Tanker (N)',
    desc:       'Liquid surge, outage, baffled vs smooth-bore tanks, rollover physics, loading and unloading. 20-question NJ MVC test, 80% to pass.',
    count:      20,
    endorse:    'N',
    accent:     '#00b8d4',
    accentSoft: 'color-mix(in oklab, #00b8d4 12%, var(--bg-card))',
    icon:       Droplets,
  },
  {
    routeId:    'cdl-doubles-triples',
    label:      'Doubles / Triples (T)',
    desc:       'Coupling, converter dollies, off-tracking, crack-the-whip amplification, brake lag across multiple trailers. 20-question NJ MVC test, 80% to pass.',
    count:      20,
    endorse:    'T',
    accent:     '#ff7b29',
    accentSoft: 'color-mix(in oklab, #ff7b29 13%, var(--bg-card))',
    icon:       Container,
  },
  {
    routeId:    'cdl-tanker-hazmat',
    label:      'Tanker + HazMat (X)',
    desc:       'Combined practice (not an official MVC exam) — N + H drill: cargo-tank specs, bonding/grounding, fuel hauling, vapor recovery, retest dates, placarding. 50 questions, 80% to pass.',
    count:      50,
    endorse:    'X',
    accent:     '#ef4444',
    accentSoft: 'color-mix(in oklab, #ef4444 13%, var(--bg-card))',
    icon:       Fuel,
  },
  {
    routeId:    'cdl-passenger',
    label:      'Passenger (P)',
    desc:       '16+ passenger vehicles — compartment inspection, RR crossings, fueling rules, disruptive passengers, after-trip checks. 20-question NJ MVC test, 80% to pass.',
    count:      20,
    endorse:    'P',
    accent:     '#3b82f6',
    accentSoft: 'color-mix(in oklab, #3b82f6 13%, var(--bg-card))',
    icon:       Bus,
  },
  {
    routeId:    'cdl-school-bus',
    label:      'School Bus (S)',
    desc:       'Danger zones, 10-step crossing procedure, mirror types, evacuation drills, post-trip child check. Requires P. 20-question NJ MVC test, 80% to pass.',
    count:      20,
    endorse:    'S',
    accent:     '#facc15',
    accentSoft: 'color-mix(in oklab, #facc15 13%, var(--bg-card))',
    icon:       School,
  },
  {
    routeId:    'cdl-tanker-doubles',
    label:      'Tanker Doubles / Triples',
    desc:       'Combined practice (not an official MVC exam) — N + T drill: liquid surge × multiple trailers, LCV rules, compounded rollover, vapor recovery across tanks. 40 questions, 80% to pass.',
    count:      40,
    endorse:    'N+T',
    accent:     '#a855f7',
    accentSoft: 'color-mix(in oklab, #a855f7 13%, var(--bg-card))',
    icon:       Workflow,
  },
]

export default function CdlHubZone({ onNavigate }: CdlHubZoneProps) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-auto"
      style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}
    >
      <div className="mx-auto w-full max-w-[1080px] pb-20 pt-10 px-[var(--pad-card)]">
        <div className="mono mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
          <GraduationCap className="size-3.5" aria-hidden />
          CDL practice tests
        </div>
        <h1 className="mb-2 text-[32px] font-semibold leading-tight tracking-tight" style={{ color: 'var(--text-1)' }}>
          CDL PRAC
        </h1>
        <p className="mb-8 max-w-2xl text-sm leading-relaxed" style={{ color: 'var(--text-3)' }}>
          Commercial Driver&apos;s License prep tuned to the official NJ MVC counts — Hazmat 30, Tanker 20, Passenger
          20, School Bus 20, Doubles 20, Air Brakes 25 — all at the same 80% pass bar the state uses. Each set
          randomly samples from a deeper bank, and every quiz screen has an &ldquo;Extended (all questions)&rdquo;
          toggle if you want to drill the full deck. Misses are flagged so you can review just what you got wrong
          before retaking.
        </p>

        <div className="grid gap-[var(--grid-gap)] sm:grid-cols-2">
          {TILES.map(tile => {
            const Icon = tile.icon
            return (
              <button
                key={tile.routeId}
                type="button"
                onClick={() => onNavigate(tile.routeId)}
                className="group flex flex-col items-start gap-[var(--grid-gap)] rounded-2xl p-[var(--pad-card)] text-left transition hover:-translate-y-px"
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
                    style={{ background: tile.accent, color: '#000', boxShadow: `0 10px 24px -10px ${tile.accent}80` }}
                    aria-hidden
                  >
                    <Icon className="size-6" strokeWidth={2} />
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
                    <ChevronRight className="size-3.5" strokeWidth={2} aria-hidden />
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
