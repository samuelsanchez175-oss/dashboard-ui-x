# Chord Detector — Loop Detection + 2nd-Pass Structuring + Output Validation

**Status:** approved design (revised after reference-MIDI review) — ready for implementation plan
**Date:** 2026-05-14

## Goal

Three additions to the in-browser chord detector, all operating on the existing
`ChordAnalysisResult` (no extra audio pass):

1. **Loop detection** — spot that a piece is a repeating loop and **report** it as a stat.
2. **2nd-pass structuring** — a final pipeline stage that **cleans every repetition in place**:
   quantizes note lengths, re-snaps residual off-grid jitter, and trims notes that straddle a
   loop-unit seam — so the export is "more structured and loops correctly." Each repetition
   stays distinct (real variation is preserved; it is *not* consolidated to one loop).
3. **Output validation panel** — a persistent "Output check" panel with a pass/warn report.

All three surface in `ToolsChordDetectorPage.tsx`. The Part-2 bug-fix pipeline (13 stages) is
unchanged; the 2nd pass is appended as stage 14.

### Why — reference MIDI

`~/Downloads/frank ocean test acura girl .mid` (the user's hand-cleaned target): 2 bars,
37 notes, **starts 100% on the 1/16 grid, 0 same-pitch overlaps** — but note *durations* still
wander (4.83, 1.36, 5.79 sixteenths…) and one start sits at 8.02/16. The 2nd pass closes
exactly that gap automatically.

## Non-goals

- Consolidating repetitions into one canonical loop (user chose clean-in-place).
- One-loop export trimming.
- Audio-domain analysis — everything runs on the analysis result.
- Auto-fixing validation warnings — the panel reports, it does not mutate.

---

## Feature 1 — Loop detection (`chord-detector-loops.ts`, new pure module)

```ts
export type LoopInfo = {
  found: boolean
  barCount: number     // P — bars in the repeating unit (0 when !found)
  repeats: number      // times the unit repeats across the analyzed span
  confidence: number   // 0..1 — mean bar-similarity for the chosen period
  barSec: number       // bar duration in seconds
  totalBars: number    // whole bars analyzed
}
export function detectBarLoop(leadNotes: readonly LeadNote[], bpm: number, durationSec: number): LoopInfo
```

**Algorithm.** `barSec = 4·60/bpm`; `totalBars = floor(durationSec / barSec)` (< 2 → not found).
Fingerprint each bar as a `Set` of `` `${midi}:${round((start − barStart)/sixteenthSec)}` ``.
Bar similarity = Jaccard. For candidate periods `P ∈ {1,2,4,8,16}` with `2P ≤ totalBars`, take
the mean of `sim(bar[i], bar[i+P])`; pick the **smallest** `P` with mean ≥ `LOOP_SIM_THRESHOLD`
(0.7). `repeats = floor(totalBars/P)`.

**Surface.** New `loop: LoopInfo` field on `ChordAnalysisResult`, set by both analysis paths.
A `LOOP` stat in the analysis stat row — `4 bars ×7` or `—` — with a `clear-ui-labels`-compliant
hint.

---

## Feature 2 — 2nd-pass output structuring (`chord-detector-structure.ts`, new pure module)

```ts
export function structureLeadNotes(
  notes: readonly LeadNote[],
  loop: LoopInfo,
  bpm: number,
): LeadNote[]
```

Appended to the engine pipeline as **stage 14**, after the final merge. Same note count and
pitches in/out — it only tightens timing. Three steps, in order:

1. **Re-snap starts.** Snap each start to the nearest 1/16 **or** 1/16-triplet grid line
   (0-anchored — the grid Part-2's quantize established). Removes the ≤8 ms drift that
   `alignChordOnsetsInLeadNotes` (stage 10) introduces on triplet-positioned notes.
2. **Quantize note lengths.** Snap each duration to the nearest 1/16 multiple, floor of one
   1/16. Then, per rounded-MIDI lane, clamp a note's end so it never overlaps the next
   same-pitch note's snapped start (mirrors the existing per-lane repair in
   `applyNeuralNoteStyleLeadNotes`). This is the core "more structured" fix — durations stop
   wandering.
3. **Seam trim** (only when `loop.found`). Loop unit = `loop.barCount · barSec`. If a note's
   end crosses its loop-unit boundary by more than one 1/16, clamp the note to end at the
   boundary. Keeps each loop unit self-contained so the output "loops correctly."

Module-level tunables: `STRUCTURE_PASS = { durationGridSixteenths: 1, seamTrimToleranceSixteenths: 1, minDurationSixteenths: 1 }`.

**Always on** — it is a strict tightening of the output (no toggle; the user asked for the
output to "go through a 2nd pass").

---

## Feature 3 — "Output check" validation panel (`chord-detector-validation.ts`, new pure module)

```ts
export type ValidationCheck = {
  id: 'timing' | 'duplicates' | 'loopSeam' | 'coverage' | 'confidence'
  label: string; status: 'pass' | 'warn'; detail: string
}
export type ValidationReport = { checks: ValidationCheck[]; passCount: number; warnCount: number }
export function validateChordOutput(result: ChordAnalysisResult): ValidationReport
```

| id | label | pass when | covers |
|---|---|---|---|
| `timing` | Timing & note lengths | ≥95% of starts **and** durations on the 1/16 / 1/16-triplet grid | "accuracy" (Bug 1 + 2nd pass) |
| `duplicates` | No split/duplicate notes | 0 same-pitch pairs with gap ≤ 45 ms (overlaps counted) | "accuracy" (Bug 4) |
| `loopSeam` | Loop seam | `loop.found` and no note straddles a loop-unit boundary by > 1 sixteenth; **n/a → pass** when `!loop.found` | "looping issues" |
| `coverage` | Note coverage | density `notes/durationSec` ∈ [0.5, 20] **and** no silent gap > 2 bars mid-piece | "missing notes" |
| `confidence` | Analysis confidence | `estimatedKey.confidence ≥ 0.6` | overall trust |

Module tunable `VALIDATION_THRESHOLDS`. Empty `leadNotes` → one `warn` row. Surfaces as an
"OUTPUT CHECK" panel in `ToolsChordDetectorPage.tsx`, computed
`useMemo(() => validateChordOutput(result), [result])`; one row per check (green/amber dot +
label + plain detail), GRAY2020-styled, `clear-ui-labels`-compliant.

---

## Architecture & data flow

```
analyzeChordProgressionFromBlob / …FromMidiBlob
  ├─ … stage 13 (final merge — Part 2)
  ├─ detectBarLoop(leadNotes, bpm, durationSec) ──────────────> loopInfo
  └─ stage 14: structureLeadNotes(leadNotes, loopInfo, bpm) ──> leadNotes
        result { …, loop: loopInfo, leadNotes } ──> ToolsChordDetectorPage
                ├─ LOOP stat
                └─ useMemo validateChordOutput(result) ──> "OUTPUT CHECK" panel
```

- Three new **pure** modules — data in, data out, no DOM/audio, independently testable.
- `chord-detector-engine.ts`: adds `loop` to `ChordAnalysisResult`; calls `detectBarLoop` then
  `structureLeadNotes` at the end of both analysis paths; re-exports the new functions + types
  (the page imports from the engine, matching the existing pattern).
- No change to stages 1-13.

## Edge cases / error handling

- **Short clips** (`totalBars < 2`): `detectBarLoop` → `found: false`; `structureLeadNotes`
  still re-snaps starts + quantizes lengths, just skips seam trim; `LOOP` stat → `—`.
- **Empty `leadNotes`**: every function is a safe no-op / empty report.
- **Invalid bpm** (≤ 0 / non-finite): `detectBarLoop` → `found: false`; `structureLeadNotes`
  returns notes unchanged.
- **MIDI-file input**: same path — also gets loop detection, the 2nd pass, and validation.

## Testing

- Extend `scripts/chord-detector-midi-debug.mjs` to capture `result.loop`, print the
  validation report, and report a before/after on note-duration grid-fit (proving the 2nd
  pass works).
- Run on all 3 audio control files; cross-check the structured output against the user's
  reference `.mid` with `scripts/inspect-midi-file.mjs`.
- Verify the `LOOP` stat + "OUTPUT CHECK" panel render in the browser preview.
- `tsc -b` + `eslint` clean on all changed files.
