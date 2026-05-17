# CDL Pre-Trip Inspection — Photos

This folder is where the 6 inspection-area photos live for the
**Pre-Trip Parts Map** interactive test (`CdlPreTripPartsMap.tsx`).

The test renders each photo with clickable hotspots overlaid as SVG
circles. The component falls back to a stylized SVG placeholder when
the file is missing, so the test runs immediately without the photos —
just looks plainer.

## Filenames the component expects

| Section | Filename |
|---|---|
| 1. Front / Engine Area | `1-front-engine.jpg` |
| 2. Steering Axle | `2-steering-axle.jpg` |
| 3. Side of Tractor | `3-side-of-tractor.jpg` |
| 4. Combination Vehicle / Coupling Area | `4-coupling.jpg` |
| 5. Trailer (Front) | `5-trailer-front.jpg` |
| 6. Rear of Trailer | `6-rear-of-trailer.jpg` |

JPG, PNG, or WEBP all work — just keep the basename. If you change
formats, update `imagePath` in `cdl-pretrip-parts-map-data.ts`.

## Sizing tips

The photos render at a maximum of ~900 px wide and scale down
responsively. Native size should be at least 1200 × 800 so the
hotspots stay crisp on retina displays.

If you want to use the inspection-sheet photos that already have
numbered yellow circles burned in, that's fine — the SVG overlay still
works alongside them and gives the hover/active highlights.
