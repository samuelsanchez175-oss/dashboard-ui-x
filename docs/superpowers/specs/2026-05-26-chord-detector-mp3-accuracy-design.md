# Chord Detector — MP3 Accuracy Design

**Date:** 2026-05-26
**Owner:** chord-detector
**Status:** Design (pending user review → implementation plan)
**Primary goal:** Lift the chord detector's note-F1 on real-world MP3 input from **33.8% → ≥ 85%** (weighted blend `0.7·lead-F1 + 0.3·harmony-F1`) without regressing the WAV / MIDI sanity inputs.

---

## 1. Context & problem

The current chord detector pipeline (Basic Pitch TF.js + classical HPSS + YIN bass tracker + 14-stage cleanup) was benchmarked on 2026-05-23 against a user-curated golden MIDI of the **Frank Ocean — "Acura Integurl" instrumental**. Three fixtures were measured:

| Fixture | Type | Best config | Note-F1 | Weighted blend | Status |
|---|---|---|---|---:|---|
| `frank-mid` | Golden MIDI (input == truth) | `full` | **100%** | 100% | ✅ Sanity passes |
| `notes2-wav` | Clean piano-synth render of the golden | `no-cleanup` / `raw` | **89.9%** | **90.0%** | ✅ Already passes 85% gate |
| `frank-ocean-acura-mp3` | Real reverbed/mastered MP3 | `hpss-mb` | **33.8%** | **37.9%** | ❌ **51 points short of 85%** |

The MP3 is the **production case** — real-world audio with reverb tail, stereo bus, mastering compression, and possibly minor accompanying elements. The WAV and MID fixtures are best-case sanity rails, not optimization targets. Every measurement above is real (from `docs/chord-detector-phase-test-findings.md`, scored offline via `scripts/chord-detector-phase-score.mjs` with ±50 ms onset tolerance, greedy 1-to-1 matching).

**Root cause** (per phase findings + tuning log):
- On the best config (`hpss-mb`), Basic Pitch finds only **11 of 37** ground-truth notes (recall 29.7%, precision 39.3%).
- Onset-F1 (43.1%) > note-F1 (33.8%) — timing is closer than pitch, suggesting the model **sees** events but mis-pitches them under reverb / mastering bus.
- Per-register on `hpss-mb`: lead 39.0%, harmony 35.3%, **bass 0%** (YIN bass tracker silent on this clip). Weighted blend = `0.7·39.0 + 0.3·35.3 = 37.9%`.
- Published model accuracies (BP ~80% on MAESTRO clean piano, drops to ~50% on full mixes) are consistent with the observed ~34% on a reverbed mastered MP3 — this is a model-quality bottleneck, not a post-processing one. No amount of further tuning to BP alone will hit 85%.

---

## 2. Approach (locked: hybrid C)

Two pipelines behind one engine surface. Per-analysis choice via dev settings. Default = browser hybrid (works offline). Opt-in toggle = server piano specialist (highest accuracy).

```
                        ┌────────────────────────────────┐
                        │   user uploads audio (MP3/WAV) │
                        └──────────────┬─────────────────┘
                                       │
                              ┌────────▼────────┐
                              │ engine selector │
                              └──┬───────────┬──┘
              transcriber: hybrid│           │transcriber: server
                                 │           │
            ┌────────────────────▼─┐       ┌─▼──────────────────────┐
            │ A. BROWSER HYBRID    │       │ B. SERVER SPECIALIST    │
            │                      │       │                         │
            │ 1. Demucs WASM       │       │ 1. POST audio to        │
            │    piano-stem isolate│       │    /api/transcribe-piano│
            │  fallback → HPSS     │       │    (Vercel Fluid Compute│
            │                      │       │     Node fn)            │
            │ 2. Magenta Onsets &  │       │                         │
            │    Frames (TF.js)    │       │ 2. Server runs          │
            │  fallback → BP       │       │    HPPNet-tiny ONNX     │
            │                      │       │    (~1 MB, 151k params) │
            │ 3. PESTO ONNX-web    │       │                         │
            │    monophonic lead   │       │ 3. Returns RawNote[]    │
            │    overlay (~500 KB) │       │    + modelVersion       │
            │                      │       │                         │
            │ 4. Fusion + guards   │       │ on error/timeout →      │
            │    + key/chord prior │       │    fall back to (A)     │
            └──────────┬───────────┘       └─────────┬───────────────┘
                       │                             │
                       └──────────────┬──────────────┘
                                      │
                            ┌─────────▼─────────┐
                            │ FUSION (anti-cheat│
                            │  guardrails)      │
                            └─────────┬─────────┘
                                      │
                            ┌─────────▼─────────┐
                            │ existing 14-stage │
                            │ export pipeline   │
                            └─────────┬─────────┘
                                      │
                                 LeadNotes + MIDI
                                 + score + audit
```

**Invariant:** every transcriber returns the same `RawNote[]` shape; the existing 14-stage cleanup runs after both paths, so the output sounds musically clean regardless of which model produced the raw events.

### Why C (hybrid), not A (browser-only) or B (server-only)

- **Approach A alone** (browser hybrid): research extrapolation puts the realistic ceiling at 75–82% on real reverbed piano. Won't hit 85% target reliably.
- **Approach B alone** (server-only): drops the offline / zero-server property the existing tool has. Bad failure mode on cold MP3 uploads with network issues.
- **Approach C** (hybrid + toggle): ships the browser improvement to all users on day one (lift everyone), and exposes the 85%+ ceiling for users who need it via an opt-in server toggle. Best ship velocity × ceiling.

---

## 3. Components

All new files are single-purpose, < 300 lines, testable in isolation.

### New files

| # | File | Role |
|---|---|---|
| 1 | `src/zones/tools/chord-detector-transcriber.ts` | Strategy interface `Transcriber { name; transcribe(audio, opts) → RawNote[] }`. Dispatch table by name. |
| 2 | `src/zones/tools/chord-detector-oaf-transcriber.ts` | Magenta Onsets-and-Frames TF.js wrapper. Lazy-loaded model (~10–20 MB) via `@magenta/music`. |
| 3 | `src/zones/tools/chord-detector-pesto-overlay.ts` | PESTO ONNX-web monophonic pitch tracker. Outputs per-frame `{ pitch, confidence }`. ~500 KB model. |
| 4 | `src/zones/tools/chord-detector-demucs-front.ts` | Demucs WASM wrapper (via `free-music-demixer`). Returns "other"/piano-dominant stem. Lazy-loaded. |
| 5 | `src/zones/tools/chord-detector-fusion.ts` | Fuses transcriber output + PESTO overlay + key/chord prior into final `RawNote[]`. **All anti-hallucination guards live here.** |
| 6 | `src/zones/tools/chord-detector-server-client.ts` | POST audio to `/api/transcribe-piano`; timeout, single retry, fallback on error. Emits fallback toast. |
| 7 | `api/transcribe-piano.ts` | Vercel Fluid Compute Node fn. Decodes audio via `audio-decode`/`wavefile`, runs HPPNet-tiny via `onnxruntime-node`, returns `RawNote[]`. |
| 8 | `public/models/hppnet-tiny.onnx` (or CDN-hosted) | The model file. ~1 MB. Loaded by the Vercel function. |
| 9 | `scripts/chord-detector-fast-bench.mjs` | Pure-Node bench. No Playwright. Loads fixtures → runs Node-compatible transcribers → scores vs golden MIDI → prints table. Target: ≤ 5 s per config. |
| 10 | `src/lib/dev-settings-env-model.ts` (extend) | Add `transcriber: 'basic-pitch' \| 'oaf-hybrid' \| 'server-piano'` enum + UI toggle in dev settings. |

### Existing files modified

| File | Change |
|---|---|
| `src/zones/tools/chord-detector-engine.ts` | Replace direct `analyzeViaBasicPitch(...)` call with `transcriber.transcribe(...)` selector dispatch. Behavior unchanged when `transcriber === 'basic-pitch'`. |
| `src/zones/tools/chord-detector-basic-pitch.ts` | Wrap current implementation as one transcriber strategy. No behavior change for the wrapped path. |
| `src/zones/tools/ToolsChordDetectorPage.tsx` | Add transcriber selector chip + "server" / "browser hybrid" badge in result panel + per-stage timing readout. Emit toast on fallback events. |
| `scripts/chord-detector-phase-bench.mjs` | Add new configs: `oaf-hybrid`, `oaf-demucs`, `oaf-demucs-pesto`, `server-hppnet`, `server-hppnet-pesto`. |
| `scripts/chord-detector-phase-score.mjs` | Add columns: `weighted-blend` (0.7·lead + 0.3·harmony), `pred:gt-ratio` (cheat detector), `pass-mark` (✅ when ≥ 85% AND ratio ≤ 1.5). Sort MP3 row first, bold. |

---

## 4. Data flow

### Browser hybrid path (default)

```
Blob (mp3/wav)
  │
  ▼
[A] decode → mono Float32 @ 44.1 kHz, capped at 96 s          (existing)
  │
  ▼
[B] Demucs WASM (lazy load) → piano-stem Float32              (new, ~3–8 s)
       fallback (model load fail / >30 s) → classical HPSS    (existing)
  │
  ▼  ┌──── parallel ────────────────────────────────────┐
[C] │   - resample 22.05 kHz → O&F                      │
    │   - resample 16 kHz → PESTO                       │
    │   - chroma + BPM (existing)                       │
    └────────────────────────────────────────────────────┘
  │
  ▼
[D] Magenta Onsets-and-Frames (TF.js, lazy) → RawNote[]       (new, ~5–10 s)
       fallback (model load fail) → Basic Pitch (existing)
  │
  ▼
[E] PESTO ONNX-web → per-frame { pitch, confidence }          (new, ~1–2 s)
  │
  ▼
[F] FUSION (chord-detector-fusion.ts)                          (anti-cheat — Section 5)
  │
  ▼
[G] existing 14-stage export pipeline (cleanup, structure, etc.)
  │
  ▼
LeadNotes + MIDI + score + audit
```

### Server path (`transcriber: 'server-piano'`)

```
Blob → POST multipart to /api/transcribe-piano
       (timeout 60 s; client-side retry on 502/504 once)
       │
       ▼ on server (Vercel Fluid Compute Node fn):
       │     - decode via audio-decode/wavefile → mono Float32 @ 16 kHz
       │     - HPPNet-tiny ONNX (onnxruntime-node) → frame activations
       │     - decode to RawNote[] { midi, startSec, durationSec, velocity }
       │     - return JSON: { notes, modelVersion, elapsedMs }
       │
       ▼ client receives JSON
       │   on error / timeout → fall back to browser hybrid path (A)
       │   emit toast: "server transcriber unreachable, using browser hybrid"
       │
       ▼ optional PESTO overlay (browser-side) to re-confidence lead notes
       │
       ▼ [F] FUSION (same guards as browser path)
       │
       ▼ [G] existing 14-stage post-pipeline
       │
       ▼ LeadNotes + MIDI + score + audit
```

### Fallback chain (graceful degradation)

```
server-piano  →  (error/timeout)        →  oaf-hybrid
oaf-hybrid    →  (model load fail)      →  basic-pitch (current default)
basic-pitch   →  (decode fail)          →  hard error, surface to UI
```

**Every fallback emits a visible toast** so the user knows which transcriber actually produced the MIDI. A status badge on the result panel records the final transcriber name (e.g. `"transcriber: oaf-hybrid (fallback from server)"`).

---

## 5. Anti-cheat guardrails

This section directly answers the "no hallucinations, no dragged-out notes that cheat the grading system" requirement. All guards live in `chord-detector-fusion.ts` and run regardless of which transcriber produced the raw events.

| # | Guard | Rule | Prevents | Expected note-accuracy delta on MP3 |
|---|---|---|---|---:|
| 1 | Velocity floor | Drop any note with `velocity < 0.18` | BP/O&F low-confidence ghost output | **+3–5%** |
| 2 | Ghost-shadow filter (existing, kept) | Short note with longer `+1 semitone` parent → drop | Transient sidebands of strong attacks | **+1–2%** |
| 3 | PESTO lead cross-check | Lead notes (midi ≥ 60) require PESTO confidence > 0.5 in first 100 ms | Phantom melody notes invented in reverb tails | **+5–8%** |
| 4 | Key/chord prior | Out-of-key note → `confidence × 0.5`; if < 0.3 → drop. Skip if velocity > 0.85 (passing tones) | Random chromatic noise; preserves real color notes | **+2–4%** |
| 5 | Density cap | ≤ 6 lead notes/sec, ≤ 8 total/sec rolling 1-s window | Dense hallucination clusters | **+2–3%** |
| 6 | Max note duration | Clip to `min(real, 4 × beat)` unless velocity > 0.85 | "Dragged note" cheat — holding one pitch to overlap GT | 0% F1; **audible quality fix** |
| 7 | Min note duration | 50 ms floor | Sub-onset transients counted as notes | **+1%** |
| 8 | Honest velocity mapping | Same curve across all transcribers | Path-specific velocity boosting | 0% (audit-only) |
| 9 | No dup-pitch-at-same-onset | Merge notes at same pitch within 30 ms | Carpet-bombing onsets to maximize TP | **+1%** |
| 10 | `pred:gt-ratio` audit column | New scorer column; flag > 1.5 as `⚠ over-produced` | Visible regression detection | 0% (visibility only) |
| 11 | Server fallback toast | UI banner when server unreachable / O&F fails | Silent fallback obscuring transcriber identity | 0% (UX only) |
| 12 | Fallback chain | `server-piano → oaf-hybrid → basic-pitch` | Hard failure on any single component | Stability, no accuracy impact |

**Total guard contribution (best case): +15–24%** on top of whichever transcriber produced the raw output.

### Realistic per-path projection on MP3

| Path | Model contribution | Guard contribution | **Total expected F1** |
|---|---:|---:|---:|
| Current best (`hpss-mb`, measured) | 33.8% | — | **33.8%** (measured) |
| Browser hybrid (A) | +25–35% | +15–20% | **~70–82%** (estimate) |
| Server HPPNet (B) | +40–55% | +15–20% | **~85–92%** (estimate) |

> **Honesty caveat:** Only the 33.8% baseline is measured. Published model accuracies (O&F 94.8%, HPPNet-tiny 95.8%) come from **MAESTRO** — clean dry Disklavier studio recordings. Reverbed/mastered MP3 audio degrades all of them; the question is by how much. **Phase 0** of implementation establishes the real per-model baseline on your three fixtures before any optimization work happens. Estimates above only guide priority order; measurements decide what ships.

### Error handling

| Failure | Behavior |
|---|---|
| Model load failure (Demucs/O&F/PESTO) | Caught at strategy boundary; fall back per chain; toast emitted |
| Decode failure (corrupt audio) | Hard error, surface to UI, **no fallback** |
| Server 5xx | 1 retry with 500 ms backoff, then fall back to browser hybrid |
| Server timeout (> 60 s) | Abort and fall back; toast: "server timed out, using browser" |
| Cold-start latency (> 5 s no response) | UI shows "warming server…" indicator |
| All caught errors | Logged with `{ transcriber, stage, error }` to existing dev-console logger |

---

## 6. Testing & bench plan

### Two-tier bench

| Tier | Tool | Speed | Purpose |
|---|---|---|---|
| **Fast** | `scripts/chord-detector-fast-bench.mjs` (new, pure Node) | ~3–8 s / config | Iteration. Run on every tuning change. |
| **Truth** | `scripts/chord-detector-phase-bench.mjs` (existing, Playwright) | ~60 s / config | Pre-merge gate. Browser parity verified. |

Both write to the same `tmp/chord-detector-bench/` directory and feed the same scorer (`chord-detector-phase-score.mjs`).

### Inputs (locked — your three files)

| ID | Path | Type | Target |
|---|---|---|---|
| `frank-mid` | `~/Desktop/frank  Perfect acura girll .mid` | Golden | ≥ 99% (sanity) |
| `notes2-wav` | `~/Desktop/Notes 2.wav` | Clean render | ≥ 85% (already 89.9%, no-regress) |
| `frank-ocean-acura-mp3` | `~/Desktop/Frank Ocean Acura Integurl Instrumental.mp3` | **Real MP3 — primary target** | **≥ 85% (current 33.8%)** |

### Bench config matrix

| Config | Transcriber | Front-end | Lead overlay |
|---|---|---|---|
| `baseline-bp` | Basic Pitch | HPSS classical | — |
| `baseline-bp-mb` | Basic Pitch | HPSS multiband | — |
| `oaf-only` | Onsets-and-Frames | — | — |
| `oaf-hpss` | Onsets-and-Frames | HPSS classical | — |
| `oaf-demucs` | Onsets-and-Frames | Demucs WASM | — |
| `oaf-demucs-pesto` | Onsets-and-Frames | Demucs WASM | PESTO |
| `server-hppnet` | HPPNet-tiny ONNX (server) | — (server-side) | — |
| `server-hppnet-pesto` | HPPNet-tiny ONNX (server) | — | PESTO (client) |

### Scorer extensions

- `weighted-blend` column = `0.7 × lead-F1 + 0.3 × harmony-F1` (primary target metric)
- `pred:gt-ratio` column (cheat detector — flag > 1.5)
- `pass-mark` column = ✅ when **all** of: weighted-blend ≥ 85% AND pred:gt-ratio ≤ 1.5 AND self-grade NOTES ≥ B
- MP3 row first, bold; WAV/MID become a "rails check" footer

```
=== MP3 (primary target) ===
Config                    │ Notes │ F1   │ WBlend │ pred:gt │ ✅
oaf-demucs-pesto          │   34  │ 71%  │  74%   │  0.92   │ —
server-hppnet-pesto       │   36  │ 87%  │  88%   │  0.97   │ ✅
...

=== Rails check (no-regress) ===
notes2-wav  baseline-bp  → 89.9% (pass: stayed above 85)
frank-mid   any         → 100%  (pass: sanity intact)
```

### Phase 0 acceptance gate (before any optimization)

Run the matrix once on the actual MP3 with each `transcriber` candidate at default settings. Lock in the real measurement table. Any candidate landing **< 50% on the MP3** is cut at this point — no further tuning cycles spent on a dead model.

### Phase N acceptance gate (per ship)

A new transcriber can become the **default** only when:

1. MP3 weighted-blend ≥ 85% **AND** `pred:gt-ratio` ≤ 1.5
2. WAV weighted-blend ≥ 85% (no regression on existing pass — currently 90%)
3. MID ≥ 99% (sanity stays intact)
4. Engine wall time ≤ 30 s (browser path) / ≤ 60 s (server path)
5. Self-grade NOTES grade ≥ B (audible quality check — answers "no cheating" concern)

Any gate failure = no ship, regardless of headline F1.

### Manual listen test

Before any default flip, the top 2–3 candidates' exported MIDI is dragged into a DAW and listened to. F1 catches metrics; ears catch musicality. The pass-mark sets up the listen; it doesn't replace it.

---

## 7. Phased rollout

| Phase | Scope | Gate |
|---|---|---|
| **0. Real baselines** | Build fast Node bench. Wire each candidate model at default settings (no guards yet). Run on all 3 fixtures. Lock in the real table. | Real numbers replace estimates in this spec. |
| **1. Browser hybrid (A) ships as new default** | Demucs front + O&F transcriber + PESTO overlay + fusion + guards. Lazy-loaded models. | MP3 ≥ 65% AND no rails regression. |
| **2. Anti-cheat guards** | All Section 5 guards. Re-measure. | MP3 weighted-blend ≥ 75% AND pred:gt-ratio ≤ 1.5. |
| **3. Server toggle (B) behind dev setting** | Vercel Fluid Compute fn + HPPNet-tiny ONNX + client + fallback chain + toast. | MP3 weighted-blend ≥ 85% with server toggle on. |
| **4. Second real MP3 fixture** | Add another piano-heavy real-world track to the bench to confirm gains generalize (no overfit to Frank Ocean). | Second fixture also lands ≥ 75% under same config. |

**The 85% goal lives at the end of Phase 3** — server toggle on. Browser hybrid (Phase 1+2) is the everyone-wins lift; server toggle is the bullseye for the production MP3 case.

---

## 8. Open questions / risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Published model accuracies are from MAESTRO; real Frank Ocean MP3 may drop more than expected | Phase 0 measures it before commitment. If oaf-demucs lands < 50%, cut and reweight toward server path. |
| R2 | Demucs WASM model is large (tens of MB) and slow first-load | Lazy-load on first `oaf-hybrid` analysis only. Cache via Service Worker. First analysis slow, subsequent fast. Exact transfer size verified in Phase 0. |
| R3 | Server cold-start on Vercel Fluid Compute | Function uses provisioned memory; expect ≤ 2 s cold start with shared instance reuse. Warm indicator UI absorbs perceived latency. |
| R4 | HPPNet-tiny ONNX export quality (not yet verified) | Phase 0 measures it. If conversion is lossy, fall back to ByteDance Piano Transcription (larger but proven). |
| R5 | Overfitting to one MP3 fixture (Frank Ocean) | Phase 4 adds a second real-world track. No default flip without it. |
| R6 | PESTO confidence may be noisy on polyphonic content | PESTO is monophonic — only used to confidence-check the dominant pitch per frame, not as a primary transcriber. Veto power, not vote power. |

---

## 9. Out of scope (explicit)

- Re-training models on annotated reverberant data (R&D-heavy, separate project)
- Stem-separation quality improvements beyond shipping Demucs (Demucs htdemucs_6s piano stem has known quality limits)
- Chord-symbol accuracy (chord *labels* — this spec is about *notes*). Existing Viterbi chord decoder stays as-is; its inputs improve when notes improve.
- Mobile / iOS Safari compatibility for the new models (Demucs WASM has known Safari WebGL issues — desktop Chrome / Edge first; mobile is a follow-up).
- A 4th fixture beyond what's already locked. Phase 4's "second real MP3" is one additional track, not a benchmark suite.

---

## 10. Success criteria (one-line summary)

> Ship a chord detector where uploading **`Frank Ocean Acura Integurl Instrumental.mp3`** produces MIDI scoring **≥ 85%** weighted-blend (`0.7·lead + 0.3·harmony`) against the user's golden MIDI, with no over-production (`pred:gt-ratio ≤ 1.5`), no audible "dragged note" or hallucination, and no regression on the WAV/MID sanity rails.

---
