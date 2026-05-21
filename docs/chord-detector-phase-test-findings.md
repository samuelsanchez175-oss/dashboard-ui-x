# Chord Detector — phase test findings

Generated: 2026-05-21T21:00:31Z

**Ground truth**: `frank  Perfect acura girll .mid` — 37 notes total (lead 24 / harmony 8 / bass 5). User-curated MIDI exported from Logic Pro.

Scoring methodology: a predicted note is a true positive when its rounded MIDI pitch matches a ground-truth note AND the onset is within ±50 ms. Each GT note can be matched at most once. F1 = 2·P·R / (P+R).

## TL;DR — Phase 2 / Phase 3 outcomes

| Config | What | MP3 F1 vs `full` | WAV F1 vs `full` | Verdict |
|---|---|---:|---:|---|
| `hpss-mb` | Phase 2 — multi-band HPSS (low/mid/high bands, kernel per band) replacing single-band HPSS | **+0.5 pts** (33.3 → 33.8) | **+1.7 pts** (83.6 → 85.3) | ✅ Marginal net positive. Available via `localStorage['chord-detector-separator']='hpss-multiband'`. WAV bass F1 jumped 66.7 → 80 %. |
| `yin-bass` | Phase 3 — YIN monophonic tracker replaces BP's polyphonic output on midi < 48 | **-7.7 pts** (33.3 → 25.6) | **-23.1 pts** (83.6 → 60.5) | ⚠️ Ships behind UI toggle but **needs tuning** — over-produces notes (49 vs 29 baseline) → +20 false positives. YIN's confidence threshold + minimum-duration filter are too lax. |
| `mb+yin` | Both stacked | -7.7 pts | -23.1 pts | YIN regression dominates; multi-band gain disappears when YIN is on. |

**Default behavior:** unchanged — `full` still routes through single-band HPSS + BP polyphonic. Phase 2 and Phase 3 ship as opt-in toggles so the user can A/B them without changing the production default. Phase 3's YIN segmentation tuning (lower `minConfidence`, longer `minNoteDurationSec`, an octave-snap pass) is the obvious next iteration once a bench session is dedicated to it.

## Results

| Input | Config | Notes | Overall F1 | Onset F1 | Lead F1 | Harmony F1 | Bass F1 | Precision | Recall | Engine s |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| frank-ocean-acura-mp3 | `hpss-mb` | 28 | 33.8% | 43.1% | 39.0% | 35.3% | 0.0% | 39.3% | 29.7% | 72.8 |
| frank-ocean-acura-mp3 | `full` | 29 | 33.3% | 42.4% | 38.1% | 35.3% | 0.0% | 37.9% | 29.7% | 62.6 |
| frank-ocean-acura-mp3 | `full-legacy` | 32 | 26.1% | 40.6% | 30.4% | 25.0% | 0.0% | 28.1% | 24.3% | 171.6 |
| frank-ocean-acura-mp3 | `mb+yin` | 49 | 25.6% | 37.2% | 39.0% | 30.0% | 0.0% | 22.4% | 29.7% | 74.7 |
| frank-ocean-acura-mp3 | `yin-bass` | 49 | 25.6% | 37.2% | 38.1% | 30.0% | 0.0% | 22.4% | 29.7% | 63.4 |
| frank-ocean-acura-mp3 | `raw` | 30 | 14.9% | 23.9% | 19.5% | 0.0% | 22.2% | 16.7% | 13.5% | 55.0 |
| notes2-wav | `hpss-mb` | 31 | 85.3% | 85.3% | 81.0% | 100.0% | 80.0% | 93.5% | 78.4% | 11.4 |
| notes2-wav | `mb+yin` | 49 | 60.5% | 74.4% | 81.0% | 88.9% | 7.7% | 53.1% | 70.3% | 11.6 |
| notes2-wav | `yin-bass` | 49 | 60.5% | 74.4% | 81.0% | 88.9% | 7.7% | 53.1% | 70.3% | 9.9 |

## Per-config detail

### frank-ocean-acura-mp3__hpss-mb

- Input: frank-ocean-acura-mp3
- Config: `hpss-mb`
- Notes produced: 28 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 33.8% (precision 39.3%, recall 29.7%)
  - True positives: 11
  - False positives: 17 (hallucinated)
  - False negatives: 26 (missed)
- Onset-only F1: 43.1%
- Per-register F1:
  - Lead (midi ≥ 60): 39.0%
  - Harmony (48–59):  35.3%
  - Bass (< 48):      0.0%
- Engine wall time: 72.8 s

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
- Engine wall time: 62.6 s

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
- Engine wall time: 171.6 s

### frank-ocean-acura-mp3__mb+yin

- Input: frank-ocean-acura-mp3
- Config: `mb+yin`
- Notes produced: 49 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 25.6% (precision 22.4%, recall 29.7%)
  - True positives: 11
  - False positives: 38 (hallucinated)
  - False negatives: 26 (missed)
- Onset-only F1: 37.2%
- Per-register F1:
  - Lead (midi ≥ 60): 39.0%
  - Harmony (48–59):  30.0%
  - Bass (< 48):      0.0%
- Engine wall time: 74.7 s

### frank-ocean-acura-mp3__yin-bass

- Input: frank-ocean-acura-mp3
- Config: `yin-bass`
- Notes produced: 49 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 25.6% (precision 22.4%, recall 29.7%)
  - True positives: 11
  - False positives: 38 (hallucinated)
  - False negatives: 26 (missed)
- Onset-only F1: 37.2%
- Per-register F1:
  - Lead (midi ≥ 60): 38.1%
  - Harmony (48–59):  30.0%
  - Bass (< 48):      0.0%
- Engine wall time: 63.4 s

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
- Engine wall time: 55.0 s

### notes2-wav__hpss-mb

- Input: notes2-wav
- Config: `hpss-mb`
- Notes produced: 31 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 85.3% (precision 93.5%, recall 78.4%)
  - True positives: 29
  - False positives: 2 (hallucinated)
  - False negatives: 8 (missed)
- Onset-only F1: 85.3%
- Per-register F1:
  - Lead (midi ≥ 60): 81.0%
  - Harmony (48–59):  100.0%
  - Bass (< 48):      80.0%
- Engine wall time: 11.4 s

### notes2-wav__mb+yin

- Input: notes2-wav
- Config: `mb+yin`
- Notes produced: 49 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 60.5% (precision 53.1%, recall 70.3%)
  - True positives: 26
  - False positives: 23 (hallucinated)
  - False negatives: 11 (missed)
- Onset-only F1: 74.4%
- Per-register F1:
  - Lead (midi ≥ 60): 81.0%
  - Harmony (48–59):  88.9%
  - Bass (< 48):      7.7%
- Engine wall time: 11.6 s

### notes2-wav__yin-bass

- Input: notes2-wav
- Config: `yin-bass`
- Notes produced: 49 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 60.5% (precision 53.1%, recall 70.3%)
  - True positives: 26
  - False positives: 23 (hallucinated)
  - False negatives: 11 (missed)
- Onset-only F1: 74.4%
- Per-register F1:
  - Lead (midi ≥ 60): 81.0%
  - Harmony (48–59):  88.9%
  - Bass (< 48):      7.7%
- Engine wall time: 9.9 s
