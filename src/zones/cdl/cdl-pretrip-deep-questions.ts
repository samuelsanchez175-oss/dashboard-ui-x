/**
 * NJ MVC CDL Class A — Outside Pre-Trip — Deep Dive question bank.
 *
 * 38 image-first multiple-choice questions backed by the ChatGPT close-up
 * photos in `public/cdl-pretrip-deep/`. Each question shows the photo
 * above the prompt and asks: "What does the inspector say about the
 * highlighted part?" — the user picks the correct verbal inspection
 * statement from three options.
 *
 * Distractors are real inspection statements from OTHER parts in the same
 * section, so picking the right answer requires actually recognising the
 * part — not just matching by elimination. Pre-trip mode in CdlQuiz runs
 * the bank sequentially (Engine 1-11, Cabin 1-11, Trailer 1-16) so the
 * test walks through the whole pre-trip in inspection order.
 */

import type { CdlQuestion } from './cdl-questions'
import { DEEP_DIVE_SECTIONS } from './cdl-pretrip-deep-data'

/* Flatten all items across all sections into one ordered list. ID is global
 * (1..38), so the quiz progress bar reads cleanly even though the bank spans
 * three inspection areas. */
const FLAT_ITEMS = DEEP_DIVE_SECTIONS.flatMap(s =>
  s.items.map(item => ({ ...item, sectionId: s.id, sectionLabel: s.label })),
)

/* Compress each long "say-it" sentence into a one-line summary suitable for
 * a multiple-choice option. Keeps the key facts: what's being checked and
 * the specific defects / numeric thresholds the examiner listens for.
 *
 * Keyed on the slug from the imagePath. If a slug is missing here, the full
 * sayIt is used as a fallback (long but always correct). */
const SHORT: Record<string, string> = {
  // Engine bay
  '1-oil-dipstick': 'Oil level — between ADD and FULL on the dipstick, oil clean and not low.',
  '2-coolant-reservoir': 'Coolant level — between MIN and MAX on the reservoir, cap on tight.',
  '3-power-steering-fluid': 'Power steering fluid — reservoir at the proper level, cap secure.',
  '4-windshield-washer-fluid': 'Windshield washer fluid — reservoir full, cap on tight.',
  '5-alternator': 'Alternator — properly mounted, wiring not loose or damaged, drive belt tight (≤3 cracks/inch, no frays).',
  '6-water-pump': 'Water pump — properly mounted and secured, no leaks at housing or hose connections.',
  '7-drive-belts': 'Drive belts — tight, ≤3 cracks per inch, no frays, less than ¾" of play.',
  '8-radiator-hoses': 'Radiator hoses — properly mounted, no leaks, cracks, bulges, or chafing.',
  '9-air-compressor': 'Air compressor — properly mounted, drive belt tight if belt-driven, no air leaks at fittings.',
  '10-steering-box': 'Steering box — properly mounted, no leaks, no loose nuts/bolts, pitman arm & drag link tight with no excessive play.',
  '11-battery': 'Battery — properly mounted, cables tight, no terminal corrosion, case not cracked or leaking.',

  // In-cabin
  '1-three-point-contact': 'Three-point contact when entering the cab — two hands and one foot (or two feet and one hand) on the truck at all times.',
  '2-seat-belt': 'Seat belt — properly mounted, not ripped or frayed, latches and releases properly.',
  '3-mirrors': 'Mirrors — properly mounted and adjusted, not cracked or broken, provide full coverage.',
  '4-steering-wheel': 'Steering wheel — free play no more than 10°, about 2 inches on a 20-inch wheel.',
  '5-horn': 'Horn — press the city horn and pull the air horn to confirm both work.',
  '6-wipers-windshield': "Wipers and windshield — blades not torn, arms tight, windshield not cracked or chipped in the driver's view.",
  '7-heater-defroster': 'Heater and defroster — working, air flows through the defroster vents.',
  '8-dashboard-gauges': 'Gauges — oil pressure, coolant temperature, voltmeter, air pressure all reading in the normal range.',
  '9-lights-dash-indicators': 'Lights & indicators — headlights, four-way flashers, turn signals on, all dash indicators light up at key-on.',
  '10-emergency-equipment': 'Emergency equipment — three reflective triangles, a charged fire extinguisher, and spare electrical fuses.',
  '11-parking-brake': 'Parking brake tug test — set parking brake, release service brake, gently pull against it in low gear — truck should NOT move.',

  // Trailer
  '1-brake-lights': 'Brake lights — apply the brake; both rear lamps come on bright.',
  '2-turn-signals': 'Turn signals & 4-way flashers — left, right, and four-ways all working.',
  '3-clearance-marker-lights': 'Clearance & marker lights — all on and working.',
  '4-reflective-tape': 'Reflective tape — installed and in good condition (full length of side + across rear).',
  '5-wheels-tires': 'Wheels & tires — properly inflated, no cuts/bulges, rims not cracked/bent, all lug nuts present and tight.',
  '6-suspension': 'Suspension — springs, axle, and air bags free of cracks/damage/leaks; mounting bolts + U-bolts present and secure.',
  '7-landing-gear': 'Landing gear — securely mounted, not bent or damaged, crank + foot in good condition.',
  '8-coupling-devices': 'Coupling devices — pintle hook / fifth wheel secure, not cracked or damaged, locking mechanism working.',
  '9-electrical-connections': 'Electrical connections — plug secure, pins not bent or corroded, cable not cut or frayed.',
  '10-air-lines': 'Air lines — not cut, worn, or leaking; properly connected and secured.',
  '11-doors-latches': 'Doors and latches — open/close properly, latches + hinges secure, door seals intact.',
  '12-undercarriage': 'Undercarriage — frame and crossmembers free of cracks/damage; all mounting bolts secure.',
  '13-light-operation': 'Light operation — every light operates properly (brake, turn, marker).',
  '14-abs-light': 'ABS light — comes on with the key, goes off after the truck starts moving.',
  '15-brake-chambers': 'Brake chambers — not leaking, properly mounted, push rods move freely.',
  '16-slack-adjusters': 'Slack adjusters — properly positioned, not damaged, move freely.',
}

function shortFor(slug: string, fallback: string): string {
  return SHORT[slug] ?? fallback
}

/* Build 38 questions. Each question's distractors are pulled from OTHER items
 * in the SAME inspection section — that's where students confuse parts. */
function buildBank(): CdlQuestion[] {
  const bank: CdlQuestion[] = []
  let id = 1

  for (const sectionGroup of DEEP_DIVE_SECTIONS) {
    const sectionItems = sectionGroup.items
    for (let i = 0; i < sectionItems.length; i++) {
      const item = sectionItems[i]!
      const slug = item.imagePath.split('/').pop()!.replace(/\.jpg$/, '')
      const correctText = shortFor(slug, item.sayIt)

      /* Pick two distractor items from the SAME section, deterministically by
       * index offset so the same question always shows the same options across
       * runs (better than random for tracking which questions you keep missing). */
      const others = sectionItems.filter((_, idx) => idx !== i)
      const distractor1 = others[i % others.length]!
      const distractor2 = others[(i + 1) % others.length]!
      const d1Slug = distractor1.imagePath.split('/').pop()!.replace(/\.jpg$/, '')
      const d2Slug = distractor2.imagePath.split('/').pop()!.replace(/\.jpg$/, '')
      const distractor1Text = shortFor(d1Slug, distractor1.sayIt)
      const distractor2Text = shortFor(d2Slug, distractor2.sayIt)

      /* Rotate the correct-answer slot through A / B / C so it isn't always
       * the same letter. Use the global id mod 3 — that's the simplest reliable
       * distribution for a bank this size. */
      const ansSlot = (id - 1) % 3 as 0 | 1 | 2
      const opts: [string, string, string] = ['', '', '']
      opts[ansSlot] = correctText
      let cur = 0
      for (let s = 0; s < 3; s++) {
        if (s === ansSlot) continue
        opts[s] = cur === 0 ? distractor1Text : distractor2Text
        cur++
      }

      bank.push({
        id,
        q: `What does the inspector say about the highlighted part of the ${sectionGroup.label.toLowerCase()}?`,
        opts,
        ans: ansSlot,
        image: item.imagePath,
      })
      id++
    }
  }

  return bank
}

export const PRETRIP_DEEP_DIVE_QUESTIONS: CdlQuestion[] = buildBank()
