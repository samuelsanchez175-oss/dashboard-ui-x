# CDL PRAC — Master Build Prompt for Google AI Studio

> Paste this entire document into Google AI Studio as a system / user prompt to rebuild **CDL PRAC** — a Commercial Driver's License practice app aligned to the **New Jersey MVC (Motor Vehicle Commission)** Class A test specs. The data, design system, quiz behavior, parts-map hotspots, deep-dive flashcards, and accuracy gates below are extracted verbatim from a working React/TypeScript implementation already shipped in production. Reproduce the same behavior in your target framework (React + TS recommended; Next.js, Vue, Svelte, or Flutter also acceptable).

---

## 1. MISSION

Build a single-purpose web app called **CDL PRAC** that lets a learner study for and self-test every part of the NJ Class A CDL exam in one place:

- **Endorsement knowledge tests** — written multiple-choice exams pulled from the NJ MVC public study materials (Hazmat, Air Brakes, Tanker, Doubles/Triples, Passenger, School Bus, plus combination drills).
- **Pre-Trip Inspection skills test** — the in-person walk-around the examiner observes on the road skills test, broken into five sequential sub-tests run in real inspection order (In-Cabin → Engine Bay → Steering Axle & Side → Coupling → Trailer).
- **Visual study modes** — interactive parts map (click numbered hotspots on photos of each inspection area) and deep-dive flashcards (close-up photos of every part with the verbal inspection phrase the examiner expects to hear).

The app must feel like a **dark, terminal-style instrument panel** — monospace numerals, neon-accent endorsement colors, hairline borders, blocky CONFIRM buttons. Not "study app marketing site." Treat it like a flight-deck checklist tool.

---

## 2. JURISDICTION ACCURACY — NEW JERSEY MVC

Every count, threshold, and rule below comes from the public NJ MVC CDL Manual and the Modernized Testing System Class A road test. **Do not invent or "round" any of these numbers.**

### Pass threshold
- **80% correct** on every knowledge test. Always show "need X of Y correct to pass" where X = `ceil(Y * 0.80)`.

### Official NJ MVC question counts (the size of the real exam):

| Endorsement | Letter | NJ MVC Count | Pass (80%) |
|---|---|---|---|
| Hazardous Materials | H | 30 | 24 |
| Air Brakes (CORE CDL, not an endorsement) | — | 25 | 20 |
| Tank Vehicle | N | 20 | 16 |
| Doubles / Triples | T | 20 | 16 |
| Passenger | P | 20 | 16 |
| School Bus (requires P) | S | 20 | 16 |

### Combination prep tests (these are NOT real MVC exams — they are study drills that combine two banks):

| Combo | Letter | Practice Count | Pass (80%) |
|---|---|---|---|
| Tanker + Hazmat | X | 50 | 40 |
| Tanker + Doubles | N+T | 40 | 32 |

Every combo screen must show an italic notice clarifying: *"Combined practice — not an official MVC exam."*

### Hazmat security
- **Hazmat endorsement requires a TSA background check** for the H letter. Air Brakes is NOT an endorsement; it's core CDL knowledge that adds nothing to the license but failing it restricts the holder to vehicles without air brakes.

### Pre-Trip Inspection (Class A road skills)
- The Modernized Testing System pre-trip is **scored on points**, ~22 points to pass.
- The **air brake test** during the In-Cabin portion is **pass/fail with no reset** — miss any step, automatic failure. Implement this as the `autoFail: true` flag on those questions and a separate "✗ AUTOMATIC FAILURE" verdict that supersedes percentage scoring.
- The In-Cabin walkthrough assumes an **automatic transmission truck** (no clutch, no T-bar / splitter). Do not include clutch-pedal or stick-shift questions.
- The pre-trip is broken into 5 sequential tests; **questions must play in fixed `id` order, no shuffle, no sampling**. The learner walks the inspection sequence the way the examiner watches it.

### Verbal inspection phrasing (Say-It-Right rule)
Examiners listen for specific phrases. **The two reusable templates** the rest of the data leans on:
- **Mounting check:** "properly mounted and secured"
- **Defects check:** "not cracked, bent, broken, loose, leaking, missing, or damaged"

Standard sentence template:
> "I am checking the **[PART]**. I am checking that it is **properly mounted and secured**, **not cracked, bent, broken, loose, leaking, missing, or damaged**."

Verbiage variants by part material:
- **Metal** components (rims, frame, pitman arm, drag link, tie rod, skid plate, kingpin, landing gear support): "**no bends, no dents, no welding, no excessive rust**"
- **Rubber / hose** components (brake lines, radiator hoses, glad-hand seals, belts): "**not ripped, cut, or frayed**"
- **Fluid** reservoirs: "**between MAX and FILL marks, cap present**"

### Color conventions on the truck
- **Service air line:** Blue
- **Emergency air line:** Red
- **Front clearance / marker lights:** Amber
- **Rear clearance / marker / signal / brake lights:** **Red** (common mistake — at the rear they are ALWAYS red, never amber)
- **DOT reflective tape:** Red and white, must cover more than 50% of the trailer

### Tire / brake specs to surface in questions
- **Front (steering axle) tread depth:** ≥ **4/32"**
- **All other tires tread depth:** ≥ **2/32"**
- **Minimum tire pressure:** ≥ **100 psi**
- **Front steering tires:** **No recaps** allowed
- **Brake lining material:** at least **¼ inch** remaining, no cracks
- **Slack adjuster free play:** no more than **about 1 inch** when pulled hard
- **Steering wheel free play:** no more than **10 degrees** (about 2 inches on a 20-inch wheel)

### Air brake numbers the test asks repeatedly
- **Governor cut-out:** 120–140 psi
- **Governor cut-in:** ~100 psi
- **Low-air warning:** activates **before 60 psi**
- **Spring brakes pop out:** **20–45 psi** (test answer accepts "20–40")
- **Safety valve discharges at:** 150 psi
- **Maximum air loss (applied leak test):** straight truck 4 psi/min; combination 3 psi/min (some banks accept "2 psi/min" — use the answer in this bank)
- **Build-up time 85→100 psi:** within 45 seconds
- **Service brake leakage test (engine off, brakes released):** ≤ 2 psi/min single, ≤ 3 psi/min combo
- **Engine off, brakes APPLIED test:** ≤ 4 psi/min loss in one minute

### Federal weights and distances
- **Bulk packaging (liquid):** > **119 gallons** for a single container, or > 882 lbs for solids
- **Smoking prohibition near placarded flammable hazmat:** within **25 feet**
- **Park ≥ 300 feet** from crowds / bridges / tunnels with explosives Div. 1.1/1.2
- **Stop 15–50 feet from nearest rail** at every RR crossing in a placarded hazmat vehicle or any bus
- **Stop ≥ 1,000 feet** from a fire when hauling Class 1 explosives
- **Fire extinguisher rating** for hazmat vehicles: **≥ 10 B:C**

### School bus specifics (S endorsement, requires P)
- **Danger zone:** ~**10 feet** in front, sides, and rear of bus
- **10-step crossing procedure** is the student crossing protocol — students cross only after the driver signals it is safe
- **Alternating amber warning lights** activate ~**200 feet** before a planned stop
- **Alternating red flashing lights + stop arm** = traffic must stop and remain stopped
- **Drug & alcohol testing:** pre-employment, random, post-accident, reasonable-suspicion; school-bus drivers have a **lower BAC threshold** than other CDLs
- **Cross-view mirror** = mirror that shows the danger zone immediately in front of and to the right of the bus

---

## 3. APP ARCHITECTURE

### Routes
Single-page app with one root component and a route → page mapping:

```
/                          → CdlHubZone  (landing tile grid)

# Endorsement knowledge tests
/cdl-hazmat                → 30-question NJ test, theme: neon green
/cdl-air-brakes            → 25-question NJ test, theme: amber
/cdl-tanker                → 20-question NJ test, theme: cyan
/cdl-doubles-triples       → 20-question NJ test, theme: orange
/cdl-tanker-hazmat         → 50-question combo, theme: red (X letter)
/cdl-tanker-doubles        → 40-question combo, theme: purple (N+T)
/cdl-passenger             → 20-question NJ test, theme: blue
/cdl-school-bus            → 20-question NJ test, theme: yellow

# Pre-trip Class A road skills (sequential, no shuffle)
/cdl-pretrip-parts-map     → Interactive hotspot study tool (study + quiz modes)
/cdl-pretrip-deep-dive     → 38-photo flashcard MC quiz
/cdl-pretrip-cabin         → Step 1 of 5 — In-Cabin (autofail air brake test embedded)
/cdl-pretrip-engine-bay    → Step 2 of 5 — Engine Bay
/cdl-pretrip-steering-axle → Step 3 of 5 — Steering Axle + Side of Tractor
/cdl-pretrip-coupling      → Step 4 of 5 — Coupling System (combo vehicles only)
/cdl-pretrip-trailer       → Step 5 of 5 — Trailer
```

### Component tree

```
App
├─ CdlHubZone (landing)
│   ├─ Endorsement TileGrid (8 tiles)
│   └─ Pre-Trip TileGrid (7 tiles)
│
├─ CdlQuiz (the universal quiz engine, used by 13 of the routes)
│   ├─ MenuScreen
│   ├─ QuizScreen
│   ├─ ReviewMissedScreen
│   └─ ResultsScreen
│
├─ CdlPreTripPartsMap (study tool, not CdlQuiz)
│   ├─ Section selector (6 sections)
│   ├─ Photo with overlaid numbered hotspots
│   ├─ Hotspot info card (label / sayIt / actOn)
│   └─ Modes: STUDY, QUIZ, EDIT
│
└─ CdlPreTripDeepDive (flashcard drill, not CdlQuiz)
    ├─ Section tabs (Engine / Cabin / Trailer)
    ├─ Sidebar item list (38 items total)
    ├─ Photo with phase toggle (NORMAL / HIGHLIGHT)
    ├─ Speak button (TTS via SpeechSynthesis API)
    └─ MC question card per item
```

---

## 4. DESIGN SYSTEM

### Aesthetic
**Dark utility / instrument panel.** Imagine the cockpit of a freight aircraft — Courier-monospace numerals, hairline borders, neon accent dots, no rounded "soft" cards. Never use stock SaaS gradients, big illustrations, or playful icons. The icons are **lucide-react** line glyphs, color-matched to the section accent.

### Color tokens (per endorsement / section)
Each test owns one **accent hex** + a translucent **accentSoft** background derived from it.

| Section | Accent | Soft (12-14% mix) |
|---|---|---|
| Hazmat (H) | `#39ff14` (toxic green) | `color-mix(in oklab, #39ff14 12%, var(--bg-card))` |
| Air Brakes (CORE) | `#f0c040` (caution amber) | `color-mix(in oklab, #f0c040 14%, var(--bg-card))` |
| Tanker (N) | `#00b8d4` (cyan) | `color-mix(in oklab, #00b8d4 12%, var(--bg-card))` |
| Doubles/Triples (T) | `#ff7b29` (orange) | `color-mix(in oklab, #ff7b29 13%, var(--bg-card))` |
| Tanker+Hazmat (X) | `#ef4444` (red) | `color-mix(in oklab, #ef4444 13%, var(--bg-card))` |
| Passenger (P) | `#3b82f6` (blue) | `color-mix(in oklab, #3b82f6 13%, var(--bg-card))` |
| School Bus (S) | `#facc15` (school yellow) | `color-mix(in oklab, #facc15 13%, var(--bg-card))` |
| Tanker+Doubles (N+T) | `#a855f7` (purple) | `color-mix(in oklab, #a855f7 13%, var(--bg-card))` |
| Pre-Trip Parts Map | `#f5c429` (gold) | `color-mix(in oklab, #f5c429 12%, var(--bg-card))` |
| Pre-Trip Deep Dive | `#22d3ee` (deep cyan) | `color-mix(in oklab, #22d3ee 12%, var(--bg-card))` |
| Pre-Trip Step 1 Cabin | `#5b9dff` | derived |
| Pre-Trip Step 2 Engine | `#22d3ee` | derived |
| Pre-Trip Step 3 Steering | `#2dd4bf` | derived |
| Pre-Trip Step 4 Coupling | `#a3e635` | derived |
| Pre-Trip Step 5 Trailer | `#fbbf24` | derived |

### Status colors (used in quiz responses)
- **Correct / pass:** `#39ff14` (green)
- **Wrong / fail:** `#ff4d4d` (red)
- **Selected (pre-confirm):** the section's accent at full opacity for the border

### Neutrals
- Page background (canvas): `#04090b` (near-black with cyan tint)
- Card background: ~10% lifted from canvas
- Primary text: `#e6edf3`
- Muted text: `#7d8590`
- Hairline border: `#2a3138`

### Typography
- **Body / questions:** system sans (Inter / SF Pro / -apple-system)
- **Numerals, badges, button labels:** `'Courier New', Courier, monospace` — **important**, this gives the instrument-panel feel. Letter-spacing 2–4px on caps.
- **Headline title font sizes:** 32px hub, 56px quiz menu title with letter-spacing 4
- **Quiz options:** 14px body, 13px monospace A/B/C label

### Spacing / shape
- **Border-radius:** 2–8px ONLY. Never use big pill shapes. Cards are 4px radius; buttons 2px.
- **Hairline borders:** 1px, dark gray.
- **Section borderHot** (menu card outline): a brighter version of the accent at full opacity.

### Hub tile layout
```
┌────────────────────────────────────────┐
│  [12x12 icon tile]            [eyebrow]│
│   (accent bg, black icon)      (H/T/N)│
│                                        │
│  Endorsement Title                     │
│  Two-line description blurb            │
│                                        │
│  20 questions · 80% to pass    [Open ▸]│
└────────────────────────────────────────┘
```
- Card background: `tile.accentSoft`
- Border: hairline `var(--border)`; on hover → `tile.accent`
- Eyebrow chip: H / N / T / X / P / S / CORE / STUDY / STEP 1-5 (uppercase mono, tracked)
- Icon set (lucide-react): Biohazard, Disc/Wrench, Droplets/Container, Truck, Fuel, Bus, School, Workflow, MapPin, ClipboardList, Link2, CircleDot, etc. Pick one per section.

### Quiz card layout (active question)
```
┌─────────────────────────────────────┐
│ [HAZMAT]               12 / 30      │  ← topBar: accent badge + counter
│ ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  ← 3px progress bar in accent
│                                     │
│ [optional photo, 360px max]         │  ← only on pre-trip Deep Dive bank
│                                     │
│ Q14                                 │  ← q-number in accent, 11px mono
│ Question text in 15px sans, 1.6     │
│ line-height...                      │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ A   Option text…                │ │  ← cards: hairline border default
│ ├─────────────────────────────────┤ │     selected = accent border + accentSoft bg
│ │ B   Option text…           ✓    │ │     correct after confirm = green border, ✓
│ ├─────────────────────────────────┤ │     wrong after confirm = red border, ✗
│ │ C   Option text…                │ │
│ └─────────────────────────────────┘ │
│                                     │
│                       [ CONFIRM   ] │  ← accent bg, mono, letter-spaced
│                                     │
│ ✓ 8   ✗ 3   19 left  · need 24 to ──│  ← scoreRow, monospace
└─────────────────────────────────────┘
```

---

## 5. QUIZ ENGINE BEHAVIOR

The engine is a single React component used by every endorsement + pre-trip route. State machine:

```
menu → quiz → (review) → results → quiz (retake) | menu
```

### Props (TypeScript interface)
```ts
interface CdlQuestion {
  id: number
  q: string
  opts: [string, string, string]   // exactly 3 options (A/B/C)
  ans: 0 | 1 | 2                    // 0-indexed correct answer
  autoFail?: boolean                // missing it = automatic failure verdict
  image?: string                    // optional photo above the question (pre-trip Deep Dive)
}

interface CdlQuizTheme {
  pageBg: string; cardBg: string
  accent: string; accentFg: string; accentSoft: string
  bad: string; good: string
  text: string; textDim: string
  border: string; borderHot: string
  icon?: string                     // emoji glyph above title (e.g. ☣ ⚙)
  titleLetterSpacing: number
}

interface CdlQuizProps {
  title: string
  subtitle: string
  badge: string                     // short uppercase chip, e.g. "HAZMAT"
  endorseLetter: string             // big letter on menu stat row, e.g. "H"
  questions: CdlQuestion[]          // the full bank
  theme: CdlQuizTheme
  officialCount?: number            // NJ MVC count (30 hazmat, 25 air brakes, 20 the rest)
  sequential?: boolean              // true for pre-trip — no shuffle, no sampling
  combinedNotice?: string           // italic disclaimer for combo / sequential
}
```

### Sampling behavior
- **Default mode (NJ count):** Fisher–Yates shuffle the bank, take the first `officialCount` questions. Pass = `ceil(officialCount * 0.8)`.
- **Extended mode (toggle on menu):** runs the full bank verbatim, only enabled if `bankSize > officialCount` and `!sequential`. Pass = `ceil(bankSize * 0.8)`. The toggle UI is a small checkbox-style button at the bottom of the menu card.
- **Sequential mode (pre-trip):** Sorts by `id` ascending, runs every question in inspection order. No shuffle, no sampling, **no Extended toggle visible**.

### Auto-fail
If `activeQuestions` contains any `autoFail: true` item AND that item was answered wrong:
- Pass status flips to **false** regardless of percent.
- The results screen shows `✗ AUTOMATIC FAILURE` in red instead of `✓ PASSED` or `✗ FAILED`.
- Subtitle text: *"Missed a critical auto-fail item — the air brake check is pass/fail with no reset on the real exam."*

### Question flow per screen
1. **Menu screen:** Title + subtitle + 3 stats (Questions / 80% / Endorsement letter) + "Need X of Y correct to pass" + START TEST + (optional Extended toggle) + (optional combinedNotice).
2. **Quiz screen:** Top bar (badge chip + "current / total"). Thin 3px progress bar in accent. Optional image (only if `q.image` set). `Q{id}` in accent. Question text. 3 option cards. CONFIRM button (disabled until user selects). After CONFIRM: correct option turns green with ✓; if user picked wrong, that one turns red with ✗ and the correct one shows ✓; CONFIRM becomes NEXT → / FINISH.
3. **Results screen:** Big percentage in green or red, verdict line (✓ PASSED / ✗ FAILED / ✗ AUTOMATIC FAILURE), `score / total` correct, autofail explanation if applicable, pass-threshold line, REVIEW MISSED button (only if any missed), RETAKE TEST, MAIN MENU.
4. **Review missed screen:** Same layout as quiz but read-only, walks ONLY missed questions in order, both wrong-selected and correct options labelled, ← PREV / NEXT → / DONE buttons.

### Sound (optional but on by default in production)
Web Audio API synth, no asset files:
- **Correct:** triangle wave arpeggio C5 → E5 → G5, 0.35s, gain 0.12 with fade.
- **Wrong:** sawtooth descent Gb3 → C3, 0.4s, gain 0.15 with fade.
- **Click:** sine 600Hz, 0.08s, gain 0.06.

Add a Volume2 / VolumeX icon toggle in the app header to mute.

---

## 6. INTERACTIVE PARTS MAP (Pre-Trip Study Tool)

Standalone component, NOT built on top of CdlQuiz. Goal: let the learner browse the 6 inspection areas of the truck visually, click any numbered hotspot, read what the part is and what to say out loud, then switch to quiz mode and prove they can identify each.

### Modes
1. **STUDY:** Click hotspot → reveal `label` + `sayIt` + `actOn`. No scoring. TTS button reads `sayIt` aloud.
2. **QUIZ:** Show a target part name → user must click the matching hotspot. Score correct / total. After answering, advance to next hotspot.
3. **EDIT:** (developer / power user only) Drag hotspots around, then COPY JSON to clipboard so the source data can be corrected without redeploy.

### Layout
```
┌───────────────────────────────────────────────────┐
│ [Section selector: 1 Front  2 Steering  3 Side  …│  ← horizontal tab strip
├───────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────┐   │
│  │                                            │   │
│  │     [photo with overlaid numbered          │   │
│  │      yellow circles 1..N]                  │   │
│  │                                            │   │
│  └───────────────────────────────────────────┘   │
│                                                   │
│ Step 1 · Front / Engine Area                      │
│ "I am going to do a complete pre-trip…"           │
│                                                   │
│ [STUDY] [QUIZ] [EDIT]    [🔊 Auto-Speak]         │
├───────────────────────────────────────────────────┤
│ Part #5 — Brake lines or hoses                    │
│ How to say: "I am checking the brake lines…"      │
│ How to act: "Trace each hose end-to-end…"         │
└───────────────────────────────────────────────────┘
```

### Hotspot coordinates
`{ x, y }` in **0–100 percentage space** so they survive responsive image sizing. Render hotspots as 28px circles centered at `left: x% top: y%` with:
- 2px solid white border
- 2px gold/yellow fill
- Black numeral, 14px monospace, centered
- Box-shadow `0 0 12px <accent>80` for visibility

### Photo fallback
If `imagePath` 404s, render a stylized SVG placeholder showing the section title + step number on a dark grid background, so the app still works without assets.

### TTS
Use `window.speechSynthesis` with `rate: 0.95, pitch: 1.0`. Cancel any in-flight utterance before speaking the new one.

### Persistence (localStorage)
- `cdl-parts-map-visited` → record of which hotspots have been opened across sessions
- `cdl-parts-map-autospeak` → boolean
- `cdl-parts-map-positions-override` → JSON object of `{ sectionId: { hotspotNumber: { x, y } } }` from EDIT mode

---

## 7. PRE-TRIP DEEP DIVE (Flashcard MC drill)

Also standalone, NOT built on top of CdlQuiz. Goal: drill the 38 individual close-up part photos with a "pick the correct inspection statement" multiple-choice. Each photo has TWO phases the user can toggle:
1. **NORMAL** — yellow numbered circle on the part
2. **HIGHLIGHT** — same numbered circle PLUS a yellow oval outlining the entire part

### Layout
```
┌────────────────────────────────────────────────────┐
│  Tabs: [ENGINE 11] [CABIN 11] [TRAILER 16]         │
├──────────────┬─────────────────────────────────────┤
│ Sidebar      │  ┌─────────────────────────────┐   │
│ ▸ 1 Oil dipstick     [photo with overlays]    │   │
│   2 Coolant   │  └─────────────────────────────┘   │
│   3 Power…    │  [NORMAL] [HIGHLIGHT]              │
│   4 Washer…   │                                    │
│   5 Alternator│  ◀ PREV   5 of 11 · ALTERNATOR  ▶ │
│   ⋮           │                                    │
│   11 Battery  │  Q5  Which is the correct          │
│               │      inspection statement?         │
│               │   A  "I am checking the alternator…│
│               │   B  "I am checking the oil level…"│
│               │   C  "I am checking the battery…"  │
│               │                                    │
│               │      [ CONFIRM ]   [🔊 Speak]      │
└──────────────┴─────────────────────────────────────┘
```

### Behavior
- Sidebar lists every item in the active section with a visited (✓) marker.
- The 3 MC options for each item are: the correct `sayIt` + 2 short distractors picked from other items in the same section (random per render).
- CONFIRM → correct turns green, wrong turns red. Auto-advance after 1.5s OR user clicks NEXT.
- HIGHLIGHT toggle swaps `imagePath` to the `imageHighlightPath` (filename has `-highlight` suffix).
- Speak button uses TTS on `sayIt`.

### Persistence
- `cdl-pretrip-deep-visited` → `{ engine: [number...], cabin: [...], trailer: [...] }`
- `cdl-pretrip-deep-correct` → same shape, tracks per-item correct flags

---

## 8. PHOTO / ASSET REQUIREMENTS

### Parts Map photos (6 files)
Wide-angle photos of an actual NJ-spec Class A tractor-trailer, one per inspection area. Each photo has the numbered yellow circles burned in (or rendered as overlays via the hotspot coordinates):

```
/public/cdl-pretrip/
  1-front-engine.jpg       (front of cab, hood up)
  2-steering-axle.jpg      (front left tire/wheel area)
  3-side-of-tractor.jpg    (driver-side fuel tank / battery / frame)
  4-coupling.jpg           (fifth wheel, glad hands, kingpin area)
  5-trailer-front.jpg      (landing gear, reflective tape on side)
  6-rear-of-trailer.jpg    (rear lights, reflectors, mud flap)
```

### Deep Dive photos (38 items × 2 phases = up to 76 files)
Close-up photos of each individual part with the verbal inspection phrase overlaid in an "ORANGE TAG / SAY:" composite. Naming pattern: `{number}-{slug}.jpg` and optional `{number}-{slug}-highlight.jpg`.

```
/public/cdl-pretrip-deep/
  engine/
    1-oil-dipstick.jpg
    2-coolant-reservoir.jpg
    3-power-steering-fluid.jpg
    4-windshield-washer-fluid.jpg
    5-alternator.jpg
    6-water-pump.jpg
    7-drive-belts.jpg
    8-radiator-hoses.jpg
    9-air-compressor.jpg
    10-steering-box.jpg
    11-battery.jpg
  cabin/
    1-three-point-contact.jpg
    2-seat-belt.jpg
    3-mirrors.jpg
    4-steering-wheel.jpg
    5-horn.jpg
    6-wipers-windshield.jpg
    7-heater-defroster.jpg
    8-dashboard-gauges.jpg
    9-lights-dash-indicators.jpg
    10-emergency-equipment.jpg
    11-parking-brake.jpg
  trailer/
    1-brake-lights.jpg
    2-turn-signals.jpg
    3-clearance-marker-lights.jpg
    4-reflective-tape.jpg
    5-wheels-tires.jpg
    6-suspension.jpg
    7-landing-gear.jpg
    8-coupling-devices.jpg
    9-electrical-connections.jpg
    10-air-lines.jpg
    11-doors-latches.jpg
    12-undercarriage.jpg
    13-light-operation.jpg
    14-abs-light.jpg
    15-brake-chambers.jpg
    16-slack-adjusters.jpg
```

If you don't have real photos yet, generate placeholder composites with the part label burned in. The app must run without 404ing — every `<img>` must have an `onError` fallback to a styled SVG that shows the part number and label.

---

## 9. TECH STACK

**Recommended:**
- **React 18+** with **TypeScript** (strict mode)
- **Vite** for the dev server (HMR + fast cold start)
- **lucide-react** for icons
- **Tailwind CSS** or plain CSS modules — your call, but the existing implementation uses inline `style={}` objects on top of a small CSS variable system (`--bg-canvas`, `--bg-card`, `--border`, `--text-1/2/3/4`, `--pad-card`, `--grid-gap`, `--shadow-sm`). Either is fine.
- **Web Audio API** (synth sounds, no asset files)
- **SpeechSynthesis API** (TTS for the parts map / deep dive)
- **localStorage** for visited / correct / autospeak / position-override persistence

**Acceptable alternatives:** Next.js App Router, SvelteKit, Vue 3 + Vite, Flutter (mobile). Keep the architecture (single quiz engine + per-route theme) regardless of framework.

---

## 10. FULL QUESTION BANKS

The 13 banks below are the **complete source data**. Each entry has `id`, `q` (question), `opts` (3 options A/B/C), `ans` (0-indexed correct option), and optional `autoFail` flag. Author the data file as a TypeScript module exporting one array per endorsement.

> **Important:** Banks ship with **66 questions each** for most endorsements. The quiz engine samples the official MVC count (20/25/30) at random for the default test, so the learner gets a different shuffle every time and the bank can be expanded later without code changes.

### 10.1 HAZMAT (H) — 30 official, 66-question bank

```json
[
  {"id":1,"q":"Who is responsible for identifying the hazard class of a hazardous material?","opts":["The driver","The shipper","The carrier"],"ans":1},
  {"id":2,"q":"What does the hazardous materials regulations require shippers to do?","opts":["Inspect the vehicle before loading","Package, label, and mark hazardous materials properly","Provide the driver with a hazmat endorsement"],"ans":1},
  {"id":3,"q":"A shipping paper for hazardous materials must include:","opts":["The driver's CDL number","A proper shipping description for each hazmat","The vehicle's license plate number"],"ans":1},
  {"id":4,"q":"Where must shipping papers be kept while driving?","opts":["In the glove box","In a pouch on the driver's door, or on the seat, within reach","In the sleeper berth"],"ans":1},
  {"id":5,"q":"Where must shipping papers be kept when the driver is out of the vehicle?","opts":["In the cab, in clear view from the outside","In the driver's pocket","In the cargo area"],"ans":0},
  {"id":6,"q":"The hazardous materials identification number must appear on:","opts":["The shipping paper, package, and tank","Only the shipping paper","Only the outside of the package"],"ans":0},
  {"id":7,"q":"A placard is:","opts":["A shipping document describing the hazmat","A sign on the outside of a vehicle identifying the hazard class","A label on a package"],"ans":1},
  {"id":8,"q":"When must you placard a vehicle carrying hazardous materials?","opts":["Only when carrying explosives","When required by the hazardous materials regulations","Only when carrying more than 1,000 lbs"],"ans":1},
  {"id":9,"q":"What must you do before transporting a hazardous material?","opts":["Notify your dispatcher","Check that the shipping papers are correct and the vehicle is properly placarded","Call the shipper for instructions"],"ans":1},
  {"id":10,"q":"If hazardous materials are leaking from your vehicle, you should:","opts":["Keep driving to the nearest repair shop","Stop, keep others away, and call for help","Try to fix the leak yourself"],"ans":1},
  {"id":11,"q":"What is a hazardous material?","opts":["Any material that requires refrigeration during transport","Any substance or material that poses an unreasonable risk to health, safety, or property","Any liquid chemical compound"],"ans":1},
  {"id":12,"q":"Hazard class labels are required on:","opts":["The vehicle","Individual packages of hazardous materials","The shipping papers only"],"ans":1},
  {"id":13,"q":"The 'transport index' for radioactive materials tells you:","opts":["The weight of the radioactive shipment","The degree to which the package controls radiation exposure","The distance you must keep from the package"],"ans":1},
  {"id":14,"q":"If you are carrying Division 1.1 or 1.2 explosives, you must have a written route plan and:","opts":["Travel only at night","Have it approved by local authorities","Carry a fire extinguisher rated at least 10 B:C"],"ans":1},
  {"id":15,"q":"What does a four-digit identification number on a placard or orange panel identify?","opts":["The weight of the hazmat shipment","The specific hazardous material being transported","The hazard class number"],"ans":1},
  {"id":16,"q":"You must stop before a railroad crossing when carrying:","opts":["Any cargo over 10,000 lbs","Chlorine, explosives, or radioactive materials","Any liquid in bulk containers"],"ans":1},
  {"id":17,"q":"Flammable liquids are in hazard class:","opts":["Class 2","Class 3","Class 4"],"ans":1},
  {"id":18,"q":"Compressed gases are in hazard class:","opts":["Class 1","Class 2","Class 3"],"ans":1},
  {"id":19,"q":"Explosives are in hazard class:","opts":["Class 1","Class 2","Class 3"],"ans":0},
  {"id":20,"q":"Poisons (toxic materials) are in hazard class:","opts":["Class 4","Class 5","Class 6"],"ans":2},
  {"id":21,"q":"Oxidizers are in hazard class:","opts":["Class 4","Class 5","Class 6"],"ans":1},
  {"id":22,"q":"Radioactive materials are in hazard class:","opts":["Class 6","Class 7","Class 8"],"ans":1},
  {"id":23,"q":"Corrosive materials are in hazard class:","opts":["Class 7","Class 8","Class 9"],"ans":1},
  {"id":24,"q":"When fueling a vehicle carrying hazardous materials, someone must be:","opts":["Standing by with a fire extinguisher","At the nozzle, controlling the fuel flow","Both A and B"],"ans":2},
  {"id":25,"q":"When you are hauling hazardous materials and you stop to eat, you should park:","opts":["In a truck stop parking area","At least 300 feet from the restaurant or other public areas","Within sight of the restaurant"],"ans":1},
  {"id":26,"q":"If you must park a vehicle carrying explosives, how far must you stay from a bridge, tunnel, or building?","opts":["100 feet","300 feet","500 feet"],"ans":1},
  {"id":27,"q":"Which of the following is a proper description of a hazardous material on a shipping paper?","opts":["Gasoline, Flammable Liquid, UN1203","UN1203, Gasoline, 3, PG II","Gasoline, Class 3, Flammable"],"ans":1},
  {"id":28,"q":"The basic description on a shipping paper must include, in this order:","opts":["ID number, proper shipping name, hazard class, packing group","Proper shipping name, hazard class, ID number","Hazard class, ID number, proper shipping name"],"ans":0},
  {"id":29,"q":"What is a 'reportable quantity' (RQ)?","opts":["The maximum weight of hazmat you can carry","An amount of hazardous material that requires emergency reporting if spilled","The quantity of hazmat that requires a placard"],"ans":1},
  {"id":30,"q":"What document must you have when transporting hazardous waste?","opts":["A hazmat manifest signed by the generator and all carriers","A standard bill of lading","A special permit from the EPA"],"ans":0},
  {"id":31,"q":"Containers of hazardous material should be loaded:","opts":["On top of other freight","Away from heat sources and in proper orientation","As close to the cab as possible"],"ans":1},
  {"id":32,"q":"Never transport a leaking package unless:","opts":["The leak is small and controllable","It is absolutely necessary and you take precautions","The shipper gives you written permission"],"ans":1},
  {"id":33,"q":"You should NOT transport hazardous materials if:","opts":["The vehicle is not properly placarded","You don't have a hazmat endorsement","Both A and B"],"ans":2},
  {"id":34,"q":"When is it acceptable to smoke within 25 feet of a vehicle carrying explosives or flammables?","opts":["Never","Only if the engine is off","Only during daylight hours"],"ans":0},
  {"id":35,"q":"If you are involved in an accident involving hazardous materials, you should first:","opts":["Call the shipper","Protect the public and call emergency services","Move the vehicle to a safe location"],"ans":1},
  {"id":36,"q":"The Emergency Response Guidebook (ERG) is used to:","opts":["Document hazmat shipments","Guide emergency responders and drivers during hazmat incidents","Assign hazard class numbers"],"ans":1},
  {"id":37,"q":"What is a 'bill of lading'?","opts":["A type of placard used for mixed loads","A shipping document listing cargo and its destination","A record of hazmat training"],"ans":1},
  {"id":38,"q":"Which of the following cannot be loaded together?","opts":["Explosives and blasting caps","Canned foods and paper products","Auto parts and general freight"],"ans":0},
  {"id":39,"q":"A 'DANGEROUS' placard may be used when:","opts":["Carrying any two different classes of hazardous materials","Carrying 1,001 lbs or more of two or more classes of hazardous materials (with some exceptions)","Carrying any amount of Division 2.1 gas"],"ans":1},
  {"id":40,"q":"How should you handle a package labeled 'THIS SIDE UP'?","opts":["Load it in any direction as long as it's secure","Keep it right-side up at all times","Only applicable when stacking"],"ans":1},
  {"id":41,"q":"When transporting Division 1.1 explosives, you must not park within ___ feet of a crowd.","opts":["100","300","500"],"ans":1},
  {"id":42,"q":"Packing group designations (PG I, II, III) indicate:","opts":["The hazard class number","The degree of danger — I being greatest, III being least","The weight of the package"],"ans":1},
  {"id":43,"q":"What is the purpose of segregation requirements for hazardous materials?","opts":["To reduce weight in the trailer","To prevent dangerous reactions between incompatible materials","To comply with DOT weight limits"],"ans":1},
  {"id":44,"q":"Which hazardous materials cannot be transported by any driver without a hazmat endorsement?","opts":["Only explosive materials","Any material requiring a placard","Only radioactive materials"],"ans":1},
  {"id":45,"q":"What is a 'cargo manifest'?","opts":["A list of all cargo on the vehicle, including hazmat","The emergency response contact sheet","A permit to transport hazardous materials"],"ans":0},
  {"id":46,"q":"If a hazmat shipment is refused by the consignee, the driver should:","opts":["Dump the material and return empty","Return the shipment to the shipper or get new delivery instructions from the carrier","Leave it at the consignee's location"],"ans":1},
  {"id":47,"q":"Outage means:","opts":["A spill of hazardous liquid","The amount of space left in a tank after filling to allow for expansion","The venting of compressed gases"],"ans":1},
  {"id":48,"q":"When loading or unloading hazardous materials, the engine should be:","opts":["Running to power the pump","Turned off unless it powers unloading equipment","Running at all times for safety"],"ans":1},
  {"id":49,"q":"Which class of hazmat requires you to stop at least 1,000 feet from a fire?","opts":["Class 3 Flammables","Class 1 Explosives","Class 8 Corrosives"],"ans":1},
  {"id":50,"q":"The shipper's certification on a shipping paper states:","opts":["The driver has inspected the cargo","The shipper certifies the shipment is properly described, packaged, marked, and in condition for transport","The carrier accepts liability for the shipment"],"ans":1},
  {"id":51,"q":"Hazardous material labels must be placed:","opts":["On the shipping paper only","Near the marked ID number on the package","On the vehicle door"],"ans":1},
  {"id":52,"q":"Which of the following must be reported to the National Response Center?","opts":["Any minor spill of hazardous material","Spills that meet or exceed reportable quantities, or cause death/injury","All hazmat accidents regardless of size"],"ans":1},
  {"id":53,"q":"The 'proper shipping name' is:","opts":["The brand name of the product","The DOT-approved name for the hazardous material","The chemical formula of the substance"],"ans":1},
  {"id":54,"q":"Which placard is required for a vehicle carrying 1,000 lbs or more of any single Class 1 (explosive) material?","opts":["DANGEROUS","The specific explosive division placard","EXPLOSIVE 1.4 only"],"ans":1},
  {"id":55,"q":"Inhalation hazard materials must have which label on each package?","opts":["POISON","POISON INHALATION HAZARD or INHALATION HAZARD","TOXIC GAS"],"ans":1},
  {"id":56,"q":"When must you use a hazmat endorsed driver to transport chlorine in a cargo tank?","opts":["Only when carrying more than 1,000 lbs","At all times — chlorine always requires a hazmat endorsement","Only when crossing state lines"],"ans":1},
  {"id":57,"q":"A vehicle placarded for hazardous materials must display placards:","opts":["On the front only","On all four sides","On the rear and sides only"],"ans":1},
  {"id":58,"q":"Flammable gases such as propane are in Division:","opts":["2.1","2.2","2.3"],"ans":0},
  {"id":59,"q":"Non-flammable compressed gases such as nitrogen are in Division:","opts":["2.1","2.2","2.3"],"ans":1},
  {"id":60,"q":"Poison gases are in Division:","opts":["2.1","2.2","2.3"],"ans":2},
  {"id":61,"q":"What does 'N.O.S.' mean on a shipping paper?","opts":["Not on schedule","Not otherwise specified","No outward signs"],"ans":1},
  {"id":62,"q":"Bulk packaging is defined as a single container with a capacity of:","opts":["More than 119 gallons for liquids, or more than 882 lbs for solids","More than 55 gallons for liquids","More than 500 lbs for solids"],"ans":0},
  {"id":63,"q":"When carrying hazardous materials, what is the minimum fire extinguisher rating required?","opts":["5 B:C","10 B:C","20 B:C"],"ans":1},
  {"id":64,"q":"If you discover a hazmat leak during a trip, you should:","opts":["Continue to your destination quickly","Stop safely, secure the area, identify the hazmat, and call for help","Try to reseal the package"],"ans":1},
  {"id":65,"q":"Which agency regulates the transportation of hazardous materials?","opts":["EPA","OSHA","DOT / PHMSA"],"ans":2},
  {"id":66,"q":"Hazmat endorsements require background checks because:","opts":["Drivers must be bonded","Certain hazmat materials are security-sensitive and could be used as weapons","It is a standard CDL requirement for all endorsements"],"ans":1}
]
```

### 10.2 AIR BRAKES (CORE) — 25 official, 66-question bank

```json
[
  {"id":1,"q":"The application pressure gauge shows how much air pressure you:","opts":["Have in the air tanks","Are applying to the brakes","Have in a modulating control valve"],"ans":1},
  {"id":2,"q":"The spring brakes used on the chambers in a straight truck will bring you to stop when air pressure drops below ___ psi:","opts":["20","60","100"],"ans":1},
  {"id":3,"q":"Some air brake systems have an alcohol evaporator. What may happen if you don't keep the proper level of alcohol?","opts":["The S-cam may not take back when you release the brake pedal","Ice may form in the air storage tank and cause a brake failure","Ice may form on the brake drums and wear them out"],"ans":1},
  {"id":4,"q":"Your truck or bus has a dual air brake system. If a low air pressure warning comes on for only one system, what should you do?","opts":["Bring your vehicle to a complete stop right away and safely park. Continue only after the system is fixed.","Reduce your speed and test the remaining system while under way.","Reduce your speed and drive to the nearest garage for repairs."],"ans":0},
  {"id":5,"q":"Why drain water from compressed air tanks?","opts":["Water's low boiling point reduces braking power.","Water can freeze in cold weather and cause brake failure.","Water cools the compressor too much."],"ans":1},
  {"id":6,"q":"The safety valve is set automatically when pressure is:","opts":["50","100","150"],"ans":2},
  {"id":7,"q":"Your truck has a dual air system and one system loses its pressure. What will happen?","opts":["Brake drums will not be fully pressurized.","The manual slack adjusters of the S-cam brakes will not be set properly.","Either the front or back brake will not be fully operational."],"ans":2},
  {"id":8,"q":"Parking or emergency brakes of trucks and buses can be legally held on by ___ pressure:","opts":["Spring","Air","Fluid"],"ans":0},
  {"id":9,"q":"If your truck or bus has dual parking control valves, you can use pressure from a separate tank to:","opts":["Balance the service brake system when you are parked.","Stay parked twice as long without using up service air pressure.","Release the spring emergency/parking brakes to move a short distance."],"ans":2},
  {"id":10,"q":"If your truck has a properly functioning dual air brake system and minimum size air tanks, the air pressure should build up from 85-100 psi within how many seconds?","opts":["60","30","45"],"ans":2},
  {"id":11,"q":"How should you check that your service brakes are working properly?","opts":["Park on slight grade, drain off air pressure, set parking brake and check for movement.","Park on level ground, chock the wheels, engage parking brakes when you have correct amount of air.","Park on level ground, wait until normal air pressure is reached, release the parking brake and move forward."],"ans":2},
  {"id":12,"q":"A straight truck or bus air brake system should not leak at the rate of more than ___ psi per minute with the engine off and the brakes released:","opts":["1","2","3"],"ans":1},
  {"id":13,"q":"During normal driving, spring brakes are usually held back by:","opts":["Bolts or clamps","Air pressure","Spring pressure"],"ans":1},
  {"id":14,"q":"The air compressor stops pumping air at what psi?","opts":["100","125","150"],"ans":1},
  {"id":15,"q":"The driver must be able to see a low air pressure warning which comes on before pressure in the service air tanks falls below ___ psi:","opts":["40","60","80"],"ans":1},
  {"id":16,"q":"Excessive use of the service brakes results in overheating which can lead to:","opts":["Proper adjustment of S-cam","Increase contact between the brake drums and linings","Expansion of the brake drums"],"ans":2},
  {"id":17,"q":"The most common type of foundation brake found on heavy vehicles is the:","opts":["Wedge drum","S-cam drum","Disc"],"ans":1},
  {"id":18,"q":"If you must make an emergency stop, you should brake so you:","opts":["Use the hand brake before the brake pedal.","Can steer and so your vehicle stays in a straight line.","Use the full power of the brakes to lock them."],"ans":1},
  {"id":19,"q":"Which of the following statements about brakes is true?","opts":["The heavier a vehicle or the faster it is moving, the more heat the brakes have to absorb.","Brakes have more stopping power when they get very hot.","All of the above are true."],"ans":0},
  {"id":20,"q":"If your vehicle has an alcohol evaporator, every day during cold weather you should:","opts":["Check and fill the alcohol level.","Change the alcohol from a new bottle.","Check the oil for alcohol content."],"ans":0},
  {"id":21,"q":"The air loss rate for a straight truck or bus with the engine off and the brakes on should not be more than:","opts":["1 psi in 30 seconds","2 psi in 45 seconds","3 psi in one minute"],"ans":2},
  {"id":22,"q":"The driver must be able to see a low air pressure warning which comes on before pressure in the service air tanks falls below ___ psi:","opts":["50","60","80"],"ans":1},
  {"id":23,"q":"The braking power of the spring brakes:","opts":["Is not affected by the condition of the service brakes.","Depends on the service brakes being in adjustment.","Increases when the service brakes are hot."],"ans":1},
  {"id":24,"q":"The air brake lag distance at 55 mph on dry pavement adds about ___ feet:","opts":["12 feet","32 feet","52 feet"],"ans":1},
  {"id":25,"q":"Total stopping distance for air brakes is longer than that for hydraulic brakes due to ___ distance:","opts":["Brake lag","Reaction","Effective braking"],"ans":0},
  {"id":26,"q":"It is accepted that too much heat caused by using your brakes too often can also cause:","opts":["Modulated control valve to wear out","Brake linings to split up","Brake to fade or fail"],"ans":2},
  {"id":27,"q":"Repeatedly partially releasing and pressing the brake pedal may result in:","opts":["A loss of brake air pressure","A build up of brake air pressure","No change of brake air pressure"],"ans":0},
  {"id":28,"q":"The brake system that applies and releases the brakes when the driver uses the brake pedal is the ___ brake system:","opts":["Emergency","Service","Parking"],"ans":1},
  {"id":29,"q":"A slack adjuster's free play needs to be adjusted if it is more than about ___ inches when you pull hard on it:","opts":["¼ inch","½ inch","1 inch"],"ans":2},
  {"id":30,"q":"An air brake system is fully charged at what psi?","opts":["75","100","125"],"ans":2},
  {"id":31,"q":"The purpose of engine retarders is to:","opts":["Provide emergency brakes.","Help slow the vehicle while driving and reduce brake-wear.","Apply extra braking power to the non-drive axles."],"ans":1},
  {"id":32,"q":"The brake pedal in an air brake system:","opts":["Controls the speed of the air compressor.","Controls the air pressure applied to put on the brakes.","Is connected to slack adjuster by a series of rods and linkages."],"ans":1},
  {"id":33,"q":"The S-cam:","opts":["Controls the flow of air to each of the brake chambers.","Pulls the brake shoes away from the drum and allows the wheels to roll freely.","Forces the brake shoes against the inside of the brake drum."],"ans":2},
  {"id":34,"q":"Under normal conditions in order to engage the parking brakes, the driver should:","opts":["Turn off the engine.","Let the air out of the air brake system.","Be sure the air brakes system is fully pressurized."],"ans":1},
  {"id":35,"q":"All air brake equipped vehicles have:","opts":["A supply pressure gauge","An air usage gauge","A backup hydraulic system"],"ans":0},
  {"id":36,"q":"With air brake vehicles, the parking brakes should be used:","opts":["Whenever you leave the vehicle unattended.","As little as possible.","Only during pre-and post-trip inspections."],"ans":0},
  {"id":37,"q":"A straight truck or bus air brake system should not leak at the rate of more than ___ psi per minute with the engine off and the brakes released:","opts":["1","3","2"],"ans":2},
  {"id":38,"q":"Which of these is NOT a proper time to apply the parking brakes?","opts":["To brake the vehicle very hard when coming down a steep grade.","To use parking brakes if you park for less than 1 hour.","If you are going to use the parking brakes, make sure they will hold the vehicle."],"ans":0},
  {"id":39,"q":"Which of the following is okay to find in the air brake system?","opts":["Oil","Air, Water","Both A and B"],"ans":2},
  {"id":40,"q":"You lose steering control when:","opts":["You have a front tire blow out.","Your steering tires lock up.","You use the controlled braking method."],"ans":1},
  {"id":41,"q":"If the spring brakes are on, when should you push the brake pedal?","opts":["Only when driving downhill.","Only on a slippery road.","Never."],"ans":2},
  {"id":42,"q":"To check the free play of manual slack adjusters of S-cam brakes, you should park on:","opts":["Level ground, chock the wheels and release the parking brakes.","Level ground and apply the parking brakes then apply service brakes.","Level ground and drain off air pressure before checking the adjustment."],"ans":0},
  {"id":43,"q":"Effective braking distance is:","opts":["The distance your vehicle travels after you see the hazard.","The distance your vehicle travels after you react to the hazard.","The distance your vehicle travels after brakes have been applied."],"ans":2},
  {"id":44,"q":"Of the choices below, the first thing to do when an air pressure warning comes on is:","opts":["Stop and safely park as soon as possible.","Transfer the air from the back-up tank.","Adjust the brake adjusters for more travel."],"ans":0},
  {"id":45,"q":"The use of brakes on a long and steep downgrade under normal conditions is only a supplement to:","opts":["Use of spring brakes.","The use of the front brakes limiting valve.","The braking effect of the engine."],"ans":2},
  {"id":46,"q":"The most important thing to do when a low air pressure warning comes on is:","opts":["Upshift.","Downshift.","Stop and safely park as soon as possible."],"ans":2},
  {"id":47,"q":"The parking or emergency brake on a heavy vehicle can only be held in position by something that cannot leak away, like:","opts":["Spring pressure","Air pressure","Hydraulic pressure"],"ans":0},
  {"id":48,"q":"Air braking takes more time than hydraulic braking because air:","opts":["Air brakes use different brake drums.","Takes more time to flow through the lines than hydraulic fluid.","Brakes require heavier return springs."],"ans":1},
  {"id":49,"q":"When brakes are applied, the brake shoes will press against the:","opts":["Brake drum or disc.","Slack adjuster.","S-cam."],"ans":0},
  {"id":50,"q":"The safety valve discharges automatically at the pressure of:","opts":["50","100","150"],"ans":2},
  {"id":51,"q":"Emergency stab braking is:","opts":["When you press hard on a brake pedal and apply hand valve while you stop.","Use light steady pressure on the brake pedal.","Press on the brake pedal as hard as you can, release when wheels lock, then re-apply the brakes."],"ans":2},
  {"id":52,"q":"A slack adjuster's free play needs to be adjusted if it is more than about ___ inches when you pull hard on it:","opts":["¼ inch","½ inch","1 inch"],"ans":2},
  {"id":53,"q":"If air pressure is not built up within the correct amount of time, then:","opts":["You should be ready to use your parking brakes to stop.","The alcohol container may be low.","Your air pressure may drop to a low point while driving, requiring an emergency stop."],"ans":2},
  {"id":54,"q":"The supply pressure gauge shows how much pressure:","opts":["Is in the air tanks.","You have used in this trip.","Is going to the brake chamber."],"ans":0},
  {"id":55,"q":"Your brakes are fading when:","opts":["You have to push harder on a brake pedal to control your speed on a downgrade.","Less pressure is needed on the brake pedal for each stop.","The brake pedal feels spongy when you apply pressure."],"ans":0},
  {"id":56,"q":"If your vehicle has an alcohol evaporator, it is there to:","opts":["Eliminate the need for daily tank draining.","Boost tank pressure the same way turbochargers boost the engine.","Reduce the risk of icing in air brake valves in cold weather."],"ans":2},
  {"id":57,"q":"The air compressor governor controls:","opts":["The speed of the air compressor.","Air pressure applied to the brakes.","When air is pumped into the air tanks."],"ans":2},
  {"id":58,"q":"Modern air brake systems combine three different systems. They are the service, the parking, and the ___ brakes:","opts":["Emergency","Foot","Drum"],"ans":0},
  {"id":59,"q":"If you do not have automatic tank drains, how often should you drain the oil and water from compressed air storage tanks?","opts":["After every four hours of service.","At the end of each day of driving.","Once a week."],"ans":1},
  {"id":60,"q":"The proper use of brakes going down a long steep grade after selecting a proper gear is to brake until your speed is about ___ mph below the posted speed, then release:","opts":["5 mph","15 mph","10 mph"],"ans":0},
  {"id":61,"q":"In ideal conditions, a truck or bus with air brakes going at 55 mph would require a stopping distance of how many feet?","opts":["Less than 100 feet","More than 300 feet","From 100 to 300 feet"],"ans":1},
  {"id":62,"q":"When is it OK to leave your truck unattended without applying the parking brakes and chocking the wheels?","opts":["Never.","If you are only away for a few minutes.","If you are conducting a pre-trip inspection."],"ans":0},
  {"id":63,"q":"The stop light switch:","opts":["Tells you when the air brake system is at low air pressure.","Tells you when you need to use your emergency brakes.","Turns on your brake lights to warn drivers behind you."],"ans":2},
  {"id":64,"q":"It is not safe to drive a vehicle that has brake drums with cracks longer than ___ of the width of the friction area:","opts":["½","¼","1/8"],"ans":0},
  {"id":65,"q":"To test air service brakes you should:","opts":["Stop the vehicle, brake in a low gear, depress the service brakes and then gently pull against the brakes.","Brake firmly while slowly moving forward.","Brake slowly while slowly moving backward."],"ans":1},
  {"id":66,"q":"If driving down a steep downgrade and you reach 40 mph, you apply the service brake until your speed drops below ___ mph:","opts":["25","30","35"],"ans":2}
]
```

### 10.3 TANKER (N) — 20 official, 66-question bank

Topics: liquid surge, outage / expansion space, baffled vs smooth-bore vs compartmented tanks, high center of gravity / rollover physics, tank inspection, loading / unloading, emergency handling.

```json
[
  {"id":1,"q":"A tank vehicle endorsement (N) is required when a driver operates a vehicle designed to transport:","opts":["Any cargo with a sealed-tank component","Liquid or gaseous individual containers rated 119 gallons or more (combined capacity 1,000 gallons or more)","Only flammable liquids in cargo tanks"],"ans":1},
  {"id":2,"q":"Why is hauling liquid in a tank vehicle especially dangerous?","opts":["Liquids freeze faster than solids","Liquid surge, a high center of gravity, and a slow weight transfer raise rollover risk","Liquids cause the engine to overheat"],"ans":1},
  {"id":3,"q":"What is \"outage\"?","opts":["The percent of a tank a driver may legally leave empty","The space left in a tank to allow the liquid to expand with temperature","A scheduled gap in dispatch availability"],"ans":1},
  {"id":4,"q":"A liquid that expands a lot with temperature requires:","opts":["Less outage","More outage","The same outage as any other load"],"ans":1},
  {"id":5,"q":"A \"smooth-bore\" tank has:","opts":["Internal baffles that slow liquid surge","No baffles or bulkheads, so the liquid surges freely front-to-back","Multiple separate compartments"],"ans":1},
  {"id":6,"q":"Drivers of smooth-bore tanks must be especially careful to:","opts":["Brake gradually and start gently to control liquid surge","Drive only on highways","Keep the tank exactly half-full"],"ans":0},
  {"id":7,"q":"Baffled tanks have:","opts":["Bulkheads with holes that let liquid flow through while reducing surge","Solid bulkheads that fully separate compartments","No bulkheads, just outer walls"],"ans":0},
  {"id":8,"q":"A tank with separate compartments allows you to carry:","opts":["Loads at different temperatures only","Different products at the same time, with each compartment loaded independently","Only liquids of the same density"],"ans":1},
  {"id":9,"q":"When loading compartmented tanks, watch:","opts":["Vehicle weight distribution and axle limits","Engine temperature","Tire tread depth"],"ans":0},
  {"id":10,"q":"Liquid surge can be most dangerous when:","opts":["Driving on a long straight highway","Stopping at intersections or signals — the surge can push the vehicle through the stop","Driving at a steady speed"],"ans":1},
  {"id":11,"q":"Compared to other vehicles, tank vehicles have a:","opts":["Lower center of gravity","Higher center of gravity, increasing rollover risk","Center of gravity that does not affect stability"],"ans":1},
  {"id":12,"q":"On a curve, a tank vehicle should be driven:","opts":["At the posted speed limit","Well below the posted curve speed — often by one-quarter to one-third","Slightly above the posted curve speed for stability"],"ans":1},
  {"id":13,"q":"Liquid tankers are most likely to roll over on:","opts":["Long straight roads","Highway entrance and exit ramps and sharp curves","Bridges"],"ans":1},
  {"id":14,"q":"When driving an empty or partially loaded tank, you should:","opts":["Steer aggressively to keep the load moving","Brake well in advance because surge can extend stopping distance","Drive at maximum legal speed"],"ans":1},
  {"id":15,"q":"Before transporting a tank load, you should check:","opts":["The shipping papers only","Manholes, valves, vents and hatches for leaks and proper sealing","Only the tires and lights"],"ans":1},
  {"id":16,"q":"During pre-trip on a cargo tank, you should also inspect:","opts":["The emergency / cut-off valves and accident-damage protection devices","Only the brake lines","The seat belt only"],"ans":0},
  {"id":17,"q":"Special purpose tank equipment that should be inspected before driving includes:","opts":["Vapor recovery hoses, gauges, and grounding cables (when applicable)","Bluetooth speakers","Air conditioner filters"],"ans":0},
  {"id":18,"q":"A leaking tank vehicle should be:","opts":["Driven to the destination as fast as possible","Stopped immediately if a leak threatens the cargo or public — only moved if absolutely necessary and only to a safer location","Driven to the next state line for inspection"],"ans":1},
  {"id":19,"q":"Why must drivers keep liquid surge from interfering with braking?","opts":["Surge can push the vehicle forward after braking, lengthening stopping distance","Surge raises engine speed","Surge causes tire skid only on dry pavement"],"ans":0},
  {"id":20,"q":"If you must steer hard to avoid a hazard while hauling a smooth-bore liquid load, you should:","opts":["Counter-steer normally and expect the load to behave like a solid","Anticipate the surge — slow before the maneuver, then make the gentlest possible turn","Apply maximum brakes during the maneuver"],"ans":1},
  {"id":21,"q":"Tank vehicles take ___ to stop than dry-bulk or solid loads of the same weight.","opts":["Less time","About the same time","More time"],"ans":2},
  {"id":22,"q":"In hot weather, tank trucks should be loaded:","opts":["Fully to maximum capacity to keep the load cool","With enough outage to allow for liquid expansion","To the brim because expansion is minimal"],"ans":1},
  {"id":23,"q":"The amount of liquid to load into a tank depends on:","opts":["The weight of the liquid, legal weight limits, and the amount the liquid will expand in transit","Only the brand of the truck","The driver's preference"],"ans":0},
  {"id":24,"q":"A tank truck driver should think of the load as:","opts":["A stable mass that behaves like a solid","A shifting load that can throw the truck out of control during sudden moves","A constant cargo that does not affect handling"],"ans":1},
  {"id":25,"q":"The hauler of a hazardous-material cargo tank must hold:","opts":["Only a Class A CDL","A Tank (N) endorsement, and a Hazmat (H) endorsement when the cargo requires placards","Only the Hazmat endorsement"],"ans":1},
  {"id":26,"q":"A driver with both Tank and Hazmat endorsements holds the:","opts":["T endorsement","X endorsement (combination)","P endorsement"],"ans":1},
  {"id":27,"q":"When loading a tank with a flammable liquid, the engine should be:","opts":["Idling to keep the pumps cool","Turned off unless it is required to power the loading equipment","Run at high RPM to ground the system"],"ans":1},
  {"id":28,"q":"Tanks must be properly bonded and grounded when loading flammable liquids to prevent:","opts":["Cargo spoilage","Static electricity sparks that could ignite vapors","Tire wear"],"ans":1},
  {"id":29,"q":"\"Splash loading\" (loading from the top with the inlet near the top) is dangerous because it:","opts":["Forces sediment to settle too quickly","Builds static electricity and produces vapors that can ignite","Loads the tank unevenly between compartments"],"ans":1},
  {"id":30,"q":"Bottom loading reduces:","opts":["Static electricity and vapor escape","Brake wear","Tire pressure"],"ans":0},
  {"id":31,"q":"A driver may load liquid hazmat above the outage requirement only if:","opts":["The dispatcher approves","It is never permitted — outage is a federal requirement","The receiver insists on overfilling"],"ans":1},
  {"id":32,"q":"For most tank vehicles hauling liquids in bulk, regulations require the driver to:","opts":["Keep both hands on the wheel at all times","Slow down significantly for curves and ramps to prevent rollover","Drive only during daylight hours"],"ans":1},
  {"id":33,"q":"Air-relief vents on a tank should be:","opts":["Tied closed during transit","Kept clear and operating to release pressure as the temperature changes","Removed before highway driving"],"ans":1},
  {"id":34,"q":"When a tank vehicle is parked on a slope:","opts":["The liquid will pool toward the low end, raising rollover risk when restarting","Liquid stays evenly distributed","The brakes are unaffected by liquid position"],"ans":0},
  {"id":35,"q":"When inspecting a tank, you should also check:","opts":["Special markings on the tank (UN/NA number, retest dates, capacity)","The radio antenna","The cab seat upholstery"],"ans":0},
  {"id":36,"q":"Bulk packaging for liquid is defined as a single container with capacity greater than:","opts":["55 gallons","119 gallons for liquids","500 gallons"],"ans":1},
  {"id":37,"q":"If a tank vehicle starts to skid in a curve, the safest reaction is to:","opts":["Apply the brakes hard and turn into the skid","Release the brakes, ease off the throttle, and steer smoothly in the desired direction","Lock the wheels until the slide stops"],"ans":1},
  {"id":38,"q":"Why is \"controlled\" or \"stab\" braking preferred to slamming the brakes in a tank vehicle?","opts":["It uses less air pressure","It avoids lock-up and jackknife, while keeping the truck steerable","It is required by the EPA"],"ans":1},
  {"id":39,"q":"Hatches on a tank must be:","opts":["Closed and secured before moving","Left open to vent vapors during transit","Removed before loading"],"ans":0},
  {"id":40,"q":"When unloading, you should:","opts":["Stay with the vehicle and watch the gauge / level to prevent overfill or spill","Leave the area to avoid fumes","Disconnect the brakes to allow gravity flow"],"ans":0},
  {"id":41,"q":"A driver crossing a railroad track in a placarded tank carrying hazardous materials must:","opts":["Drive across at posted speed","Stop between 15 and 50 feet from the nearest rail, then proceed only when safe","Slow to 5 mph only"],"ans":1},
  {"id":42,"q":"When a tank truck must stop at every railroad crossing, the driver must NOT shift gears:","opts":["Until at least 100 feet beyond the crossing","While crossing the tracks","Until reaching the next county line"],"ans":1},
  {"id":43,"q":"The legal weight limit for a tank vehicle is governed by:","opts":["Federal, state, and local axle and gross-weight limits","Only the tank manufacturer","Only the shipper"],"ans":0},
  {"id":44,"q":"A driver should weigh a loaded tank because:","opts":["The shipping paper alone cannot guarantee compliance with axle weight limits","Liquid is always lighter than equivalent solid loads","Weighing improves fuel economy"],"ans":0},
  {"id":45,"q":"A tank truck driver braking on a slick surface should:","opts":["Slam the brakes for maximum stopping power","Use gentle pressure on the brakes and avoid sudden steering inputs","Apply the parking brake only"],"ans":1},
  {"id":46,"q":"Tank vehicles are most likely to roll over because:","opts":["The tires are too narrow","The high center of gravity combined with liquid surge can shift weight outward through a curve","They have too many axles"],"ans":1},
  {"id":47,"q":"A \"wet tank\" load that is less than full will tend to:","opts":["Behave exactly like a full tank","Surge more violently than a fully-loaded smooth-bore tank","Have no special handling considerations"],"ans":1},
  {"id":48,"q":"To reduce front-to-back surge after braking, a driver should:","opts":["Release the brakes a moment before the vehicle has fully stopped (only when conditions allow) so the surge does not throw the truck forward","Brake harder right at the stop","Hold the throttle on while braking"],"ans":0},
  {"id":49,"q":"In hot weather, a loaded tank parked in the sun:","opts":["Can build pressure as the liquid expands — relief vents must work properly","Cools the liquid through radiation","Should be sealed completely to prevent loss"],"ans":0},
  {"id":50,"q":"When unloading liquid from a tank, the most important thing to monitor is:","opts":["The truck radio","The unloading process itself — stay with the vehicle to react to spills, hose failures, or overfills","The trailer registration"],"ans":1},
  {"id":51,"q":"A tank truck driver hauling a smooth-bore load through a series of curves should:","opts":["Brake into each curve and accelerate out","Smooth speed adjustments well before each curve to prevent surge buildup","Maintain maximum legal speed"],"ans":1},
  {"id":52,"q":"\"Side-to-side\" surge in a tank can:","opts":["Help corner stability","Tip the vehicle in a sharp turn even at moderate speed","Reduce braking distance"],"ans":1},
  {"id":53,"q":"If a tank rollover is imminent, the driver should:","opts":["Steer aggressively in the opposite direction","Brace and ride it down — do not try to abandon the vehicle while moving","Open the cab door and jump"],"ans":1},
  {"id":54,"q":"Tankers transporting petroleum products are typically required to carry:","opts":["No emergency equipment","Fire extinguishers, spill kits, and emergency response info as required","Only a flashlight"],"ans":1},
  {"id":55,"q":"After delivery, residual product in the tank should be considered:","opts":["Always safe — the tank is \"empty\"","Still potentially hazardous (vapors, residue), so all safety procedures still apply","A free gift to the next shipper"],"ans":1},
  {"id":56,"q":"\"Bulkheads\" inside a baffled tank:","opts":["Are solid walls between compartments","Are walls with holes that allow some liquid flow while limiting surge","Are external markings only"],"ans":1},
  {"id":57,"q":"Special hazards of food-grade tankers include:","opts":["They have no baffles for sanitation reasons, so surge is significant","They are exempt from rollover rules","They never need outage"],"ans":0},
  {"id":58,"q":"A driver hauling a tank load of any kind should plan:","opts":["A route avoiding sharp curves, steep grades, and railroad crossings where possible","The shortest possible route regardless of conditions","Only the return leg"],"ans":0},
  {"id":59,"q":"When approaching a downgrade with a tank load, you should:","opts":["Wait until you are halfway down to shift to a lower gear","Select the right gear and check brakes BEFORE starting the descent","Use the spring brake to control speed"],"ans":1},
  {"id":60,"q":"A loaded tank vehicle climbing a steep grade should:","opts":["Be driven at maximum throttle to maintain speed","Use the right gear for the grade, expecting reduced speed and longer climb","Be parked at the bottom and re-loaded lighter"],"ans":1},
  {"id":61,"q":"When using engine brake/retarder on a tank vehicle:","opts":["Avoid use on slippery surfaces — the drive wheels can lose traction and slide","Use only at highway speeds","Use only at idle"],"ans":0},
  {"id":62,"q":"If a tank load is \"live load\" (water, fuel, etc.) the driver should remember that:","opts":["Stops and starts must be gentler than for solid loads","It behaves the same as boxes","It improves acceleration"],"ans":0},
  {"id":63,"q":"In an emergency that requires hard braking in a tank vehicle, you should:","opts":["Brake hard enough to lock the wheels","Use controlled / stab braking and steer to a safe escape path, keeping the vehicle straight if possible","Pull the trailer brake only"],"ans":1},
  {"id":64,"q":"When hauling a tank load through wind gusts on a bridge, you should:","opts":["Speed up to clear the bridge","Slow down and grip the wheel firmly to counter side-thrust","Stop on the bridge and wait it out"],"ans":1},
  {"id":65,"q":"The driver of a tank vehicle must understand that, compared to dry-van trailers, the tank trailer:","opts":["Has identical handling characteristics","Reacts more violently to steering and braking due to liquid movement","Stops more quickly at all speeds"],"ans":1},
  {"id":66,"q":"The single most important rule for tank vehicle drivers is:","opts":["Always drive at the posted speed limit","Anticipate liquid movement — drive smoothly, brake early, and slow down well before curves","Refuel only at company yards"],"ans":1}
]
```

### 10.4 DOUBLES / TRIPLES (T) — 20 official, 66-question bank

Topics: coupling and uncoupling sequence, converter dollies, pintle hooks, off-tracking on turns, "crack-the-whip" rearward amplification, brake lag across multiple trailers, inspection sequence, and special rules for long combination vehicles.

> **All 66 questions follow the same JSON schema. The full list is embedded in `src/zones/cdl/cdl-questions.ts` in the existing implementation. Copy the array exactly. Sample (first 10) shown below for format clarity; reproduce all 66 verbatim.**

```json
[
  {"id":1,"q":"The T endorsement is required for drivers operating a vehicle pulling:","opts":["Any trailer over 10,000 lbs","More than one trailer (doubles or triples)","A single trailer over 53 feet long"],"ans":1},
  {"id":2,"q":"The most important reason for using extra caution with doubles and triples is:","opts":["Lower fuel economy","Rearward amplification — the rear trailer reacts more violently to steering than the front","Reduced engine power"],"ans":1},
  {"id":3,"q":"\"Crack-the-whip\" refers to:","opts":["A coupling technique","How sudden steering by the tractor causes the rear trailer to swing much more sharply","A type of brake fade"],"ans":1},
  {"id":4,"q":"The rear trailer of a triple can swing how much compared to the tractor in a sudden lane change?","opts":["About the same","Roughly 2 to 3 times as much side-to-side","Half as much"],"ans":1},
  {"id":5,"q":"When pulling doubles or triples, the heaviest trailer should be:","opts":["Coupled at the rear of the combination","Coupled directly behind the tractor (closest to the cab)","Placed in the middle of a triple"],"ans":1},
  {"id":6,"q":"A \"converter dolly\" is:","opts":["A second tractor used to pull longer loads","A coupling device with a fifth wheel that connects a second trailer to a lead trailer","A brake-system component on the rear axle"],"ans":1},
  {"id":7,"q":"Before coupling a second trailer, you should inspect the converter dolly's:","opts":["Tires, lights, brakes, fifth wheel, and air / electric connections","Paint and decals","Mud flaps only"],"ans":0},
  {"id":8,"q":"When coupling a converter dolly to a second trailer, the dolly's tongue should be:","opts":["Tilted up before backing under","Level with the trailer kingpin and locked","Disconnected from the lead trailer"],"ans":1},
  {"id":9,"q":"After coupling a converter dolly to the lead trailer, you must check that:","opts":["The radio works","The pintle hook is fully latched and the safety chains and air/electric lines are properly connected","The cab seat is forward"],"ans":1},
  {"id":10,"q":"Glad hands are:","opts":["The air-line couplers between tractor and trailer","A driver's nickname for landing gear","Hand pumps for fueling"],"ans":0}
]
```

> **REPRODUCE THE FULL 66-QUESTION BANK** following the same format. The complete data is in `src/zones/cdl/cdl-questions.ts` of the existing project (lines 257–324). All questions are written in the same style — single statement of a NJ CDL doubles/triples manual fact, two distractors that are plausible but wrong, one correct answer at `ans: 1` or `ans: 0` consistent with NJ MVC source material. Full list summary:

- **Q1-20 (NJ official scope):** T endorsement requirement, rearward amplification, crack-the-whip, converter dolly anatomy, glad hand seals, coupling sequence, brake lag, off-tracking, sweep-wide-left for right turns
- **Q21-40:** triple trailer geographic restrictions, parking on slopes, back-coupling rules, weight distribution (heaviest in lead trailer), grade descents, engine retarder slip risk, jackknife causes, single-axle vs tandem dolly stability, lane-change signaling
- **Q41-66:** air-supply line routing, burning smell action, cargo distribution per trailer, uncoupling sequence safely, parking unattended regulations, RR crossing approach, Interstate maximum (typically 2 trailers, triples restricted), Rocky Mountain doubles, Turnpike doubles, low-air-warning trigger psi (60), C-dollies / B-dollies (self-steering rigid drawbar), spring brake automatic activation on supply disconnect, glad-hand seal replacement before connect, U-turn discouragement, **"single most important rule: drive smoothly — every action is amplified at the back of the combination"**

### 10.5 TANKER + HAZMAT (X) — 50-question combo drill

Combined practice (NOT a real MVC exam). 66-question bank focuses on cargo-tank specifications (MC-306, MC-307, MC-312, DOT-406, DOT-407, DOT-412), fuel hauling, bonding/grounding, vapor recovery, retest dates, outage for flammables, and placarding rules that apply ONLY when the two endorsements combine.

> Full bank follows same JSON schema. Source: `src/zones/cdl/cdl-questions.ts` lines 409–476. Key facts to surface:

- **MC-306 / DOT-406:** flammable liquids (gasoline) at near-atmospheric pressure
- **MC-307 / DOT-407:** low-pressure chemicals / mild corrosives
- **MC-312 / DOT-412:** highly corrosive liquids (acids), steel exterior with corrosion-resistant lining
- **Retest cadence:** annual for some + 5-year hydrostatic (depends on tank type)
- **Smoking:** prohibited within 25 ft of cargo tank loaded with flammable hazmat
- **Bonding:** electrical connection between tank and loading apparatus to equalize static
- **Grounding:** electrical connection from tank to earth ground to dissipate static
- **Bottom-load:** reduces static buildup and vapor escape vs splash-loading top
- **Pressure-relief valve:** must be free, operational, weeping product means stop and fix
- **PIH (Poison Inhalation Hazard):** tank must display "POISON INHALATION HAZARD" markings
- **Placarding:** all four sides
- **No hazmat in marked tunnels** — alternate route required
- **Stop 15-50 ft from RR** with placarded cargo tank
- **Fire extinguisher:** 10 B:C minimum
- **Driver attendance:** required for most placarded hazmat; **always** for Division 1.1/1.2 explosives
- **Single most important rule:** "Always treat a loaded hazmat cargo tank as the most dangerous load on the road — every action affects public safety."

### 10.6 TANKER + DOUBLES (N+T) — 40-question combo drill

Combined practice (NOT a real MVC exam). 66-question bank: liquid surge × multiple trailers × converter dollies. Drivers must understand how surge propagates across the dolly, why rollover risk multiplies, and the special rules around Long Combination Vehicle (LCV) tank haulers.

> Full bank: `cdl-questions.ts` lines 333–400. Key facts:

- **LCV speed limits:** often 5-10 mph below general truck limit on approved corridors
- **Heaviest tank:** directly behind tractor
- **Brake lag:** longer because air must travel farther; low-air warning trigger 60 psi
- **Engine retarders:** dangerous on wet/icy — drive wheels can lose traction, trailers jackknife
- **Smooth-bore doubles:** many carriers prohibit entirely (surge compounds rearward amplification)
- **Right turn:** swing wide LEFT first
- **Off-tracking:** rear tank sweeps inside tractor's path on sharp low-speed turns
- **Bonding & grounding:** mandatory on **both** tanks at every loading/unloading
- **Snub-braking** on long downgrades: short firm application until 5 mph below target, release to cool, repeat
- **Single most important rule:** "Drive so smoothly that surge, off-tracking, and rearward amplification never combine into a single emergency."

### 10.7 PASSENGER (P) — 20 official, 66-question bank

Required for any vehicle designed to carry 16 or more passengers including the driver.

> Full bank: `cdl-questions.ts` lines 486–553. Key NJ-specific facts:

- **16+ passengers** (including driver) triggers P endorsement
- **Hazmat limit on bus:** up to 500 lbs total / 100 lbs of any one class (where permitted)
- **No refueling** with passengers aboard except in emergency
- **Standees:** behind standee line on transit buses authorized for standees only
- **RR crossing:** stop 15-50 ft from nearest rail, open service door, listen, look
- **No gear shifting** while crossing tracks
- **Disruptive passenger:** discharge at next regular stop or safe place with shelter
- **After-trip:** walk bus looking for sleeping passengers and items left behind
- **Tight right turn:** swing wide to LEFT first
- **Backing:** avoid; if necessary, use spotter
- **Reflective triangles:** behind, beside, ahead of disabled bus
- **Gasoline cans:** generally prohibited
- **Curves/ramps:** well below posted speed (high center of gravity)
- **Single most important rule:** "Always put passenger safety first — every decision is judged by that standard."

### 10.8 SCHOOL BUS (S) — 20 official, 66-question bank

Requires P endorsement first.

> Full bank: `cdl-questions.ts` lines 563–630. Key NJ-specific facts:

- **Danger zone:** ~10 ft front, sides, rear
- **Most fatalities:** OUTSIDE the bus, in danger zones, during loading/unloading
- **10-step crossing procedure:** student protocol — students only cross after driver signals safe
- **Amber lights:** activate ~200 ft before stop
- **Red lights + stop arm:** all traffic must stop and remain stopped
- **Cross-view mirror:** danger zone immediately in front and right of bus
- **Convex mirror:** wider distorted view of side; distances appear farther
- **Flat mirror:** true distance view behind
- **No gear shifting** at RR crossings (just like passenger)
- **Post-trip child check:** required device or sign at rear; walk every row
- **No backing while students outside**
- **Evacuations:** front (rear blocked), rear (front blocked), side (both blocked), roof (overturned)
- **Drug & alcohol testing:** pre-employment, random, post-accident, reasonable-suspicion; lower BAC threshold than other CDLs
- **Divided highway:** opposing traffic may proceed across physical barrier per state law; same direction must always stop
- **No cell phone / texting** while driving school bus
- **Single most important rule:** "Children's safety comes first — always — every decision is judged by that standard."

### 10.9 PRE-TRIP IN-CABIN — Step 1 of 5, 59 questions SEQUENTIAL

Walks the In-Cabin walkthrough in real test order: external light check → safe start (seatbelt → gear selector in N → both brakes applied → key ON / ABS light) → **4-part air brake test (autofail)** → 6-item cabin inspection (lighting indicators → emergency equipment → windshield & mirror → wipers & washer → heater & defroster → horns) → tug test (tractor → trailer → service).

**Q16-32 must be flagged `autoFail: true`** (the air brake test). Use this exact bank — every question is a step in the script the examiner is listening for. Source: `cdl-questions.ts` lines 646–706.

**Critical air-brake-test numbers the bank teaches:**
- Air brake test has **4 parts**, in this order: lower/build pressure → applied leak test → low-pressure warning → spring brakes
- Build pressure to **120-140 psi** (governor cut-out)
- Applied leak test setup (automatic): selector in drive gear → turn off → **keep hold of key** → turn to electrical/on
- Applied leak test: must lose **no more than 4 psi in 1 minute**
- Low-pressure warning light/buzzer: must come on **before 60 psi**
- Spring brakes: pop out between **20-40 psi**
- **Fanning down:** if only one spring brake valve pops, keep fanning down without touching them until both pop
- **Tug test order:** tractor (parking brake out, gentle throttle) → trailer (trailer brake out, gentle throttle) → service brake (release both parking brakes, roll forward gently, depress service brake, truck should stop firmly without pulling)
- **Emergency equipment:** **3 reflective triangles**, **ABC fire extinguisher (charged, dated, with locking pin)**, **spare electrical fuses**
- **Mirrors:** not damaged or cracked, securely mounted, set to drive, clean, no illegal stickers
- **Windshield:** no obstructions, no illegal stickers, not cracked or damaged
- **Wipers/washer:** washer fluid sprays, wipers move smoothly with proper tension, not dry-rotted
- **Horns:** both the electrical horn AND the air horn
- **Pass threshold:** ~22 points
- **Inspection checklist:** must arrive clean, no markings beforehand
- **3-point contact:** handle, door, steering wheel
- **To get credit:** name it, point to and/or touch it, fully explain what you are inspecting for

### 10.10 PRE-TRIP ENGINE BAY — Step 2 of 5, 30 questions SEQUENTIAL

Walks the front-of-vehicle / engine area in real order: lenses → fluid levels → fluid & air leaks → steering system. Source: `cdl-questions.ts` lines 708–739.

Key teaching points the bank covers:
- Front clearance lights = **amber**
- Open hood = strongly recommended (examiners may require it)
- First fluid: **coolant reservoir** (don't open if hot)
- Oil dipstick: pull, wipe, reinsert, confirm above the line
- Air compressor: listen for audible leaks, hoses/lines sealed
- Steering system in order: **power steering gearbox → pitman arm → drag link → steering knuckle → tie rod**
- Metal parts verbiage: "no bends, no dents, no welding, no excessive rust"
- Metal steering components secured with **castle nut and cotter key (cotter pin)**
- Checklist symbol: **circle = metal**

### 10.11 PRE-TRIP STEERING AXLE & SIDE — Step 3 of 5, 37 questions SEQUENTIAL

Walks both front wheels and the driver-side of the tractor. Source: `cdl-questions.ts` lines 741–779.

Order: tires → rims → lug nuts → springs/suspension → brake lines/leaks → brake contamination → then side: lenses/reflectors → mirrors → battery → fuel tank → DEF tank → frame.

Key facts:
- Front tires: **original, no recaps**, **4/32" tread**, **100 psi minimum**
- Lug nuts: rust trails or shiny metal = LOOSE
- Axle seal: no signs of leaks or damage
- Leaf springs: not scissored, missing, or shifted
- Shock absorber: not leaking hydraulic fluid
- Slack adjuster: no more than ~1" of play
- Brake lining: at least **¼ inch** material, no cracks
- Brake contamination: debris/oil/liquid between lining and drum prevents friction
- Side markers middle-forward: **amber**
- Battery: no corrosion, no acid dripping, sealed correctly
- Fuel tank: no leaks, dry, no holes, cap present, straps secure, gas lines sealed
- DEF tank: same defect check
- Frame: not bent or welded, secure, solid metal, no excessive rust

### 10.12 PRE-TRIP COUPLING SYSTEM — Step 4 of 5, 25 questions SEQUENTIAL

Combination vehicles only. Source: `cdl-questions.ts` lines 781–807.

Order: air & electric lines → connectors/glad hands → fifth wheel (apron → skid plate → platform → release arm → kingpin).

Key facts:
- Electrical wire: locked, fully plugged in
- Electrical connector: pull out, no debris in prongs, prongs not damaged or bent
- **Service line = Blue, Emergency line = Red**
- Air lines: sealed correctly, no audible leaks, no rips/cuts/frays, not touching truck parts, not tangled
- Glad hands: O-ring/rubber seal present, not bent or cut
- After reconnecting glad hand: seated even, no audible leaks
- Damaged electrical pins affect trailer **lights** (not brakes)
- Fifth wheel order: **apron → skid plate → platform → release arm → kingpin**
- Apron: no holes, no gap/space between apron and fifth wheel skid plate
- Skid plate: metal verbiage (no bends/dents/welding/rust)
- Fifth wheel platform: all bolts present, locking pin with cotter key, no rust trails or shiny metal
- Release arm: full lock position (IN is locked, OUT is release)
- **Never go underneath the trailer to inspect the kingpin** — point only, for safety
- Kingpin: locking jaws around it, secure, not bent/welded/damaged, no gap, well greased

### 10.13 PRE-TRIP TRAILER — Step 5 of 5, 20 questions SEQUENTIAL

Closes out the pre-trip. Source: `cdl-questions.ts` lines 809–830.

Order: landing gear & clearance → reflective tape → rear of trailer lenses & reflectors.

Key facts:
- Landing gear clearance: doesn't hit truck when turning; fully raised while driving
- Crank handle: latched, not hanging
- Landing gear support frame: metal verbiage
- **DOT reflective tape: red and white, more than 50% of the trailer**
- Side markers middle-forward: **amber**
- Side markers/reflectors at REAR: **red** (common mistake — not amber!)
- Rear signal/brake lights/reflectors: **all red**
- Rear lenses: not cracked, damaged, proper color, in place
- Trailer lights ON: turn them on before exiting cab
- Once rear done: you should have reached the points needed — the new test focuses more on driving maneuvers

---

## 11. PRE-TRIP INSPECTION PARTS MAP DATA (6 sections, 31 hotspots)

Author this as `cdl-pretrip-parts-map-data.ts`. Hotspot positions are in 0–100 percentage space.

```ts
export const PRETRIP_KEYWORDS = {
  mounted: 'properly mounted and secured',
  defects: 'not cracked, bent, broken, loose, leaking, missing, or damaged',
} as const

export const PRETRIP_INSPECTION_SECTIONS = [
  {
    id: 'front-engine', step: 1, title: 'Front / Engine Area',
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
      { number: 1, label: 'Front light lenses', position: { x: 28, y: 14 },
        sayIt: 'I am checking the front light lenses. I am checking that they are properly mounted and secured, not cracked, bent, broken, loose, leaking, missing, or damaged.',
        actOn: 'Point to each headlight, turn signal, and marker lens at the top of the cab.' },
      { number: 2, label: 'Fluid levels', position: { x: 43, y: 49 },
        sayIt: 'I am checking the fluid levels — oil, coolant, brake fluid, power steering fluid, and windshield washer fluid.',
        actOn: 'Point to each reservoir / dipstick in the engine bay.' },
      { number: 3, label: 'Fluid or air leaks', position: { x: 38, y: 76 },
        sayIt: 'I am checking for any fluid or air leaks under the vehicle.',
        actOn: 'Get down and look under the engine area for drips or pooling.' },
      { number: 4, label: 'Steering system', position: { x: 22, y: 77 },
        sayIt: 'I am checking the steering system — steering shaft, gear box, hoses, and the steering linkage to the wheel.',
        actOn: 'Trace the steering shaft down to the wheel and check for missing nuts, bolts, or worn linkages.' },
    ],
  },
  {
    id: 'steering-axle', step: 2, title: 'Steering Axle',
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
      { number: 1, label: 'Tires', position: { x: 24, y: 14 },
        sayIt: 'I am checking the tires. I am checking that they are properly mounted and secured, no cuts, bulges, or abrasions, and have proper tread depth.',
        actOn: 'Tread ≥ 4/32" front, ≥ 2/32" elsewhere. No cuts, bulges, or sidewall damage.' },
      { number: 2, label: 'Rims', position: { x: 22, y: 48 },
        sayIt: 'I am checking the rims. I am checking that the rims are not cracked, bent, or damaged.',
        actOn: 'Walk around the rim — no welds, no cracks, no missing chunks.' },
      { number: 3, label: 'Lug nuts', position: { x: 32, y: 58 },
        sayIt: 'I am checking the lug nuts. I am checking that the lug nuts are present and tight.',
        actOn: 'Count them. Look for rust streaks (sign of looseness).' },
      { number: 4, label: 'Springs / Airbags / Shocks', position: { x: 64, y: 48 },
        sayIt: 'I am checking the springs, airbags, and shocks. I am checking that they are not cracked, bent, broken, loose, leaking, missing, or damaged.',
        actOn: 'Look behind the wheel into the suspension.' },
      { number: 5, label: 'Brake lines or hoses', position: { x: 70, y: 55 },
        sayIt: 'I am checking the brake lines or hoses. I am checking that they are not cracked, damaged, leaking, or rubbing.',
        actOn: 'Trace each hose end-to-end. No chafing against suspension.' },
      { number: 6, label: 'Brake area for contaminants', position: { x: 62, y: 84 },
        sayIt: 'I am checking the brake area for any contaminants — oil, grease, or fluid.',
        actOn: 'A wet, oily brake = compromised stopping power.' },
    ],
  },
  {
    id: 'side-of-tractor', step: 3, title: 'Side of Tractor',
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
      { number: 1, label: 'Side lenses and reflectors', position: { x: 8, y: 38 },
        sayIt: 'I am checking the side lenses and reflectors. I am checking that they are properly mounted and secured, not cracked, bent, broken, loose, leaking, missing, or damaged.',
        actOn: 'Point to each side marker lens and reflector on the cab.' },
      { number: 2, label: 'Mirrors / Traffic monitoring devices', position: { x: 12, y: 22 },
        sayIt: 'I am checking the mirrors and traffic monitoring devices. I am checking that they are properly mounted and secured, and not cracked or broken.',
        actOn: 'West coast mirror + convex spot mirror. Both must be clean and undamaged.' },
      { number: 3, label: 'Battery', position: { x: 32, y: 70 },
        sayIt: 'I am checking the battery. I am checking that it is properly mounted and secured, not cracked or damaged, no loose or corroded cables.',
        actOn: 'Open the battery box (usually below the door step). Cables tight, no corrosion at terminals.' },
      { number: 4, label: 'Fuel tank', position: { x: 46, y: 67 },
        sayIt: 'I am checking the fuel tank. I am checking that it is properly mounted and secured, not leaking, not cracked, not damaged, and the cap is tight.',
        actOn: 'The cylindrical aluminum tank — cap snug, no fuel drips on the tank or strap.' },
      { number: 5, label: 'Frame', position: { x: 60, y: 70 },
        sayIt: 'I am checking the frame. I am checking that it is not cracked, bent, broken, or damaged.',
        actOn: 'Look down the rail — no bowing, no welds, no rust-through.' },
    ],
  },
  {
    id: 'coupling', step: 4, title: 'Combination Vehicle / Coupling Area',
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
      { number: 1, label: 'Air and electric lines', position: { x: 35, y: 14 },
        sayIt: 'I am checking the air and electric lines. I am checking that they are not cut, damaged, or dragging.',
        actOn: 'Three lines — service (blue or red), emergency (red), electric (black 7-pin).' },
      { number: 2, label: 'Connectors', position: { x: 13, y: 12 },
        sayIt: 'I am checking the connectors. I am checking that they are plugged in and secured.',
        actOn: 'Glad hands locked, 7-pin seated and clipped — top-left of the coupling area.' },
      { number: 3, label: 'Fifth wheel skid plate', position: { x: 38, y: 50 },
        sayIt: 'I am checking the fifth wheel skid plate. I am checking that it is not cracked or broken.',
        actOn: 'The big metal plate on the tractor that the trailer sits on — well greased, no cracks or weld breaks.' },
      { number: 4, label: 'Kingpin', position: { x: 50, y: 55 },
        sayIt: 'I am checking the kingpin. I am checking that it is locked in the center of the fifth wheel.',
        actOn: 'Kingpin must seat at dead center of the jaws — visible as the dark spot in the middle of the plate.' },
      { number: 5, label: 'Apron', position: { x: 50, y: 62 },
        sayIt: 'I am checking the apron. I am checking that it is properly mounted and secured.',
        actOn: 'Apron flat against the skid plate.' },
      { number: 6, label: 'No gap between apron and fifth wheel', position: { x: 75, y: 47 },
        sayIt: 'I am checking that there is no gap between the apron and the fifth wheel.',
        actOn: 'Sight along the seam — no daylight between trailer apron and plate.' },
      { number: 7, label: 'Locking jaws / Safety devices', position: { x: 52, y: 25 },
        sayIt: 'I am checking the locking jaws and safety devices. I am checking that the locking jaws are closed around the kingpin and the safety devices are in place.',
        actOn: 'Release arm fully back. Safety pin / clip engaged.' },
    ],
  },
  {
    id: 'trailer-front', step: 5, title: 'Trailer (Front)',
    blurb: 'Three quick items at the front of the trailer: landing gear, clearance, reflective tape.',
    imagePath: '/cdl-pretrip/5-trailer-front.jpg',
    sayOpener: 'I am checking the front of the trailer.',
    actSteps: [
      'Look at both landing gear legs — properly mounted and secured.',
      'Check there is enough clearance between tractor and landing gear.',
      'Look along the side for reflective tape — not missing or damaged.',
    ],
    hotspots: [
      { number: 1, label: 'Landing gear', position: { x: 15, y: 60 },
        sayIt: 'I am checking the landing gear. I am checking that it is properly mounted and secured.',
        actOn: 'Both legs fully retracted, crank handle stowed.' },
      { number: 2, label: 'Clearance between tractor and landing gear', position: { x: 44, y: 70 },
        sayIt: 'I am checking the clearance between the tractor and landing gear. I am checking that there is enough clearance and the landing gear is not contacting the tractor.',
        actOn: 'Tractor frame should not be touching the landing gear feet.' },
      { number: 3, label: 'Reflective tape', position: { x: 70, y: 42 },
        sayIt: 'I am checking the reflective tape. I am checking that it is properly mounted and secured, not missing or damaged.',
        actOn: 'Continuous red/white stripe along the side and across the rear.' },
    ],
  },
  {
    id: 'rear-of-trailer', step: 6, title: 'Rear of Trailer',
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
      { number: 1, label: 'Rear lenses', position: { x: 13, y: 17 },
        sayIt: 'I am checking the rear lenses. I am checking that they are properly mounted and secured, not cracked, bent, broken, loose, leaking, missing, or damaged.',
        actOn: 'Point to each tail-lamp lens at the top-left corner cluster.' },
      { number: 2, label: 'Rear reflectors', position: { x: 22, y: 50 },
        sayIt: 'I am checking the rear reflectors. I am checking that they are properly mounted and secured, not cracked, bent, broken, loose, leaking, missing, or damaged.',
        actOn: 'Red reflectors at the rear corners + along the bottom rail.' },
      { number: 3, label: 'Brake lights', position: { x: 78, y: 45 },
        sayIt: 'I am checking the brake lights. (Helper presses the brake pedal.)',
        actOn: 'Both rear lamps glow red when helper presses the brake.' },
      { number: 4, label: 'Turn signals', position: { x: 85, y: 45 },
        sayIt: 'I am checking the turn signals. (Helper signals left, then right.)',
        actOn: 'Amber blinker fires on the matching side.' },
      { number: 5, label: '4-way flashers', position: { x: 85, y: 55 },
        sayIt: 'I am checking the 4-way flashers. (Helper switches on hazards.)',
        actOn: 'Both sides blink simultaneously.' },
      { number: 6, label: 'Clearance / Marker lights', position: { x: 50, y: 8 },
        sayIt: 'I am checking the clearance and marker lights.',
        actOn: 'Amber clearance lights across the top of the trailer, red marker lights at the corners.' },
    ],
  },
]
```

---

## 12. DEEP DIVE FLASHCARD DATA (3 sections, 38 items)

Author as `cdl-pretrip-deep-data.ts`. Each item is one part with its photo and the verbal phrase the examiner must hear. Distractors for the MC question are picked from sibling items in the same section at render time.

```ts
export const DEEP_DIVE_SECTIONS = [
  {
    id: 'engine', label: 'Engine Bay', step: 'DEEP DIVE · ENGINE',
    blurb: 'Eleven engine-bay items the examiner expects you to name and inspect, one by one.',
    items: [
      { number: 1, label: 'Oil dipstick', imagePath: '/cdl-pretrip-deep/engine/1-oil-dipstick.jpg',
        sayIt: 'I am checking the oil level. I am checking that the oil is between the ADD and FULL marks on the dipstick and the oil is clean and not low.' },
      { number: 2, label: 'Coolant reservoir', imagePath: '/cdl-pretrip-deep/engine/2-coolant-reservoir.jpg',
        sayIt: 'I am checking the coolant level. I am checking that the coolant reservoir is between the MIN and MAX marks and the cap is on tight.' },
      { number: 3, label: 'Power steering fluid', imagePath: '/cdl-pretrip-deep/engine/3-power-steering-fluid.jpg',
        sayIt: 'I am checking the power steering fluid. I am checking that the reservoir is at the proper level and the cap is secure.' },
      { number: 4, label: 'Windshield washer fluid', imagePath: '/cdl-pretrip-deep/engine/4-windshield-washer-fluid.jpg',
        sayIt: 'I am checking the windshield washer fluid. I am checking that the reservoir is full and the cap is on tight.' },
      { number: 5, label: 'Alternator', imagePath: '/cdl-pretrip-deep/engine/5-alternator.jpg',
        sayIt: 'I am checking the alternator. I am checking that it is properly mounted and secured, the wiring is not loose or damaged, and the drive belt is tight with no more than three cracks per inch and no frays.' },
      { number: 6, label: 'Water pump', imagePath: '/cdl-pretrip-deep/engine/6-water-pump.jpg',
        sayIt: 'I am checking the water pump. I am checking that it is properly mounted and secured, no leaks at the housing or hose connections.' },
      { number: 7, label: 'Drive belts', imagePath: '/cdl-pretrip-deep/engine/7-drive-belts.jpg',
        sayIt: 'I am checking the drive belts. I am checking that the belts are tight with no more than three cracks per inch, no frays, and have less than three-quarters of an inch of play.' },
      { number: 8, label: 'Radiator hoses', imagePath: '/cdl-pretrip-deep/engine/8-radiator-hoses.jpg',
        sayIt: 'I am checking the radiator hoses. I am checking that they are properly mounted and secured, no leaks, no cracks, no bulges, and no chafing.' },
      { number: 9, label: 'Air compressor', imagePath: '/cdl-pretrip-deep/engine/9-air-compressor.jpg',
        sayIt: 'I am checking the air compressor. I am checking that it is properly mounted and secured, the drive belt is tight if belt-driven, and there are no air leaks at the fittings.' },
      { number: 10, label: 'Steering box & linkage', imagePath: '/cdl-pretrip-deep/engine/10-steering-box.jpg',
        sayIt: 'I am checking the steering box. I am checking that it is properly mounted and secured, no leaks, no loose or missing nuts and bolts, and the pitman arm and drag link are tight with no excessive play.' },
      { number: 11, label: 'Battery', imagePath: '/cdl-pretrip-deep/engine/11-battery.jpg',
        sayIt: 'I am checking the battery. I am checking that it is properly mounted and secured, the cables are tight, no corrosion on the terminals, and the case is not cracked or leaking.' },
    ],
  },
  {
    id: 'cabin', label: 'In-Cabin', step: 'DEEP DIVE · IN-CABIN',
    blurb: 'Eleven cab-interior checks: three-point contact, mirrors, gauges, the air-brake-related controls, emergency gear.',
    items: [
      { number: 1, label: 'Three-point contact', imagePath: '/cdl-pretrip-deep/cabin/1-three-point-contact.jpg',
        sayIt: 'Before entering the cab, I am using three-point contact — two hands and one foot, or two feet and one hand, on the truck at all times.' },
      { number: 2, label: 'Seat belt', imagePath: '/cdl-pretrip-deep/cabin/2-seat-belt.jpg',
        sayIt: 'I am checking the seat belt. I am checking that the belt is properly mounted and secured, not ripped or frayed, and latches and releases properly.' },
      { number: 3, label: 'Mirrors (cab interior view)', imagePath: '/cdl-pretrip-deep/cabin/3-mirrors.jpg',
        sayIt: 'I am checking the mirrors. I am checking that they are properly mounted and adjusted, not cracked or broken, and provide full coverage.' },
      { number: 4, label: 'Steering wheel (free play check)', imagePath: '/cdl-pretrip-deep/cabin/4-steering-wheel.jpg',
        sayIt: 'I am checking the steering wheel. I am checking that the free play is no more than 10 degrees — about two inches on a 20-inch wheel.' },
      { number: 5, label: 'Horn (city + air)', imagePath: '/cdl-pretrip-deep/cabin/5-horn.jpg',
        sayIt: 'I am checking the horn. I am pressing the city horn and pulling the air horn to make sure both are working.' },
      { number: 6, label: 'Wipers & windshield', imagePath: '/cdl-pretrip-deep/cabin/6-wipers-windshield.jpg',
        sayIt: "I am checking the wipers and windshield. I am checking that the wiper blades are not torn, the arms are tight, and the windshield is not cracked or chipped in the driver's view." },
      { number: 7, label: 'Heater / defroster', imagePath: '/cdl-pretrip-deep/cabin/7-heater-defroster.jpg',
        sayIt: 'I am checking the heater and defroster. I am checking that they are working and that air flows through the defroster vents.' },
      { number: 8, label: 'Dashboard gauges', imagePath: '/cdl-pretrip-deep/cabin/8-dashboard-gauges.jpg',
        sayIt: 'I am checking the gauges. I am checking the oil pressure, coolant temperature, voltmeter, and air pressure gauges — all reading in the normal range.' },
      { number: 9, label: 'Lights & dash indicators', imagePath: '/cdl-pretrip-deep/cabin/9-lights-dash-indicators.jpg',
        sayIt: 'I am checking the lights and indicators. I am turning on the headlights, four-way flashers, and turn signals, and checking that all dash indicators light up at key-on.' },
      { number: 10, label: 'Emergency equipment', imagePath: '/cdl-pretrip-deep/cabin/10-emergency-equipment.jpg',
        sayIt: 'I am checking the emergency equipment. I am checking for three reflective triangles, a charged fire extinguisher, and spare electrical fuses.' },
      { number: 11, label: 'Parking brake (tug test)', imagePath: '/cdl-pretrip-deep/cabin/11-parking-brake.jpg',
        sayIt: 'I am performing the parking brake tug test. I am setting the parking brake, releasing the service brake, and gently pulling against the brake in low gear — the truck should not move.' },
    ],
  },
  {
    id: 'trailer', label: 'Trailer', step: 'DEEP DIVE · TRAILER',
    blurb: 'Sixteen trailer items — lights, tape, suspension, brake chambers, slack adjusters, coupling, doors, undercarriage.',
    items: [
      { number: 1, label: 'Brake lights', imagePath: '/cdl-pretrip-deep/trailer/1-brake-lights.jpg',
        sayIt: 'I am checking the brake lights. I am applying the brake and checking that the brake lights come on bright.' },
      { number: 2, label: 'Turn signals / 4-way flashers', imagePath: '/cdl-pretrip-deep/trailer/2-turn-signals.jpg',
        sayIt: 'I am checking the turn signals and four-way flashers. I am checking that the left, right, and four-way flashers are working.' },
      { number: 3, label: 'Clearance & marker lights', imagePath: '/cdl-pretrip-deep/trailer/3-clearance-marker-lights.jpg',
        sayIt: 'I am checking the clearance and marker lights. I am checking that all clearance and marker lights are on and working.' },
      { number: 4, label: 'Reflective tape', imagePath: '/cdl-pretrip-deep/trailer/4-reflective-tape.jpg',
        sayIt: 'I am checking the reflective tape. I am checking that the reflective tape is installed and in good condition.' },
      { number: 5, label: 'Wheels & tires', imagePath: '/cdl-pretrip-deep/trailer/5-wheels-tires.jpg',
        sayIt: 'I am checking the wheels and tires. I am checking that the tires are properly inflated, no cuts or bulges, that the rims are not cracked or bent, and all lug nuts are present and tight.' },
      { number: 6, label: 'Suspension', imagePath: '/cdl-pretrip-deep/trailer/6-suspension.jpg',
        sayIt: 'I am checking the suspension. I am checking the springs, axle, and air bags for cracks, damage, or leaks, and that all mounting bolts and U-bolts are present and secure.' },
      { number: 7, label: 'Landing gear', imagePath: '/cdl-pretrip-deep/trailer/7-landing-gear.jpg',
        sayIt: 'I am checking the landing gear. I am checking that it is securely mounted, not bent or damaged, and that the crank and foot are in good condition.' },
      { number: 8, label: 'Coupling devices', imagePath: '/cdl-pretrip-deep/trailer/8-coupling-devices.jpg',
        sayIt: 'I am checking the coupling devices. I am checking that the pintle hook or fifth wheel is secure, not cracked or damaged, and that the locking mechanism is working.' },
      { number: 9, label: 'Electrical connections', imagePath: '/cdl-pretrip-deep/trailer/9-electrical-connections.jpg',
        sayIt: 'I am checking the electrical connections. I am checking that the electrical plug is secure, the pins are not bent or corroded, and the cable is not cut or frayed.' },
      { number: 10, label: 'Air lines', imagePath: '/cdl-pretrip-deep/trailer/10-air-lines.jpg',
        sayIt: 'I am checking the air lines. I am checking that the air lines are not cut, worn, or leaking, and that they are properly connected and secured.' },
      { number: 11, label: 'Doors & latches', imagePath: '/cdl-pretrip-deep/trailer/11-doors-latches.jpg',
        sayIt: 'I am checking the doors and latches. I am checking that the doors open and close properly, the latches and hinges are secure, and the door seals are intact.' },
      { number: 12, label: 'Undercarriage', imagePath: '/cdl-pretrip-deep/trailer/12-undercarriage.jpg',
        sayIt: 'I am checking the undercarriage. I am checking the frame and crossmembers for cracks or damage, and that all mounting bolts and fasteners are secure.' },
      { number: 13, label: 'Light operation (full test)', imagePath: '/cdl-pretrip-deep/trailer/13-light-operation.jpg',
        sayIt: 'I am checking the light operation. I am checking that all lights operate properly, including brake lights, turn signals, and marker lights.' },
      { number: 14, label: 'ABS light', imagePath: '/cdl-pretrip-deep/trailer/14-abs-light.jpg',
        sayIt: 'I am checking the ABS light. I am checking that the ABS light comes on with the key and goes off after moving the truck.' },
      { number: 15, label: 'Brake chambers', imagePath: '/cdl-pretrip-deep/trailer/15-brake-chambers.jpg',
        sayIt: 'I am checking the brake chambers. I am checking that they are not leaking, are properly mounted, and that the push rods move freely.' },
      { number: 16, label: 'Slack adjusters', imagePath: '/cdl-pretrip-deep/trailer/16-slack-adjusters.jpg',
        sayIt: 'I am checking the slack adjusters. I am checking that they are properly positioned and not damaged, and that they move freely.' },
    ],
  },
]
```

---

## 13. HUB / LANDING PAGE TILES

The landing page has TWO grids — endorsement tests above, pre-trip tests below.

### Endorsement tile metadata

```ts
const ENDORSEMENT_TILES = [
  { routeId: 'cdl-hazmat',           label: 'Hazmat (H)',                       desc: 'Hazardous Materials endorsement — placards, shipping papers, leaks, segregation. 30-question NJ MVC test, 80% to pass.', count: 30, endorse: 'H',    accent: '#39ff14', icon: 'Biohazard' },
  { routeId: 'cdl-air-brakes',       label: 'Air Brakes',                       desc: 'Core CDL knowledge (not an endorsement) — service / parking / emergency systems, slack adjusters, pressure warnings. 25-question NJ MVC test, 80% to pass.', count: 25, endorse: 'CORE', accent: '#f0c040', icon: 'Disc' },
  { routeId: 'cdl-tanker',           label: 'Tanker (N)',                       desc: 'Liquid surge, outage, baffled vs smooth-bore tanks, rollover physics, loading and unloading. 20-question NJ MVC test, 80% to pass.', count: 20, endorse: 'N',    accent: '#00b8d4', icon: 'Droplets' },
  { routeId: 'cdl-doubles-triples',  label: 'Doubles / Triples (T)',            desc: 'Coupling, converter dollies, off-tracking, crack-the-whip amplification, brake lag across multiple trailers. 20-question NJ MVC test, 80% to pass.', count: 20, endorse: 'T',    accent: '#ff7b29', icon: 'Container' },
  { routeId: 'cdl-tanker-hazmat',    label: 'Tanker + HazMat (X)',              desc: 'Combined practice (not an official MVC exam) — N + H drill: cargo-tank specs, bonding/grounding, fuel hauling, vapor recovery, retest dates, placarding. 50 questions, 80% to pass.', count: 50, endorse: 'X',    accent: '#ef4444', icon: 'Fuel' },
  { routeId: 'cdl-passenger',        label: 'Passenger (P)',                    desc: '16+ passenger vehicles — compartment inspection, RR crossings, fueling rules, disruptive passengers, after-trip checks. 20-question NJ MVC test, 80% to pass.', count: 20, endorse: 'P',    accent: '#3b82f6', icon: 'Bus' },
  { routeId: 'cdl-school-bus',       label: 'School Bus (S)',                   desc: 'Danger zones, 10-step crossing procedure, mirror types, evacuation drills, post-trip child check. Requires P. 20-question NJ MVC test, 80% to pass.', count: 20, endorse: 'S',    accent: '#facc15', icon: 'School' },
  { routeId: 'cdl-tanker-doubles',   label: 'Tanker Doubles / Triples',         desc: 'Combined practice (not an official MVC exam) — N + T drill: liquid surge × multiple trailers, LCV rules, compounded rollover, vapor recovery across tanks. 40 questions, 80% to pass.', count: 40, endorse: 'N+T', accent: '#a855f7', icon: 'Workflow' },
]
```

### Pre-trip tile metadata

```ts
const PRETRIP_TILES = [
  { routeId: 'cdl-pretrip-parts-map',    label: 'Parts Map (Interactive)',           desc: 'Photo-based study tool. Click numbered hotspots on the inspection-area photos to see what each part is, what to say out loud, and how to act. Six sections, 31 parts. Switch to Quiz mode to test yourself.', count: 31, endorse: 'STUDY',  accent: '#f5c429', icon: 'MapPin' },
  { routeId: 'cdl-pretrip-deep-dive',    label: 'Pre-Trip Deep Dive (Photo Quiz)',   desc: 'Image-first multiple-choice quiz. 38 close-up photos across Engine Bay (11), In-Cabin (11), and Trailer (16) — pick the correct inspection statement for each highlighted part. Sequential walk-through from engine to trailer. 80% to pass.', count: 38, endorse: 'STEP 0', accent: '#22d3ee', icon: 'ClipboardList' },
  { routeId: 'cdl-pretrip-cabin',        label: 'In-Cabin Inspection',               desc: 'Step 1 of 5 — three-point contact, safe start, the 4-part air brake test (auto-fail), the 6-item cabin inspection, and the tug test. Automatic transmission. Runs in real inspection order.', count: 59, endorse: 'STEP 1', accent: '#5b9dff', icon: 'ClipboardList' },
  { routeId: 'cdl-pretrip-engine-bay',   label: 'Engine Bay',                        desc: 'Step 2 of 5 — front of vehicle / engine area: lenses, fluid levels, fluid & air leaks, and the full steering system. Walks the checklist top to bottom.', count: 30, endorse: 'STEP 2', accent: '#22d3ee', icon: 'Wrench' },
  { routeId: 'cdl-pretrip-steering-axle', label: 'Steering Axle & Side',             desc: 'Step 3 of 5 — tires, rims, lug nuts, suspension, brake lines and contamination, then the side of the vehicle: lenses, mirrors, battery, fuel & DEF tanks, and frame.', count: 37, endorse: 'STEP 3', accent: '#2dd4bf', icon: 'CircleDot' },
  { routeId: 'cdl-pretrip-coupling',     label: 'Coupling System',                   desc: 'Step 4 of 5 — combination vehicles only: air & electric lines, glad hands, and the fifth wheel — apron, skid plate, platform, release arm, and kingpin.', count: 25, endorse: 'STEP 4', accent: '#a3e635', icon: 'Link2' },
  { routeId: 'cdl-pretrip-trailer',      label: 'Trailer',                           desc: 'Step 5 of 5 — trailer only: landing gear & clearance, reflective tape, and the rear-of-trailer lenses & reflectors. Closes out the pre-trip.', count: 20, endorse: 'STEP 5', accent: '#fbbf24', icon: 'Truck' },
]
```

### Hub copy
- **Header eyebrow:** "CDL practice tests" (mono, 11px, tracked, with GraduationCap icon)
- **Title:** `CDL PRAC` (32px, semibold, tracked tight)
- **Subtitle:** "Commercial Driver's License prep tuned to the official NJ MVC counts — Hazmat 30, Tanker 20, Passenger 20, School Bus 20, Doubles 20, Air Brakes 25 — all at the same 80% pass bar the state uses. Each set randomly samples from a deeper bank, and every quiz screen has an 'Extended (all questions)' toggle if you want to drill the full deck. Misses are flagged so you can review just what you got wrong before retaking."
- **Pre-trip section eyebrow:** "Pre-Trip Inspection — Class A Road Skills" (with ClipboardList icon)
- **Pre-trip section subtitle:** "The NJ MVC Modernized Testing System pre-trip, broken into five sequential tests. Each one runs its full bank in real inspection order — start to finish, no shuffle — so you drill the sequence, not just the facts. The In-Cabin test is written for an automatic transmission, and its air brake check is auto-fail, mirroring the real road test."

---

## 14. ACCEPTANCE CRITERIA

Mark the build done only when ALL of these are true:

### Data
- [ ] Every endorsement bank has at least the official MVC count of questions, ideally 66 for deep practice (Hazmat 30→66, Air Brakes 25→66, Tanker/Doubles/Passenger/School Bus 20→66).
- [ ] Combo banks (X = 50, N+T = 40) exist as separate arrays with a `combinedNotice` that says "Combined practice — not an official MVC exam."
- [ ] Pre-trip banks (Cabin 59, Engine 30, Steering 37, Coupling 25, Trailer 20) are stored separately and run in `sequential: true` mode.
- [ ] **All air brake test questions in the Cabin bank (Q16-32) are flagged `autoFail: true`.**
- [ ] Parts Map data has 6 sections, 31 hotspots total, each with `sayIt` + `actOn` + position coordinates.
- [ ] Deep Dive data has 3 sections, 38 items total.

### Quiz behavior
- [ ] Pass threshold is `ceil(count * 0.8)`. 80% on every screen.
- [ ] Default test samples `officialCount` questions at random (Fisher-Yates).
- [ ] "Extended practice (all N questions)" toggle appears ONLY when `bankSize > officialCount` AND `!sequential`.
- [ ] Sequential mode (pre-trip) runs the full bank sorted by `id`, never shuffles, hides the Extended toggle.
- [ ] Missing any `autoFail: true` question forces "✗ AUTOMATIC FAILURE" regardless of percentage.
- [ ] Review missed walks ONLY the wrong answers, with both the wrong-selected and correct options labelled.
- [ ] Retake reshuffles the sample.
- [ ] CONFIRM button is disabled until the user selects an option.
- [ ] After CONFIRM: correct option = green border + ✓; wrong-selected = red border + ✗; correct option highlighted with ✓.

### Pre-Trip Parts Map
- [ ] STUDY / QUIZ / EDIT mode toggle.
- [ ] Hotspot positions in 0-100 % space, survive responsive resize.
- [ ] SVG placeholder fallback when image 404s.
- [ ] TTS reads `sayIt` aloud (cancel any in-flight utterance).
- [ ] `localStorage` persists visited hotspots and autospeak preference.
- [ ] EDIT mode lets you drag hotspots and COPY JSON.

### Pre-Trip Deep Dive
- [ ] Section tabs (Engine / Cabin / Trailer) with item counts.
- [ ] Sidebar item list with visited check marks.
- [ ] Photo + NORMAL/HIGHLIGHT phase toggle (image filename auto-suffixed `-highlight`).
- [ ] MC question with 3 options (correct `sayIt` + 2 distractors from same section).
- [ ] CONFIRM → green/red feedback, auto-advance or NEXT.
- [ ] Speak button uses TTS.
- [ ] `localStorage` persists visited + correct per section.

### Design
- [ ] All hub tiles match the spec (icon tile + eyebrow + title + desc + question count + Open chevron).
- [ ] Dark background `#04090b`, cards lifted ~10%, hairline borders, neon-accent per section.
- [ ] Monospace numerals (`Courier New`) on numbers, badges, button labels, with 2-4px letter-spacing.
- [ ] Border radius 2-8px ONLY (no big pill shapes).
- [ ] Status colors: green `#39ff14`, red `#ff4d4d`.
- [ ] Each route uses its assigned accent hex from §4.
- [ ] Combo and sequential screens show the italic `combinedNotice` line.

### Sound (optional but recommended)
- [ ] Web Audio synth: correct (triangle arpeggio), wrong (sawtooth descent), click (sine).
- [ ] Volume2/VolumeX header toggle.

### Persistence
- [ ] Parts Map visited hotspots and autospeak.
- [ ] Deep Dive visited and correct items.
- [ ] (Optional) Per-quiz "last score" to display on the hub tile.

### NJ MVC accuracy
- [ ] Every count in §2 surfaces correctly in the UI.
- [ ] Every threshold (80%, 4 psi/min, 60 psi warning, 120-140 psi cut-out, 20-40 psi spring brake pop, 10°/2" steering wheel free play, 4/32" front tread, 100 psi tire min, ¼" lining, ~1" slack play) appears in at least one question per relevant bank.
- [ ] Color conventions (service Blue, emergency Red, front amber, rear red, DOT red/white tape) are taught in at least one question per relevant bank.
- [ ] Air brake test questions are `autoFail: true` and verdict reflects automatic failure when missed.

---

## 15. STRETCH GOALS (only after the above ships)

- **Multi-state mode:** add a `state` parameter so banks can be filtered by state-specific rules (TX, CA, FL — each has minor variations). Default remains NJ.
- **Spaced repetition:** track per-question last-answered and last-wrong; resurface wrong questions sooner.
- **Voice quiz mode:** speech recognition lets the user say the inspection phrase out loud; match against `sayIt` and grade phonetically.
- **Progress dashboard:** per-endorsement pass/fail history, time-to-complete, last 5 scores chart.
- **Print-friendly checklist:** export the parts map sections + sayIt phrases as a one-page PDF.
- **Mobile native wrapper:** Capacitor or React Native shell so the app works on the road.

---

## 16. SOURCES & ATTRIBUTION

- **NJ MVC CDL Manual** — public-domain study material from the NJ Motor Vehicle Commission. Use it as the authoritative source for any question wording disputes.
- **NJ MVC Modernized Testing System** — Class A pre-trip score sheet and air brake test protocol.
- **E-Z Wheels Driving School** in-cabin and outside-inspection walkthrough videos — used as the basis for the sequential pre-trip banks.
- **FMCSA regulations 49 CFR parts 383, 391, 392, 393, 396** — federal CDL rules.
- **Hazmat (49 CFR 100-185)** — shipping papers, placarding, segregation, RQ rules.

When the AI Studio model generates additional or replacement questions, every new question must cite (in a comment field) which manual section it's drawn from. **Do not invent regulations.** Every numeric threshold must trace back to a specific CFR section or the NJ CDL Manual.

---

**End of CDL PRAC build prompt. Reproduce the data + design + behavior as specified. Question accuracy > visual polish. Pre-trip sequence integrity > question count.**
