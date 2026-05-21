# Phase 3 plan — CREPE for bass register

Goal: replace the bass portion of Basic Pitch's polyphonic output with a dedicated monophonic pitch tracker (CREPE). Bass lines in popular music are nearly always monophonic; using a polyphonic model on bass spreads probability mass across multiple candidates and underperforms a model that commits to one pitch per frame.

## Status

**Not shipped.** This document scopes the work so the next session can pick it up cold.

## Why CREPE specifically

CREPE (Convolutional REpresentation for Pitch Estimation) is the state of the art for monophonic pitch tracking. Key properties for our use:

- Outputs a 360-element softmax distribution over pitch every 10 ms (cents bins from C1).
- Trained on a wide range of monophonic instruments, generalises well.
- Has multiple sizes: tiny (~5 MB), small (~15 MB), medium (~30 MB), large (~50 MB).
- TFLite + ONNX exports both available from the original repo (marl/crepe) and community ports.
- WebAssembly-compatible — no platform-specific kernel requirements.

For our use case, **CREPE-tiny or CREPE-small is appropriate.** Bass pitch range is narrow (~E1 to ~G3, 28-55 MIDI) and the model doesn't need to distinguish subtle timbral cues — it just needs the f0 trajectory.

## The flow we'd add

```
audio (mono, 44.1 kHz)
     │
     ├─► HPSS / current source separation  ──► harmonic stem
     │                                            │
     │                                            ├─► Basic Pitch (full range)
     │                                            │      └─► leadNotes_bp
     │                                            │
     │                                            └─► low-pass filter (cutoff ~250 Hz)
     │                                                  │
     │                                                  └─► CREPE-tiny → f0 trajectory
     │                                                        │
     │                                                        └─► segment into discrete notes
     │                                                              └─► leadNotes_crepe (bass only)
     │
     └─► register split:
            lead    = leadNotes_bp[midi >= 60]
            harmony = leadNotes_bp[48 <= midi < 60]
            bass    = leadNotes_crepe         ← new
```

## Work breakdown

1. **Choose model + export.** CREPE-tiny ONNX is the smallest option but performance varies. Prefer CREPE-small if accuracy on busy mixes is the goal. Verify the ONNX file's input/output shapes match the published spec:
   - Input: 1024-sample frame @ 16 kHz, shape `[1, 1024]` or `[1, 1, 1024]` depending on export.
   - Output: 360 cents bins, shape `[1, 360]`. Argmax → frequency in cents → MIDI.

2. **Drop model in `public/source-separation/crepe-small.onnx`** (or wherever — the path is configurable).

3. **Build `chord-detector-crepe.ts`** in `src/zones/tools/`. Shape: similar to `chord-detector-source-separation-onnx.ts` (already shipped as scaffold). Functions:
   - `transcribeBassWithCrepe(mono: Float32Array, sr: number, options?: CrepeOptions): Promise<LeadNote[]>`
   - Internals: resample to 16 kHz, low-pass at 250 Hz (steeper than the ONNX scaffold's resampler — use a real biquad), frame at 1024 with 10 ms hop, run inference, convert f0 trajectories to discrete notes via onset / offset detection on f0 stability + confidence.

4. **Wire into the engine**: in `chord-detector-engine.ts`, after the BP register-pass output, branch on a new `bassSource` option (`'bp'` default, `'crepe'` opt-in). When `'crepe'`, replace the bass-register slice (midi < 48) of `leadNotesRaw` with the CREPE output.

5. **Add UI toggle** in `ToolsChordDetectorPage.tsx`: row 4 next to RAW MODE — "BASS · CREPE / BP".

6. **Bench it**. Add a `crepe-bass` config to `scripts/chord-detector-phase-bench.mjs`. Compare against current default. Expected wins:
   - Bass F1 on the MP3 should jump from 0 % to **at least 40 %** (CREPE on a low-passed bass signal should track the bass line cleanly).
   - Lead/harmony F1 unchanged (we only swap the bass slice).
   - Engine time: +1-2 s for the CREPE inference per clip (model is small).

## Risks

- **CREPE's note segmentation is fuzzy.** The model outputs continuous f0; converting to discrete (onset, offset, midi) is non-trivial. The original CREPE paper just thresholds confidence + smooths the median. We may need empirical tuning.
- **Vibrato + bends.** A bass with vibrato will produce wobbling f0; the segmentation has to be tolerant.
- **Polyphonic moments.** Sometimes the bass plays a dyad (root + fifth on a piano bass voicing). CREPE only emits one pitch. We accept that limitation — most modern bass lines are monophonic.

## What this depends on

- ONNX Runtime Web — already a project dep (`onnxruntime-web@1.21`). Same runtime the Phase 2 scaffold uses.
- A CREPE ONNX model file. Need to either:
  - Convert from the official TFLite (`marl/crepe`) using `tf2onnx` — straightforward, but needs a one-time offline step.
  - Or use an existing community ONNX export — search huggingface / GitHub for `crepe.onnx`.

## Estimated effort

**Standalone session, ~3-4 hours:**
- 30 min: pick + acquire model file
- 90 min: implement `chord-detector-crepe.ts` (DSP + segmentation logic)
- 30 min: engine wiring + UI toggle
- 30 min: re-bench + score
- 30 min: tune confidence thresholds based on bench results

## Where it lives next to Phase 2

Phase 2 (neural source separation) and Phase 3 (CREPE for bass) are independent. Either can ship first. Recommended order if both:

1. Phase 2 first — provides a cleaner harmonic stem that BP consumes. The lead and harmony register F1 should jump from 38 % / 35 % to high-50s.
2. Phase 3 second — provides better bass on top of Phase 2's cleaner stems. Bass F1 should jump from 0 % to 40-60 %.

Combined effect (hypothesis, not yet measured): **MP3 overall F1 from 33 % to 55-65 %.** That puts us in commercial-tool territory (AnthemScore, Klangio).
