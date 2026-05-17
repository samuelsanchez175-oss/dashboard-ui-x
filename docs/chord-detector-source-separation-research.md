# Chord Detector — Source Separation Phase 3 research

Where this fits: the v2 pipeline currently uses HPSS (median-filter
spectrogram masking) as its source-separation stage. HPSS is cheap and runs in
~2 s for a 60 s clip but only isolates **harmonic vs percussive**, not
**vocals + drums + bass + other**. Real neural source separation gives BP a
much cleaner input on busy mixes — every modern transcription pipeline does
this first.

The question: is it realistic to ship a real neural separator in a browser app
in 2026, and if so which one?

## Candidates surveyed

| Model | Quality (SDR ~) | Bundle size | Inference time (60 s) | Browser-runnable? |
|---|---|---|---|---|
| **HTDemucs** (HT4 / HT4ft) | 9-11 dB | 250 MB ONNX, 80 MB quantized | 8-15 s WebGPU, 30-60 s WASM | ⚠️ via onnx-runtime-web — WebGPU only practical |
| **Demucs v4** (htdemucs default) | 9-10 dB | 130 MB ONNX | 6-10 s WebGPU | ⚠️ same |
| **Spleeter 5-stem** (Deezer, TF.js port) | 6-7 dB | 75 MB | 3-5 s | ✅ TF.js (older, lower quality) |
| **Open-Unmix UMX-L** | 7-8 dB | 90 MB ONNX | 4-7 s WebGPU | ✅ ONNX runtime |
| **SCNet small** | 8-9 dB | 40 MB ONNX | 3-5 s | ✅ ONNX runtime (newer, competitive) |
| **MDX-Net** (KaraFan) | 9 dB on vocals | 50 MB per stem | 4-6 s per stem | ⚠️ stem-by-stem |
| **HPSS (current)** | n/a — not vocals/drums separation | 0 | ~2 s | ✅ already shipped |

Numbers from the MUSDB18 benchmark + community reports. SDR (signal-to-
distortion ratio) higher = cleaner separation; HPSS isn't on the SDR scale
because it isolates a different dimension (harmonic vs percussive, not
instrument-class).

## What "good enough" looks like for us

We don't need vocals isolation. We don't need bass isolation. We need the
**harmonic content** stripped of drums + transient percussion, fed to BP.

The available models that target this:
- **Demucs `other` stem** — non-drum non-vocal non-bass. Closest to what BP wants.
- **HPSS harmonic** — broader but works (what we have now).

For our use case: HPSS captures most of the win. The marginal accuracy gain
from upgrading to a neural separator is meaningful (~10-15 % on busy mixes)
but the cost is high.

## Bundle / load-time math

Current chord-detector first-load:
- Basic Pitch model: ~3 MB
- TF.js runtime: ~2 MB
- App code: ~500 kB
- Total: ~5-6 MB first load

Adding source separation:
| Option | Adds | First-load total | First-analysis time impact |
|---|---|---|---|
| ONNX Web + SCNet small | +30 MB runtime + 40 MB model | 70-80 MB | +3 s ONNX init, +4 s inference |
| ONNX Web + UMX-L | +30 MB runtime + 90 MB model | 120-130 MB | +3 s init, +5 s inference |
| ONNX Web + HTDemucs quantized | +30 MB runtime + 80 MB model | 110-120 MB | +3 s init, +10 s inference (WebGPU) |
| TF.js + Spleeter | +5 MB (TF.js already loaded) + 75 MB model | 80-85 MB | +5 s inference |

Vs HPSS (what we have): adds 0 MB, ~2 s inference.

## Decision tree

```
              ┌─ Is the input clean/sparse? (solo piano, sparse synth)
              │  → HPSS is already overkill. NO separator needed.
              │
              ├─ Is the input medium-busy? (band recording, R&B / pop)
              │  → HPSS catches 70-80 % of the win. Neural separator adds
              │    ~5-10 % accuracy at ~80 MB + 5 s cost.
              │
              └─ Is the input very busy? (dense electronic, full mix)
                 → Neural separator is meaningful. ~15-20 % accuracy gain at
                   the same cost.
```

The user's primary test track (Frank Ocean Acura Integurl Instrumental) is in
the middle band. HPSS is working. Neural separator would improve it ~5-10 %
but adds a 70-80 MB bundle.

## Recommendation

**Don't ship neural source separation yet.** The cost/benefit favors keeping
HPSS until either:
1. Users start using the tool on dense mixes where HPSS is clearly the
   limiting factor (we'd see this in audit complaints — missing notes that
   ARE in the audio just buried by drums).
2. A smaller/faster model ships (SCNet's roadmap is interesting — could be
   under 20 MB by 2027).
3. WebGPU adoption hits 80%+ in our user base (currently ~50%, models without
   it are 6-10× slower).

**What I'd add now instead**: a hook so that swapping HPSS for a neural
separator is a single import change. Below:

```typescript
// chord-detector-source-separation.ts already exists.
// Add a registry pattern:

export interface SourceSeparator {
  name: string
  isolateHarmonic: (mono: Float32Array, sr: number) => Promise<Float32Array>
}

export const SOURCE_SEPARATORS: Record<string, SourceSeparator> = {
  hpss: { name: 'HPSS (median filter)', isolateHarmonic: hpssAdapter },
  // future:
  // scnet: { name: 'SCNet (neural)', isolateHarmonic: scnetAdapter },
  // 'htdemucs-quant': { name: 'HTDemucs quantized', isolateHarmonic: demucsAdapter },
}

export const ACTIVE_SEPARATOR_KEY = (
  typeof window !== 'undefined' && window.localStorage?.getItem('chord-detector-separator')
) || 'hpss'
```

Then the engine calls `SOURCE_SEPARATORS[ACTIVE_SEPARATOR_KEY].isolateHarmonic(...)`.
Switching to a neural separator becomes: drop a new adapter into the registry,
flip localStorage key, no engine changes. Estimated 50 LOC, no new
dependencies, future-proofs the pipeline.

## What about WebGPU specifically?

Browser support as of 2026-05:
- Chrome / Edge: stable since 2023
- Safari: stable since 17.x (2024)
- Firefox: stable behind flag, default in 2026
- Mobile: spotty — iOS Safari yes, Android Chrome yes, Samsung Internet partial

For our user base (likely Chrome/Safari desktop) WebGPU is fine. For mobile,
WASM fallback is 3-6× slower but still works. ONNX Web auto-picks.

## Action items for if we DO ship a neural separator

1. Pick the model. My vote: **SCNet small** — newest, competitive quality,
   smallest bundle. UMX-L is the safer "battle-tested" pick.
2. Bundle: lazy-load via dynamic import so the +80 MB doesn't hit users who
   never click the "use neural separator" toggle.
3. Cache the model with the Cache API so the 80 MB download is one-time per
   browser.
4. Add a UI toggle: "Use neural source separation (downloads 80 MB first
   time)". Default off. Opt-in.
5. Replace the HPSS call in the engine with the registry lookup.
6. Run a side-by-side accuracy comparison on the test tracks (Acura
   Integurl, American Wedding, Notes 2 reference) and document the actual
   uplift before we declare it worth keeping.

## Final word

The honest answer: HPSS + the rest of the v2 pipeline (multi-pass BP, CQT
validation, key-aware Viterbi, audio-onset loop detection, AI POLISH) is
already a meaningful step up from what we had. Adding neural source
separation is a real win but at real cost — better to validate the lighter
changes land first, then iterate based on what the audit panel actually
flags as the remaining gap.

If the test runs show HPSS leaving real notes on the table, we add SCNet.
Until then, the registry pattern keeps the option open without paying the
cost.
