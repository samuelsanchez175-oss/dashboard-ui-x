# Chord Detector — phase test findings

Generated: 2026-05-21T22:05:48Z

**Ground truth**: `frank  Perfect acura girll .mid` — 37 notes total (lead 24 / harmony 8 / bass 5). User-curated MIDI exported from Logic Pro.

Scoring methodology: a predicted note is a true positive when its rounded MIDI pitch matches a ground-truth note AND the onset is within ±50 ms. Each GT note can be matched at most once. F1 = 2·P·R / (P+R).

## Results

| Input | Config | Notes | Overall F1 | Onset F1 | Lead F1 | Harmony F1 | Bass F1 | Precision | Recall | Engine s |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| frank-mid | `full-legacy` | 37 | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 0.0 |
| frank-mid | `full` | 37 | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 0.0 |
| frank-mid | `hpss-mb` | 37 | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 0.0 |
| frank-mid | `mb+yin` | 37 | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 0.0 |
| frank-mid | `no-cleanup` | 37 | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 0.0 |
| frank-mid | `no-cqt` | 37 | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 0.0 |
| frank-mid | `no-hpss` | 37 | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 0.0 |
| frank-mid | `no-register` | 37 | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 0.0 |
| frank-mid | `no-structure` | 37 | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 0.0 |
| frank-mid | `raw` | 37 | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 0.0 |
| frank-mid | `structure-on` | 37 | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 0.0 |
| frank-mid | `yin-bass` | 37 | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 0.0 |
| frank-mid | `chord-imply-on` | 43 | 92.5% | 92.5% | 98.0% | 76.2% | 100.0% | 86.0% | 100.0% | 0.0 |
| frank-ocean-acura-mp3 | `hpss-mb` | 28 | 33.8% | 43.1% | 39.0% | 35.3% | 0.0% | 39.3% | 29.7% | 72.5 |
| frank-ocean-acura-mp3 | `full` | 29 | 33.3% | 42.4% | 38.1% | 35.3% | 0.0% | 37.9% | 29.7% | 62.2 |
| frank-ocean-acura-mp3 | `no-register` | 29 | 33.3% | 42.4% | 38.1% | 35.3% | 0.0% | 37.9% | 29.7% | 61.7 |
| frank-ocean-acura-mp3 | `no-structure` | 29 | 33.3% | 42.4% | 38.1% | 35.3% | 0.0% | 37.9% | 29.7% | 61.2 |
| frank-ocean-acura-mp3 | `structure-on` | 29 | 33.3% | 42.4% | 38.1% | 35.3% | 0.0% | 37.9% | 29.7% | 61.5 |
| frank-ocean-acura-mp3 | `chord-imply-on` | 31 | 32.4% | 41.2% | 36.4% | 35.3% | 0.0% | 35.5% | 29.7% | 61.5 |
| frank-ocean-acura-mp3 | `no-hpss` | 33 | 31.4% | 45.7% | 35.6% | 37.5% | 0.0% | 33.3% | 29.7% | 168.3 |
| frank-ocean-acura-mp3 | `no-cqt` | 33 | 28.6% | 42.9% | 30.4% | 35.3% | 0.0% | 30.3% | 27.0% | 171.0 |
| frank-ocean-acura-mp3 | `full-legacy` | 32 | 26.1% | 40.6% | 30.4% | 25.0% | 0.0% | 28.1% | 24.3% | 169.9 |
| frank-ocean-acura-mp3 | `mb+yin` | 49 | 25.6% | 37.2% | 39.0% | 30.0% | 0.0% | 22.4% | 29.7% | 74.7 |
| frank-ocean-acura-mp3 | `yin-bass` | 49 | 25.6% | 37.2% | 38.1% | 30.0% | 0.0% | 22.4% | 29.7% | 62.2 |
| frank-ocean-acura-mp3 | `no-cleanup` | 29 | 18.2% | 24.2% | 23.3% | 0.0% | 28.6% | 20.7% | 16.2% | 62.3 |
| frank-ocean-acura-mp3 | `raw` | 30 | 14.9% | 23.9% | 19.5% | 0.0% | 22.2% | 16.7% | 13.5% | 53.7 |
| notes2-wav | `no-cleanup` | 32 | 89.9% | 89.9% | 85.7% | 100.0% | 90.9% | 96.9% | 83.8% | 9.4 |
| notes2-wav | `raw` | 32 | 89.9% | 89.9% | 85.7% | 100.0% | 90.9% | 96.9% | 83.8% | 8.6 |
| notes2-wav | `hpss-mb` | 31 | 85.3% | 85.3% | 81.0% | 100.0% | 80.0% | 93.5% | 78.4% | 11.2 |
| notes2-wav | `full` | 30 | 83.6% | 83.6% | 81.0% | 100.0% | 66.7% | 93.3% | 75.7% | 9.5 |
| notes2-wav | `no-hpss` | 30 | 83.6% | 83.6% | 76.2% | 93.3% | 100.0% | 93.3% | 75.7% | 25.9 |
| notes2-wav | `no-register` | 30 | 83.6% | 83.6% | 81.0% | 100.0% | 66.7% | 93.3% | 75.7% | 9.5 |
| notes2-wav | `no-structure` | 30 | 83.6% | 83.6% | 81.0% | 100.0% | 66.7% | 93.3% | 75.7% | 9.4 |
| notes2-wav | `structure-on` | 30 | 83.6% | 83.6% | 81.0% | 100.0% | 66.7% | 93.3% | 75.7% | 9.5 |
| notes2-wav | `full-legacy` | 33 | 82.9% | 82.9% | 79.1% | 100.0% | 72.7% | 87.9% | 78.4% | 26.5 |
| notes2-wav | `no-cqt` | 34 | 81.7% | 81.7% | 77.3% | 100.0% | 72.7% | 85.3% | 78.4% | 26.0 |
| notes2-wav | `chord-imply-on` | 34 | 78.9% | 90.1% | 81.0% | 80.0% | 66.7% | 82.4% | 75.7% | 9.5 |
| notes2-wav | `mb+yin` | 49 | 60.5% | 74.4% | 81.0% | 88.9% | 7.7% | 53.1% | 70.3% | 11.6 |
| notes2-wav | `yin-bass` | 49 | 60.5% | 74.4% | 81.0% | 88.9% | 7.7% | 53.1% | 70.3% | 9.8 |

## Per-config detail

### frank-mid__full-legacy

- Input: frank-mid
- Config: `full-legacy`
- Notes produced: 37 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 100.0% (precision 100.0%, recall 100.0%)
  - True positives: 37
  - False positives: 0 (hallucinated)
  - False negatives: 0 (missed)
- Onset-only F1: 100.0%
- Per-register F1:
  - Lead (midi ≥ 60): 100.0%
  - Harmony (48–59):  100.0%
  - Bass (< 48):      100.0%
- Engine wall time: 0.0 s

### frank-mid__full

- Input: frank-mid
- Config: `full`
- Notes produced: 37 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 100.0% (precision 100.0%, recall 100.0%)
  - True positives: 37
  - False positives: 0 (hallucinated)
  - False negatives: 0 (missed)
- Onset-only F1: 100.0%
- Per-register F1:
  - Lead (midi ≥ 60): 100.0%
  - Harmony (48–59):  100.0%
  - Bass (< 48):      100.0%
- Engine wall time: 0.0 s

### frank-mid__hpss-mb

- Input: frank-mid
- Config: `hpss-mb`
- Notes produced: 37 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 100.0% (precision 100.0%, recall 100.0%)
  - True positives: 37
  - False positives: 0 (hallucinated)
  - False negatives: 0 (missed)
- Onset-only F1: 100.0%
- Per-register F1:
  - Lead (midi ≥ 60): 100.0%
  - Harmony (48–59):  100.0%
  - Bass (< 48):      100.0%
- Engine wall time: 0.0 s

### frank-mid__mb+yin

- Input: frank-mid
- Config: `mb+yin`
- Notes produced: 37 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 100.0% (precision 100.0%, recall 100.0%)
  - True positives: 37
  - False positives: 0 (hallucinated)
  - False negatives: 0 (missed)
- Onset-only F1: 100.0%
- Per-register F1:
  - Lead (midi ≥ 60): 100.0%
  - Harmony (48–59):  100.0%
  - Bass (< 48):      100.0%
- Engine wall time: 0.0 s

### frank-mid__no-cleanup

- Input: frank-mid
- Config: `no-cleanup`
- Notes produced: 37 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 100.0% (precision 100.0%, recall 100.0%)
  - True positives: 37
  - False positives: 0 (hallucinated)
  - False negatives: 0 (missed)
- Onset-only F1: 100.0%
- Per-register F1:
  - Lead (midi ≥ 60): 100.0%
  - Harmony (48–59):  100.0%
  - Bass (< 48):      100.0%
- Engine wall time: 0.0 s

### frank-mid__no-cqt

- Input: frank-mid
- Config: `no-cqt`
- Notes produced: 37 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 100.0% (precision 100.0%, recall 100.0%)
  - True positives: 37
  - False positives: 0 (hallucinated)
  - False negatives: 0 (missed)
- Onset-only F1: 100.0%
- Per-register F1:
  - Lead (midi ≥ 60): 100.0%
  - Harmony (48–59):  100.0%
  - Bass (< 48):      100.0%
- Engine wall time: 0.0 s

### frank-mid__no-hpss

- Input: frank-mid
- Config: `no-hpss`
- Notes produced: 37 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 100.0% (precision 100.0%, recall 100.0%)
  - True positives: 37
  - False positives: 0 (hallucinated)
  - False negatives: 0 (missed)
- Onset-only F1: 100.0%
- Per-register F1:
  - Lead (midi ≥ 60): 100.0%
  - Harmony (48–59):  100.0%
  - Bass (< 48):      100.0%
- Engine wall time: 0.0 s

### frank-mid__no-register

- Input: frank-mid
- Config: `no-register`
- Notes produced: 37 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 100.0% (precision 100.0%, recall 100.0%)
  - True positives: 37
  - False positives: 0 (hallucinated)
  - False negatives: 0 (missed)
- Onset-only F1: 100.0%
- Per-register F1:
  - Lead (midi ≥ 60): 100.0%
  - Harmony (48–59):  100.0%
  - Bass (< 48):      100.0%
- Engine wall time: 0.0 s

### frank-mid__no-structure

- Input: frank-mid
- Config: `no-structure`
- Notes produced: 37 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 100.0% (precision 100.0%, recall 100.0%)
  - True positives: 37
  - False positives: 0 (hallucinated)
  - False negatives: 0 (missed)
- Onset-only F1: 100.0%
- Per-register F1:
  - Lead (midi ≥ 60): 100.0%
  - Harmony (48–59):  100.0%
  - Bass (< 48):      100.0%
- Engine wall time: 0.0 s

### frank-mid__raw

- Input: frank-mid
- Config: `raw`
- Notes produced: 37 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 100.0% (precision 100.0%, recall 100.0%)
  - True positives: 37
  - False positives: 0 (hallucinated)
  - False negatives: 0 (missed)
- Onset-only F1: 100.0%
- Per-register F1:
  - Lead (midi ≥ 60): 100.0%
  - Harmony (48–59):  100.0%
  - Bass (< 48):      100.0%
- Engine wall time: 0.0 s

### frank-mid__structure-on

- Input: frank-mid
- Config: `structure-on`
- Notes produced: 37 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 100.0% (precision 100.0%, recall 100.0%)
  - True positives: 37
  - False positives: 0 (hallucinated)
  - False negatives: 0 (missed)
- Onset-only F1: 100.0%
- Per-register F1:
  - Lead (midi ≥ 60): 100.0%
  - Harmony (48–59):  100.0%
  - Bass (< 48):      100.0%
- Engine wall time: 0.0 s

### frank-mid__yin-bass

- Input: frank-mid
- Config: `yin-bass`
- Notes produced: 37 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 100.0% (precision 100.0%, recall 100.0%)
  - True positives: 37
  - False positives: 0 (hallucinated)
  - False negatives: 0 (missed)
- Onset-only F1: 100.0%
- Per-register F1:
  - Lead (midi ≥ 60): 100.0%
  - Harmony (48–59):  100.0%
  - Bass (< 48):      100.0%
- Engine wall time: 0.0 s

### frank-mid__chord-imply-on

- Input: frank-mid
- Config: `chord-imply-on`
- Notes produced: 43 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 92.5% (precision 86.0%, recall 100.0%)
  - True positives: 37
  - False positives: 6 (hallucinated)
  - False negatives: 0 (missed)
- Onset-only F1: 92.5%
- Per-register F1:
  - Lead (midi ≥ 60): 98.0%
  - Harmony (48–59):  76.2%
  - Bass (< 48):      100.0%
- Engine wall time: 0.0 s

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
- Engine wall time: 72.5 s

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
- Engine wall time: 62.2 s

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
- Engine wall time: 61.7 s

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
- Engine wall time: 61.2 s

### frank-ocean-acura-mp3__structure-on

- Input: frank-ocean-acura-mp3
- Config: `structure-on`
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
- Engine wall time: 61.5 s

### frank-ocean-acura-mp3__chord-imply-on

- Input: frank-ocean-acura-mp3
- Config: `chord-imply-on`
- Notes produced: 31 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 32.4% (precision 35.5%, recall 29.7%)
  - True positives: 11
  - False positives: 20 (hallucinated)
  - False negatives: 26 (missed)
- Onset-only F1: 41.2%
- Per-register F1:
  - Lead (midi ≥ 60): 36.4%
  - Harmony (48–59):  35.3%
  - Bass (< 48):      0.0%
- Engine wall time: 61.5 s

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
- Engine wall time: 168.3 s

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
- Engine wall time: 171.0 s

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
- Engine wall time: 169.9 s

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
- Engine wall time: 62.2 s

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
- Engine wall time: 62.3 s

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
- Engine wall time: 53.7 s

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
- Engine wall time: 9.4 s

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
- Engine wall time: 8.6 s

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
- Engine wall time: 11.2 s

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
- Engine wall time: 9.5 s

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
- Engine wall time: 9.4 s

### notes2-wav__structure-on

- Input: notes2-wav
- Config: `structure-on`
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
- Engine wall time: 26.5 s

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
- Engine wall time: 26.0 s

### notes2-wav__chord-imply-on

- Input: notes2-wav
- Config: `chord-imply-on`
- Notes produced: 34 (ground truth: 37)
- BPM detected: 65 · Key: F# major
- Note F1: 78.9% (precision 82.4%, recall 75.7%)
  - True positives: 28
  - False positives: 6 (hallucinated)
  - False negatives: 9 (missed)
- Onset-only F1: 90.1%
- Per-register F1:
  - Lead (midi ≥ 60): 81.0%
  - Harmony (48–59):  80.0%
  - Bass (< 48):      66.7%
- Engine wall time: 9.5 s

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
- Engine wall time: 9.8 s
