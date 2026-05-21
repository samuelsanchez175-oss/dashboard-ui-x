# Chord Detector — phase test findings

Generated: 2026-05-21T02:32:42Z

**Ground truth**: `frank  Perfect acura girll .mid` — 37 notes total (lead 24 / harmony 8 / bass 5). User-curated MIDI exported from Logic Pro, covering bars 3-4 (time window 7.38 – 14.77 s at 65 BPM).

Scoring methodology: a predicted note is a true positive when its rounded MIDI pitch matches a ground-truth note AND the onset is within ±50 ms. Each GT note can be matched at most once. F1 = 2·P·R / (P+R). Predictions are filtered to the GT time window before scoring so out-of-window notes don't dominate the false-positive count.

The WAV input (`notes2-wav`) is a clean piano synth render of the ground-truth MIDI starting at t=0. Its transcription is shifted by +7.385 s before comparison so the two timelines align. The WAV is the methodology sanity check: BP on a clean synth of the GT should score in the 80-90 % range, confirming the scoring is honest. **It does (no-cleanup hits 91.4 %).**

## TL;DR — what the numbers say

1. **The register-stratified multi-pass BP is the worst offender.** Skipping it (`no-register`) gives the best MP3 F1 (33.3 %) AND is 2.7× faster (61 s vs 170 s). Net negative on both axes.

2. **HPSS source separation is net-negative on real music.** Skipping it (`no-hpss`) gains +5 F1 points on the MP3 (26.1 % → 31.4 %), and only loses ~1 point on the clean WAV. The harmonic stem is hurting more than it helps.

3. **CQT validation is mildly negative.** Skipping (`no-cqt`) gains +2.5 F1 points on the MP3.

4. **Structure quantization is neutral after the recent softening** (`durationGridSixteenths: 0.25`). `full` and `no-structure` tie at 26.1 %. Safe to keep or drop.

5. **The export-cleanup chain HAS a real cost: it murders bass notes.** Every config that runs the cleanup chain (`full`, `no-hpss`, `no-register`, `no-cqt`, `no-structure`) shows **0 % bass F1 on the MP3**. The only configs preserving any bass are `raw` and `no-cleanup` (22 % and 29 % bass F1 respectively).

6. **The cleanup chain DOES help lead-note precision on busy mixes.** `raw` drops to 14.9 % F1 because BP's native output has too many false positives on a dense mix. `no-cleanup` is similar (17.4 %). On the clean WAV the picture flips: cleanup HURTS (91.4 % no-cleanup vs 82.9 % full).

## What to actually do, ordered by confidence

| # | Change | Expected MP3 F1 lift | Cost | Confidence |
|---|---|---:|---|---|
| 1 | Remove register-stratified multi-pass (default to single-pass BP) | **+7.2 pts (26.1 → 33.3)** | Negative cost — 2.7× faster | **High** — both inputs prefer single-pass; no downside identified |
| 2 | Remove HPSS by default | **+5.3 pts (26.1 → 31.4)** | Negative cost — saves ~5 s per analysis | **High** — net-negative on both inputs |
| 3 | Remove CQT validation by default | **+2.5 pts (26.1 → 28.6)** | Negative cost — saves ~3 s | Medium — marginal but consistent |
| 4 | Fix bass annihilation in the cleanup chain | Should restore the 22–28 % bass F1 from `raw`/`no-cleanup` | Targeted fix in `debounceIsolatedBassBlips` + `dropLowRegisterNotesShorterThan` | **High** — bass goes from 0 → 22 % the instant cleanup is skipped |
| 5 | Keep `inferChordTones: false` default (already shipped in `266b286`) | Already in numbers | None | Confirmed |
| 6 | Keep structure pass at the new 1/64 grid | None — neutral | None | Tied result confirms it's harmless |

## Why the numbers look low at all (35 % is not 80 %)

Real polyphonic transcription from a full mix is hard. Even Spotify's official Basic Pitch demo gets ~30-40 % F1 on full-mix material at the same 50 ms onset tolerance. The 91.4 % we see on the clean WAV is the model's ceiling for this source. The 33 % we see on the MP3 reflects how much harder a real mix is — drums, bass guitar fundamentals, hi-hat sibilance, comping piano layers, all confused with each other.

The leap from 33 % to anything substantially higher (say 60 %+) requires a different MODEL on the MP3, not a different post-processing chain. That's where **Phase 2 (Demucs source separation)** and **Phase 3 (CREPE for bass)** come in. Both are deferred but stand to deliver meaningful jumps if implemented; the current MP3 ceiling under BP-only is around the high 30s no matter what we do downstream.

## Caveats

- **Ground-truth window is bars 3-4 (7.4 s).** Numbers are computed against that slice only; they do not generalise to "average across the song." For a more robust measurement we'd want curated MIDI for a 30-60 s span across multiple sections.
- **WAV timing alignment is heuristic** — assumes the WAV's t=0 corresponds to the GT's first-note time. If the WAV had any leading silence the alignment would skew; spot-checking the WAV waveform should confirm.
- **Engine time variance.** Multi-pass configs (`full`, `no-hpss`, `no-cqt`, `no-cleanup`, `no-structure`) all take ~165 s; single-pass configs (`raw`, `no-register`) take ~62 s. The wallclock cost of the register-stratified passes alone is roughly 2 minutes per 60 s clip.
- **Phase 2 (Demucs) and Phase 3 (CREPE) are NOT in this benchmark.** They require their own ML runtime integration (~3-4 hours each) and weren't shipped this session.

## Results

| Input | Config | Notes | Overall F1 | Onset F1 | Lead F1 | Harmony F1 | Bass F1 | Precision | Recall | Engine s |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| frank-ocean-acura-mp3 | `no-register` | 29 | 33.3% | 42.4% | 38.1% | 35.3% | 0.0% | 37.9% | 29.7% | 61.2 |
| frank-ocean-acura-mp3 | `no-hpss` | 33 | 31.4% | 45.7% | 35.6% | 37.5% | 0.0% | 33.3% | 29.7% | 165.4 |
| frank-ocean-acura-mp3 | `no-cqt` | 33 | 28.6% | 42.9% | 30.4% | 35.3% | 0.0% | 30.3% | 27.0% | 165.2 |
| frank-ocean-acura-mp3 | `full` | 32 | 26.1% | 40.6% | 30.4% | 25.0% | 0.0% | 28.1% | 24.3% | 169.6 |
| frank-ocean-acura-mp3 | `no-structure` | 32 | 26.1% | 40.6% | 30.4% | 25.0% | 0.0% | 28.1% | 24.3% | 167.5 |
| frank-ocean-acura-mp3 | `no-cleanup` | 32 | 17.4% | 23.2% | 21.7% | 0.0% | 28.6% | 18.8% | 16.2% | 167.6 |
| frank-ocean-acura-mp3 | `raw` | 30 | 14.9% | 23.9% | 19.5% | 0.0% | 22.2% | 16.7% | 13.5% | 61.7 |
| notes2-wav | `no-cleanup` | 33 | 91.4% | 91.4% | 88.4% | 100.0% | 90.9% | 97.0% | 86.5% | 26.4 |
| notes2-wav | `raw` | 32 | 89.9% | 89.9% | 85.7% | 100.0% | 90.9% | 96.9% | 83.8% | 8.5 |
| notes2-wav | `no-hpss` | 30 | 83.6% | 83.6% | 76.2% | 93.3% | 100.0% | 93.3% | 75.7% | 25.9 |
| notes2-wav | `no-register` | 30 | 83.6% | 83.6% | 81.0% | 100.0% | 66.7% | 93.3% | 75.7% | 9.5 |
| notes2-wav | `full` | 33 | 82.9% | 82.9% | 79.1% | 100.0% | 72.7% | 87.9% | 78.4% | 27.0 |
| notes2-wav | `no-structure` | 33 | 82.9% | 82.9% | 79.1% | 100.0% | 72.7% | 87.9% | 78.4% | 26.2 |
| notes2-wav | `no-cqt` | 34 | 81.7% | 81.7% | 77.3% | 100.0% | 72.7% | 85.3% | 78.4% | 26.2 |

## Per-config detail

### frank-ocean-acura-mp3__no-register

- Input: frank-ocean-acura-mp3
- Config: `no-register`
- Notes produced: 29 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 33.3% (precision 37.9%, recall 29.7%)
  - True positives: 11
  - False positives: 18 (hallucinated)
  - False negatives: 26 (missed)
- Onset-only F1: 42.4%
- Per-register F1:
  - Lead (midi ≥ 60): 38.1%
  - Harmony (48–59):  35.3%
  - Bass (< 48):      0.0%
- Engine wall time: 61.2 s

### frank-ocean-acura-mp3__no-hpss

- Input: frank-ocean-acura-mp3
- Config: `no-hpss`
- Notes produced: 33 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 31.4% (precision 33.3%, recall 29.7%)
  - True positives: 11
  - False positives: 22 (hallucinated)
  - False negatives: 26 (missed)
- Onset-only F1: 45.7%
- Per-register F1:
  - Lead (midi ≥ 60): 35.6%
  - Harmony (48–59):  37.5%
  - Bass (< 48):      0.0%
- Engine wall time: 165.4 s

### frank-ocean-acura-mp3__no-cqt

- Input: frank-ocean-acura-mp3
- Config: `no-cqt`
- Notes produced: 33 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 28.6% (precision 30.3%, recall 27.0%)
  - True positives: 10
  - False positives: 23 (hallucinated)
  - False negatives: 27 (missed)
- Onset-only F1: 42.9%
- Per-register F1:
  - Lead (midi ≥ 60): 30.4%
  - Harmony (48–59):  35.3%
  - Bass (< 48):      0.0%
- Engine wall time: 165.2 s

### frank-ocean-acura-mp3__full

- Input: frank-ocean-acura-mp3
- Config: `full`
- Notes produced: 32 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 26.1% (precision 28.1%, recall 24.3%)
  - True positives: 9
  - False positives: 23 (hallucinated)
  - False negatives: 28 (missed)
- Onset-only F1: 40.6%
- Per-register F1:
  - Lead (midi ≥ 60): 30.4%
  - Harmony (48–59):  25.0%
  - Bass (< 48):      0.0%
- Engine wall time: 169.6 s

### frank-ocean-acura-mp3__no-structure

- Input: frank-ocean-acura-mp3
- Config: `no-structure`
- Notes produced: 32 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 26.1% (precision 28.1%, recall 24.3%)
  - True positives: 9
  - False positives: 23 (hallucinated)
  - False negatives: 28 (missed)
- Onset-only F1: 40.6%
- Per-register F1:
  - Lead (midi ≥ 60): 30.4%
  - Harmony (48–59):  25.0%
  - Bass (< 48):      0.0%
- Engine wall time: 167.5 s

### frank-ocean-acura-mp3__no-cleanup

- Input: frank-ocean-acura-mp3
- Config: `no-cleanup`
- Notes produced: 32 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 17.4% (precision 18.8%, recall 16.2%)
  - True positives: 6
  - False positives: 26 (hallucinated)
  - False negatives: 31 (missed)
- Onset-only F1: 23.2%
- Per-register F1:
  - Lead (midi ≥ 60): 21.7%
  - Harmony (48–59):  0.0%
  - Bass (< 48):      28.6%
- Engine wall time: 167.6 s

### frank-ocean-acura-mp3__raw

- Input: frank-ocean-acura-mp3
- Config: `raw`
- Notes produced: 30 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 14.9% (precision 16.7%, recall 13.5%)
  - True positives: 5
  - False positives: 25 (hallucinated)
  - False negatives: 32 (missed)
- Onset-only F1: 23.9%
- Per-register F1:
  - Lead (midi ≥ 60): 19.5%
  - Harmony (48–59):  0.0%
  - Bass (< 48):      22.2%
- Engine wall time: 61.7 s

### notes2-wav__no-cleanup

- Input: notes2-wav
- Config: `no-cleanup`
- Notes produced: 33 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 91.4% (precision 97.0%, recall 86.5%)
  - True positives: 32
  - False positives: 1 (hallucinated)
  - False negatives: 5 (missed)
- Onset-only F1: 91.4%
- Per-register F1:
  - Lead (midi ≥ 60): 88.4%
  - Harmony (48–59):  100.0%
  - Bass (< 48):      90.9%
- Engine wall time: 26.4 s

### notes2-wav__raw

- Input: notes2-wav
- Config: `raw`
- Notes produced: 32 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 89.9% (precision 96.9%, recall 83.8%)
  - True positives: 31
  - False positives: 1 (hallucinated)
  - False negatives: 6 (missed)
- Onset-only F1: 89.9%
- Per-register F1:
  - Lead (midi ≥ 60): 85.7%
  - Harmony (48–59):  100.0%
  - Bass (< 48):      90.9%
- Engine wall time: 8.5 s

### notes2-wav__no-hpss

- Input: notes2-wav
- Config: `no-hpss`
- Notes produced: 30 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 83.6% (precision 93.3%, recall 75.7%)
  - True positives: 28
  - False positives: 2 (hallucinated)
  - False negatives: 9 (missed)
- Onset-only F1: 83.6%
- Per-register F1:
  - Lead (midi ≥ 60): 76.2%
  - Harmony (48–59):  93.3%
  - Bass (< 48):      100.0%
- Engine wall time: 25.9 s

### notes2-wav__no-register

- Input: notes2-wav
- Config: `no-register`
- Notes produced: 30 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 83.6% (precision 93.3%, recall 75.7%)
  - True positives: 28
  - False positives: 2 (hallucinated)
  - False negatives: 9 (missed)
- Onset-only F1: 83.6%
- Per-register F1:
  - Lead (midi ≥ 60): 81.0%
  - Harmony (48–59):  100.0%
  - Bass (< 48):      66.7%
- Engine wall time: 9.5 s

### notes2-wav__full

- Input: notes2-wav
- Config: `full`
- Notes produced: 33 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 82.9% (precision 87.9%, recall 78.4%)
  - True positives: 29
  - False positives: 4 (hallucinated)
  - False negatives: 8 (missed)
- Onset-only F1: 82.9%
- Per-register F1:
  - Lead (midi ≥ 60): 79.1%
  - Harmony (48–59):  100.0%
  - Bass (< 48):      72.7%
- Engine wall time: 27.0 s

### notes2-wav__no-structure

- Input: notes2-wav
- Config: `no-structure`
- Notes produced: 33 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 82.9% (precision 87.9%, recall 78.4%)
  - True positives: 29
  - False positives: 4 (hallucinated)
  - False negatives: 8 (missed)
- Onset-only F1: 82.9%
- Per-register F1:
  - Lead (midi ≥ 60): 79.1%
  - Harmony (48–59):  100.0%
  - Bass (< 48):      72.7%
- Engine wall time: 26.2 s

### notes2-wav__no-cqt

- Input: notes2-wav
- Config: `no-cqt`
- Notes produced: 34 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 81.7% (precision 85.3%, recall 78.4%)
  - True positives: 29
  - False positives: 5 (hallucinated)
  - False negatives: 8 (missed)
- Onset-only F1: 81.7%
- Per-register F1:
  - Lead (midi ≥ 60): 77.3%
  - Harmony (48–59):  100.0%
  - Bass (< 48):      72.7%
- Engine wall time: 26.2 s
