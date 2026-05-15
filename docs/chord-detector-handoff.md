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

| Round | Subagents | Findings (filled as we go) | Fixes applied |
|---|---|---|---|
| 1 | first-note loss · loop quality · missing top notes | — | — |
| 2 | TBD after round 1 | — | — |
| 3 | TBD after round 2 | — | — |

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
