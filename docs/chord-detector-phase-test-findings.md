# Chord Detector — phase test findings (all 7 phases)

Final run: 2026-05-21. Bench harness flaky due to HMR-triggered page reloads — 11 of 22 expected runs persisted on the last attempt, but they include every Phase 2 + Phase 3 config we needed to evaluate against the lean baseline.

**Ground truth**: `frank  Perfect acura girll .mid` — 37 notes total (lead 24 / harmony 8 / bass 5). User-curated MIDI exported from Logic Pro covering bars 3-4 (time window 7.38 – 14.77 s at 65 BPM).

## All 7 phases — status

| Phase | What | Outcome |
|---|---|---|
| 1 | Register-multi-pass off by default | ✅ +7.2 F1 pts, 2.7× faster — proven winner, shipped (`42e484b`) |
| 2 | Source separation: classical multi-band HPSS (pivot from neural Demucs / SCNet; model files unavailable in this environment) | ✅ **+0.5 F1 pts on MP3** (33.8 % vs 33.3 % lean), +1.7 on WAV — slight net positive, shipped (`825cca3`) |
| 3 | Bass via YIN classical mono pitch tracker (pivot from CREPE; same reason) | ❌ **−7.7 F1 pts on MP3** (25.6 % vs 33.3 % lean), −23.1 on WAV — over-produces notes, needs threshold tuning before default-on. Architecture ships; defaults to BP. |
| 4 | `inferChordTones: false` default | ✅ Shipped (`266b286`) |
| 5 | Viterbi confined to chord labels | ✅ Already structurally true |
| 6 | Structure pass skip toggle | ✅ Shipped |
| 7 | Test ledger | ✅ Shipped (`d541dd8`) |

## MP3 — head-to-head (winner first)

```
hpss-mb        33.8 % F1  · lead 39.0 %  · bass 0.0 %  · 72.8 s  · 28 notes  ← Phase 2 winner
full           33.3 % F1  · lead 38.1 %  · bass 0.0 %  · 62.6 s  · 29 notes  ← Phase 1 default
no-hpss        31.4 % F1  · lead 35.6 %  · bass 0.0 %  · 166.7 s · 33 notes
full-legacy    26.1 % F1  · lead 30.4 %  · bass 0.0 %  · 171.6 s · 32 notes  ← pre-Phase-1
yin-bass       25.6 % F1  · lead 38.1 %  · bass 0.0 %  · 63.4 s  · 49 notes  ← Phase 3 regression
mb+yin         25.6 % F1  · lead 39.0 %  · bass 0.0 %  · 74.7 s  · 49 notes
raw            14.9 % F1  · lead 19.5 %  · bass 22.2 % · 55.0 s  · 30 notes
```

## WAV (clean piano synth)

```
hpss-mb        85.3 % F1  · lead 81.0 %  · bass 80.0 %  · 11.4 s  · 31 notes
yin-bass       60.5 % F1  · lead 81.0 %  · bass  7.7 %  ·  9.9 s  · 49 notes
mb+yin         60.5 % F1  · lead 81.0 %  · bass  7.7 %  · 11.6 s  · 49 notes
```

(Lean/raw configs on WAV scored 82-90 % in prior bench runs — confirms the WAV scoring methodology is honest.)

## TL;DR — what changed in production

1. **Phase 2 multi-band HPSS** is registered as `hpss-multiband` and is the best-scoring separator. To activate it for all analyses: `localStorage.setItem('chord-detector-separator', 'hpss-multiband')`. Default still ships as single-band `hpss` because the F1 gain is small (+0.5 on MP3) and the engine-time cost is +16 %.

2. **Phase 3 YIN bass** ships behind the new `bassSource: 'yin'` option. Default is `'bp'`. The architecture is correct — runs the YIN tracker on the harmonic stem, low-passed at 300 Hz, and splices its monophonic output into the bass-register slice of `leadNotes`. The over-production issue is in segmentation: `minConfidence` 0.8 is too permissive; `medianWindowFrames` 5 doesn't suppress octave jumps. Specific tuning hypotheses for a follow-up session:
   - `minConfidence: 0.92` (was 0.8)
   - `medianWindowFrames: 9` (was 5)
   - `minNoteDurationSec: 0.15` (was 0.08)
   - Add a "stable pitch for ≥3 consecutive frames" gate before opening a segment.

3. **Bass F1 still stuck at 0 % across cleanup-enabled MP3 configs.** Only `raw` (cleanup completely off) shows non-zero bass F1. The cleanup chain has a bass-hostile stage we haven't isolated — likely `enforceTwoHandPianoPolyphony` (caps both hands; the lower-hand cap can drop a sustaining bass note). Not addressed this session; logged for future work.

4. **Lead F1 ceiling appears to be ~39 %** for BP on this MP3 regardless of separator quality. Further improvement requires either a better polyphonic transcription model or true neural source separation. Both deferred — ONNX runtime scaffold in `chord-detector-source-separation-onnx.ts` is ready for a model file when one is acquired.

## Caveats

- Per-config retry logic was added to the bench (`ebec6ce`) so a single HMR navigation doesn't kill the sweep. Even so, 11 / 22 configs persisted this run. The dev server's HMR + Playwright's CDP connection are an inherently brittle combination; a future improvement is to disable HMR for bench runs (`VITE_HMR=false` or similar).
- Numbers above are computed against bars 3-4 of the MP3 only (~7 s of music). Not necessarily representative of the full song.
- WAV alignment shifts the WAV's t=0 to the GT's first-note time. Validated by raw/full WAV configs scoring 80-90 % in prior runs.

## Results

| Input | Config | Notes | Overall F1 | Onset F1 | Lead F1 | Harmony F1 | Bass F1 | Precision | Recall | Engine s |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| frank-ocean-acura-mp3 | `hpss-mb` | 28 | 33.8% | 43.1% | 39.0% | 35.3% | 0.0% | 39.3% | 29.7% | 72.8 |
| frank-ocean-acura-mp3 | `full` | 29 | 33.3% | 42.4% | 38.1% | 35.3% | 0.0% | 37.9% | 29.7% | 62.6 |
| frank-ocean-acura-mp3 | `no-hpss` | 33 | 31.4% | 45.7% | 35.6% | 37.5% | 0.0% | 33.3% | 29.7% | 166.7 |
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
- Engine wall time: 166.7 s

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
