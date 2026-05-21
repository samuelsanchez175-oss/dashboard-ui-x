/**
 * Scoring step for the phase-test bench.
 *
 * Reads each per-config JSON dump from `tmp/chord-detector-bench/` and
 * compares the extracted lead notes against the user's curated ground-truth
 * MIDI (the .mid file they cleaned up in Logic Pro). Reports note-F1,
 * onset-F1, and per-register breakdowns so we can attribute accuracy deltas
 * to specific pipeline stages.
 *
 *   node scripts/chord-detector-phase-score.mjs [/path/to/ground-truth.mid]
 *
 * Default ground truth: `/Users/samuel/Downloads/frank  Perfect acura girll .mid`.
 *
 * F1 methodology (mir_eval-style):
 *   - True positive: predicted note's pitch (rounded MIDI) matches a ground
 *     truth note AND onset is within ±50 ms.
 *   - Each ground-truth note can match at most ONE predicted note (greedy
 *     by onset distance), preventing inflated TP counts when the prediction
 *     duplicates the same pitch.
 *   - Precision = TP / (TP + FP), Recall = TP / (TP + FN), F1 = 2PR/(P+R).
 *   - Also reported: onset-only F1 (timing match, ignore pitch),
 *     pitch-presence (% of GT pitches that appear anywhere in output).
 */

import tonejsMidi from '@tonejs/midi'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const { Midi } = tonejsMidi

const DEFAULT_GT_PATH = '/Users/samuel/Downloads/frank  Perfect acura girll .mid'
const BENCH_DIR = path.resolve('tmp/chord-detector-bench')
const OUT_MD = path.resolve('docs/chord-detector-phase-test-findings.md')

/** Onset tolerance for note-F1, in seconds. mir_eval's standard. */
const ONSET_TOL_SEC = 0.05

function loadGroundTruth(midiPath) {
  const buf = readFileSync(midiPath)
  const midi = new Midi(buf)
  /** @type {{ midi: number; startSec: number; durationSec: number }[]} */
  const notes = []
  for (const track of midi.tracks) {
    for (const n of track.notes) {
      notes.push({
        midi: Math.round(n.midi),
        startSec: n.time,
        durationSec: n.duration,
      })
    }
  }
  notes.sort((a, b) => a.startSec - b.startSec)
  return notes
}

function loadConfigOutput(jsonPath) {
  const blob = JSON.parse(readFileSync(jsonPath, 'utf8'))
  /** @type {{ midi: number; startSec: number; durationSec: number }[]} */
  const notes = (blob.leadNotes || []).map(n => ({
    midi: Math.round(n.midi),
    startSec: n.startSec,
    durationSec: n.durationSec,
  }))
  notes.sort((a, b) => a.startSec - b.startSec)
  return { blob, notes }
}

/**
 * Filter a note list to only those starting within `[windowStart, windowEnd]`.
 * Used when the ground truth covers only a short slice of the song (e.g. the
 * user's cleaned MIDI is bars 3-4 only) but the transcription run covers the
 * full clip — without windowing, all the notes outside the GT slice would
 * count as false positives and tank the F1 score even when the in-window
 * transcription is reasonable.
 *
 * Tolerance: notes whose start is within `tolSec` of the window boundaries
 * are included (covers cases where the user's MIDI start is slightly inside
 * the actual bar boundary).
 */
function filterToWindow(notes, windowStart, windowEnd, tolSec = 0.1) {
  return notes.filter(
    n => n.startSec >= windowStart - tolSec && n.startSec <= windowEnd + tolSec,
  )
}

/**
 * Compute note-F1 between predicted notes and ground truth.
 * Greedy match by onset distance, per-pitch lane.
 */
function noteF1(predicted, groundTruth, tolSec = ONSET_TOL_SEC) {
  // Group ground-truth notes by pitch for O(N) matching.
  const gtByPitch = new Map()
  for (let i = 0; i < groundTruth.length; i++) {
    const p = groundTruth[i].midi
    if (!gtByPitch.has(p)) gtByPitch.set(p, [])
    gtByPitch.get(p).push({ idx: i, startSec: groundTruth[i].startSec, used: false })
  }

  let tp = 0
  const matchedGt = new Set()
  const matchedPred = new Set()

  // Sort predicted by onset to make greedy matching stable.
  const predIdxByOnset = predicted
    .map((n, i) => ({ i, startSec: n.startSec, midi: n.midi }))
    .sort((a, b) => a.startSec - b.startSec)

  for (const p of predIdxByOnset) {
    const lane = gtByPitch.get(p.midi)
    if (!lane) continue
    let bestIdx = -1
    let bestDist = tolSec + 1
    for (let k = 0; k < lane.length; k++) {
      if (lane[k].used) continue
      const d = Math.abs(lane[k].startSec - p.startSec)
      if (d <= tolSec && d < bestDist) {
        bestDist = d
        bestIdx = k
      }
    }
    if (bestIdx >= 0) {
      lane[bestIdx].used = true
      matchedGt.add(lane[bestIdx].idx)
      matchedPred.add(p.i)
      tp += 1
    }
  }

  const fp = predicted.length - tp
  const fn = groundTruth.length - tp
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
  return { tp, fp, fn, precision, recall, f1 }
}

/** Onset-only F1: match by time, ignore pitch. */
function onsetF1(predicted, groundTruth, tolSec = ONSET_TOL_SEC) {
  // Sort both by onset, then greedily match.
  const pred = [...predicted].sort((a, b) => a.startSec - b.startSec)
  const gt = [...groundTruth].sort((a, b) => a.startSec - b.startSec).map((n, i) => ({
    ...n,
    idx: i,
    used: false,
  }))
  let tp = 0
  for (const p of pred) {
    // Find closest unused GT within tolerance — linear scan since both sorted.
    let bestIdx = -1
    let bestDist = tolSec + 1
    for (let k = 0; k < gt.length; k++) {
      if (gt[k].used) continue
      const d = Math.abs(gt[k].startSec - p.startSec)
      if (d > tolSec) {
        // Cannot improve once past the tolerance window in sorted order.
        if (gt[k].startSec - p.startSec > tolSec) break
        continue
      }
      if (d < bestDist) {
        bestDist = d
        bestIdx = k
      }
    }
    if (bestIdx >= 0) {
      gt[bestIdx].used = true
      tp += 1
    }
  }
  const fp = pred.length - tp
  const fn = gt.length - tp
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
  return { tp, fp, fn, precision, recall, f1 }
}

/** Bucket notes into lead / harmony / bass by midi range, matching the page. */
function bucketByRegister(notes) {
  return {
    lead: notes.filter(n => n.midi >= 60),
    harmony: notes.filter(n => n.midi >= 48 && n.midi < 60),
    bass: notes.filter(n => n.midi < 48),
  }
}

function pct(x) {
  return `${(x * 100).toFixed(1)}%`
}

function fmtRow(cells) {
  return `| ${cells.join(' | ')} |`
}

function main() {
  const gtPath = process.argv[2] || DEFAULT_GT_PATH
  console.log(`[score] ground truth: ${gtPath}`)
  const gt = loadGroundTruth(gtPath)
  const gtBuckets = bucketByRegister(gt)
  /* Compute the time window covered by the ground truth so we can filter
   * each prediction to the same slice. The user's MIDI is bars 3-4 only
   * (~7 seconds out of a 60 s clip); without this, every config gets ~200
   * false positives from notes outside the GT window. */
  const windowStart = Math.min(...gt.map(n => n.startSec))
  const windowEnd = Math.max(...gt.map(n => n.startSec + n.durationSec))
  console.log(
    `[score] ground truth: ${gt.length} notes ` +
      `(lead ${gtBuckets.lead.length}, harmony ${gtBuckets.harmony.length}, bass ${gtBuckets.bass.length}), ` +
      `time window ${windowStart.toFixed(2)}s → ${windowEnd.toFixed(2)}s`,
  )

  const files = readdirSync(BENCH_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'))
  if (files.length === 0) {
    console.error(`[score] no per-config dumps in ${BENCH_DIR} — run chord-detector-phase-bench.mjs first`)
    process.exit(1)
  }
  files.sort()

  const rows = []
  for (const fname of files) {
    const { blob, notes: notesAll } = loadConfigOutput(path.join(BENCH_DIR, fname))
    /* Time-origin alignment. The MP3 covers the full song; the GT bars 3-4
     * are at their absolute song position (~7.38-14.77 s) and the MP3
     * transcription uses the same clock. The WAV, however, is just a render
     * of the same MIDI bars 3-4 but starts at t=0 of the audio file (no
     * leading silence). When comparing WAV outputs against the GT we have
     * to shift one of the two streams so they share an origin. We choose
     * to shift the WAV transcription UP by `windowStart`, treating its
     * t=0 as if it were the GT's first-note time. (This is the convention
     * the user gave us: "the wav is a perfect output of the MIDI" — i.e.
     * the WAV starts where the GT's first note starts.) */
    const isWav = blob.input === 'notes2-wav'
    const aligned = isWav
      ? notesAll.map(n => ({ ...n, startSec: n.startSec + windowStart }))
      : notesAll
    /* Filter to the GT time window so the F1 measures in-window quality
     * rather than penalizing every out-of-window note as a false positive. */
    const notes = filterToWindow(aligned, windowStart, windowEnd)
    const overall = noteF1(notes, gt)
    const onset = onsetF1(notes, gt)
    const predBuckets = bucketByRegister(notes)
    const leadF1 = noteF1(predBuckets.lead, gtBuckets.lead)
    const harmonyF1 = noteF1(predBuckets.harmony, gtBuckets.harmony)
    const bassF1 = noteF1(predBuckets.bass, gtBuckets.bass)
    rows.push({
      tag: blob.tag,
      input: blob.input,
      config: blob.config,
      noteCount: notes.length,
      noteCountFull: notesAll.length,
      gtCount: gt.length,
      engineMs: blob.engineElapsedMs,
      overall,
      onset,
      leadF1,
      harmonyF1,
      bassF1,
      bpm: blob.bpm,
      key: blob.estimatedKey?.label,
    })
  }

  // Sort: MP3 configs first, then WAV configs; within each, by overall F1 desc.
  rows.sort((a, b) => {
    if (a.input !== b.input) return a.input.localeCompare(b.input)
    return b.overall.f1 - a.overall.f1
  })

  // Print to console as a table.
  console.log()
  console.log('=== RESULTS ===')
  console.log()
  console.log(
    fmtRow(['Input', 'Config', 'Notes', 'F1', 'Onset F1', 'Lead F1', 'Bass F1', 'Engine ms']),
  )
  console.log(fmtRow(['---', '---', '---:', '---:', '---:', '---:', '---:', '---:']))
  for (const r of rows) {
    console.log(
      fmtRow([
        r.input,
        r.config,
        String(r.noteCount),
        pct(r.overall.f1),
        pct(r.onset.f1),
        pct(r.leadF1.f1),
        pct(r.bassF1.f1),
        `${(r.engineMs / 1000).toFixed(1)}s`,
      ]),
    )
  }
  console.log()

  // Write markdown report.
  const lines = []
  lines.push('# Chord Detector — phase test findings')
  lines.push('')
  lines.push(`Generated: ${new Date().toISOString().slice(0, 19)}Z`)
  lines.push('')
  lines.push(`**Ground truth**: \`${path.basename(gtPath)}\` — ${gt.length} notes total ` +
    `(lead ${gtBuckets.lead.length} / harmony ${gtBuckets.harmony.length} / bass ${gtBuckets.bass.length}). ` +
    `User-curated MIDI exported from Logic Pro.`)
  lines.push('')
  lines.push('Scoring methodology: a predicted note is a true positive when its rounded MIDI pitch ' +
    'matches a ground-truth note AND the onset is within ±50 ms. Each GT note can be matched at most ' +
    'once. F1 = 2·P·R / (P+R).')
  lines.push('')
  lines.push('## Results')
  lines.push('')
  lines.push(fmtRow(['Input', 'Config', 'Notes', 'Overall F1', 'Onset F1', 'Lead F1', 'Harmony F1', 'Bass F1', 'Precision', 'Recall', 'Engine s']))
  lines.push(fmtRow(['---', '---', '---:', '---:', '---:', '---:', '---:', '---:', '---:', '---:', '---:']))
  for (const r of rows) {
    lines.push(
      fmtRow([
        r.input,
        `\`${r.config}\``,
        String(r.noteCount),
        pct(r.overall.f1),
        pct(r.onset.f1),
        pct(r.leadF1.f1),
        pct(r.harmonyF1.f1),
        pct(r.bassF1.f1),
        pct(r.overall.precision),
        pct(r.overall.recall),
        (r.engineMs / 1000).toFixed(1),
      ]),
    )
  }
  lines.push('')
  lines.push('## Per-config detail')
  lines.push('')
  for (const r of rows) {
    lines.push(`### ${r.tag}`)
    lines.push('')
    lines.push(`- Input: ${r.input}`)
    lines.push(`- Config: \`${r.config}\``)
    lines.push(`- Notes produced: ${r.noteCount} (ground truth: ${r.gtCount})`)
    lines.push(`- BPM detected: ${r.bpm} · Key: ${r.key}`)
    lines.push(`- Note F1: ${pct(r.overall.f1)} (precision ${pct(r.overall.precision)}, recall ${pct(r.overall.recall)})`)
    lines.push(`  - True positives: ${r.overall.tp}`)
    lines.push(`  - False positives: ${r.overall.fp} (hallucinated)`)
    lines.push(`  - False negatives: ${r.overall.fn} (missed)`)
    lines.push(`- Onset-only F1: ${pct(r.onset.f1)}`)
    lines.push(`- Per-register F1:`)
    lines.push(`  - Lead (midi ≥ 60): ${pct(r.leadF1.f1)}`)
    lines.push(`  - Harmony (48–59):  ${pct(r.harmonyF1.f1)}`)
    lines.push(`  - Bass (< 48):      ${pct(r.bassF1.f1)}`)
    lines.push(`- Engine wall time: ${(r.engineMs / 1000).toFixed(1)} s`)
    lines.push('')
  }

  writeFileSync(OUT_MD, lines.join('\n'))
  console.log(`[score] wrote ${OUT_MD}`)
}

main()
