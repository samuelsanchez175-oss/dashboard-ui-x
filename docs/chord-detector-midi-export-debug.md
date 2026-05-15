# Chord Detector — MIDI Export Debug Log

Systematic-debugging pass on four reported MIDI-export bugs. The export pipeline is a
12-stage chain from Basic Pitch raw notes to the exported `.mid`; the harness
`scripts/chord-detector-midi-debug.mjs` drives the real in-browser pipeline headlessly and
captures a per-stage lead-note snapshot (`window.__chordPipelineStages`, DEV-only) plus the
true pre-ghost-filter BP output (`window.__bpRawNotes`).

## Control inputs

| File | Length | BP detects | Notes |
|---|---|---|---|
| `~/Downloads/Frank Ocean Acura Integurl Instrumental.mp3` | 96 s | 458 raw | dense arpeggios — the screenshot case |
| `~/Desktop/Notes.wav` | 9.6 s | 24 raw | sparse pure piano |
| `~/Desktop/Notes 2.wav` | 9.6 s | 33 raw | sparse pure piano |

## The 12-stage export pipeline

`leadNotesRaw` → 1 merge → 2 octave-collapse → 3 outlier¹ → 4 thin-poly → 5 debounce-bass →
6 drop-low-short → 7 drop-short → 8 rms-refine → 9 neuralnote-post (quantize) →
10 onset-align → 11 outlier² → 12 two-hand-cap → **13 final-merge (new)** → `buildChordMidiBlob`

---

## Bug 1 — "didn't recognize starting time for notes" ✅ FIXED

**Root cause.** The notes were *already* spaced on a 1/16 grid (exactly 0.231 s apart @ 65 BPM)
but (a) the quantize grid was the **finest division, 1/64** — too fine to land notes on
musical positions — and (b) it was anchored at t=0 while the music's downbeat sat ~115 ms in.
Result: a coherent grid offset by a 1/32, which a DAW reads as "off-grid."

**Fix** (`chord-detector-neuralnote-style.ts`). `applyNeuralNoteStyleLeadNotes` now quantizes
to a **musical 1/16 + 1/16-triplet dual grid** (`snapToDualGrid` — nearest of either grid
wins, exactly like a DAW's "1/16 & 1/16T" mode), **phase-aligned to the music's own downbeat**
(`circularGridPhaseSec`) and then shifted so that downbeat lands on t=0. Default
`timeDivisionIndex` changed from 1/64 → 1/16.

**Verified.** Notes within 10 ms of the musical grid: **28% → 100%** (control), median
deviation 27 ms → 0 ms, first note bar-aligned at t=0 on all three files.

## Bug 2 — "didn't look correctly" ✅ FIXED (composite)

No separate root cause — the scrambled look was Bugs 1 + 4 together (off-grid jitter + split
fragments). With those fixed: `firstStartSec` 0.115 → 0, structure clean across all files.

## Bug 3 — "missing some notes from the top notes" ⚠️ PARTIALLY — pipeline side fixed; BP side input-bounded

**Investigation.** Per-stage trace shows the pipeline preserves **every** high note Basic
Pitch detects (control: 10 notes ≥ C5 in raw → 10 in final, through all 13 stages). The
"missing" notes are missing because **Basic Pitch never transcribed them** — its per-file
pitch ceiling is C#5 / C#5 / B4 for the three files (different ceilings ⇒ not a code clip;
each reflects real content). Raising note sensitivity (last session) and a +6 dB high-shelf
pre-emphasis before BP (this session) **both failed** to lift the ceiling — reverted as
negative results. BP's high-register detection on a given source is input/model-bounded.

**Fix applied anyway** (`chord-detector-melody.ts`). The two polyphony caps —
`thinPolyphonicLeadNotesByTimeWindow` and `enforceTwoHandPianoPolyphony` — selected purely by
velocity, which on dense material *would* drop a quiet top-melody note. Both now **always
keep the outer voice** (`pickKeepingEdge`: melody on top, bass on bottom) and fill remaining
slots by velocity. The control files are too sparse to trigger the caps, so this is verified
by code inspection — it removes the "missing top notes" mechanism for dense input.

## Bug 4 — "runs the same note twice split into two notes" ✅ FIXED

**Root cause.** `mergeAdjacentSamePitchNotes` ran once at stage 1, but stages 8-10 (RMS
refine, quantize, onset-align) move note timing *afterwards* — creating fresh sub-perceptual
gaps and same-pitch **overlaps** never re-merged. On the control: 5 genuine cases (1 overlap +
4 gaps ≤ 25 ms — physically impossible repeats on a piano).

**Fix** (`chord-detector-engine.ts`). Added **stage 13 — a final `mergeAdjacentSamePitchNotes`
pass** after the timing stages, at the existing 42 ms threshold. That threshold sits safely
below the 77 ms minimum spacing between any two musical-grid points, so it only collapses
sub-grid split fragments — real fast repeats (≥ 100 ms) are untouched.

**Verified.** Control: 5 fragments merged, nothing ≤ 50 ms remains. Notes 2.wav: 1 merged.
Notes.wav: 0 (its only close pair is a real 293 ms repeat — correctly kept).

---

## Summary

| Bug | Status | Where |
|---|---|---|
| 1 — off-grid start times | ✅ fixed | musical dual-grid + phase-aware quantize |
| 2 — "didn't look correct" | ✅ fixed | composite of 1 + 4 |
| 3 — missing top notes | ⚠️ pipeline side fixed; BP detection input-bounded | outer-voice-preserving polyphony caps |
| 4 — same note split in two | ✅ fixed | final same-pitch merge pass |

Every shipped change is general (no clip-specific constants). Pre-emphasis was the one
reverted experiment (documented negative result).
