# Chord Detector — Accuracy Tuning Log

A self-improvement loop for the in-browser chord detector (`ToolsChordDetectorPage`,
`chord-detector-engine.ts`, `chord-detector-melody.ts`, `chord-detector-neuralnote-style.ts`).

## Control input

`~/Downloads/Frank Ocean Acura Integurl Instrumental.mp3` — piano arrangement,
~96 s analyzed in-browser.

## Ground truth (from the engraved score "Acura Integurl")

| Field | Truth | How we know |
|---|---|---|
| Key | **B major** | 5-sharp key signature on every staff |
| Tempo | **♩ = 70 BPM** | Marked above bar 1 |
| Meter | **4/4** | Time signature |
| Texture | RH arpeggiated 16th-note figures; LH dotted-rhythm bass | Score |
| Harmony | Diatonic to B major — expect roots/triads on B, C♯m, D♯m, E, F♯, G♯m | Score + key |

## Hallucination definition

A detected note/chord counts as a hallucination when it is **not explainable by the
source**:
- Notes whose pitch-class is outside B major (B C♯ D♯ E F♯ G♯ A♯) — should be near 0%
  for this fully-diatonic piece.
- Octave-displaced doublings the score doesn't contain.
- Ghost chords — segments whose root is non-diatonic or that flicker faster than the
  harmonic rhythm (this arrangement changes harmony roughly per bar / half-bar).
- BPM off by an integer factor (140 / 35 instead of 70) — tempo octave error.

## Loop — 3 steps, repeated ≥ 5×

1. **RUN** — analyze the control MP3 (first pass: upload; later passes: "Re-run clip"
   after adjusting params).
2. **MEASURE** — record detected key, BPM, note count, chord count, unique chords,
   out-of-key %, octave spread; compare to ground truth; compute a hallucination score.
3. **ADJUST + NOTE** — change one or two parameters (UI sliders for fast passes, engine
   defaults for structural fixes), write the hypothesis + result here, then go to step 1.

### Metrics captured each pass

- `key` / `keyConfidence` — want **B major**, high confidence
- `bpm` / `bpmSource` — want **~70** (±2), reject 140 / 35
- `noteCount` — total transcribed lead notes
- `chordCount` / `uniqueChords` — harmonic-rhythm sanity
- `outOfKeyPct` — share of note-duration whose pitch-class ∉ B major → **hallucination proxy**
- notes/sec — density vs. a hand-played piano arrangement (expect ~6–12 note onsets/sec
  for busy 16th passages at 70 BPM, lower in sparse bars)

---

## Harness

`scripts/chord-detector-tune.mjs` — drives the real in-browser pipeline headlessly
(Playwright → dev server → `tools-chord-detector` route → inject control MP3 →
read `window.__chordDetectorTest`). Run: `node scripts/chord-detector-tune.mjs <label>`.
Raw JSON per pass lands in `tmp/chord-tune/<label>.json`.

Composite **hallucination score** (lower = better):
`outOfKeyPct·1.0 + outOfKeyChordPct·0.75 + augSusChordPct·0.5 + (keyWrong?20:0) + (bpmOctaveErr?25:min(10,bpmErr))`

---

## Iteration 0 — baseline

Params: stock `NEURALNOTE_STYLE` + `CHORD_PIPELINE` + `ARPEGGIO_CHORD_WINDOW`.

| Metric | Value | vs truth |
|---|---|---|
| Key | **F♯ major** (conf 0.817) | ❌ want B major — picked the dominant |
| BPM | 65 (estimated) | ⚠️ want 70, err 5, no octave error |
| Notes | 387 (4.03/s), range B1–C♯5, oct spread 4 | plausible density |
| Chords / unique | 42 / 5, avg 2.29 s | ✅ harmonic rhythm sane (~half-bar–bar) |
| Out-of-key notes | 2.65% dur / 5.17% count (20 notes, all F♮) | small but flips the key |
| Out-of-key chord roots | 0% | ✅ every root is diatonic |
| aug/sus chords | **96.13%** (40/42 segments are sus4) | ❌❌ dominant hallucination |
| **Hallucination score** | **75.72** | aug/sus 48.1 + keyWrong 20 + bpmErr 5 + ook 2.65 |

**Diagnosis:**
- Basic Pitch transcribed **zero E** across 96 s. The histogram is a textbook F♯-major
  scale (F♯ G♯ A♯ B C♯ D♯ + F♮=E♯), so KK locks onto F♯ major with high confidence.
  Missing the one note (E) that separates B major from its dominant.
- Chord decoder labels **40/42 segments sus4**. Roots are 100% diatonic, but with weak/
  absent 3rds the windowed chroma looks like stacked fourths (F♯sus4 = F♯-B-C♯, etc.),
  and `exoticQualityPenalty` (0.036) is far too weak to push it back to plain triads.
- The 20 F♮ notes (E♯) are likely hallucinated chromatic/overtone artifacts — they both
  inflate out-of-key % and feed the F♯-major key error.

**Notes to self — next levers (one/two at a time):**
1. Crush sus4: raise `CHORD_PIPELINE.exoticQualityPenalty` hard (biggest single win, ~48 pts).
2. Recover 3rds / kill F♮ ghosts: tune `NEURALNOTE_STYLE.basicPitch` (noteSensitivity,
   minNoteDurationMs) so real 3rds survive and stray semitone ghosts don't.
3. Fix the key: cleaner histogram should pull KK to B major; if not, look at the
   arpeggio-window blur and the KK estimator's dominant-vs-tonic tie-break.
4. BPM 65→70: revisit `estimateBpmFromMono`, or accept and move on (not a hallucination).

---

## Iteration 1 — crush sus4 (`exoticQualityPenalty`)

**Change:** `CHORD_PIPELINE.exoticQualityPenalty` 0.036 → **0.14**.
**Hypothesis:** the penalty must exceed the cosine gap between the stacked-fourth sus4 fit
and the real triad fit, or arpeggiated sources decode as sus4 everywhere.

| Metric | iter0 → iter1 | |
|---|---|---|
| Hallucination score | 75.72 → **34.01** | ✅ −41.7 |
| aug/sus chords | 96.13% → **12.72%** | ✅ sus4 spam broken |
| Chords / unique | 42/5 → 30/6, avg 2.29→3.20 s | ✅ longer, saner segments |
| Key / BPM / out-of-key | unchanged (F♯ major / 65 / 2.65%) | — |

**Verdict: KEEP.** Biggest single win — confirmed sus4 was an emission-penalty problem,
not a root problem (roots were diatonic all along). Quality split now `major 13 / minor 9 / sus4 8`.

## Iteration 2 — recover the missing E (Basic Pitch sensitivity)

**Change:** `noteSensitivity` 0.565 → 0.72, `minNoteDurationMs` 205 → 120.
**Hypothesis:** the absent E (and weak 3rds) are quiet/short arpeggio notes below threshold.

| Metric | iter1 → iter2 | |
|---|---|---|
| Hallucination score | 34.01 → **39.45** | ❌ +5.4 regression |
| Notes | 387 → 545 (4.0→5.7/s) | more notes… |
| E notes detected | 0 → **0** | ❌ still zero E |
| aug/sus chords | 12.72% → 25.23% | ❌ extra density → more ambiguous beats |

**Verdict: REVERT.** Decisive negative result: BP finds **zero E at either sensitivity** —
the extra 158 notes all piled onto pitch classes already present, adding ghost density and
sus4 ambiguity without touching the key. The control clip genuinely has ~no scale-degree-4.

## Iteration 3 — suppress ghost onsets (`splitSensitivity`)

**Change:** reverted iter 2; `splitSensitivity` 0.26 → **0.12** (raises `onsetThresh` ≈ 0.74→0.88).
**Hypothesis:** the 20 F♮ ghosts are spurious weak onsets — a higher onset threshold drops them.

| Metric | iter1 → iter3 | |
|---|---|---|
| Hallucination score | 34.01 → **31.55** | ✅ −2.5 |
| aug/sus chords | 12.72% → **7.84%** | ✅ cleaner beats |
| F♮ ghosts | 20 notes / 7.42 s → **20 / 7.42 s** | ❌ unchanged — not weak onsets |
| Chords / unique | 30/6 → 29/5, avg 3.31 s | ✅ |

**Verdict: KEEP.** Helped sus4 (fewer spurious beat splits) but the F♮ ghosts are *stable*
detections, not onset noise — all exactly **F4**, all short (0.28–0.50 s), near the most-common
note F♯4. They read as semitone-flat transient artifacts of F♯4, not filterable by onset/duration.

### Key + BPM reality check (after iter 3)

Computed the full KK correlation table on the iter-3 histogram to see if the key is
recoverable by tuning:

- **Key is not honestly fixable here.** B major is **rank 5** (corr 0.53) vs F♯ major
  (0.82); zeroing the F♮ ghosts barely moves it (0.812, still rank 5); even injecting a
  synthetic 10% E only lifts B major to rank 4. The clip is a two-chord **F♯ → G♯m vamp**
  (V–vi in B, but also I–ii in F♯, III–iv in D♯m, VII–i in G♯m) with no scale-degree-4 —
  genuinely key-ambiguous from audio. F♯ major (the most-emphasised chord) is a defensible
  audio-only read; the score "knows" it's B major. Not chasing this with a clip-specific hack.
- **BPM 65 vs 70 is deprioritised.** Not a hallucination by our own definition (no integer-
  factor error). The fix lives in `estimateBpmFromMono` (autocorrelation peaked at lag ~79
  instead of ~74) — a *shared* file used by the mixing zone, so changing it risks unrelated
  regressions for a 5-point gain. Noted as a known limitation.

**Remaining real hallucinations to chase:** sus4 residue (7.84%) + F4 ghosts (2.63%).

---

## Iteration 4 — cut neighbor bleed (`ARPEGGIO_CHORD_WINDOW.decay`)

**Change:** `ARPEGGIO_CHORD_WINDOW.decay` 0.72 → **0.45**.
**Hypothesis:** at 0.72 each beat inherited ~72% of the previous chord's pitch classes;
the mixed two-chord blob matches stacked-fourth sus4 templates — the structural driver
behind the residual sus4 (vs iter 1's emission-penalty fix, which was a band-aid).

| Metric | iter3 → iter4 | |
|---|---|---|
| Hallucination score | 31.55 → **31.01** | ✅ −0.5 |
| aug/sus chords | 7.84% → **6.77%** | ✅ structural confirmation |
| Chords / unique | 29/5 → 32/7, avg 3.31→3.00 s | ✅ resolves more distinct harmonies |
| Key / BPM / notes / out-of-key | unchanged | — |

**Verdict: KEEP.** Modest but confirms the diagnosis — less cross-chord bleed → fewer
stacked-fourth beats *and* more unique chords resolved (the window was smearing real
harmony changes, not just causing sus4). Diminishing returns on sus4 from here.

---

## Iteration 5 — kill the F4 ghosts (semitone-flat onset-shadow filter)

**Change:** new `dropSemitoneFlatOnsetShadows()` in `chord-detector-basic-pitch.ts`, applied
to raw BP notes before the key histogram + chord blend are built.
**Hypothesis:** the 20 F4 ghosts are onset-transient artifacts of the longer F♯4 a semitone
above — droppable as "short note + longer note one semitone up, nearby in time."

Took three sub-passes (good loop discipline — the harness made each cheap to test):
- *5a* — required ≥60%-of-duration overlap with the +1-semitone parent → dropped **0**.
- *5b* — relaxed to "any ≥30 ms overlap" → still **0**. Suspicious. Added a raw-BP timing
  diagnostic to `__bpGhostDiag` (the metrics I'd been reading were the engine's *post*-
  quantise output, not the raw BP notes the filter actually sees).
- *5 final* — diagnostic showed the F4 ghosts **abut** their F♯4 parent with a 0–81 ms
  *gap* (no overlap) in raw BP output. Switched the test to gap-tolerant (`NEAR_SEC` 0.1 s).

| Metric | iter4 → iter5 | |
|---|---|---|
| Hallucination score | 31.01 → **27.88** | ✅ −3.1 |
| Out-of-key notes | 2.63% / 20 notes → **0% / 0 notes** | ✅ ghosts eliminated |
| Notes | 388 → 364 (dropped 24: 20 ghosts + 4 in-key collateral) | acceptable |
| aug/sus chords | 6.77% → 5.76% | ✅ small bonus — cleaner chord evidence |
| Key | F♯ major 0.816 → 0.811 | unchanged, as predicted |

**Verdict: KEEP.** The last true *note-level* hallucination is gone. The 4 in-key collateral
drops (short notes abutting a louder semitone-up neighbour) don't touch out-of-key % or the
key, and the filter stays conservative (short + longer parent + ≤0.1 s gap) so real semitone
voicings survive.

## Iteration 6 — mop up residual sus4 (`medianFilterWindow`)

**Change:** `CHORD_PIPELINE.medianFilterWindow` 3 → 5.
**Hypothesis:** a wider post-decode majority vote clears isolated one-beat sus4 misreads.

| Metric | iter5 → iter6 | |
|---|---|---|
| Hallucination score | 27.88 → 26.36 | proxy ↓ 1.5… |
| aug/sus chords | 5.76% → 2.72% | …but |
| Chords / unique / avg | 31/6/3.1 s → **19/4/5.05 s** | ❌ over-smoothed to ~5 s/chord |

**Verdict: REVERT.** Classic proxy-gaming: the composite dropped but harmonic rhythm
coarsened to ~5 s/chord, well below the source's ~3.4 s per-bar rate (≈28 expected changes
over 96 s; iter 6 gave 19). Per-bar fidelity matters more than a 1.5-pt proxy gain. Window
held at 3 — final state = iter 5.

---

## Summary — 6 iterations, baseline 75.72 → 27.88 (−63%)

| Iter | Change | Score | Verdict |
|---|---|---|---|
| 0 | baseline | 75.72 | — |
| 1 | `exoticQualityPenalty` 0.036 → 0.14 | 34.01 | ✅ keep |
| 2 | BP `noteSensitivity`↑ + `minNoteDurationMs`↓ | 39.45 | ❌ revert |
| 3 | `splitSensitivity` 0.26 → 0.12 | 31.55 | ✅ keep |
| 4 | `ARPEGGIO_CHORD_WINDOW.decay` 0.72 → 0.45 | 31.01 | ✅ keep |
| 5 | `dropSemitoneFlatOnsetShadows()` ghost filter | 27.88 | ✅ keep |
| 6 | `medianFilterWindow` 3 → 5 | 26.36 | ❌ revert |

**Hallucinations — fixed:**
- **sus4 spam 96.1% → 5.8%** — was an emission-penalty problem (roots were diatonic all
  along), not a root problem. Penalty + less arpeggio-window bleed.
- **Out-of-key notes 2.65% → 0%** — the 20 F4 onset-shadow ghosts, now filtered at the BP stage.
- Chord roots stayed 100% diatonic throughout; harmonic rhythm sane (~3.1 s/chord ≈ per-bar).

**Not hallucinations — bounded by the input, documented, not chased:**
- **Key reads F♯ major, not B major.** The clip is a two-chord F♯→G♯m vamp with ~no
  scale-degree-4 (BP finds zero E at any sensitivity). On the pitch-class histogram B major
  is rank 5 (corr 0.53 vs F♯ major 0.82) — no honest histogram tweak flips that. F♯ (the
  most-emphasised chord) is a defensible audio-only read; only the engraved score "knows"
  it's B major. A clip-specific key hack was explicitly rejected.
- **BPM 65 vs 70.** A 7% estimate error, not an integer-factor octave error. The fix lives
  in `estimateBpmFromMono` (shared with the mixing zone) — deferred to avoid unrelated
  regressions for a 5-pt gain.

**Net:** every change that shipped is generalizable (no clip-specific constants); the two
reverts are documented negative results. Composite floor for this clip ≈ 25 (key 20 + bpm 5)
is input-bounded, not detector-bounded.
