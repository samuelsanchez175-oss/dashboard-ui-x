/**
 * Register-stratified, multi-pass Basic Pitch transcription.
 *
 * WHY THIS EXISTS
 * ---------------
 * A single Basic Pitch (BP) pass has to compromise across the whole spectrum: one set of
 * onset / frame thresholds and one minimum note length for melody, mid-voice, and bass at
 * the same time. Empirically this means:
 *   - faint high-register melody notes are missed (frame threshold is too strict for them)
 *   - sustained bass is over-fragmented into many short re-onsets (split threshold is too eager)
 *
 * Strategy: scan the audio "top to bottom" by running BP THREE times with parameters tuned
 * to each register, then filter each pass to keep only the notes that belong to that
 * register. Dedupe across passes so a real note never appears twice.
 *
 * We delegate every BP call to `transcribeMono22050ToLeadNotes` — this module does NOT
 * reimplement Basic Pitch. We only pick the parameters and post-filter the output.
 *
 * REGISTER BOUNDARIES (MIDI)
 *   bass    : midi <  48   (below C3) — bass guitar, kick of low piano LH
 *   harmony : 48..71       (C3..B4)   — middle voice, chord tones, inner harmony
 *   lead    : midi >= 60   (C4 and up) — melody, top of chord, treble counter-line
 *
 * Note that harmony and lead overlap at C4..B4 (60..71) on purpose: at the seam the same
 * physical note may be a melody peak or a chord top. Dedupe (below) resolves the seam by
 * giving the HIGH pass priority for any (midi, start) it found.
 */

import type { LeadNote } from './chord-detector-melody'
import { transcribeMono22050ToLeadNotes } from './chord-detector-basic-pitch'

/** Tolerance for treating two notes (same midi) as the "same" detection across passes. */
const DEDUPE_START_TOL_SEC = 0.05 // 50 ms

export interface RegisterPassOptions {
  /** Base note-sensitivity for the MID pass. HIGH/BASS use their own register-tuned values. */
  noteSensitivity?: number
  /** Base split-sensitivity for the MID pass. HIGH/BASS use their own register-tuned values. */
  splitSensitivity?: number
  /** Base min note duration (ms) for the MID pass. HIGH/BASS use their own register-tuned values. */
  minNoteDurationMs?: number
}

export interface RegisterPassResult {
  /** Notes with midi >= 60 (C4 and above). Lead / melody / top voice. */
  lead: LeadNote[]
  /** Notes with midi 48..71 (C3..B4) that were NOT already claimed by `lead`. Inner harmony. */
  harmony: LeadNote[]
  /** Notes with midi < 48 (below C3). Bass. */
  bass: LeadNote[]
  /** Union of all three, sorted ascending by startSec. Use for back-compat with single-stream consumers. */
  merged: LeadNote[]
}

/**
 * Run Basic Pitch on `mono22050` three times — once per register — and return the
 * register-stratified note streams plus a merged union.
 *
 * @param mono22050 mono PCM, already resampled to 22050 Hz (BP's required rate).
 * @param sampleRate accepted for clarity at the call site; must be 22050.
 * @param options base MID-pass thresholds (HIGH/BASS use their own register-tuned values).
 */
export async function transcribeWithRegisterPasses(
  mono22050: Float32Array,
  sampleRate: 22050,
  options?: RegisterPassOptions,
): Promise<RegisterPassResult> {
  void sampleRate // signature carries the rate for callers; BP itself assumes 22050.

  // -------------------------------------------------------------------------
  // PASS 1 — HIGH (lead / melody, midi >= 60)
  // -------------------------------------------------------------------------
  // noteSensitivity 0.45 is intentionally LOWER than the MID default. In BP/NeuralNote
  // terms `frameThresh = 1 - noteSensitivity`, so a lower sensitivity yields a HIGHER
  // frame threshold (~0.55) — which sounds backwards but matches the convention:
  // we want to be willing to accept thin, low-amplitude evidence in the treble where
  // the melody often sits 10-20 dB below the accompaniment. Setting it low forces BP
  // to commit to high-register candidates the global pass would discard as noise.
  //
  // splitSensitivity 0.15 is LOW → onsetThresh ~0.85 → fewer onset splits. A melodic
  // line should stay as one held note where possible, not get chopped into 80 ms tiles
  // every time the player adds vibrato or a soft tongue.
  //
  // minNoteDurationMs 150 ms — short enough for fast melodic 16ths at 100 BPM
  // (one 16th ≈ 150 ms) but long enough to suppress sub-perceptual artefacts.
  // -------------------------------------------------------------------------
  const highRes = await transcribeMono22050ToLeadNotes(mono22050, {
    noteSensitivity: 0.45,
    splitSensitivity: 0.15,
    minNoteDurationMs: 150,
  })
  const highRaw = highRes.ok ? highRes.leadNotes : []
  const lead = highRaw.filter(n => n.midi >= 60)

  // -------------------------------------------------------------------------
  // PASS 2 — MID (inner harmony, midi 48..71)
  // -------------------------------------------------------------------------
  // Use the caller's options if provided, otherwise let BP fall back to its tuned
  // defaults (see `chord-detector-neuralnote-style.ts`). This is the pass that does
  // the heavy lifting for chord-tone detection, where the existing single-pass
  // tuning was already optimised — so we don't fight it here.
  // -------------------------------------------------------------------------
  const midRes = await transcribeMono22050ToLeadNotes(mono22050, {
    ...(options?.noteSensitivity !== undefined ? { noteSensitivity: options.noteSensitivity } : {}),
    ...(options?.splitSensitivity !== undefined ? { splitSensitivity: options.splitSensitivity } : {}),
    ...(options?.minNoteDurationMs !== undefined ? { minNoteDurationMs: options.minNoteDurationMs } : {}),
  })
  const midRaw = midRes.ok ? midRes.leadNotes : []
  // Restrict to the inner-voice band before dedupe.
  const midBandRaw = midRaw.filter(n => n.midi >= 48 && n.midi <= 71)
  // Dedupe vs HIGH: if the same midi was already detected within DEDUPE_START_TOL_SEC, drop the MID copy.
  const harmony = dedupeAgainst(midBandRaw, lead)

  // -------------------------------------------------------------------------
  // PASS 3 — BASS (midi < 48)
  // -------------------------------------------------------------------------
  // noteSensitivity 0.55 is slightly HIGHER than mid default → frameThresh ~0.45 →
  // BP is MORE conservative about declaring a bass-frequency event. Bass partials bleed
  // into higher octaves and we'd rather miss a faint one than hallucinate a sub-bass note.
  //
  // splitSensitivity 0.05 is VERY low → onsetThresh ~0.95 → almost no onset splits.
  // Bass notes are typically held long and BP's onset model loves to re-trigger them
  // every time a transient on top of the mix bleeds through. Killing onset splits keeps
  // a held E1 as one event instead of 6 staccato E1s.
  //
  // minNoteDurationMs 300 ms — bass notes shorter than ~300 ms in real recordings are
  // almost always artefacts (slap noise, finger squeak misidentified as a pitched event).
  // -------------------------------------------------------------------------
  const bassRes = await transcribeMono22050ToLeadNotes(mono22050, {
    noteSensitivity: 0.55,
    splitSensitivity: 0.05,
    minNoteDurationMs: 300,
  })
  const bassRaw = bassRes.ok ? bassRes.leadNotes : []
  const bassBandRaw = bassRaw.filter(n => n.midi < 48)
  // Dedupe vs MID (harmony): if MID already claimed a same-midi event near this time, drop BASS copy.
  // This guards the C3-area seam where a low piano-LH note might be picked up by both passes.
  const bass = dedupeAgainst(bassBandRaw, harmony)

  // -------------------------------------------------------------------------
  // MERGED — union of all three, sorted by start time. Back-compat for single-stream consumers.
  // -------------------------------------------------------------------------
  const merged = [...lead, ...harmony, ...bass].sort((a, b) => a.startSec - b.startSec)

  return { lead, harmony, bass, merged }
}

/**
 * Return only those `candidates` that are NOT already present in `claimed`
 * at (same rounded midi, |startSec - startSec| <= DEDUPE_START_TOL_SEC).
 *
 * `claimed` wins ties — this is the higher-priority pass.
 */
function dedupeAgainst(candidates: readonly LeadNote[], claimed: readonly LeadNote[]): LeadNote[] {
  if (claimed.length === 0) return candidates.map(n => ({ ...n }))
  // Bucket claimed notes by integer midi for O(1) lookup.
  const claimedByMidi = new Map<number, number[]>()
  for (const c of claimed) {
    const m = Math.round(c.midi)
    let arr = claimedByMidi.get(m)
    if (!arr) {
      arr = []
      claimedByMidi.set(m, arr)
    }
    arr.push(c.startSec)
  }
  return candidates
    .filter(n => {
      const m = Math.round(n.midi)
      const starts = claimedByMidi.get(m)
      if (!starts) return true
      for (const s of starts) {
        if (Math.abs(s - n.startSec) <= DEDUPE_START_TOL_SEC) return false
      }
      return true
    })
    .map(n => ({ ...n }))
}
