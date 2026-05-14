# Chord Detector — Loop Detection + Output Validation Panel

**Status:** approved design — ready for implementation plan
**Date:** 2026-05-14

## Goal

Two additions to the in-browser chord detector, both operating on the existing
`ChordAnalysisResult` (no extra audio pass):

1. **Loop detection** — spot that a (typically pure-piano) piece is a repeating loop and
   **report** it as a stat in the analysis output.
2. **Output validation panel** — a persistent "Output check" panel that runs a pass/warn
   report on the exported MIDI's quality after every analysis.

Both surface in `ToolsChordDetectorPage.tsx`. The export pipeline (Part 2's bug fixes) is
unchanged.

## Non-goals

- One-loop export trimming (user chose report-only).
- Audio-domain loop detection — works purely on the analysis result.
- Auto-fixing validation warnings — the panel reports, it does not mutate output.

---

## Feature 1 — Loop detection (bar-level pattern match)

### Module: `src/zones/tools/chord-detector-loops.ts` (new, pure)

```ts
export type LoopInfo = {
  found: boolean
  barCount: number     // P — bars in the repeating unit (0 when !found)
  repeats: number      // how many times the unit repeats across the analyzed span
  confidence: number   // 0..1 — mean bar-similarity for the chosen period
  barSec: number       // bar duration in seconds
  totalBars: number    // whole bars analyzed
}

export function detectBarLoop(
  leadNotes: readonly LeadNote[],
  bpm: number,
  durationSec: number,
): LoopInfo
```

### Algorithm

1. `barSec = 4 * 60 / bpm` (4/4). `totalBars = floor(durationSec / barSec)`.
   If `totalBars < 2` or `leadNotes` empty → `{ found: false, barCount: 0, repeats: 0, confidence: 0, … }`.
2. `sixteenthSec = barSec / 16`.
3. **Bar fingerprint** — for each bar `b`, a `Set<string>` of `` `${midi}:${pos16}` `` where
   `pos16 = round((startSec − b*barSec) / sixteenthSec)` for every lead note whose start
   falls in `[b*barSec, (b+1)*barSec)`. (Part 2's quantize already put notes on a clean
   grid, so `pos16` is crisp.)
4. **Bar similarity** `sim(A, B)` = Jaccard `|A∩B| / |A∪B|`; both empty → 1.0, one empty → 0.
5. **Candidate periods** `P ∈ {1, 2, 4, 8, 16}` with `2P ≤ totalBars` (need ≥2 reps to confirm).
6. For each `P`: `meanSim` = mean of `sim(bar[i], bar[i+P])` over `i ∈ [0, totalBars−P)`.
7. Choose the **smallest** `P` with `meanSim ≥ LOOP_SIM_THRESHOLD` (0.7) — the fundamental
   period. None pass → `found: false`.
8. `repeats = floor(totalBars / P)`, `confidence = meanSim`.

Module-level tunable: `LOOP_SIM_THRESHOLD = 0.7`.

### Surface

- New `loop: LoopInfo` field on `ChordAnalysisResult`. Both analysis paths
  (`analyzeChordProgressionFromBlob` audio path **and** `analyzeChordProgressionFromMidiBlob`)
  call `detectBarLoop` on the final lead notes and set it.
- A `LOOP` stat in the existing analysis stat row of `ToolsChordDetectorPage.tsx`:
  value `4 bars ×7` (or `—` when `!found`), with a `clear-ui-labels`-compliant hint:
  *"The piece repeats a 4-bar pattern 7 times. '—' = no clear loop."*

---

## Feature 2 — "Output check" validation panel

### Module: `src/zones/tools/chord-detector-validation.ts` (new, pure)

```ts
export type ValidationCheck = {
  id: 'timing' | 'duplicates' | 'loopSeam' | 'coverage' | 'confidence'
  label: string                  // plain, clear (clear-ui-labels skill)
  status: 'pass' | 'warn'
  detail: string                 // plain-English one-liner
}
export type ValidationReport = {
  checks: ValidationCheck[]
  passCount: number
  warnCount: number
}

export function validateChordOutput(result: ChordAnalysisResult): ValidationReport
```

### The five checks

| id | label | pass when | detail example |
|---|---|---|---|
| `timing` | On-grid timing | ≥95% of lead notes within 10 ms of the nearest 1/16 or 1/16-triplet line @ `result.bpm` | "98% of notes land on the beat grid." |
| `duplicates` | No split/duplicate notes | 0 same-pitch consecutive pairs with gap ≤ 45 ms (overlaps counted) | "No duplicate notes." / "3 same-pitch notes overlap." |
| `loopSeam` | Loop seam | `loop.found` and no note straddles a loop-unit boundary by > half a bar; **n/a → pass** when `!loop.found` | "4-bar loop repeats cleanly." / "Through-composed — no loop seam to check." |
| `coverage` | Note coverage | density `notes/durationSec` ∈ [0.5, 20] **and** no silent gap > 2 bars mid-piece | "6.2 notes/sec, no large gaps." / "Large silent gap at 41 s — possible missing notes." |
| `confidence` | Analysis confidence | `estimatedKey.confidence ≥ 0.6` | "Key estimate is confident." / "Key/tempo uncertain — review the output." |

Module-level tunable `VALIDATION_THRESHOLDS = { onGridPct: 95, onGridTolMs: 10, dupGapSec: 0.045, minNotesPerSec: 0.5, maxNotesPerSec: 20, maxSilentGapBars: 2, minKeyConfidence: 0.6 }`.

Empty `leadNotes` → a single `warn` report ("No notes detected").

### Surface

- A new "OUTPUT CHECK" panel in `ToolsChordDetectorPage.tsx`, rendered whenever `result`
  exists, computed `useMemo(() => validateChordOutput(result), [result])`.
- One row per check: a status dot (green = pass, amber = warn) + label + detail.
  GRAY2020-styled; labels/hints follow the `clear-ui-labels` skill.

---

## Architecture & data flow

```
analyzeChordProgressionFromBlob / …FromMidiBlob
  └─ detectBarLoop(leadNotes, bpm, durationSec) ──> result.loop
        result ──> ToolsChordDetectorPage
                     ├─ LOOP stat (from result.loop)
                     └─ useMemo validateChordOutput(result) ──> "OUTPUT CHECK" panel
```

- `chord-detector-loops.ts` and `chord-detector-validation.ts` are **pure** — they take
  data, return data, no DOM/audio. Independently testable.
- `chord-detector-engine.ts` re-exports `detectBarLoop`, `validateChordOutput`, and the
  `LoopInfo` / `ValidationReport` / `ValidationCheck` types (the page imports from the
  engine, matching the existing pattern).
- No change to the 13-stage export pipeline.

## Edge cases / error handling

- **Short clips** (`totalBars < 2·P`): `detectBarLoop` returns `found: false`; `loopSeam`
  check reports "through-composed"; the `LOOP` stat shows `—`.
- **Empty `leadNotes`**: `detectBarLoop` → `found: false`; `validateChordOutput` → one warn row.
- **MIDI-file input**: same path — `analyzeChordProgressionFromMidiBlob` also has lead notes,
  also gets loop detection + a result the panel can validate.
- **Invalid bpm** (≤0 / non-finite): `detectBarLoop` guards and returns `found: false`.

## Testing

- Extend `scripts/chord-detector-midi-debug.mjs` to capture `result.loop` and print the loop
  info + the full validation report.
- Run on all 3 control files in the browser; expected: control MP3 (a 2-chord vamp) → loop
  found; the short `Notes*.wav` clips → short loop or `found: false` (both valid).
- Verify the panel + LOOP stat render in the browser preview.
- `tsc -b` + `eslint` clean on all changed files.
