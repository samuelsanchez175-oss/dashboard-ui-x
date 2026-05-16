# Chord Detector — Handoff & Progress Ledger

Running record of what's been built, what's outstanding, and where the live
pipeline sits relative to the user's stated goal.

**Goal:** The chord detector should produce a clean, loop-ready MIDI export
from a source MP3 that lands at **80–90% fidelity to `Notes 2.wav`** (the
user's hand-cleaned target — their MIDI rendered through Logic with all the
top notes added back in).

**Reference files (live on disk):**

| Path | Role |
|---|---|
| `/Users/samuel/Desktop/Frank Ocean Acura Integurl Instrumental.mp3` | Source audio (primary test track) |
| `/Users/samuel/Desktop/Notes.wav` | The detector's raw MIDI export rendered through Logic |
| `/Users/samuel/Desktop/Notes 2.wav` | Target — `Notes.wav` after the user hand-added missing top notes |
| `/Users/samuel/Downloads/Frank Ocean - American Wedding (Instrumental).mp3` | Sibling track for regression checks |

## Live pipeline (current)

```
MP3 ──▶ Basic Pitch (TF.js) ──▶ ghost filter ──▶ leadNotesRaw
              │                                       │
              ▼                                       ▼
        chromagram                            14-stage export pipeline
              │                                  (merge → outliers → thin →
              ▼                                   quantize → align → cap →
        Viterbi chord                             two-hand → final merge)
        segments                                       │
              │                                       ▼
              │                              stage 14: structureLeadNotes
              │                              (re-snap / length-quantize /
              │                              seam-trim / final merge)
              │                                       │
              │                                       ▼
              ├────────────────────────────▶ detectBarLoop (strict OR stand-out)
              │                                       │
              │                                       ▼
              ├────────────────────────────▶ audit pass (read-only)
              │                                       │
              │                                       ▼
              │                          stage 15: consolidateToLoop
              │                          (when loop.found — union of notes
              │                          across iterations + per-pitch lane merge)
              │                                       │
              ▼                                       ▼
        ChordAnalysisResult ◀────────────────────────┘
              │
              ├──▶ OUTPUT CHECK panel (5 checks)
              ├──▶ AUDIT panel (missing notes / loop quality / key)
              └──▶ buildChordMidiBlob → .mid download
```

## Knobs by where they live

| Stage | Knob | Default | Purpose |
|---|---|---|---|
| Basic Pitch | `noteSensitivity` | 0.565 | Frame threshold |
| Basic Pitch | `splitSensitivity` | 0.12 | Onset threshold |
| Basic Pitch | `minNoteDurationMs` | 205 | Pre-merge length floor |
| Ghost filter | `MAX_GHOST_SEC` | 0.52 | Short-note cutoff |
| Stage 1 / 13 | `samePitchMaxGapSec` | 0.042 | Same-pitch merge gap |
| Stage 9 | quantize grid | 1/16 + 1/16-T | Primary quantize grid |
| Stage 12 | `maxAbove` / `maxBelow` | 4 / 4 | Two-hand polyphony cap |
| Stage 14 | `durationGridSixteenths` | 1 | Length quantize step |
| Stage 14 | `seamTrimToleranceSixteenths` | 1 | Allowed seam straddle |
| Loop | `LOOP_SIM_STRICT` | 0.70 | Clean-repeat gate |
| Loop | `LOOP_SIM_FLOOR` | 0.15 | Stand-out absolute floor |
| Loop | `LOOP_SIM_RATIO` | 1.5 | Stand-out dominance ratio |
| Stage 15 | `minIterationFraction` | 0 | Min iterations a (midi,phase) must appear in |
| Stage 15 | `phaseGridSixteenths` | 1 | Phase quantisation grid |

## Output Check (control MP3: Acura Integurl)

| Check | After stages 1–14 only | After stage 15 |
|---|---|---|
| Timing & note lengths | ✔ 100% on grid | ✔ 100% on grid |
| Split/duplicate notes | ⚠ 172 back-to-back | ✔ 0 |
| Loop seam | ✔ | ✔ 2-bar, self-contained |
| Note coverage | ⚠ 27.2 notes/sec | ✔ 3.8 notes/sec |
| Analysis confidence | ✔ F# major | ✔ F# major |

## Modules touched (chord detector)

| Module | Status | What it does |
|---|---|---|
| `chord-detector-engine.ts` | wired | Pipeline conductor (audio + MIDI paths) |
| `chord-detector-basic-pitch.ts` | live | BP wrapper + ghost-shadow filter |
| `chord-detector-melody.ts` | live | 14-stage export pipeline |
| `chord-detector-structure.ts` | live (stage 14) | Re-snap / length-quantize / seam-trim |
| `chord-detector-loops.ts` | live (strict + stand-out) | Bar-fingerprint loop detection |
| `chord-detector-validation.ts` | live | 5-check OUTPUT CHECK panel |
| `chord-detector-audit.ts` | live | Missing-note / per-period / key cross-check |
| `chord-detector-loop-consensus.ts` | live (stage 15) | Collapse loop iterations into canonical window |
| `ToolsChordDetectorPage.tsx` | live | UI: stats / controls / panels / piano roll |

## Recent commits (newest first)

| Commit | What |
|---|---|
| `df8d926` | docs(chord-detector): pipeline map — stage 15 loop-consensus is live |
| `1b61d43` | fix(chord-detector): merge same-pitch fragments inside loop-consensus output |
| `24907b2` | feat(chord-detector): stage 15 loop-consensus + stand-out detection |
| `2acf4c8` | docs(chord-detector): pipeline map — add the audit pass |
| `5d5a14c` | feat(chord-detector): post-pipeline audit (missing notes / loop quality / key) |
| `2534939` | fix(chord-detector): preview plays only the exported MIDI |
| `640a7eb` | ui(chord-detector): layout reorder (Statistics to bottom, etc.) |
| `0989ec5` | feat(chord-detector): NeuralNote-style piano roll |
| `31da1d8` | docs(chord-detector): full MP3 → MIDI pipeline map |
| `b332b98` | feat(chord-detector): loop detection + 2nd-pass structuring + output validation |

## Outstanding / known gaps

1. **Missing first / top notes on Acura Integurl.** Audit flags G / A / F / C
   at ~1.8s as source-chroma deficits (the audit looks at chroma vs note share,
   independent of the export). BP's transcription is missing some chord-tones.
2. **Loop quality below Notes 2.wav.** Stage 15 successfully collapses to a
   2-bar canonical window, but the per-period audit still reads "no" on every
   tested period — meaning fidelity inside the window is right, but the
   detector isn't certain the source is a loop in the strict sense.
3. **Audit is read-only** — it identifies missing notes but doesn't fill
   them in. No chord-implied note inference layer yet.
4. **Preview button HMR concern.** Source has `schedulePreviewPass` as
   strict `if/else`; if the user still hears doubled audio, hard-refresh.

## Audit / improvement rounds (this session)

| Round | Subagent findings | Fixes applied | Commit |
|---|---|---|---|
| 1 | (A) phantom-stack at t=0 from BPM-drift / (B) merge collapsed G#4 65→1 pad / (C) `minIterationFraction=0` admits 49 % single-iter noise | iter-0 anchor + register-aware merge (`midi < 60` only) + strict gap criteria + `minIterationFraction` 0 → 0.25 | `3e921bf` |
| 2 | (A) lone bass notes stretched to 7.385 s by extend-to-seam / (B) bass register over-represented +14 pp / (C) melodic stabs 0.69 s vs target 0.23 s | Drop unconditional bass extend-to-seam + 25th-percentile melody durations + snap to ⅟16 grid | `888007f` |
| 3 | (A) drift spreads high-recurrence onsets across adjacent ⅟16 buckets / (B) 6 of 10 PC × register cells now match / (C) **18 of 21 missing GT notes were never in any pipeline stage — only chord-implied inference can recover them** | `driftTolSixteenths` 1 → 2 (⅛-cell bucket key) + averaged emission phase snapped to ⅟16 | `8ad9615` |
| 4 | 6 sup=1 phantom notes (iter-0-only) survive the iter-0 anchor; D# matches Notes 2's 3 count (it's a duration issue, not missing notes); stray C#5 from `octaveCollapse` not catching standalone high notes | Require iter-0 anchor + sup ≥ 2 (drops 6 phantoms while preserving everything drift recovered) | `475fc79` |
| — | UI architecture: stage 15 was auto-applied — felt like the export was always a 2-bar loop. User wants full track by default + opt-in 2-bar consolidation. | Removed auto-stage-15 from engine. New EXTRACT LOOP button in a 4×2 grid (8 cells, no clipping) toggles consolidation on demand. | `04883c3` |
| 5 | Direct measurement: full-track output has 13.6 notes/bar vs Notes 2's 12.0 (1.1× density), recall 81 % (21 of 26 Notes 2 onsets matched within ±1 sx ±1 bar). Misses are D# / G# / B / F — non-chord-tones BP didn't transcribe. | No fix — chose to focus next round on closing the recall gap via inference. | — |
| 6 | Designed stage 14.5 chord-implied inference: per-segment half-bar slots, anchor onset detection, chord-tone (R / 3 / 5 / 6 / 8) insertion, register-nearest octave choice, soft velocity. | Designed and documented in `chord-detector-chord-imply.ts`. | `f28497e` |
| 7 | Implemented + wired stage 14.5. 354 → 359 notes (+5 chord-tones across 31 segments). Recall stays at 81 % because the missing onsets are non-chord-tones — strict chord-imply can't recover melodic embellishments. | Shipped chord-imply. Audio path defaults ON; MIDI path stays OFF (don't add notes to user input). | `f28497e` |
| 8 | Per-stage rating (see "Pipeline rating" section below). Recommendation: chroma-driven inference is the next lever to push recall from 81 % toward 90 %. | Documentation pass. | (this commit) |

### Pitch-class share Δpp convergence (Acura vs Notes 2 target)

| PC | R0 broken | R1 anchor + merge | R2 dur + snap | R3 drift-tol | Verdict |
|---|---:|---:|---:|---:|---|
| C# | +12.35 | +2.35 | +3.28 | **-1.34** | ✓ |
| D# | +6.60 | +0.34 | -0.91 | +5.11 | minor under |
| F# | -10.11 | -6.90 | -2.37 | **+0.58** | ✓ |
| A# | -7.50 | +12.36 | +0.42 | **-1.04** | ✓ |
| B | small | -14.35 | +7.31 | **-3.74** | ✓ |
| G# | small | +3.19 | +1.91 | -3.06 | minor over |
| F | — | +3.66 | +3.49 | +3.49 | **chord-implied** |

8 of 12 PCs within ±3 pp of target after round 3. Remaining gaps (D# slightly under, F missing) are chord-implied notes that BP did not transcribe in the source audio at all.

### Canonical-window snapshot (post-round-3)

| Metric | Value | Target (Notes 2) |
|---|---|---|
| Notes in canonical 2-bar window | 58 | 31 |
| Max polyphony | 7 | 4-5 |
| First note at t=0 | B2 ✓ | B2 ✓ |
| Bass B2 duration | 1.75 s | 1.38 s |
| Melodic stab duration (G#4 etc.) | 0.23 s (= ⅟16) | 0.23 s |
| Notes ≥ C5 | 1 (stray C#5) | 0 |
| OUTPUT CHECK panel | 4/5 ✓ | (5/5 on Notes 2.wav) |
| Notes 2 onset coverage | ≈ 71-78 % (R3 improved on R2's 71) | — |

## Pipeline rating (post-round-8)

Each stage rated A–F on: does it work as designed, does it serve the user's
80–90 % Notes 2 fidelity goal, can it be tuned further without regressions.

| # | Stage | Module | Grade | Strengths | Weaknesses |
|---|---|---|:---:|---|---|
| A | Decode + mono | browser + `mixing-audio-analysis` | **A** | Reliable, no failures observed across all test tracks | None |
| B | 96 s cap | engine | **A** | Bounded runtime + memory | None |
| C | BPM estimate | `mixing-audio-analysis` | **B** | Picks 65 BPM correctly on Acura | ~2 % imprecision compounds into ⅛-cell drift across 13 loop iterations (caused the round-3 fix) |
| D | Chromagram | `mixing-audio-key-estimate` | **A** | Drives reliable F# major key estimation | None |
| E | Basic Pitch (TF.js) | `@spotify/basic-pitch` | **B+** | 458 raw notes on Acura, 81 % of Notes 2 onsets caught | Misses non-chord-tones in the melodic register that the user adds back by hand |
| F | Ghost-shadow filter | `chord-detector-basic-pitch` | **A** | 458 → 434 (24 ghost notes removed, no false drops observed) | None |
| G | Histogram + Key | `chord-detector-basic-pitch` + engine | **A** | F# major / 0.6+ confidence reliably | None |
| H | Per-beat blend + Viterbi | engine | **A−** | 31 chord segments on Acura, agrees with audit's chord-implied top (D#m / F# major relative pair) | Some sus4/aug bias persists; tuned in earlier commit `2ea81f6` |
| 1-13 | 14-stage export pipeline | `chord-detector-melody.ts` | **A** | 458 → 354 (cleanup is appropriate, density matches Notes 2 at 1.1×) | None at this scale |
| 14 | Re-snap + length quantize + seam-trim | `chord-detector-structure.ts` | **A** | 100 % notes on ⅟16 grid, durations quantized cleanly | None |
| 14.5 | Chord-implied inference (NEW) | `chord-detector-chord-imply.ts` | **B−** | Adds 5 missing chord-tones cleanly, conservative guardrails | Strict chord-tone only — misses melodic embellishments (D# / G# / B / F that Notes 2's user added by hand) |
| L | Loop detect | `chord-detector-loops.ts` | **A−** | Strict + stand-out paths correctly identify 2-bar loop on Acura | Per-period scores still don't clear 0.7 strict gate (22 % on Acura) — stand-out compensates |
| M | Validate | `chord-detector-validation.ts` | **B** | 5 pass/warn checks, 5/5 on Notes 2, 4/5 on Acura | "Splits" check too strict for back-to-back ⅟16 stabs that are legitimate musical content |
| N | Audit | `chord-detector-audit.ts` | **A** | Read-only, identifies what's missing (basis for chord-imply lever) | Doesn't act on findings — that's by design |
| 15 | Loop-consensus consolidation | `chord-detector-loop-consensus.ts` | **A** (post-round-1-to-4 fixes) | Drift-tolerant + iter-0 anchor + register-aware merge + ⅟16 grid snap | Was auto-applied; now opt-in via UI button |
| O | MIDI export | engine | **A** | `@tonejs/midi` produces clean output | None |

**Weakest links by impact on the 80-90 % goal:**

1. **E (Basic Pitch)** — captures chord-tones well but misses melodic embellishments. Lowering `noteSensitivity` would help recall at the cost of more false positives.
2. **14.5 (chord-imply)** — too conservative; only emits strict chord-tones. The audit's missing-note flag already identifies what's missing via chroma — chord-imply could use that directly instead of guessing from chord segments.
3. **M (validation)** — cosmetic, but `dupGapSec = 0.045` flags every back-to-back ⅟16 stab as a "split."

## Recommended next phase: CHROMA-DRIVEN inference (the real lever)

The audit's `missingNotes` flag already does the hard work: it compares the
source chroma distribution to the lead-note PC share and identifies which PCs
have source energy but no transcribed notes. The current chord-imply uses chord
segments as its guide; chroma-driven inference would use the audit's findings
directly.

**Proposed: `chord-detector-chroma-imply.ts`, ~80 LOC, drop-in replacement / sibling to chord-imply.**

1. Read `audit.missingNotes` (already computed pre-pipeline-end).
2. For each missing PC: find the half-bar slot(s) where it's most strongly
   present in the source chroma (look up `audit.chromaPcDist` per frame).
3. At each such slot's first existing onset, insert the missing PC at the
   register suggested by the chord context (median of nearby notes).
4. Reuse the same guardrails as chord-imply (anchor must exist, ≥2 PCs already
   present, soft velocity).

Expected uplift: recall 81 → ~90 %, because this catches BOTH chord-tones AND
melodic embellishments / passing tones that the user adds by hand to Notes 2.
The 5 unmatched Notes 2 onsets (D#, G#, B, G#, F) are precisely what the
audit's missing-note flag already identifies.

Risk: more aggressive insertion = more chance of false positives. Mitigate by:
- Requiring chroma share ≥ some threshold (e.g. 5 %) at the slot
- Capping to top N inferred PCs per slot
- Marking inferred notes with a distinguishable velocity range

Implementation cost: 80 LOC + integration test against Notes 2.wav, expected 4-6 hours.

## Other plausible levers (lower expected impact)

- **Lower BP `noteSensitivity`** (0.565 → 0.45): catches more notes including melodic embellishments. Cost: precision drops, more false positives that downstream stages have to filter.
- **Validation rule update**: relax `dupGapSec` for melody-register notes (midi ≥ 60). Cosmetic OUTPUT CHECK improvement, no impact on actual fidelity.
- **Loop quality gate**: lower `LOOP_SIM_STRICT` 0.7 → 0.5 to catch more loops in the strict path. Cosmetic improvement to the audit panel's "loop overall: yes/no" verdict.
- **Polyphony cap**: relax `enforceTwoHandPianoPolyphony` (maxAbove/maxBelow 4→6). Risk: clutter.

## Original recommendation (kept for context — partially shipped as v1)



Subagent C's round-3 finding (paraphrased): of 21 notes in Notes 2.wav that are
NOT in the post-round-3 canonical window, 18 were **never in any pipeline stage**
— BP didn't transcribe them in the source audio. 6 have no same-PC anywhere
within ±2 sixteenths in raw BP. These are structurally missing, not
threshold-tunable. The pipeline cannot recover them from BP output alone.

**Proposed solution (NEW stage 14.5 — `chord-detector-chord-imply.ts`, ~150 LOC):**

1. Partition the canonical loop window into half-bar slices (2 beats each — Notes
   2's chord-change rate).
2. For each slice: collect existing PCs → match against 24 triads/seventh chords
   using the key-anchored template (the engine already has `estimatedKey`).
3. For the best-matching chord (Acura cycles iv-v-i-iv-ish in C# minor: F#m / G#m /
   C#m): compute its expected root / 3rd / 5th MIDI positions in the same octave
   register as the existing bass and inner voices.
4. For each chord tone NOT already present at the slice's onset bin (nearest ⅟16):
   insert a synthetic note (velocity = 0.6 × median window velocity, duration ⅛
   for inner voices, ⅛-note for bass) at the slice downbeat.
5. Only insert when the slice has ≥ 3 existing PCs (don't invent chords from
   noise); never extend beyond chord tones.

Expected event-level Jaccard uplift: **22 % → 65–75 %**, putting the audit's
strict 70 % loop-quality gate within reach and the user's 80–90 % goal in sight.

Insert in `chord-detector-engine.ts` between `structureLeadNotes` and
`consolidateToLoop` so the chord-implied notes flow through stage 15's
loop-aware consolidation.

## How to drive the harness

```bash
# Headless run of the live pipeline (requires pm2 dev server on port 5175)
node scripts/chord-detector-midi-debug.mjs "/Users/samuel/Desktop/Frank Ocean Acura Integurl Instrumental.mp3"

# JSON output lands in: tmp/chord-midi-debug/<input-name>.json
# Console prints: per-stage attrition, top-note survival, splits, grid fit,
# loop info, output check, audit.
```

## UI conventions

- Layout: `flex flex-col` with `gap: '1px'` and `PALETTE.line` divider colour.
- Buttons row: 8-column grid with 3 spacers (playback / trim / export groups).
- Statistics sit at the bottom (`marginTop: auto`).
- `Re-run clip` is green (`PALETTE.green = #54C98E`); `Piano / lead focus`
  highlight is amber.
- All hint copy under sliders follows `clear-ui-labels` skill — plain words,
  what-happens + default, no 9px all-caps.

## Open questions for the user (when convenient)

- Are there other test tracks beyond Acura Integurl + American Wedding we
  should validate against? More data improves the loop heuristics.
- Should the audit's missing-note flag drive a *correction* pass (insert
  chord-implied notes), or stay read-only? Has big implications for export
  fidelity vs. transcription faithfulness.
