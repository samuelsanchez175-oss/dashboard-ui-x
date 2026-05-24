# Note Detector 2 — accuracy vs Chord Detector

Generated: 2026-05-23T18:21:26Z

**Ground truth**: `frank  Perfect acura girll .mid` — 37 notes (lead 24 / harmony 8 / bass 5).

**Scoring**: identical ±50 ms onset / rounded-pitch-match F1 as the chord-detector bench — the scorer functions are copied verbatim from `scripts/chord-detector-phase-score.mjs`. Both tools scored by the same code in the same run.

## Caveats — read before trusting the numbers

- note-detector-2 accepts **audio only**; the chord-detector's `frank-mid` MIDI-passthrough row has no equivalent and is omitted.
- note-detector-2's merged MIDI is multi-track; the **drums track is excluded** from scoring (the GT is pitched melodic content — drum hits would only be false positives).
- `notes2-wav` predictions are shifted +7.38s to share a time origin with the GT, same convention as the chord-detector bench.
- The chord-detector column is its **best config** per input (highest overall F1 across all 13 configs in `tmp/chord-detector-bench/`).

## Comparison

| Input | Tool | Notes | Overall F1 | Onset F1 | Lead F1 | Harmony F1 | Bass F1 | Precision | Recall |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| frank-ocean-acura-mp3 | note-detector-2 | 140 | 11.3% | 23.7% | 15.8% | 4.3% | 6.9% | 7.1% | 27.0% |
| frank-ocean-acura-mp3 | chord-detector (`full`) | 29 | 33.3% | 42.4% | 38.1% | 35.3% | 0.0% | 37.9% | 29.7% |
| notes-wav | note-detector-2 | 50 | 50.6% | 59.8% | 60.3% | 0.0% | 0.0% | 44.0% | 59.5% |
| notes-wav | chord-detector (`full`) | 23 | 63.3% | 63.3% | 80.9% | 0.0% | 0.0% | 82.6% | 51.4% |
| notes2-wav | note-detector-2 | 86 | 56.9% | 60.2% | 69.8% | 44.4% | 41.7% | 40.7% | 94.6% |
| notes2-wav | chord-detector (`full`) | 30 | 83.6% | 83.6% | 81.0% | 100.0% | 66.7% | 93.3% | 75.7% |

## Verdict

- **frank-ocean-acura-mp3**: note-detector-2 11.3% vs chord-detector 33.3% (`full`) — **chord-detector wins**, Δ -22.0 pts.
- **notes-wav**: note-detector-2 50.6% vs chord-detector 63.3% (`full`) — **chord-detector wins**, Δ -12.8 pts.
- **notes2-wav**: note-detector-2 56.9% vs chord-detector 83.6% (`full`) — **chord-detector wins**, Δ -26.7 pts.

## Per-input detail

### frank-ocean-acura-mp3 — note-detector-2

- Notes scored (in GT window): 140 (raw output: 2273)
- Note F1: 11.3% (precision 7.1%, recall 27.0%)
  - True positives: 10
  - False positives: 130 (hallucinated)
  - False negatives: 27 (missed)
- Onset-only F1: 23.7%
- Per-register F1: lead 15.8% · harmony 4.3% · bass 6.9%

- Tracks in merged MIDI: 3; drum track(s) dropped: 0.

### frank-ocean-acura-mp3 — chord-detector (`full`)

- Notes scored (in GT window): 29 (raw output: 222)
- Note F1: 33.3% (precision 37.9%, recall 29.7%)
  - True positives: 11
  - False positives: 18 (hallucinated)
  - False negatives: 26 (missed)
- Onset-only F1: 42.4%
- Per-register F1: lead 38.1% · harmony 35.3% · bass 0.0%

### notes-wav — note-detector-2

- Notes scored (in GT window): 50 (raw output: 54)
- Note F1: 50.6% (precision 44.0%, recall 59.5%)
  - True positives: 22
  - False positives: 28 (hallucinated)
  - False negatives: 15 (missed)
- Onset-only F1: 59.8%
- Per-register F1: lead 60.3% · harmony 0.0% · bass 0.0%

- Tracks in merged MIDI: 3; drum track(s) dropped: 0.

### notes-wav — chord-detector (`full`)

- Notes scored (in GT window): 23 (raw output: 23)
- Note F1: 63.3% (precision 82.6%, recall 51.4%)
  - True positives: 19
  - False positives: 4 (hallucinated)
  - False negatives: 18 (missed)
- Onset-only F1: 63.3%
- Per-register F1: lead 80.9% · harmony 0.0% · bass 0.0%

### notes2-wav — note-detector-2

- Notes scored (in GT window): 86 (raw output: 90)
- Note F1: 56.9% (precision 40.7%, recall 94.6%)
  - True positives: 35
  - False positives: 51 (hallucinated)
  - False negatives: 2 (missed)
- Onset-only F1: 60.2%
- Per-register F1: lead 69.8% · harmony 44.4% · bass 41.7%

- Tracks in merged MIDI: 3; drum track(s) dropped: 0.

### notes2-wav — chord-detector (`full`)

- Notes scored (in GT window): 30 (raw output: 30)
- Note F1: 83.6% (precision 93.3%, recall 75.7%)
  - True positives: 28
  - False positives: 2 (hallucinated)
  - False negatives: 9 (missed)
- Onset-only F1: 83.6%
- Per-register F1: lead 81.0% · harmony 100.0% · bass 66.7%
