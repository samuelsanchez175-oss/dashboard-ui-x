# CDL Pre-Trip — ChatGPT Image Generation Prompts

> Ready-to-paste prompts for generating the 44 reference images (6 wide-shots + 38 close-ups) the CDL PRAC app needs. Built for **point-and-identify training** — every image shows the part the student must name out loud during the NJ MVC Class A road test.
>
> **Workflow:** Paste the **MASTER STYLE BLOCK** once at the top of a ChatGPT conversation, then paste any individual prompt below to generate that image. Re-paste the style block in a new chat or whenever the model drifts.

---

## MASTER STYLE BLOCK — paste once per chat session

```
You are generating photorealistic training photos for a CDL Class A pre-trip inspection study app. Every image follows this exact style:

VEHICLE: A clean, well-maintained late-model day-cab tractor (Freightliner Cascadia, Peterbilt 579, Kenworth T680, or Volvo VNL — pick one and stay consistent) coupled to a 53-foot dry van trailer. Painted white or silver tractor, plain white trailer with red mud flaps. No company logos.

LIGHTING: Bright overcast daylight or shop-fluorescent. NO harsh shadows, no backlight, no sunset/golden hour. The subject part must be evenly lit and clearly visible.

CAMERA: Eye-level for wide shots (chest height of a 5'10" adult). Close-up shots are taken from where an actual driver-applicant would stand or kneel during inspection — never bird's-eye, never worm's-eye, never tilted.

COMPOSITION: The named part fills the center 60% of the frame. Other parts can be visible in context but the subject part is unambiguous.

OVERLAYS (rendered ON the image, not described):
  1. A solid YELLOW CIRCLE (#FFD60A), 8% of image width in diameter, with a 3px white border, centered exactly on the named part. Inside the circle: a BOLD BLACK numeral matching the part's index in the section (e.g. "5" for the 5th item in Engine Bay).
  2. A horizontal ORANGE TAG (#FF8800) along the bottom 12% of the image, full width, with the part name in WHITE BOLD SANS-SERIF caps (Inter or Helvetica), letter-spaced. Example: "DRIVE BELTS".
  3. A semi-transparent BLACK BANNER along the top 10% of the image with "SAY:" in yellow caps followed by the inspection phrase in white. Phrase must wrap; readable at thumbnail size.

REALISM: This is a real truck in a real shop or parking lot. No illustration, no diagram, no 3D render look. Sharp focus on the named part, mild background defocus is fine.

QUALITY: 1536×1024 landscape. High detail on the named part — every bolt, hose clamp, and wear pattern visible. The student should be able to recognize this part on any truck after studying.

DO NOT include:
- People
- Multiple vehicles in frame
- Watermarks or fake brand logos
- Captions other than the three overlays above
- Cartoon arrows, callouts, or extra annotations
- Speech bubbles
- Color-tinted filters (no Instagram look)

Each image I request will give you: NUMBER, PART NAME (orange tag), SAY phrase (black banner), and a detailed visual description of the part and its location on the truck. Generate one image per request at 1536×1024 unless I say otherwise.
```

---

## SECTION 1 — Parts Map Wide Shots (6 images)

These are area overviews. Instead of a single numbered circle, render **N numbered circles** at the positions listed (in percent of image width and height). Skip the orange tag and black banner — these are multi-part shots, identification of all numbered hotspots happens in the app.

### 1.1 — `1-front-engine.jpg`

```
Wide shot of the front of a Class A semi-tractor (Freightliner Cascadia, white) with the hood TILTED FORWARD and OPEN, taken from about 6 feet in front of the truck at chest height. The bumper, headlights, grille, hood interior, and the entire engine bay are clearly visible. The truck is parked on a clean asphalt lot in flat daylight.

Overlay 4 numbered YELLOW CIRCLES (#FFD60A, 3px white border, 6% image width, bold black numerals) at these positions (left-to-right is x, top-to-bottom is y, both in percent of image):
  Circle "1" at x=28%, y=14% — centered on the LEFT headlight lens cluster
  Circle "2" at x=43%, y=49% — centered on the engine oil dipstick handle in the engine bay
  Circle "3" at x=38%, y=76% — centered on the asphalt directly under the engine, where leaks would pool
  Circle "4" at x=22%, y=77% — centered on the steering box / drag link visible behind the front axle

Sharp focus throughout. No people. No company logos. The four numbered circles must be perfectly readable at 50% zoom.
```

### 1.2 — `2-steering-axle.jpg`

```
Close-medium shot of the LEFT FRONT (driver's side steering) wheel and axle assembly of a Class A tractor. Camera is at hub-height, about 5 feet away from the wheel. Frame includes the full tire, rim, lug nuts, the wheel well behind the tire showing the suspension (leaf spring + shock absorber), the brake chamber, brake lines, and the brake area behind the tire. Flat shop daylight, no harsh shadows.

Overlay 6 numbered YELLOW CIRCLES at:
  "1" at x=24%, y=14% — on the tire tread / sidewall
  "2" at x=22%, y=48% — on the rim itself
  "3" at x=32%, y=58% — on one of the lug nuts
  "4" at x=64%, y=48% — on the leaf spring / shock absorber visible behind the wheel
  "5" at x=70%, y=55% — on the brake line / hose coming into the brake chamber
  "6" at x=62%, y=84% — on the brake drum / shoe area visible from below

All six circles clearly distinguishable. Tire must show realistic tread depth (~6/32"). No company logos.
```

### 1.3 — `3-side-of-tractor.jpg`

```
Side profile of the driver's-side of a Class A tractor day-cab, taken from about 8 feet away at chest height. Frame extends from just behind the front wheel to just before the fifth wheel. The cab side, fuel tank (aluminum cylinder), battery box (under the door step), and frame rail are all visible. Daylight, clean lot.

Overlay 5 numbered YELLOW CIRCLES at:
  "1" at x=8%, y=38% — on a side marker lens / reflector on the cab
  "2" at x=12%, y=22% — on the west coast mirror + convex spot mirror
  "3" at x=32%, y=70% — on the battery box (rectangular box under the driver door step)
  "4" at x=46%, y=67% — on the cylindrical aluminum fuel tank
  "5" at x=60%, y=70% — on the frame rail visible between the fuel tank and the fifth wheel

Crisp focus on each part. Battery box latch visible. Fuel cap visible on tank. No people, no logos.
```

### 1.4 — `4-coupling.jpg`

```
Overhead-angled shot of the COUPLING AREA between the tractor and trailer of a Class A combination vehicle. Camera is positioned behind the cab and above the catwalk, looking down at the fifth wheel. Frame shows the fifth wheel skid plate, kingpin engaged in the locking jaws, the trailer apron above the plate, the release arm on the side of the fifth wheel, AND the three lines (service air = blue, emergency air = red, electric = black 7-pin) running from the back of the cab to the front of the trailer with glad-hand connectors and electrical connector clipped to mounting points.

Overlay 7 numbered YELLOW CIRCLES at:
  "1" at x=35%, y=14% — on the air lines (where blue/red lines are visible mid-span)
  "2" at x=13%, y=12% — on the glad-hand connectors / electrical 7-pin connector at the cab end
  "3" at x=38%, y=50% — on the fifth wheel SKID PLATE (the greased metal plate)
  "4" at x=50%, y=55% — on the KINGPIN (the dark vertical pin in the center of the locking jaws)
  "5" at x=50%, y=62% — on the trailer APRON (flat plate that rests on the skid plate)
  "6" at x=75%, y=47% — on the seam between apron and fifth wheel (to show NO GAP)
  "7" at x=52%, y=25% — on the LOCKING JAWS / SAFETY PIN visible on the side of the fifth wheel

The fifth wheel should be well greased (visible gray/black grease film). All three line colors must be unmistakable. No company logos.
```

### 1.5 — `5-trailer-front.jpg`

```
Side shot of the FRONT of a 53-foot white dry-van trailer, taken from about 6 feet away at chest height. Frame shows the front wall of the trailer, the LANDING GEAR (both legs visible, fully retracted up off the ground, crank handle stowed flat), the clearance between the rear of the tractor and the landing gear, and the side wall of the trailer with the continuous DOT reflective tape (alternating red and white stripe along the side at mid-height).

Overlay 3 numbered YELLOW CIRCLES at:
  "1" at x=15%, y=60% — on the landing gear LEGS
  "2" at x=44%, y=70% — on the GAP between the tractor frame and the landing gear (clearance area)
  "3" at x=70%, y=42% — on the red/white DOT reflective tape stripe on the side of the trailer

Clean white trailer, no graphics. Landing gear crank visible and properly stowed.
```

### 1.6 — `6-rear-of-trailer.jpg`

```
Rear shot of a 53-foot dry-van trailer, taken from about 8 feet behind at chest height. Frame shows the full rear door area, the rear bumper, the rear light cluster (tail lights, brake lights, turn signals), the red reflectors along the bottom rail, the mud flaps, and the upper edge of the trailer where amber clearance lights are mounted at the top corners with red marker lights at the corners. Lights are OFF in this shot.

Overlay 6 numbered YELLOW CIRCLES at:
  "1" at x=13%, y=17% — on the LEFT REAR tail-lamp lens cluster
  "2" at x=22%, y=50% — on a red REFLECTOR along the bottom rail
  "3" at x=78%, y=45% — on the BRAKE LIGHT lens (right side)
  "4" at x=85%, y=45% — on the TURN SIGNAL lens (right side)
  "5" at x=85%, y=55% — on the 4-WAY FLASHER lens
  "6" at x=50%, y=8% — on a CLEARANCE / MARKER LIGHT at the top of the trailer

Lenses must be unbroken, properly mounted. White trailer body. No logos.
```

---

## SECTION 2 — Deep Dive: Engine Bay (11 close-ups)

### 2.1 — `engine/1-oil-dipstick.jpg`

```
NUMBER: 1
ORANGE TAG: OIL DIPSTICK
SAY: "I am checking the oil level. I am checking that the oil is between the ADD and FULL marks on the dipstick and the oil is clean and not low."

Tight close-up of the engine oil dipstick PULLED OUT of its tube, held vertically against a clean rag, with the dipstick blade clearly showing the cross-hatched measuring area and both the ADD and FULL/SAFE etched markings. Oil film on the stick reads between the marks (about 75% up — slightly above middle), amber-honey color, clean (not black). The engine bay is the defocused background. Daylight from above.

Yellow numbered circle "1" centered on the etched FULL mark area of the dipstick. Orange tag at bottom reads "OIL DIPSTICK". Black banner at top with the SAY phrase.
```

### 2.2 — `engine/2-coolant-reservoir.jpg`

```
NUMBER: 2
ORANGE TAG: COOLANT RESERVOIR
SAY: "I am checking the coolant level. I am checking that the coolant reservoir is between the MIN and MAX marks and the cap is on tight."

Close-up of the engine coolant overflow reservoir — a translucent white plastic bottle mounted to the firewall or fender liner of the truck's engine bay. The bottle's MIN and MAX level lines are molded into the side and clearly visible. Green or pink coolant is visible inside, fill level just below MAX. The yellow plastic cap is on tight. Surrounding hoses and engine components are slightly defocused.

Yellow numbered circle "2" centered on the coolant level (mid-bottle). Orange tag "COOLANT RESERVOIR". Black banner with SAY phrase.
```

### 2.3 — `engine/3-power-steering-fluid.jpg`

```
NUMBER: 3
ORANGE TAG: POWER STEERING FLUID
SAY: "I am checking the power steering fluid. I am checking that the reservoir is at the proper level and the cap is secure."

Close-up of the power steering fluid reservoir — a small metallic-finish or black cylindrical reservoir with a screw-on cap labeled "POWER STEERING" or with an icon of a steering wheel. The cap is visible and properly seated. The reservoir is mounted to the engine block or fender well of a heavy-duty diesel truck engine. Engine block and belts visible defocused in background.

Yellow numbered circle "3" centered on the cap. Orange tag "POWER STEERING FLUID". Black banner with SAY phrase.
```

### 2.4 — `engine/4-windshield-washer-fluid.jpg`

```
NUMBER: 4
ORANGE TAG: WINDSHIELD WASHER FLUID
SAY: "I am checking the windshield washer fluid. I am checking that the reservoir is full and the cap is on tight."

Close-up of the windshield washer fluid reservoir — a translucent white plastic bottle with a yellow or blue cap, labeled with a windshield-and-wiper icon. Mounted in the engine bay near the firewall on a Class A truck. Blue washer fluid visible inside, fill level near top. Cap is on. Other engine bay parts defocused around it.

Yellow numbered circle "4" centered on the cap. Orange tag "WINDSHIELD WASHER FLUID". Black banner with SAY phrase.
```

### 2.5 — `engine/5-alternator.jpg`

```
NUMBER: 5
ORANGE TAG: ALTERNATOR
SAY: "I am checking the alternator. I am checking that it is properly mounted and secured, the wiring is not loose or damaged, and the drive belt is tight with no more than three cracks per inch and no frays."

Close-up of the alternator on a heavy-duty diesel engine — a cylindrical aluminum/silver alternator with a ribbed pulley at the front, mounted via a bracket to the engine block. The serpentine drive belt wraps around the pulley. Black battery cable terminal lugged to the back of the alternator. Brackets and mounting bolts clearly visible.

Yellow numbered circle "5" centered on the alternator body. Orange tag "ALTERNATOR". Black banner with SAY phrase.
```

### 2.6 — `engine/6-water-pump.jpg`

```
NUMBER: 6
ORANGE TAG: WATER PUMP
SAY: "I am checking the water pump. I am checking that it is properly mounted and secured, no leaks at the housing or hose connections."

Close-up of the water pump on a heavy-duty diesel engine — a cast metal housing mounted to the front of the engine block with a pulley driven by the serpentine belt. Upper and lower radiator hoses connect to the housing via metal clamps. No coolant leaks visible, but the area is clean enough that any drip would be obvious.

Yellow numbered circle "6" centered on the water pump housing. Orange tag "WATER PUMP". Black banner with SAY phrase.
```

### 2.7 — `engine/7-drive-belts.jpg`

```
NUMBER: 7
ORANGE TAG: DRIVE BELTS
SAY: "I am checking the drive belts. I am checking that the belts are tight with no more than three cracks per inch, no frays, and have less than three-quarters of an inch of play."

Close-up of the serpentine drive belt on a heavy-duty diesel engine, taken from the side so the belt path over multiple pulleys (crankshaft, alternator, water pump, AC compressor, idler) is visible. Belt is black ribbed rubber, in good condition (no cracks, no shiny glazed surface, no fraying on the edges). Tensioner pulley visible.

Yellow numbered circle "7" centered on the middle of the longest visible belt span. Orange tag "DRIVE BELTS". Black banner with SAY phrase.
```

### 2.8 — `engine/8-radiator-hoses.jpg`

```
NUMBER: 8
ORANGE TAG: RADIATOR HOSES
SAY: "I am checking the radiator hoses. I am checking that they are properly mounted and secured, no leaks, no cracks, no bulges, and no chafing."

Close-up of the upper radiator hose — a thick black molded rubber hose with a 90-degree bend, running from the engine thermostat housing to the top of the radiator core. Metal worm-gear hose clamps at each end. No bulges, no cracks. Radiator core visible defocused at one end, engine block at the other.

Yellow numbered circle "8" centered on the middle of the hose. Orange tag "RADIATOR HOSES". Black banner with SAY phrase.
```

### 2.9 — `engine/9-air-compressor.jpg`

```
NUMBER: 9
ORANGE TAG: AIR COMPRESSOR
SAY: "I am checking the air compressor. I am checking that it is properly mounted and secured, the drive belt is tight if belt-driven, and there are no air leaks at the fittings."

Close-up of the air compressor on a heavy-duty diesel engine — a cast iron compressor mounted on the side of the engine block, usually gear-driven (no belt visible on this model) or belt-driven from the front. Two metal lines (discharge and governor) exit from the head of the compressor. Mounting bolts and fittings clearly visible.

Yellow numbered circle "9" centered on the compressor body. Orange tag "AIR COMPRESSOR". Black banner with SAY phrase.
```

### 2.10 — `engine/10-steering-box.jpg`

```
NUMBER: 10
ORANGE TAG: STEERING BOX & LINKAGE
SAY: "I am checking the steering box. I am checking that it is properly mounted and secured, no leaks, no loose or missing nuts and bolts, and the pitman arm and drag link are tight with no excessive play."

Low-angle close-up taken from in front of the driver-side front wheel looking inboard at the steering gearbox — a large cast iron box mounted to the frame rail, with the steering shaft entering from above and the PITMAN ARM (curved metal lever) exiting downward. The DRAG LINK (long horizontal rod with ball joints at each end) connects the pitman arm to the steering knuckle at the wheel. Castle nuts with cotter pins visible at each joint.

Yellow numbered circle "10" centered on the steering gearbox housing. Orange tag "STEERING BOX & LINKAGE". Black banner with SAY phrase.
```

### 2.11 — `engine/11-battery.jpg`

```
NUMBER: 11
ORANGE TAG: BATTERY
SAY: "I am checking the battery. I am checking that it is properly mounted and secured, the cables are tight, no corrosion on the terminals, and the case is not cracked or leaking."

Close-up with the battery box OPEN on the driver-side step area of a Class A tractor, revealing 2-4 Group 31 commercial batteries mounted side-by-side. Positive (red) and negative (black) cables clamped to terminals with no white/blue corrosion. Battery cases are clean, no cracks, no swelling. Hold-down brackets visible across the top.

Yellow numbered circle "11" centered on the nearest battery top. Orange tag "BATTERY". Black banner with SAY phrase.
```

---

## SECTION 3 — Deep Dive: In-Cabin (11 close-ups)

### 3.1 — `cabin/1-three-point-contact.jpg`

```
NUMBER: 1
ORANGE TAG: THREE-POINT CONTACT
SAY: "Before entering the cab, I am using three-point contact — two hands and one foot, or two feet and one hand, on the truck at all times."

Side view of the driver's side door of a Class A tractor, with the door open. The grab handle on the A-pillar and inside the door frame are clearly visible. The lower step, mid-step, and floor of the cab are all visible. NO PERSON in frame — just the steps, handles, and door open showing the climbing path. Yellow arrows DO NOT appear (the overlay system handles markup).

Yellow numbered circle "1" centered on the GRAB HANDLE on the A-pillar (the primary three-point handhold). Orange tag "THREE-POINT CONTACT". Black banner with SAY phrase.
```

### 3.2 — `cabin/2-seat-belt.jpg`

```
NUMBER: 2
ORANGE TAG: SEAT BELT
SAY: "I am checking the seat belt. I am checking that the belt is properly mounted and secured, not ripped or frayed, and latches and releases properly."

Interior shot from the passenger seat looking at the DRIVER'S SEAT of a Class A tractor cab. The 3-point seat belt is visible — the shoulder strap from the B-pillar retractor across the seat, the lap belt buckle on the seat side, and the latch plate. Belt webbing is clean, no fraying, no cuts. Buckle is unlatched and resting on the seat.

Yellow numbered circle "2" centered on the buckle. Orange tag "SEAT BELT". Black banner with SAY phrase.
```

### 3.3 — `cabin/3-mirrors.jpg`

```
NUMBER: 3
ORANGE TAG: MIRRORS
SAY: "I am checking the mirrors. I am checking that they are properly mounted and adjusted, not cracked or broken, and provide full coverage."

Interior shot from the driver's seat looking forward and slightly LEFT at the driver-side west coast mirror and the convex (spot) mirror mounted on the same bracket outside the driver's window. Both mirrors are flat-glass surfaces, no cracks. The mounting arm anchors them solidly to the cab. Side road / parking lot visible in the mirror reflection.

Yellow numbered circle "3" centered on the main rectangular west coast mirror. Orange tag "MIRRORS". Black banner with SAY phrase.
```

### 3.4 — `cabin/4-steering-wheel.jpg`

```
NUMBER: 4
ORANGE TAG: STEERING WHEEL
SAY: "I am checking the steering wheel. I am checking that the free play is no more than 10 degrees — about two inches on a 20-inch wheel."

Interior driver-seat shot of the STEERING WHEEL of a Class A tractor cab. The wheel is approximately 20 inches in diameter, with a horn-pad center logo (generic, no brand). Hands are NOT in frame. Dash and windshield slightly visible in defocus.

Yellow numbered circle "4" centered on the horn pad / center hub of the wheel. Orange tag "STEERING WHEEL". Black banner with SAY phrase.
```

### 3.5 — `cabin/5-horn.jpg`

```
NUMBER: 5
ORANGE TAG: HORN (CITY + AIR)
SAY: "I am checking the horn. I am pressing the city horn and pulling the air horn to make sure both are working."

Interior shot of the CEILING / headliner area of a Class A tractor cab, showing the AIR HORN LANYARD (a black braided pull cord with a knot at the end) hanging down from the headliner, AND the STEERING WHEEL HORN PAD visible below in the same frame. The lanyard is in focus.

Yellow numbered circle "5" centered on the air horn lanyard. Orange tag "HORN (CITY + AIR)". Black banner with SAY phrase.
```

### 3.6 — `cabin/6-wipers-windshield.jpg`

```
NUMBER: 6
ORANGE TAG: WIPERS & WINDSHIELD
SAY: "I am checking the wipers and windshield. I am checking that the wiper blades are not torn, the arms are tight, and the windshield is not cracked or chipped in the driver's view."

Exterior shot of the WINDSHIELD of a Class A tractor, taken from the front of the truck at hood height. Both wiper blades visible in the parked (down) position across the windshield. Glass is clean, no cracks, no chips. Wiper arms and rubber blades show no tears.

Yellow numbered circle "6" centered on the DRIVER-SIDE wiper blade rubber strip. Orange tag "WIPERS & WINDSHIELD". Black banner with SAY phrase.
```

### 3.7 — `cabin/7-heater-defroster.jpg`

```
NUMBER: 7
ORANGE TAG: HEATER / DEFROSTER
SAY: "I am checking the heater and defroster. I am checking that they are working and that air flows through the defroster vents."

Interior dashboard close-up showing the DEFROSTER VENTS along the top of the dashboard at the base of the windshield. Vent louvers visible. The HVAC control panel with heat / defrost / fan controls is visible in the lower-right of the frame.

Yellow numbered circle "7" centered on the largest defroster vent. Orange tag "HEATER / DEFROSTER". Black banner with SAY phrase.
```

### 3.8 — `cabin/8-dashboard-gauges.jpg`

```
NUMBER: 8
ORANGE TAG: DASHBOARD GAUGES
SAY: "I am checking the gauges. I am checking the oil pressure, coolant temperature, voltmeter, and air pressure gauges — all reading in the normal range."

Interior shot of the INSTRUMENT CLUSTER / gauge panel directly behind the steering wheel of a Class A tractor. The speedometer, tachometer, oil pressure gauge, water temperature gauge, voltmeter, and TWO air pressure gauges (primary and secondary) are all visible. All needles are in the GREEN / normal range. Key is in the ON position.

Yellow numbered circle "8" centered on the AIR PRESSURE gauge pair. Orange tag "DASHBOARD GAUGES". Black banner with SAY phrase.
```

### 3.9 — `cabin/9-lights-dash-indicators.jpg`

```
NUMBER: 9
ORANGE TAG: LIGHTS & DASH INDICATORS
SAY: "I am checking the lights and indicators. I am turning on the headlights, four-way flashers, and turn signals, and checking that all dash indicators light up at key-on."

Interior dashboard shot showing the DASH INDICATOR LIGHTS lit up at key-ON — ABS warning light, check engine, oil pressure warning, low air warning, and a few others all ILLUMINATED in amber/red. The headlight switch and 4-way flasher switch are visible on the lower dash.

Yellow numbered circle "9" centered on the ABS warning indicator light (the brightest amber light in the cluster). Orange tag "LIGHTS & DASH INDICATORS". Black banner with SAY phrase.
```

### 3.10 — `cabin/10-emergency-equipment.jpg`

```
NUMBER: 10
ORANGE TAG: EMERGENCY EQUIPMENT
SAY: "I am checking the emergency equipment. I am checking for three reflective triangles, a charged fire extinguisher, and spare electrical fuses."

Interior shot showing all three required emergency items laid out on the passenger seat or floor of the cab:
  1. THREE reflective warning triangles (red-and-orange, folded flat) stacked together
  2. A red ABC FIRE EXTINGUISHER with a clearly visible pressure gauge in the green and a locking pin
  3. A small plastic box of SPARE ELECTRICAL FUSES

All three items in sharp focus.

Yellow numbered circle "10" centered on the FIRE EXTINGUISHER gauge. Orange tag "EMERGENCY EQUIPMENT". Black banner with SAY phrase.
```

### 3.11 — `cabin/11-parking-brake.jpg`

```
NUMBER: 11
ORANGE TAG: PARKING BRAKE (TUG TEST)
SAY: "I am performing the parking brake tug test. I am setting the parking brake, releasing the service brake, and gently pulling against the brake in low gear — the truck should not move."

Interior shot of the DASH PANEL of a Class A tractor showing the YELLOW DIAMOND-SHAPED parking brake valve (tractor brake) and the RED OCTAGONAL trailer brake valve, both PULLED OUT (applied position). The valves are clearly visible on the dash, typically near the air pressure gauges.

Yellow numbered circle "11" centered on the YELLOW DIAMOND parking brake valve. Orange tag "PARKING BRAKE (TUG TEST)". Black banner with SAY phrase.
```

---

## SECTION 4 — Deep Dive: Trailer (16 close-ups)

### 4.1 — `trailer/1-brake-lights.jpg`

```
NUMBER: 1
ORANGE TAG: BRAKE LIGHTS
SAY: "I am checking the brake lights. I am applying the brake and checking that the brake lights come on bright."

Close-up of the LEFT REAR brake light lens cluster on a 53-foot dry van trailer with the BRAKE LIGHT ILLUMINATED BRIGHT RED. The lens is clean, intact, no cracks. Visible at twilight or in a dim shop to make the illumination pop.

Yellow numbered circle "1" centered on the illuminated brake light lens. Orange tag "BRAKE LIGHTS". Black banner with SAY phrase.
```

### 4.2 — `trailer/2-turn-signals.jpg`

```
NUMBER: 2
ORANGE TAG: TURN SIGNALS / 4-WAY FLASHERS
SAY: "I am checking the turn signals and four-way flashers. I am checking that the left, right, and four-way flashers are working."

Close-up of the LEFT REAR turn signal of a 53-foot dry van trailer with the AMBER TURN SIGNAL LENS ILLUMINATED bright amber (mid-blink). Lens is intact, properly mounted. Twilight lighting to make the amber pop.

Yellow numbered circle "2" centered on the illuminated amber lens. Orange tag "TURN SIGNALS / 4-WAY FLASHERS". Black banner with SAY phrase.
```

### 4.3 — `trailer/3-clearance-marker-lights.jpg`

```
NUMBER: 3
ORANGE TAG: CLEARANCE & MARKER LIGHTS
SAY: "I am checking the clearance and marker lights. I am checking that all clearance and marker lights are on and working."

Wide rear-quarter shot of the upper edge of a dry van trailer at TWILIGHT, with the AMBER CLEARANCE LIGHTS at the top corners and the RED MARKER LIGHTS along the rear corners ALL ILLUMINATED. The cluster of three amber lights at top-center and the red corner markers are unmistakable.

Yellow numbered circle "3" centered on the cluster of THREE AMBER clearance lights at the top center of the trailer. Orange tag "CLEARANCE & MARKER LIGHTS". Black banner with SAY phrase.
```

### 4.4 — `trailer/4-reflective-tape.jpg`

```
NUMBER: 4
ORANGE TAG: REFLECTIVE TAPE
SAY: "I am checking the reflective tape. I am checking that the reflective tape is installed and in good condition."

Close-up of the DOT C2 REFLECTIVE CONSPICUITY TAPE along the side of a 53-foot dry van trailer — alternating RED and WHITE 6-inch stripes in a long continuous strip at the lower half of the trailer side. Tape is clean, no peeling, no fading. Daylight shot so colors are accurate.

Yellow numbered circle "4" centered on the middle of a visible RED segment of the tape. Orange tag "REFLECTIVE TAPE". Black banner with SAY phrase.
```

### 4.5 — `trailer/5-wheels-tires.jpg`

```
NUMBER: 5
ORANGE TAG: WHEELS & TIRES
SAY: "I am checking the wheels and tires. I am checking that the tires are properly inflated, no cuts or bulges, that the rims are not cracked or bent, and all lug nuts are present and tight."

Close-up of the OUTER DUAL on a tandem axle of a 53-foot trailer. Both inner and outer dual tires visible, with the silver aluminum hub cap and ALL 10 LUG NUTS clearly present and tight. Tire tread depth ~4/32" (legal for trailer position). No bulges, no cuts. Rim is undamaged.

Yellow numbered circle "5" centered on the hub between the dual tires. Orange tag "WHEELS & TIRES". Black banner with SAY phrase.
```

### 4.6 — `trailer/6-suspension.jpg`

```
NUMBER: 6
ORANGE TAG: SUSPENSION
SAY: "I am checking the suspension. I am checking the springs, axle, and air bags for cracks, damage, or leaks, and that all mounting bolts and U-bolts are present and secure."

Low-angle close-up taken behind the trailer wheel looking inboard, showing the AIR-RIDE SUSPENSION — air bags (round black rubber bellows mounted between axle and frame), trailing arm (long horizontal beam from frame to axle), shock absorbers, and U-bolts holding the axle to the suspension. All components visible and intact.

Yellow numbered circle "6" centered on the air bag. Orange tag "SUSPENSION". Black banner with SAY phrase.
```

### 4.7 — `trailer/7-landing-gear.jpg`

```
NUMBER: 7
ORANGE TAG: LANDING GEAR
SAY: "I am checking the landing gear. I am checking that it is securely mounted, not bent or damaged, and that the crank and foot are in good condition."

Close-up of the LEFT landing gear leg of a 53-foot trailer, taken from the side at chest height. The vertical telescoping leg is fully raised, the foot (sand shoe) is clear of the ground by 6 inches, the crank handle on the SIDE of the gear is STOWED FLAT against the gear (not hanging out). Mounting brackets clearly visible.

Yellow numbered circle "7" centered on the joint between the upper and lower leg sections. Orange tag "LANDING GEAR". Black banner with SAY phrase.
```

### 4.8 — `trailer/8-coupling-devices.jpg`

```
NUMBER: 8
ORANGE TAG: COUPLING DEVICES
SAY: "I am checking the coupling devices. I am checking that the pintle hook or fifth wheel is secure, not cracked or damaged, and that the locking mechanism is working."

Close-up of the KINGPIN of the trailer (the vertical pin that locks into the tractor's fifth wheel jaws), taken from BELOW LOOKING UP at the underside of the trailer's apron plate. The kingpin is a solid steel pin about 2 inches in diameter and 3 inches tall, hanging down from the apron plate. Clean, no welds, no damage.

Yellow numbered circle "8" centered on the kingpin shaft. Orange tag "COUPLING DEVICES". Black banner with SAY phrase.
```

### 4.9 — `trailer/9-electrical-connections.jpg`

```
NUMBER: 9
ORANGE TAG: ELECTRICAL CONNECTIONS
SAY: "I am checking the electrical connections. I am checking that the electrical plug is secure, the pins are not bent or corroded, and the cable is not cut or frayed."

Close-up of the 7-PIN ELECTRICAL CONNECTOR (the round black plug with 7 round metal pins inside) connected at the front of the trailer, with the black coiled cable running back to the tractor. The connector is fully seated in its receptacle and the locking lever is engaged. Pins not corroded.

Yellow numbered circle "9" centered on the connector body. Orange tag "ELECTRICAL CONNECTIONS". Black banner with SAY phrase.
```

### 4.10 — `trailer/10-air-lines.jpg`

```
NUMBER: 10
ORANGE TAG: AIR LINES
SAY: "I am checking the air lines. I am checking that the air lines are not cut, worn, or leaking, and that they are properly connected and secured."

Close-up of the two GLAD HAND connectors at the front of the trailer — the BLUE glad hand (service line) and the RED glad hand (emergency line) — each clamped to the matching tractor glad hand via the rotating metal jaws. The braided / nylon-covered air hoses run back toward the tractor.

Yellow numbered circle "10" centered on the junction where the two glad hands clamp together. Orange tag "AIR LINES". Black banner with SAY phrase.
```

### 4.11 — `trailer/11-doors-latches.jpg`

```
NUMBER: 11
ORANGE TAG: DOORS & LATCHES
SAY: "I am checking the doors and latches. I am checking that the doors open and close properly, the latches and hinges are secure, and the door seals are intact."

Close-up of the REAR DOOR LATCH HARDWARE of a 53-foot dry van trailer — the two vertical CAM BARS, the rotating CAM HOOKS at top and bottom that hook into keepers on the door frame, and the door handle. Hinges visible on the side. Door is CLOSED and LATCHED. Black rubber door seal visible around the door perimeter.

Yellow numbered circle "11" centered on the door handle / latch keeper. Orange tag "DOORS & LATCHES". Black banner with SAY phrase.
```

### 4.12 — `trailer/12-undercarriage.jpg`

```
NUMBER: 12
ORANGE TAG: UNDERCARRIAGE
SAY: "I am checking the undercarriage. I am checking the frame and crossmembers for cracks or damage, and that all mounting bolts and fasteners are secure."

Low-angle shot taken from the SIDE of the trailer looking UNDERNEATH, showing the LONGITUDINAL FRAME RAILS (I-beams running front to back), the CROSSMEMBERS (perpendicular beams between the rails), and the rear MUDFLAP HANGER. Clean steel, no cracks visible.

Yellow numbered circle "12" centered on a crossmember junction with the main rail. Orange tag "UNDERCARRIAGE". Black banner with SAY phrase.
```

### 4.13 — `trailer/13-light-operation.jpg`

```
NUMBER: 13
ORANGE TAG: LIGHT OPERATION
SAY: "I am checking the light operation. I am checking that all lights operate properly, including brake lights, turn signals, and marker lights."

Wide rear shot of a 53-foot dry van trailer at TWILIGHT with ALL LIGHTS ON simultaneously — brake lights bright red, both turn signals flashing amber (mid-cycle), 4-way flashers, clearance lights at top in amber, marker lights at corners in red, license plate light white. The trailer is lit up like a Christmas tree.

Yellow numbered circle "13" centered on the brightest red brake light cluster. Orange tag "LIGHT OPERATION". Black banner with SAY phrase.
```

### 4.14 — `trailer/14-abs-light.jpg`

```
NUMBER: 14
ORANGE TAG: ABS LIGHT
SAY: "I am checking the ABS light. I am checking that the ABS light comes on with the key and goes off after moving the truck."

Close-up of the AMBER ABS WARNING LIGHT mounted on the LEFT side of the trailer (typically a yellow square fixture about 1 inch across, mounted to the trailer's outer wall just behind the landing gear or near the front of the wheelwell). The light is ILLUMINATED amber to show ABS self-test is active (key just turned ON).

Yellow numbered circle "14" centered on the illuminated ABS lamp. Orange tag "ABS LIGHT". Black banner with SAY phrase.
```

### 4.15 — `trailer/15-brake-chambers.jpg`

```
NUMBER: 15
ORANGE TAG: BRAKE CHAMBERS
SAY: "I am checking the brake chambers. I am checking that they are not leaking, are properly mounted, and that the push rods move freely."

Close-up of a TRAILER AXLE BRAKE CHAMBER — a metal canister (about the size of a coffee can) mounted to the axle with TWO METAL AIR LINES connecting to the top, and the PUSH ROD exiting one end connecting to the SLACK ADJUSTER. Spring brake chamber (the larger black canister) is visible behind the service chamber.

Yellow numbered circle "15" centered on the brake chamber body. Orange tag "BRAKE CHAMBERS". Black banner with SAY phrase.
```

### 4.16 — `trailer/16-slack-adjusters.jpg`

```
NUMBER: 16
ORANGE TAG: SLACK ADJUSTERS
SAY: "I am checking the slack adjusters. I am checking that they are properly positioned and not damaged, and that they move freely."

Close-up of a TRAILER SLACK ADJUSTER — the lever arm connecting the push rod (from the brake chamber) to the S-CAM (which rotates to apply the brakes). The slack adjuster is a flat metal arm about 6 inches long with an adjustment bolt at one end. Auto-slack adjusters (preferred on modern trailers) have a clutch mechanism visible. Push rod and S-cam shaft visible at each end.

Yellow numbered circle "16" centered on the body of the slack adjuster. Orange tag "SLACK ADJUSTERS". Black banner with SAY phrase.
```

---

## OPTIONAL — HIGHLIGHT phase variants

For each deep-dive image above, generate a **second image** with the same composition that ADDS a yellow OVAL OUTLINE (#FFD60A, 4px stroke, no fill) traced around the entire named part. The oval should be tight to the part — not a generic circle. This is the HIGHLIGHT phase the app toggles to when the student needs an extra visual cue.

Filename convention: `{number}-{slug}-highlight.jpg`. Example: `engine/5-alternator-highlight.jpg` = the alternator photo with a yellow oval traced around the alternator's outline in addition to the numbered yellow circle.

To request a highlight variant, append to any prompt above:
```
ADDITIONAL OVERLAY: Also trace a YELLOW OVAL OUTLINE (#FFD60A, 4px stroke, no fill, no shadow) tightly around the entire named part. The oval should follow the part's silhouette — not a circle, an oval that matches the part's actual shape. The numbered yellow circle remains. Orange tag and black banner remain unchanged.
```

---

## QUICK CHECKLIST — when reviewing generated images

Before accepting any image from ChatGPT into the app, verify:

- [ ] The named part is in the center 60% of the frame.
- [ ] The yellow numbered circle is centered on the part (not floating in empty space).
- [ ] The number inside the circle matches the part's index in the section.
- [ ] The orange tag text matches the part name exactly (no abbreviations, no typos).
- [ ] The SAY phrase in the black banner reads correctly and is grammatically intact.
- [ ] The truck looks like a real Class A tractor or 53-foot dry van trailer — no toy proportions, no cab-over trucks unless explicitly requested.
- [ ] Lighting is even (no harsh shadows obscuring the part).
- [ ] No people, no company logos, no extra annotations beyond the three overlays.
- [ ] Background does not include a second numbered part that could confuse the student.
- [ ] Resolution is at least 1536×1024.

If the image fails any check, regenerate with corrective wording (e.g. "the numbered circle is in the wrong place — center it on the alternator pulley, not on the engine block to its left").

---

## TIPS FOR BETTER RESULTS

1. **Anchor the model with one reference truck.** In the first message of each session, after the style block, paste a real photo of the truck model you want (Freightliner Cascadia / Pete 579 / etc) and tell the model "match this truck's appearance for every image you generate this session."

2. **Generate one image per turn.** Don't ask for batches — image models are dramatically more accurate on a single subject than a multi-image request.

3. **Iterate on the overlay separately.** If the photo is good but the overlay is wrong (wrong number, wrong tag text, banner cut off), ask the model to regenerate ONLY the overlay layer with the same photo. This saves rerolling the whole image.

4. **Use real-world references.** If you have actual reference photos of the parts (e.g. a real coolant reservoir from your truck), include them in the prompt with "match the layout of this real reservoir." DALL-E and similar models can use reference images.

5. **Reject any image with the wrong COLOR convention.** The Service air line is BLUE and the Emergency air line is RED. The rear lights are RED, never amber. The front clearance lights are AMBER. If a generated image gets these wrong, regenerate — the test answers depend on color accuracy.

6. **For "lights ON" shots, request twilight or dim shop lighting.** Bright daylight washes out the LED brightness and makes the illumination indistinguishable from off.

7. **Avoid AI-render look.** Add "photographic, NOT 3D rendered, NOT illustrated" to any prompt where the model drifts toward a CGI aesthetic.

---

**End of image prompt list. 6 wide shots + 38 close-ups + optional 38 highlight variants = up to 82 images total.**
