# Chord Detector — Test Ledger

Authoritative record of the reference inputs and methodology used to evaluate every change to the chord-detector pipeline. Lives in version control so each commit that changes pipeline behavior can be tested against the same yardstick.

## Why this document exists

Over a stretch of sessions the pipeline grew from ~3 stages to ~14 stages. Each addition (HPSS source separation, register-stratified BP, CQT validation, structure quantization, chord-implied note inference, key-aware Viterbi smoothing, AI POLISH) had a plausible reason. None of them had numbers behind them. Compound stack of "this should help" arrived at a state where the user reported the output was *getting worse over time*.

The lesson: **pipeline changes need empirical validation against a ground truth, not vibes.** This ledger lists the reference inputs, the scoring method, and the configurations we compare. Every commit that touches the pipeline should re-run the bench and update findings in `docs/chord-detector-phase-test-findings.md`.

## Reference inputs

| Label | Path | Role |
|---|---|---|
| `frank-ocean-acura-mp3` | `/Users/samuel/Desktop/Frank Ocean Acura Integurl Instrumental.mp3` | The song we're trying to transcribe. Mid-tempo R&B / hip-hop instrumental with a clear lead melody + sustained bass + harmonic comping. Representative of the "dense but tonal" material the tool is for. |
| `notes2-wav` | `/Users/samuel/Desktop/Notes 2.wav` | A clean piano synth rendering of the ground-truth MIDI. Used as a sanity-check input — running BP on this should produce nearly the same notes as parsing the ground-truth MIDI directly. Confirms the scoring methodology is honest. |
| ground truth | `/Users/samuel/Downloads/frank  Perfect acura girll .mid` | Logic-Pro-curated MIDI of the song. Hand-cleaned by the user. The source of truth for `notes2-wav` and the target every config is scored against. |

## Pipeline configurations under test

Defined in `scripts/chord-detector-phase-bench.mjs`. Each maps to a specific shape passed as `ChordDetectorAnalyzeOptions` to `analyzeChordProgressionFromBlob`.

| Config | Options | What it tests |
|---|---|---|
| `raw` | `{ analysisMode: 'raw' }` | Every post-processing stage bypassed. BP's native output with only the final same-pitch merge. The baseline against which every layered stage is measured. |
| `full` | `{}` | All current stages enabled (the pre-toggle default behavior). What "current production" looks like. |
| `no-hpss` | `{ skipHpss: true }` | Full pipeline minus HPSS source separation. Measures the contribution of harmonic / percussive splitting. |
| `no-register` | `{ skipRegisterPasses: true }` | Full pipeline but BP runs once with default thresholds (instead of three register-stratified passes). Measures whether the multi-pass actually helps. |
| `no-cleanup` | `{ skipExportCleanup: true }` | Skip the 9-stage export shaping chain (merge / outlier / poly thin / bass-blip / RMS refine / NeuralNote post / onset align / two-hand cap). Measures the cumulative effect of those layers. |
| `no-cqt` | `{ skipCqt: true }` | Full pipeline minus CQT validation. Measures whether dropping notes by audio-energy threshold helps or hurts. |
| `no-structure` | `{ skipStructure: true }` | Full pipeline minus the structure pass (1/16 grid snapping of starts + duration quantization). The user has flagged this as too aggressive; this config quantifies the impact. |

## Scoring methodology

Implemented in `scripts/chord-detector-phase-score.mjs`. Standard mir_eval-style note-F1:

- **True positive**: predicted note's rounded MIDI pitch matches a ground-truth note AND onset is within ±50 ms.
- **Each GT note can be matched at most once.** Greedy matching by onset distance within each pitch lane prevents inflated TP counts when the prediction duplicates the same pitch.
- **Precision** = TP / (TP + FP)
- **Recall** = TP / (TP + FN)
- **F1** = 2·P·R / (P+R)

Also reported per config:

- **Onset F1** — same as note F1 but ignoring pitch. Catches "timing is right, pitch is wrong" patterns.
- **Per-register F1** — same metric restricted to lead (midi ≥ 60), harmony (48–59), bass (< 48). Tells us whether a layer helps the melody at the cost of the bass, or vice versa.
- **Note count vs GT count** — gross over-/under-production signal.
- **Engine wall time** — every accuracy gain has a cost; if a 5 % F1 lift costs 4× analysis time, that's worth knowing.

## Running the bench

Prerequisites:
- Dev server up: `npm run dev` (default port 5179 per `.claude/launch.json`).
- Playwright installed (already a project dep, `@playwright/test`).

```bash
# 1. Run the sweep — drives the dev server through Playwright, saves a JSON
#    + .mid file per (input × config) pair to tmp/chord-detector-bench/.
#    Wall time ~10-25 min for the default 14-run sweep.
node scripts/chord-detector-phase-bench.mjs

# 2. Score outputs against the ground truth MIDI + write findings markdown.
node scripts/chord-detector-phase-score.mjs

# Optional: point at a different ground-truth file
node scripts/chord-detector-phase-score.mjs /path/to/other.mid
```

The findings doc lands at `docs/chord-detector-phase-test-findings.md`. Commit it alongside the pipeline change that produced it.

## When to update this ledger

- New reference input added (different style, edge case the current refs miss)
- New scoring metric proposed (e.g., velocity match, sustain accuracy)
- New configuration added to the sweep (e.g., when Demucs / CREPE land — Phases 2 and 3)
- The scoring methodology changes (e.g., tolerance loosened or tightened)

Do not update this ledger casually — the value of fixed reference inputs is that scores over time can be compared. Adding a new input is fine; replacing one mid-stream invalidates historical comparisons.

## Roadmap of phases (status as of 2026-05-21)

| Phase | Description | Status |
|---|---|---|
| 1 | RAW MODE toggle + register-multi-pass off by default | ✅ Shipped (`266b286`, `42e484b`). +7.2 F1, 2.7× faster. |
| 2 | Better source separation than single-band HPSS | ✅ Multi-band HPSS shipped (`hpss-multiband` separator). Originally planned around Open-Unmix ONNX; pivoted to classical multi-band median filtering because the ONNX model file can't reliably be acquired in this environment. ONNX scaffold remains in `chord-detector-source-separation-onnx.ts` for the day the model lands. |
| 3 | Dedicated monophonic bass pitch tracker | ✅ YIN shipped (`chord-detector-bass-yin.ts`, `bassSource: 'yin'`). Originally planned around CREPE; pivoted to YIN (Cheveigné & Kawahara 2002) for the same reason as Phase 2 — zero ML dependency, matches CREPE-tiny within a few cents on monophonic bass. |
| 4 | Default `inferChordTones` to `false` on the audio path | ✅ Shipped (`266b286`) |
| 5 | Lock Viterbi to chord labels only, never note pitches | ✅ Already structurally true — `viterbiChordPath` operates on `instantBeatEvidence` (per-beat chord templates), never note arrays |
| 6 | Default quantization OFF — `skipStructure: true` available via toggle | ✅ Default flipped OFF; bench confirmed `full` ties `no-structure` |
| 7 | This document | ✅ Shipped |

### Configs added to the bench

| Config | Options | Purpose |
|---|---|---|
| `yin-bass` | `{ bassSource: 'yin' }` | Phase 3 — YIN tracks the bass register instead of BP. |
| `hpss-mb` | `{}` + `localStorage['chord-detector-separator']='hpss-multiband'` | Phase 2 — multi-band HPSS replaces single-band. |
| `mb+yin` | both above combined | Phase 2 + Phase 3 stacked — the "everything new" config. |
