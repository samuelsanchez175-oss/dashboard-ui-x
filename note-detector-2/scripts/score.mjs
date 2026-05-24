/**
 * note-detector-2 scoring + head-to-head comparison vs the chord detector.
 *
 * Scores the merged MIDIs produced by `./bench.mjs` against the user's curated
 * ground-truth MIDI, AND re-scores the chord-detector's existing bench dumps
 * with the SAME code, so the two tools are compared apples-to-apples.
 *
 * Usage (run from the REPO ROOT):
 *
 *   node note-detector-2/scripts/bench.mjs    # produces tmp/note-detector-2-bench/*.mid
 *   node note-detector-2/scripts/score.mjs    # this script
 *
 * Output: note-detector-2/docs/accuracy-vs-chord-detector.md
 *
 * The scorer functions in the "verbatim" block below are copied UNCHANGED from
 * `scripts/chord-detector-phase-score.mjs`. Do not "improve" them here without
 * making the identical change there — any divergence invalidates the comparison.
 */

import tonejsMidi from '@tonejs/midi'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const { Midi } = tonejsMidi

const DEFAULT_GT_PATH = '/Users/samuel/Downloads/frank  Perfect acura girll .mid'
const ND2_DIR = path.resolve('tmp/note-detector-2-bench')
const CD_DIR = path.resolve('tmp/chord-detector-bench')
const OUT_MD = path.resolve('note-detector-2/docs/accuracy-vs-chord-detector.md')

/** Onset tolerance for note-F1, in seconds. mir_eval's standard. */
const ONSET_TOL_SEC = 0.05

// ═══════════════════════════════════════════════════════════════════════════
// VERBATIM scorer — copied from scripts/chord-detector-phase-score.mjs.
// Keep byte-identical with that file. See header note above.
// ═══════════════════════════════════════════════════════════════════════════

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

/**
 * Filter a note list to only those starting within `[windowStart, windowEnd]`.
 * The ground truth covers only a short slice of the song (bars 3-4); without
 * windowing every note outside that slice counts as a false positive.
 */
function filterToWindow(notes, windowStart, windowEnd, tolSec = 0.1) {
  return notes.filter(
    (n) => n.startSec >= windowStart - tolSec && n.startSec <= windowEnd + tolSec,
  )
}

/**
 * Compute note-F1 between predicted notes and ground truth.
 * Greedy match by onset distance, per-pitch lane.
 */
function noteF1(predicted, groundTruth, tolSec = ONSET_TOL_SEC) {
  const gtByPitch = new Map()
  for (let i = 0; i < groundTruth.length; i++) {
    const p = groundTruth[i].midi
    if (!gtByPitch.has(p)) gtByPitch.set(p, [])
    gtByPitch.get(p).push({ idx: i, startSec: groundTruth[i].startSec, used: false })
  }

  let tp = 0
  const matchedGt = new Set()
  const matchedPred = new Set()

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
  const pred = [...predicted].sort((a, b) => a.startSec - b.startSec)
  const gt = [...groundTruth]
    .sort((a, b) => a.startSec - b.startSec)
    .map((n, i) => ({ ...n, idx: i, used: false }))
  let tp = 0
  for (const p of pred) {
    let bestIdx = -1
    let bestDist = tolSec + 1
    for (let k = 0; k < gt.length; k++) {
      if (gt[k].used) continue
      const d = Math.abs(gt[k].startSec - p.startSec)
      if (d > tolSec) {
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
    lead: notes.filter((n) => n.midi >= 60),
    harmony: notes.filter((n) => n.midi >= 48 && n.midi < 60),
    bass: notes.filter((n) => n.midi < 48),
  }
}

function pct(x) {
  return `${(x * 100).toFixed(1)}%`
}

function fmtRow(cells) {
  return `| ${cells.join(' | ')} |`
}

// ═══════════════════════════════════════════════════════════════════════════
// note-detector-2 specific loaders + driver
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse a note-detector-2 merged MIDI into a flat melodic note list.
 *
 * The drums track is dropped: the ground truth is pitched melodic content
 * (lead/harmony/bass), so unpitched drum hits could only ever be false
 * positives — keeping them would measure nothing useful and tank precision.
 */
function loadMergedMidi(midiPath) {
  const midi = new Midi(readFileSync(midiPath))
  const notes = []
  let droppedDrumTracks = 0
  let totalTracks = 0
  for (const track of midi.tracks) {
    if (track.notes.length === 0) continue
    totalTracks += 1
    const isDrum =
      track.instrument?.percussion === true ||
      /drum/i.test(track.name || '') ||
      track.channel === 9
    if (isDrum) {
      droppedDrumTracks += 1
      continue
    }
    for (const n of track.notes) {
      notes.push({
        midi: Math.round(n.midi),
        startSec: n.time,
        durationSec: n.duration,
      })
    }
  }
  notes.sort((a, b) => a.startSec - b.startSec)
  return { notes, droppedDrumTracks, totalTracks }
}

/** Load a chord-detector per-config JSON dump (lead notes only). */
function loadChordDetectorOutput(jsonPath) {
  const blob = JSON.parse(readFileSync(jsonPath, 'utf8'))
  const notes = (blob.leadNotes || []).map((n) => ({
    midi: Math.round(n.midi),
    startSec: n.startSec,
    durationSec: n.durationSec,
  }))
  notes.sort((a, b) => a.startSec - b.startSec)
  return { blob, notes }
}

/**
 * Score one raw note list against the GT, applying the same time-origin
 * alignment + window filtering the chord-detector scorer uses:
 *  - `notes2-wav` is a render of bars 3-4 starting at t=0, so its transcription
 *    is shifted UP by `windowStart` to share an origin with the GT.
 *  - the MP3 keeps absolute song timing — no shift.
 */
function scoreNotes(rawNotes, inputLabel, ctx) {
  const { gt, gtBuckets, windowStart, windowEnd } = ctx
  const isWav = inputLabel === 'notes2-wav' || inputLabel === 'notes-wav'
  const aligned = isWav
    ? rawNotes.map((n) => ({ ...n, startSec: n.startSec + windowStart }))
    : rawNotes
  const notes = filterToWindow(aligned, windowStart, windowEnd)
  const b = bucketByRegister(notes)
  return {
    noteCount: notes.length,
    noteCountFull: rawNotes.length,
    overall: noteF1(notes, gt),
    onset: onsetF1(notes, gt),
    leadF1: noteF1(b.lead, gtBuckets.lead),
    harmonyF1: noteF1(b.harmony, gtBuckets.harmony),
    bassF1: noteF1(b.bass, gtBuckets.bass),
  }
}

function detailLines(label, toolName, s) {
  return [
    `### ${label} — ${toolName}`,
    '',
    `- Notes scored (in GT window): ${s.noteCount} (raw output: ${s.noteCountFull})`,
    `- Note F1: ${pct(s.overall.f1)} (precision ${pct(s.overall.precision)}, recall ${pct(s.overall.recall)})`,
    `  - True positives: ${s.overall.tp}`,
    `  - False positives: ${s.overall.fp} (hallucinated)`,
    `  - False negatives: ${s.overall.fn} (missed)`,
    `- Onset-only F1: ${pct(s.onset.f1)}`,
    `- Per-register F1: lead ${pct(s.leadF1.f1)} · harmony ${pct(s.harmonyF1.f1)} · bass ${pct(s.bassF1.f1)}`,
    '',
  ]
}

function main() {
  const gtPath = process.argv[2] || DEFAULT_GT_PATH
  console.log(`[score] ground truth: ${gtPath}`)
  const gt = loadGroundTruth(gtPath)
  const gtBuckets = bucketByRegister(gt)
  const windowStart = Math.min(...gt.map((n) => n.startSec))
  const windowEnd = Math.max(...gt.map((n) => n.startSec + n.durationSec))
  const ctx = { gt, gtBuckets, windowStart, windowEnd }
  console.log(
    `[score] GT: ${gt.length} notes (lead ${gtBuckets.lead.length}, ` +
      `harmony ${gtBuckets.harmony.length}, bass ${gtBuckets.bass.length}), ` +
      `window ${windowStart.toFixed(2)}s -> ${windowEnd.toFixed(2)}s`,
  )

  // --- note-detector-2 results -----------------------------------------------
  if (!existsSync(ND2_DIR)) {
    console.error(`[score] ${ND2_DIR} missing — run \`node note-detector-2/scripts/bench.mjs\` first`)
    process.exit(1)
  }
  const nd2Files = readdirSync(ND2_DIR).filter((f) => f.endsWith('.mid'))
  if (nd2Files.length === 0) {
    console.error(`[score] no .mid files in ${ND2_DIR} — run bench.mjs first`)
    process.exit(1)
  }
  /** @type {Record<string, any>} */
  const nd2 = {}
  for (const f of nd2Files.sort()) {
    const label = f.replace(/\.mid$/, '')
    const { notes, droppedDrumTracks, totalTracks } = loadMergedMidi(path.join(ND2_DIR, f))
    nd2[label] = { ...scoreNotes(notes, label, ctx), droppedDrumTracks, totalTracks }
    console.log(
      `[score] note-detector-2 ${label}: F1 ${pct(nd2[label].overall.f1)} ` +
        `(${totalTracks} tracks, ${droppedDrumTracks} drum track(s) dropped)`,
    )
  }

  // --- chord-detector baseline (best config per input) -----------------------
  /** @type {Record<string, { config: string; score: any }>} */
  const cdBest = {}
  if (existsSync(CD_DIR)) {
    const cdFiles = readdirSync(CD_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    for (const f of cdFiles.sort()) {
      const { blob, notes } = loadChordDetectorOutput(path.join(CD_DIR, f))
      const label = blob.input
      if (!(label in nd2)) continue // only compare inputs note-detector-2 ran
      const s = scoreNotes(notes, label, ctx)
      if (!cdBest[label] || s.overall.f1 > cdBest[label].score.overall.f1) {
        cdBest[label] = { config: blob.config, score: s }
      }
    }
    for (const [label, b] of Object.entries(cdBest)) {
      console.log(`[score] chord-detector ${label}: best F1 ${pct(b.score.overall.f1)} (config \`${b.config}\`)`)
    }
  } else {
    console.warn(`[score] ${CD_DIR} missing — comparison column will be blank`)
  }

  // --- build markdown report -------------------------------------------------
  const lines = []
  lines.push('# Note Detector 2 — accuracy vs Chord Detector')
  lines.push('')
  lines.push(`Generated: ${new Date().toISOString().slice(0, 19)}Z`)
  lines.push('')
  lines.push(
    `**Ground truth**: \`${path.basename(gtPath)}\` — ${gt.length} notes ` +
      `(lead ${gtBuckets.lead.length} / harmony ${gtBuckets.harmony.length} / bass ${gtBuckets.bass.length}).`,
  )
  lines.push('')
  lines.push(
    '**Scoring**: identical ±50 ms onset / rounded-pitch-match F1 as the chord-detector ' +
      'bench — the scorer functions are copied verbatim from ' +
      '`scripts/chord-detector-phase-score.mjs`. Both tools scored by the same code in the same run.',
  )
  lines.push('')
  lines.push('## Caveats — read before trusting the numbers')
  lines.push('')
  lines.push(
    '- note-detector-2 accepts **audio only**; the chord-detector\'s `frank-mid` ' +
      'MIDI-passthrough row has no equivalent and is omitted.',
  )
  lines.push(
    '- note-detector-2\'s merged MIDI is multi-track; the **drums track is excluded** ' +
      'from scoring (the GT is pitched melodic content — drum hits would only be false positives).',
  )
  lines.push(
    `- \`notes2-wav\` predictions are shifted +${windowStart.toFixed(2)}s to share a time ` +
      'origin with the GT, same convention as the chord-detector bench.',
  )
  lines.push(
    '- The chord-detector column is its **best config** per input (highest overall F1 ' +
      'across all 13 configs in `tmp/chord-detector-bench/`).',
  )
  lines.push('')
  lines.push('## Comparison')
  lines.push('')
  lines.push(
    fmtRow([
      'Input', 'Tool', 'Notes', 'Overall F1', 'Onset F1',
      'Lead F1', 'Harmony F1', 'Bass F1', 'Precision', 'Recall',
    ]),
  )
  lines.push(fmtRow(['---', '---', '---:', '---:', '---:', '---:', '---:', '---:', '---:', '---:']))
  for (const label of Object.keys(nd2).sort()) {
    const n = nd2[label]
    lines.push(
      fmtRow([
        label, 'note-detector-2', String(n.noteCount),
        pct(n.overall.f1), pct(n.onset.f1),
        pct(n.leadF1.f1), pct(n.harmonyF1.f1), pct(n.bassF1.f1),
        pct(n.overall.precision), pct(n.overall.recall),
      ]),
    )
    const c = cdBest[label]
    if (c) {
      lines.push(
        fmtRow([
          label, `chord-detector (\`${c.config}\`)`, String(c.score.noteCount),
          pct(c.score.overall.f1), pct(c.score.onset.f1),
          pct(c.score.leadF1.f1), pct(c.score.harmonyF1.f1), pct(c.score.bassF1.f1),
          pct(c.score.overall.precision), pct(c.score.overall.recall),
        ]),
      )
    } else {
      lines.push(fmtRow([label, 'chord-detector', '—', '—', '—', '—', '—', '—', '—', '—']))
    }
  }
  lines.push('')

  // --- verdict ---------------------------------------------------------------
  lines.push('## Verdict')
  lines.push('')
  for (const label of Object.keys(nd2).sort()) {
    const n = nd2[label]
    const c = cdBest[label]
    if (!c) {
      lines.push(`- **${label}**: note-detector-2 F1 ${pct(n.overall.f1)} — no chord-detector dump to compare.`)
      continue
    }
    const delta = n.overall.f1 - c.score.overall.f1
    const winner =
      Math.abs(delta) < 0.01
        ? 'tie'
        : delta > 0
          ? 'note-detector-2 wins'
          : 'chord-detector wins'
    lines.push(
      `- **${label}**: note-detector-2 ${pct(n.overall.f1)} vs ` +
        `chord-detector ${pct(c.score.overall.f1)} (\`${c.config}\`) — ` +
        `**${winner}**, Δ ${(delta * 100).toFixed(1)} pts.`,
    )
  }
  lines.push('')

  // --- per-input detail ------------------------------------------------------
  lines.push('## Per-input detail')
  lines.push('')
  for (const label of Object.keys(nd2).sort()) {
    const n = nd2[label]
    lines.push(...detailLines(label, 'note-detector-2', n))
    lines.push(
      `- Tracks in merged MIDI: ${n.totalTracks}; drum track(s) dropped: ${n.droppedDrumTracks}.`,
      '',
    )
    const c = cdBest[label]
    if (c) lines.push(...detailLines(label, `chord-detector (\`${c.config}\`)`, c.score))
  }

  mkdirSync(path.dirname(OUT_MD), { recursive: true })
  writeFileSync(OUT_MD, lines.join('\n'))
  console.log(`[score] wrote ${OUT_MD}`)
}

main()
