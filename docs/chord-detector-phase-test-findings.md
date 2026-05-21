# Chord Detector — phase test findings

Generated: 2026-05-21T04:55:06Z (validated final run after surgical Phase 1 fix)

**Ground truth**: `frank  Perfect acura girll .mid` — 37 notes total (lead 24 / harmony 8 / bass 5). User-curated MIDI exported from Logic Pro covering bars 3-4 (time window 7.38 – 14.77 s at 65 BPM).

Scoring methodology: a predicted note is a true positive when its rounded MIDI pitch matches a ground-truth note AND the onset is within ±50 ms. Each GT note can be matched at most once. F1 = 2·P·R / (P+R). Predictions are filtered to the GT time window before scoring.

## TL;DR — what shipped, what didn't

**Shipped (commit `42e484b`):** the chord-detector now runs single-pass Basic Pitch by default instead of the three-pass register-stratified loop. Everything else (HPSS, CQT validation, the export cleanup chain) stayed on. The new default scores:

```
NEW default `full`:    33.3 %  F1   (lead 38 %, bass 0 %)   61.7 s engine
OLD `full-legacy`:     26.1 %  F1   (lead 30 %, bass 0 %)  171.5 s engine
                       ────────                            ─────────
                       +7.2 pts                            2.7× faster
```

**Did NOT ship (rolled back during the session):**
- Dropping HPSS by default — bench showed `no-hpss` was a marginal +5 pts ALONE, but combining "no HPSS + no register-pass + no CQT" tanked the MP3 from 26 % to 12 % F1. The layers interact; the cleanup chain depends on HPSS-cleaned audio for its RMS-based timing refinement.
- Dropping CQT validation by default — same story; net-negative once stacked.
- Removing `debounceIsolatedBassBlips` + `dropLowRegisterNotesShorterThan` from the cleanup chain — removing them did NOT actually improve bass F1 (still 0 % on the cleanup-enabled lean config). The bass-killing on this clip happens elsewhere in the chain, most likely `enforceTwoHandPianoPolyphony`. Deferred — needs a test track with more bass activity to make the signal clear.

**Lesson:** isolated single-layer wins don't always stack. Always re-bench after combining cuts.

## Final results (sorted by MP3 F1)

| Input | Config | Notes | Overall F1 | Onset F1 | Lead F1 | Harmony F1 | Bass F1 | Precision | Recall | Engine s |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| frank-ocean-acura-mp3 | `full` | 29 | 33.3% | 42.4% | 38.1% | 35.3% | 0.0% | 37.9% | 29.7% | 61.7 |
| frank-ocean-acura-mp3 | `no-register` | 29 | 33.3% | 42.4% | 38.1% | 35.3% | 0.0% | 37.9% | 29.7% | 65.4 |
| frank-ocean-acura-mp3 | `no-structure` | 29 | 33.3% | 42.4% | 38.1% | 35.3% | 0.0% | 37.9% | 29.7% | 63.7 |
| frank-ocean-acura-mp3 | `no-hpss` | 33 | 31.4% | 45.7% | 35.6% | 37.5% | 0.0% | 33.3% | 29.7% | 182.6 |
| frank-ocean-acura-mp3 | `no-cqt` | 33 | 28.6% | 42.9% | 30.4% | 35.3% | 0.0% | 30.3% | 27.0% | 174.9 |
| frank-ocean-acura-mp3 | `full-legacy` | 32 | 26.1% | 40.6% | 30.4% | 25.0% | 0.0% | 28.1% | 24.3% | 171.5 |
| frank-ocean-acura-mp3 | `no-cleanup` | 29 | 18.2% | 24.2% | 23.3% | 0.0% | 28.6% | 20.7% | 16.2% | 64.9 |
| frank-ocean-acura-mp3 | `raw` | 30 | 14.9% | 23.9% | 19.5% | 0.0% | 22.2% | 16.7% | 13.5% | 54.4 |
| notes2-wav | `no-cleanup` | 32 | 89.9% | 89.9% | 85.7% | 100.0% | 90.9% | 96.9% | 83.8% | 9.6 |
| notes2-wav | `raw` | 32 | 89.9% | 89.9% | 85.7% | 100.0% | 90.9% | 96.9% | 83.8% | 9.0 |
| notes2-wav | `full` | 30 | 83.6% | 83.6% | 81.0% | 100.0% | 66.7% | 93.3% | 75.7% | 9.8 |
| notes2-wav | `no-hpss` | 30 | 83.6% | 83.6% | 76.2% | 93.3% | 100.0% | 93.3% | 75.7% | 26.3 |
| notes2-wav | `no-register` | 30 | 83.6% | 83.6% | 81.0% | 100.0% | 66.7% | 93.3% | 75.7% | 9.7 |
| notes2-wav | `no-structure` | 30 | 83.6% | 83.6% | 81.0% | 100.0% | 66.7% | 93.3% | 75.7% | 9.9 |
| notes2-wav | `full-legacy` | 33 | 82.9% | 82.9% | 79.1% | 100.0% | 72.7% | 87.9% | 78.4% | 27.1 |
| notes2-wav | `no-cqt` | 34 | 81.7% | 81.7% | 77.3% | 100.0% | 72.7% | 85.3% | 78.4% | 26.4 |

## Per-config detail

### frank-ocean-acura-mp3__full

- Input: frank-ocean-acura-mp3
- Config: `full`
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
- Engine wall time: 61.7 s

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
- Engine wall time: 65.4 s

### frank-ocean-acura-mp3__no-structure

- Input: frank-ocean-acura-mp3
- Config: `no-structure`
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
- Engine wall time: 63.7 s

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
- Engine wall time: 182.6 s

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
- Engine wall time: 174.9 s

### frank-ocean-acura-mp3__full-legacy

- Input: frank-ocean-acura-mp3
- Config: `full-legacy`
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
- Engine wall time: 171.5 s

### frank-ocean-acura-mp3__no-cleanup

- Input: frank-ocean-acura-mp3
- Config: `no-cleanup`
- Notes produced: 29 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 18.2% (precision 20.7%, recall 16.2%)
  - True positives: 6
  - False positives: 23 (hallucinated)
  - False negatives: 31 (missed)
- Onset-only F1: 24.2%
- Per-register F1:
  - Lead (midi ≥ 60): 23.3%
  - Harmony (48–59):  0.0%
  - Bass (< 48):      28.6%
- Engine wall time: 64.9 s

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
- Engine wall time: 54.4 s

### notes2-wav__no-cleanup

- Input: notes2-wav
- Config: `no-cleanup`
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
- Engine wall time: 9.6 s

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
- Engine wall time: 9.0 s

### notes2-wav__full

- Input: notes2-wav
- Config: `full`
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
- Engine wall time: 9.8 s

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
- Engine wall time: 26.3 s

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
- Engine wall time: 9.7 s

### notes2-wav__no-structure

- Input: notes2-wav
- Config: `no-structure`
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
- Engine wall time: 9.9 s

### notes2-wav__full-legacy

- Input: notes2-wav
- Config: `full-legacy`
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
- Engine wall time: 27.1 s

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
- Engine wall time: 26.4 s
