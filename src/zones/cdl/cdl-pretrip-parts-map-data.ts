/**
 * NJ MVC CDL Class A — Outside Pre-Trip Inspection — Parts Map Data
 *
 * Six inspection sections, 31 numbered hotspots, with the full "say it / act on it"
 * scripts taken from the user's study sheet (the "How to Say It / How to Act"
 * PDF). Coordinates are percentages of the photo box (`{ x, y }` in 0..100 space)
 * so they survive responsive image sizing.
 *
 * Photos live in `public/cdl-pretrip/` — see that folder's README for the file
 * names this data references. The component renders a stylized SVG placeholder
 * when a photo is missing so the test runs immediately without the assets.
 */

/** One labelled part on the photo. Clicking the SVG hotspot reveals this entry. */
export interface PartHotspot {
  /** Yellow-circle number on the inspection sheet — what the photo shows. */
  number: number
  /** Short part name — appears in the hotspot title and the info card header. */
  label: string
  /** Where the hotspot sits on the photo, as a percentage of the photo box. */
  position: { x: number; y: number }
  /**
   * Verbal inspection sentence — what the applicant must SAY out loud during
   * the test. Pulled verbatim from the user's "How to Say It" PDF where possible.
   */
  sayIt: string
  /** Optional one-liner describing what the inspector physically does for this part. */
  actOn?: string
}

/** One inspection area (e.g. "Front / Engine Area"). */
export interface InspectionSection {
  id: string
  step: number
  title: string
  /** Short blurb shown in the section selector + section header. */
  blurb: string
  /** Path under `/public` — falls back to a styled placeholder when missing. */
  imagePath: string
  /** Section-wide "How to Act" steps — physical actions, top to bottom. */
  actSteps: readonly string[]
  /** Section-wide "How to Say It" opener — what to say when entering the section. */
  sayOpener: string
  /** Per-part hotspots overlaid on the photo. */
  hotspots: readonly PartHotspot[]
}

/* ──────────────────────────────────────────────────────────────────────────── */

/**
 * Shared key-words template: every "How to Say It" string for inspection items
 * uses these exact phrases. The examiner listens for them — if they're missing,
 * the item doesn't get the point.
 */
export const PRETRIP_KEYWORDS = {
  mounted: 'properly mounted and secured',
  defects: 'not cracked, bent, broken, loose, leaking, missing, or damaged',
} as const

/** Helper: build the standard "I am checking X. I am checking that it is K1, K2." sentence. */
const say = (part: string): string =>
  `I am checking the ${part}. I am checking that it is ${PRETRIP_KEYWORDS.mounted}, ${PRETRIP_KEYWORDS.defects}.`

/* ──────────────────────────────────────────────────────────────────────────── */

export const PRETRIP_INSPECTION_SECTIONS: readonly InspectionSection[] = [
  {
    id: 'front-engine',
    step: 1,
    title: 'Front / Engine Area',
    blurb: 'Start the inspection at the front of the truck. Lenses, fluids, leaks, steering.',
    imagePath: '/cdl-pretrip/1-front-engine.jpg',
    sayOpener: 'I am going to do a complete pre-trip inspection. I am checking the front of the vehicle.',
    actSteps: [
      'Stand in front of the truck.',
      'Point to each item as you say it.',
      'Look at each item — get down and look underneath where needed.',
      'Move the steering wheel left and right (small movements).',
    ],
    hotspots: [
      {
        number: 1,
        label: 'Front light lenses',
        position: { x: 16, y: 32 },
        sayIt: `I am checking the front light lenses. I am checking that they are ${PRETRIP_KEYWORDS.mounted}, ${PRETRIP_KEYWORDS.defects}.`,
        actOn: 'Point to each headlight, turn signal, and marker lens.',
      },
      {
        number: 2,
        label: 'Fluid levels',
        position: { x: 30, y: 36 },
        sayIt: 'I am checking the fluid levels — oil, coolant, brake fluid, power steering fluid, and windshield washer fluid.',
        actOn: 'Point to each reservoir / dipstick under the hood.',
      },
      {
        number: 3,
        label: 'Fluid or air leaks',
        position: { x: 26, y: 78 },
        sayIt: 'I am checking for any fluid or air leaks under the vehicle.',
        actOn: 'Get down and look under the engine area for drips or pooling.',
      },
      {
        number: 4,
        label: 'Steering system',
        position: { x: 38, y: 86 },
        sayIt: 'I am checking the steering system — steering shaft, gear box, hoses, and the steering linkage to the wheel.',
        actOn: 'Trace the steering shaft down to the wheel and check for missing nuts, bolts, or worn linkages.',
      },
    ],
  },

  {
    id: 'steering-axle',
    step: 2,
    title: 'Steering Axle',
    blurb: 'Both front wheels — tires, rims, lug nuts, suspension, brake lines, and contamination.',
    imagePath: '/cdl-pretrip/2-steering-axle.jpg',
    sayOpener: 'I am checking the steering axle.',
    actSteps: [
      'Get down and look at the tire — check tread, sides, and for any damage.',
      'Look at the rim all the way around.',
      'Count lug nuts — they should all be present and tight.',
      'Look behind the wheel for springs / airbags / shocks.',
      'Look for brake lines or hoses — no leaks, no rubbing.',
      'Look at the brake area — no oil, grease, or fluid.',
    ],
    hotspots: [
      {
        number: 1,
        label: 'Tires',
        position: { x: 36, y: 30 },
        sayIt: `I am checking the tires. I am checking that they are ${PRETRIP_KEYWORDS.mounted}, no cuts, bulges, or abrasions, and have proper tread depth.`,
        actOn: 'Tread ≥ 4/32" front, ≥ 2/32" elsewhere. No cuts, bulges, or sidewall damage.',
      },
      {
        number: 2,
        label: 'Rims',
        position: { x: 50, y: 42 },
        sayIt: 'I am checking the rims. I am checking that the rims are not cracked, bent, or damaged.',
        actOn: 'Walk around the rim — no welds, no cracks, no missing chunks.',
      },
      {
        number: 3,
        label: 'Lug nuts',
        position: { x: 50, y: 56 },
        sayIt: 'I am checking the lug nuts. I am checking that the lug nuts are present and tight.',
        actOn: 'Count them. Look for rust streaks (sign of looseness).',
      },
      {
        number: 4,
        label: 'Springs / Airbags / Shocks',
        position: { x: 70, y: 50 },
        sayIt: `I am checking the springs, airbags, and shocks. I am checking that they are ${PRETRIP_KEYWORDS.defects}.`,
        actOn: 'Look behind the wheel into the suspension.',
      },
      {
        number: 5,
        label: 'Brake lines or hoses',
        position: { x: 60, y: 64 },
        sayIt: 'I am checking the brake lines or hoses. I am checking that they are not cracked, damaged, leaking, or rubbing.',
        actOn: 'Trace each hose end-to-end. No chafing against suspension.',
      },
      {
        number: 6,
        label: 'Brake area for contaminants',
        position: { x: 64, y: 78 },
        sayIt: 'I am checking the brake area for any contaminants — oil, grease, or fluid.',
        actOn: 'A wet, oily brake = compromised stopping power.',
      },
    ],
  },

  {
    id: 'side-of-tractor',
    step: 3,
    title: 'Side of Tractor',
    blurb: 'Walk along the side: lenses, mirrors, battery, fuel tank, frame.',
    imagePath: '/cdl-pretrip/3-side-of-tractor.jpg',
    sayOpener: 'I am checking the side of the tractor.',
    actSteps: [
      'Walk down the side of the tractor.',
      'Point to and look at each item.',
      'Check that the battery is secured.',
      'Look under the frame for any damage or leaks.',
    ],
    hotspots: [
      {
        number: 1,
        label: 'Side lenses and reflectors',
        position: { x: 18, y: 38 },
        sayIt: say('side lenses and reflectors'),
        actOn: 'Point to each side marker lens and reflector.',
      },
      {
        number: 2,
        label: 'Mirrors / Traffic monitoring devices',
        position: { x: 28, y: 24 },
        sayIt: `I am checking the mirrors and traffic monitoring devices. I am checking that they are ${PRETRIP_KEYWORDS.mounted}, and not cracked or broken.`,
        actOn: 'West coast mirror + convex spot mirror. Both must be clean and undamaged.',
      },
      {
        number: 3,
        label: 'Battery',
        position: { x: 38, y: 72 },
        sayIt: `I am checking the battery. I am checking that it is ${PRETRIP_KEYWORDS.mounted}, not cracked or damaged, no loose or corroded cables.`,
        actOn: 'Open the battery box. Cables tight, no corrosion at terminals.',
      },
      {
        number: 4,
        label: 'Fuel tank',
        position: { x: 50, y: 78 },
        sayIt: `I am checking the fuel tank. I am checking that it is ${PRETRIP_KEYWORDS.mounted}, not leaking, not cracked, not damaged, and the cap is tight.`,
        actOn: 'Cap snug. No fuel drips on the tank or strap.',
      },
      {
        number: 5,
        label: 'Frame',
        position: { x: 64, y: 86 },
        sayIt: 'I am checking the frame. I am checking that it is not cracked, bent, broken, or damaged.',
        actOn: 'Look down the rail — no bowing, no welds, no rust-through.',
      },
    ],
  },

  {
    id: 'coupling',
    step: 4,
    title: 'Combination Vehicle / Coupling Area',
    blurb: 'The fifth wheel and the air + electric connections between tractor and trailer.',
    imagePath: '/cdl-pretrip/4-coupling.jpg',
    sayOpener: 'I am checking the coupling area.',
    actSteps: [
      'Make sure lines are not cut, damaged, or dragging.',
      'Check connectors are plugged in and secured.',
      'Check fifth wheel skid plate — not cracked or broken.',
      'Make sure kingpin is locked in the center of the fifth wheel.',
      'Check apron — must be close to the fifth wheel (no gap).',
      'Check locking jaws are closed around the kingpin.',
      'Check safety devices.',
    ],
    hotspots: [
      {
        number: 1,
        label: 'Air and electric lines',
        position: { x: 30, y: 22 },
        sayIt: 'I am checking the air and electric lines. I am checking that they are not cut, damaged, or dragging.',
        actOn: 'Three lines — service (blue or red), emergency (red), electric (black 7-pin).',
      },
      {
        number: 2,
        label: 'Connectors',
        position: { x: 50, y: 28 },
        sayIt: 'I am checking the connectors. I am checking that they are plugged in and secured.',
        actOn: 'Glad hands locked, 7-pin seated and clipped.',
      },
      {
        number: 3,
        label: 'Fifth wheel skid plate',
        position: { x: 64, y: 40 },
        sayIt: 'I am checking the fifth wheel skid plate. I am checking that it is not cracked or broken.',
        actOn: 'Plate well greased, no cracks or weld breaks.',
      },
      {
        number: 4,
        label: 'Kingpin',
        position: { x: 50, y: 56 },
        sayIt: 'I am checking the kingpin. I am checking that it is locked in the center of the fifth wheel.',
        actOn: 'Kingpin must seat at dead center of the jaws.',
      },
      {
        number: 5,
        label: 'Apron',
        position: { x: 64, y: 62 },
        sayIt: `I am checking the apron. I am checking that it is ${PRETRIP_KEYWORDS.mounted}.`,
        actOn: 'Apron flat against the skid plate.',
      },
      {
        number: 6,
        label: 'No gap between apron and fifth wheel',
        position: { x: 78, y: 56 },
        sayIt: 'I am checking that there is no gap between the apron and the fifth wheel.',
        actOn: 'Sight along the seam — no daylight between trailer apron and plate.',
      },
      {
        number: 7,
        label: 'Locking jaws / Safety devices',
        position: { x: 30, y: 64 },
        sayIt: 'I am checking the locking jaws and safety devices. I am checking that the locking jaws are closed around the kingpin and the safety devices are in place.',
        actOn: 'Release arm fully back. Safety pin / clip engaged.',
      },
    ],
  },

  {
    id: 'trailer-front',
    step: 5,
    title: 'Trailer (Front)',
    blurb: 'Three quick items at the front of the trailer: landing gear, clearance, reflective tape.',
    imagePath: '/cdl-pretrip/5-trailer-front.jpg',
    sayOpener: 'I am checking the front of the trailer.',
    actSteps: [
      'Look at both landing gear legs — properly mounted and secured.',
      'Check there is enough clearance between tractor and landing gear.',
      'Look along the side for reflective tape — not missing or damaged.',
    ],
    hotspots: [
      {
        number: 1,
        label: 'Landing gear',
        position: { x: 22, y: 64 },
        sayIt: `I am checking the landing gear. I am checking that it is ${PRETRIP_KEYWORDS.mounted}.`,
        actOn: 'Both legs fully retracted, crank handle stowed.',
      },
      {
        number: 2,
        label: 'Clearance between tractor and landing gear',
        position: { x: 36, y: 78 },
        sayIt: 'I am checking the clearance between the tractor and landing gear. I am checking that there is enough clearance and the landing gear is not contacting the tractor.',
        actOn: 'Tractor frame should not be touching the landing gear feet.',
      },
      {
        number: 3,
        label: 'Reflective tape',
        position: { x: 48, y: 38 },
        sayIt: `I am checking the reflective tape. I am checking that it is ${PRETRIP_KEYWORDS.mounted}, not missing or damaged.`,
        actOn: 'Continuous red/white stripe along the side and across the rear.',
      },
    ],
  },

  {
    id: 'rear-of-trailer',
    step: 6,
    title: 'Rear of Trailer',
    blurb: 'Lenses, reflectors, and the full lights test — needs a helper.',
    imagePath: '/cdl-pretrip/6-rear-of-trailer.jpg',
    sayOpener: 'I am checking the rear of the trailer.',
    actSteps: [
      'Check that all lights and lenses are properly mounted and secure.',
      'Have your helper: Test the brake lights.',
      'Have your helper: Test left turn signal.',
      'Have your helper: Test right turn signal.',
      'Have your helper: Turn on 4-way flashers.',
      'Check that clearance / marker lights are on.',
    ],
    hotspots: [
      {
        number: 1,
        label: 'Rear lenses',
        position: { x: 22, y: 38 },
        sayIt: say('rear lenses'),
        actOn: 'Point to each tail-lamp lens.',
      },
      {
        number: 2,
        label: 'Rear reflectors',
        position: { x: 32, y: 50 },
        sayIt: say('rear reflectors'),
        actOn: 'Red reflectors at the rear corners + along the bottom rail.',
      },
      {
        number: 3,
        label: 'Brake lights',
        position: { x: 50, y: 40 },
        sayIt: 'I am checking the brake lights. (Helper presses the brake pedal.)',
        actOn: 'Both rear lamps glow red when helper presses the brake.',
      },
      {
        number: 4,
        label: 'Turn signals',
        position: { x: 60, y: 50 },
        sayIt: 'I am checking the turn signals. (Helper signals left, then right.)',
        actOn: 'Amber blinker fires on the matching side.',
      },
      {
        number: 5,
        label: '4-way flashers',
        position: { x: 70, y: 40 },
        sayIt: 'I am checking the 4-way flashers. (Helper switches on hazards.)',
        actOn: 'Both sides blink simultaneously.',
      },
      {
        number: 6,
        label: 'Clearance / Marker lights',
        position: { x: 80, y: 28 },
        sayIt: 'I am checking the clearance and marker lights.',
        actOn: 'Amber clearance lights across the top, red marker lights at the corners.',
      },
    ],
  },
]

/** Quick totals for the page header / hub tile. */
export const PRETRIP_TOTALS = {
  sectionCount: PRETRIP_INSPECTION_SECTIONS.length,
  hotspotCount: PRETRIP_INSPECTION_SECTIONS.reduce((n, s) => n + s.hotspots.length, 0),
} as const
