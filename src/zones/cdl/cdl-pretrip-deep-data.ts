/**
 * NJ MVC CDL Class A — Outside Pre-Trip Inspection — Deep Dive Data
 *
 * 38 individual part photos across three sections: Engine Bay, In-Cabin,
 * Trailer. Each photo is a CHATGPT-generated image with the part name in
 * an orange tag, the "SAY:" verbal phrase overlaid, and a yellow numbered
 * circle on the part itself.
 *
 * The deep-dive UI is a flashcard interface (one part per screen) rather
 * than a parts map (multiple hotspots on a single photo), because each
 * photo here teaches one part in depth. The component:
 *   - Sidebar lists every part in the active section (1-11 / 1-11 / 1-16)
 *   - Main area shows the selected part's photo
 *   - Speak button reads the "say it" phrase via TTS
 *   - Visited tracking + Quiz / Walk-through modes (same UX as the
 *     existing CdlPreTripPartsMap)
 *
 * Source photos: extracted from ChatGPT composites by
 * `scripts/cdl-pretrip-deep-extract.py` — see that script for the
 * detection/cropping logic.
 */

export type DeepDiveSectionId = 'engine' | 'cabin' | 'trailer'

export interface DeepDiveItem {
  /** Stable number — matches the printed yellow circle in the photo. */
  number: number
  /** Short part name (no section prefix). */
  label: string
  /** Normal phase — yellow numbered circle on the part. */
  imagePath: string
  /**
   * Highlight phase — yellow numbered circle PLUS a yellow oval outlining
   * the part. Toggleable in the UI so the user can see the part with and
   * without the explicit outline.
   */
  imageHighlightPath?: string
  /**
   * Verbal inspection sentence — what the applicant says out loud during the
   * test. Verbatim from the photo's "SAY:" overlay. The Speak button reads
   * this exact string via the SpeechSynthesis API.
   */
  sayIt: string
}

export interface DeepDiveSection {
  id: DeepDiveSectionId
  label: string
  blurb: string
  /** Sub-heading number (Step in the inspection — matches the existing CDL hub tiles.) */
  step: string
  items: readonly DeepDiveItem[]
}

/* ──────────────────────────────────────────────────────────────────────────── */

export const DEEP_DIVE_SECTIONS: readonly DeepDiveSection[] = [
  {
    id: 'engine',
    label: 'Engine Bay',
    step: 'DEEP DIVE · ENGINE',
    blurb: 'Eleven engine-bay items the examiner expects you to name and inspect, one by one.',
    items: [
      {
        number: 1,
        label: 'Oil dipstick',
        imagePath: '/cdl-pretrip-deep/engine/1-oil-dipstick.jpg',
        sayIt:
          'I am checking the oil level. I am checking that the oil is between the ADD and FULL marks on the dipstick and the oil is clean and not low.',
      },
      {
        number: 2,
        label: 'Coolant reservoir',
        imagePath: '/cdl-pretrip-deep/engine/2-coolant-reservoir.jpg',
        sayIt:
          'I am checking the coolant level. I am checking that the coolant reservoir is between the MIN and MAX marks and the cap is on tight.',
      },
      {
        number: 3,
        label: 'Power steering fluid',
        imagePath: '/cdl-pretrip-deep/engine/3-power-steering-fluid.jpg',
        sayIt:
          'I am checking the power steering fluid. I am checking that the reservoir is at the proper level and the cap is secure.',
      },
      {
        number: 4,
        label: 'Windshield washer fluid',
        imagePath: '/cdl-pretrip-deep/engine/4-windshield-washer-fluid.jpg',
        sayIt:
          'I am checking the windshield washer fluid. I am checking that the reservoir is full and the cap is on tight.',
      },
      {
        number: 5,
        label: 'Alternator',
        imagePath: '/cdl-pretrip-deep/engine/5-alternator.jpg',
        sayIt:
          'I am checking the alternator. I am checking that it is properly mounted and secured, the wiring is not loose or damaged, and the drive belt is tight with no more than three cracks per inch and no frays.',
      },
      {
        number: 6,
        label: 'Water pump',
        imagePath: '/cdl-pretrip-deep/engine/6-water-pump.jpg',
        sayIt:
          'I am checking the water pump. I am checking that it is properly mounted and secured, no leaks at the housing or hose connections.',
      },
      {
        number: 7,
        label: 'Drive belts',
        imagePath: '/cdl-pretrip-deep/engine/7-drive-belts.jpg',
        sayIt:
          'I am checking the drive belts. I am checking that the belts are tight with no more than three cracks per inch, no frays, and have less than three-quarters of an inch of play.',
      },
      {
        number: 8,
        label: 'Radiator hoses',
        imagePath: '/cdl-pretrip-deep/engine/8-radiator-hoses.jpg',
        sayIt:
          'I am checking the radiator hoses. I am checking that they are properly mounted and secured, no leaks, no cracks, no bulges, and no chafing.',
      },
      {
        number: 9,
        label: 'Air compressor',
        imagePath: '/cdl-pretrip-deep/engine/9-air-compressor.jpg',
        sayIt:
          'I am checking the air compressor. I am checking that it is properly mounted and secured, the drive belt is tight if belt-driven, and there are no air leaks at the fittings.',
      },
      {
        number: 10,
        label: 'Steering box & linkage',
        imagePath: '/cdl-pretrip-deep/engine/10-steering-box.jpg',
        sayIt:
          'I am checking the steering box. I am checking that it is properly mounted and secured, no leaks, no loose or missing nuts and bolts, and the pitman arm and drag link are tight with no excessive play.',
      },
      {
        number: 11,
        label: 'Battery',
        imagePath: '/cdl-pretrip-deep/engine/11-battery.jpg',
        sayIt:
          'I am checking the battery. I am checking that it is properly mounted and secured, the cables are tight, no corrosion on the terminals, and the case is not cracked or leaking.',
      },
    ],
  },

  {
    id: 'cabin',
    label: 'In-Cabin',
    step: 'DEEP DIVE · IN-CABIN',
    blurb: 'Eleven cab-interior checks: three-point contact, mirrors, gauges, the air-brake-related controls, emergency gear.',
    items: [
      {
        number: 1,
        label: 'Three-point contact',
        imagePath: '/cdl-pretrip-deep/cabin/1-three-point-contact.jpg',
        sayIt:
          'Before entering the cab, I am using three-point contact — two hands and one foot, or two feet and one hand, on the truck at all times.',
      },
      {
        number: 2,
        label: 'Seat belt',
        imagePath: '/cdl-pretrip-deep/cabin/2-seat-belt.jpg',
        sayIt:
          'I am checking the seat belt. I am checking that the belt is properly mounted and secured, not ripped or frayed, and latches and releases properly.',
      },
      {
        number: 3,
        label: 'Mirrors (cab interior view)',
        imagePath: '/cdl-pretrip-deep/cabin/3-mirrors.jpg',
        sayIt:
          'I am checking the mirrors. I am checking that they are properly mounted and adjusted, not cracked or broken, and provide full coverage.',
      },
      {
        number: 4,
        label: 'Steering wheel (free play check)',
        imagePath: '/cdl-pretrip-deep/cabin/4-steering-wheel.jpg',
        sayIt:
          'I am checking the steering wheel. I am checking that the free play is no more than 10 degrees — about two inches on a 20-inch wheel.',
      },
      {
        number: 5,
        label: 'Horn (city + air)',
        imagePath: '/cdl-pretrip-deep/cabin/5-horn.jpg',
        sayIt:
          'I am checking the horn. I am pressing the city horn and pulling the air horn to make sure both are working.',
      },
      {
        number: 6,
        label: 'Wipers & windshield',
        imagePath: '/cdl-pretrip-deep/cabin/6-wipers-windshield.jpg',
        sayIt:
          "I am checking the wipers and windshield. I am checking that the wiper blades are not torn, the arms are tight, and the windshield is not cracked or chipped in the driver's view.",
      },
      {
        number: 7,
        label: 'Heater / defroster',
        imagePath: '/cdl-pretrip-deep/cabin/7-heater-defroster.jpg',
        sayIt:
          'I am checking the heater and defroster. I am checking that they are working and that air flows through the defroster vents.',
      },
      {
        number: 8,
        label: 'Dashboard gauges',
        imagePath: '/cdl-pretrip-deep/cabin/8-dashboard-gauges.jpg',
        sayIt:
          'I am checking the gauges. I am checking the oil pressure, coolant temperature, voltmeter, and air pressure gauges — all reading in the normal range.',
      },
      {
        number: 9,
        label: 'Lights & dash indicators',
        imagePath: '/cdl-pretrip-deep/cabin/9-lights-dash-indicators.jpg',
        sayIt:
          'I am checking the lights and indicators. I am turning on the headlights, four-way flashers, and turn signals, and checking that all dash indicators light up at key-on.',
      },
      {
        number: 10,
        label: 'Emergency equipment',
        imagePath: '/cdl-pretrip-deep/cabin/10-emergency-equipment.jpg',
        sayIt:
          'I am checking the emergency equipment. I am checking for three reflective triangles, a charged fire extinguisher, and spare electrical fuses.',
      },
      {
        number: 11,
        label: 'Parking brake (tug test)',
        imagePath: '/cdl-pretrip-deep/cabin/11-parking-brake.jpg',
        sayIt:
          'I am performing the parking brake tug test. I am setting the parking brake, releasing the service brake, and gently pulling against the brake in low gear — the truck should not move.',
      },
    ],
  },

  {
    id: 'trailer',
    label: 'Trailer',
    step: 'DEEP DIVE · TRAILER',
    blurb: 'Sixteen trailer items — lights, tape, suspension, brake chambers, slack adjusters, coupling, doors, undercarriage.',
    items: [
      {
        number: 1,
        label: 'Brake lights',
        imagePath: '/cdl-pretrip-deep/trailer/1-brake-lights.jpg',
        sayIt:
          'I am checking the brake lights. I am applying the brake and checking that the brake lights come on bright.',
      },
      {
        number: 2,
        label: 'Turn signals / 4-way flashers',
        imagePath: '/cdl-pretrip-deep/trailer/2-turn-signals.jpg',
        sayIt:
          'I am checking the turn signals and four-way flashers. I am checking that the left, right, and four-way flashers are working.',
      },
      {
        number: 3,
        label: 'Clearance & marker lights',
        imagePath: '/cdl-pretrip-deep/trailer/3-clearance-marker-lights.jpg',
        sayIt:
          'I am checking the clearance and marker lights. I am checking that all clearance and marker lights are on and working.',
      },
      {
        number: 4,
        label: 'Reflective tape',
        imagePath: '/cdl-pretrip-deep/trailer/4-reflective-tape.jpg',
        sayIt:
          'I am checking the reflective tape. I am checking that the reflective tape is installed and in good condition.',
      },
      {
        number: 5,
        label: 'Wheels & tires',
        imagePath: '/cdl-pretrip-deep/trailer/5-wheels-tires.jpg',
        sayIt:
          'I am checking the wheels and tires. I am checking that the tires are properly inflated, no cuts or bulges, that the rims are not cracked or bent, and all lug nuts are present and tight.',
      },
      {
        number: 6,
        label: 'Suspension',
        imagePath: '/cdl-pretrip-deep/trailer/6-suspension.jpg',
        sayIt:
          'I am checking the suspension. I am checking the springs, axle, and air bags for cracks, damage, or leaks, and that all mounting bolts and U-bolts are present and secure.',
      },
      {
        number: 7,
        label: 'Landing gear',
        imagePath: '/cdl-pretrip-deep/trailer/7-landing-gear.jpg',
        sayIt:
          'I am checking the landing gear. I am checking that it is securely mounted, not bent or damaged, and that the crank and foot are in good condition.',
      },
      {
        number: 8,
        label: 'Coupling devices',
        imagePath: '/cdl-pretrip-deep/trailer/8-coupling-devices.jpg',
        sayIt:
          'I am checking the coupling devices. I am checking that the pintle hook or fifth wheel is secure, not cracked or damaged, and that the locking mechanism is working.',
      },
      {
        number: 9,
        label: 'Electrical connections',
        imagePath: '/cdl-pretrip-deep/trailer/9-electrical-connections.jpg',
        sayIt:
          'I am checking the electrical connections. I am checking that the electrical plug is secure, the pins are not bent or corroded, and the cable is not cut or frayed.',
      },
      {
        number: 10,
        label: 'Air lines',
        imagePath: '/cdl-pretrip-deep/trailer/10-air-lines.jpg',
        sayIt:
          'I am checking the air lines. I am checking that the air lines are not cut, worn, or leaking, and that they are properly connected and secured.',
      },
      {
        number: 11,
        label: 'Doors & latches',
        imagePath: '/cdl-pretrip-deep/trailer/11-doors-latches.jpg',
        sayIt:
          'I am checking the doors and latches. I am checking that the doors open and close properly, the latches and hinges are secure, and the door seals are intact.',
      },
      {
        number: 12,
        label: 'Undercarriage',
        imagePath: '/cdl-pretrip-deep/trailer/12-undercarriage.jpg',
        sayIt:
          'I am checking the undercarriage. I am checking the frame and crossmembers for cracks or damage, and that all mounting bolts and fasteners are secure.',
      },
      {
        number: 13,
        label: 'Light operation (full test)',
        imagePath: '/cdl-pretrip-deep/trailer/13-light-operation.jpg',
        sayIt:
          'I am checking the light operation. I am checking that all lights operate properly, including brake lights, turn signals, and marker lights.',
      },
      {
        number: 14,
        label: 'ABS light',
        imagePath: '/cdl-pretrip-deep/trailer/14-abs-light.jpg',
        sayIt:
          'I am checking the ABS light. I am checking that the ABS light comes on with the key and goes off after moving the truck.',
      },
      {
        number: 15,
        label: 'Brake chambers',
        imagePath: '/cdl-pretrip-deep/trailer/15-brake-chambers.jpg',
        sayIt:
          'I am checking the brake chambers. I am checking that they are not leaking, are properly mounted, and that the push rods move freely.',
      },
      {
        number: 16,
        label: 'Slack adjusters',
        imagePath: '/cdl-pretrip-deep/trailer/16-slack-adjusters.jpg',
        sayIt:
          'I am checking the slack adjusters. I am checking that they are properly positioned and not damaged, and that they move freely.',
      },
    ],
  },
]

export const DEEP_DIVE_TOTALS = {
  sectionCount: DEEP_DIVE_SECTIONS.length,
  itemCount: DEEP_DIVE_SECTIONS.reduce((n, s) => n + s.items.length, 0),
} as const
