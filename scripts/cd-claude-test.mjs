/**
 * Chord-detector "is it working better?" test, by Claude.
 *
 * Runs the same ±50 ms onset / pitch-match F1 scorer the existing
 * chord-detector bench uses (copied verbatim) against THREE sets of dumps:
 *
 *   1. NEW chord-detector run        tmp/chord-detector-bench/
 *      (this session's bench output — full config only)
 *   2. BASELINE chord-detector run   tmp/chord-detector-bench-baseline-2026-05-21/
 *      (the May-21 sweep, 13 configs × 3 inputs)
 *   3. note-detector-2 merged MIDIs  tmp/note-detector-2-bench/
 *      (bonus context — Demucs + basic-pitch pipeline)
 *
 * Emits:
 *   tmp/chord-detector-test-claude.html   — tables for Drive
 *   tmp/chord-detector-test-claude.md     — same content as markdown
 *   tmp/chord-detector-test-claude.json   — raw data for re-rendering
 *
 * Usage (from repo root):
 *   node scripts/cd-claude-test.mjs
 *
 * Safe to re-run before the chord-detector bench finishes — it just reports
 * "no data" for that pipeline and still scores the other two.
 */

import tonejsMidi from '@tonejs/midi'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const { Midi } = tonejsMidi

const GT_PATH = '/Users/samuel/Downloads/frank  Perfect acura girll .mid'
const NEW_CD_DIR = path.resolve('tmp/chord-detector-bench')
const OLD_CD_DIR = path.resolve('tmp/chord-detector-bench-baseline-2026-05-21')
const ND2_DIR = path.resolve('tmp/note-detector-2-bench')
const OUT_HTML = path.resolve('tmp/chord-detector-test-claude.html')
const OUT_MD = path.resolve('tmp/chord-detector-test-claude.md')
const OUT_JSON = path.resolve('tmp/chord-detector-test-claude.json')

const ONSET_TOL_SEC = 0.05

// ═══════════════════════════════════════════════════════════════════════════
// VERBATIM scorer — copied from scripts/chord-detector-phase-score.mjs.
// ═══════════════════════════════════════════════════════════════════════════

function loadGroundTruth(midiPath) {
  const midi = new Midi(readFileSync(midiPath))
  const notes = []
  for (const t of midi.tracks) for (const n of t.notes) notes.push({
    midi: Math.round(n.midi), startSec: n.time, durationSec: n.duration,
  })
  notes.sort((a, b) => a.startSec - b.startSec)
  return notes
}

function filterToWindow(notes, ws, we, tol = 0.1) {
  return notes.filter(n => n.startSec >= ws - tol && n.startSec <= we + tol)
}

function noteF1(predicted, groundTruth, tolSec = ONSET_TOL_SEC) {
  const gtByPitch = new Map()
  for (let i = 0; i < groundTruth.length; i++) {
    const p = groundTruth[i].midi
    if (!gtByPitch.has(p)) gtByPitch.set(p, [])
    gtByPitch.get(p).push({ idx: i, startSec: groundTruth[i].startSec, used: false })
  }
  let tp = 0
  const predIdx = predicted.map((n, i) => ({ i, startSec: n.startSec, midi: n.midi }))
    .sort((a, b) => a.startSec - b.startSec)
  for (const p of predIdx) {
    const lane = gtByPitch.get(p.midi)
    if (!lane) continue
    let bestIdx = -1, bestDist = tolSec + 1
    for (let k = 0; k < lane.length; k++) {
      if (lane[k].used) continue
      const d = Math.abs(lane[k].startSec - p.startSec)
      if (d <= tolSec && d < bestDist) { bestDist = d; bestIdx = k }
    }
    if (bestIdx >= 0) { lane[bestIdx].used = true; tp++ }
  }
  const fp = predicted.length - tp
  const fn = groundTruth.length - tp
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0
  return { tp, fp, fn, precision, recall, f1 }
}

function onsetF1(predicted, groundTruth, tolSec = ONSET_TOL_SEC) {
  const pred = [...predicted].sort((a, b) => a.startSec - b.startSec)
  const gt = [...groundTruth].sort((a, b) => a.startSec - b.startSec)
    .map((n, i) => ({ ...n, idx: i, used: false }))
  let tp = 0
  for (const p of pred) {
    let bestIdx = -1, bestDist = tolSec + 1
    for (let k = 0; k < gt.length; k++) {
      if (gt[k].used) continue
      const d = Math.abs(gt[k].startSec - p.startSec)
      if (d > tolSec) { if (gt[k].startSec - p.startSec > tolSec) break; continue }
      if (d < bestDist) { bestDist = d; bestIdx = k }
    }
    if (bestIdx >= 0) { gt[bestIdx].used = true; tp++ }
  }
  const fp = pred.length - tp, fn = gt.length - tp
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0
  return { tp, fp, fn, precision, recall, f1 }
}

function bucketByRegister(notes) {
  return {
    lead: notes.filter(n => n.midi >= 60),
    harmony: notes.filter(n => n.midi >= 48 && n.midi < 60),
    bass: notes.filter(n => n.midi < 48),
  }
}

const pct = x => `${(x * 100).toFixed(1)}%`

// ═══════════════════════════════════════════════════════════════════════════
// Loaders
// ═══════════════════════════════════════════════════════════════════════════

function loadChordDetectorJson(p) {
  const blob = JSON.parse(readFileSync(p, 'utf8'))
  const notes = (blob.leadNotes || []).map(n => ({
    midi: Math.round(n.midi),
    startSec: n.startSec,
    durationSec: n.durationSec,
  })).sort((a, b) => a.startSec - b.startSec)
  return { blob, notes }
}

function loadMergedMidi(p) {
  const midi = new Midi(readFileSync(p))
  const notes = []
  for (const t of midi.tracks) {
    if (t.notes.length === 0) continue
    const isDrum = t.instrument?.percussion === true || /drum/i.test(t.name || '') || t.channel === 9
    if (isDrum) continue
    for (const n of t.notes) notes.push({
      midi: Math.round(n.midi), startSec: n.time, durationSec: n.duration,
    })
  }
  notes.sort((a, b) => a.startSec - b.startSec)
  return notes
}

function scoreOne(rawNotes, inputLabel, ctx) {
  const { gt, gtBuckets, windowStart, windowEnd } = ctx
  const isWav = inputLabel === 'notes2-wav'
  const aligned = isWav
    ? rawNotes.map(n => ({ ...n, startSec: n.startSec + windowStart }))
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

// ═══════════════════════════════════════════════════════════════════════════
// Per-pipeline scoring
// ═══════════════════════════════════════════════════════════════════════════

/** Score every chord-detector JSON dump in a dir, keyed by `${input}__${config}`. */
function scoreChordDetectorDir(dir, ctx) {
  const out = {} // tag -> { input, config, score, engineMs }
  if (!existsSync(dir)) return out
  const files = readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_'))
  for (const f of files) {
    const { blob, notes } = loadChordDetectorJson(path.join(dir, f))
    const s = scoreOne(notes, blob.input, ctx)
    out[blob.tag] = {
      input: blob.input,
      config: blob.config,
      score: s,
      engineMs: blob.engineElapsedMs,
    }
  }
  return out
}

function scoreNd2(dir, ctx) {
  const out = {}
  if (!existsSync(dir)) return out
  for (const f of readdirSync(dir).filter(f => f.endsWith('.mid'))) {
    const label = f.replace(/\.mid$/, '')
    const notes = loadMergedMidi(path.join(dir, f))
    out[label] = { score: scoreOne(notes, label, ctx) }
  }
  return out
}

// ═══════════════════════════════════════════════════════════════════════════
// Reporting — markdown + HTML with real <table> tags so Drive renders cleanly
// ═══════════════════════════════════════════════════════════════════════════

function bestPerInputForConfig(scoredCd, config) {
  // Pick the row with config === <config> for each input.
  const byInput = {}
  for (const tag of Object.keys(scoredCd)) {
    const r = scoredCd[tag]
    if (r.config !== config) continue
    byInput[r.input] = r
  }
  return byInput
}

function bestPerInputAllConfigs(scoredCd) {
  // Best-F1 across all configs for each input — used for the BASELINE column.
  const byInput = {}
  for (const tag of Object.keys(scoredCd)) {
    const r = scoredCd[tag]
    if (!byInput[r.input] || r.score.overall.f1 > byInput[r.input].score.overall.f1) {
      byInput[r.input] = r
    }
  }
  return byInput
}

function tdNum(s) {
  if (s === '—' || s == null) return '<td style="text-align:right">—</td>'
  return `<td style="text-align:right">${s}</td>`
}

function htmlReport(payload) {
  const { gt, gtBuckets, windowStart, windowEnd, generatedAt, inputs, perInput } = payload

  const css = `
    body { font-family: -apple-system, system-ui, sans-serif; max-width: 1100px; margin: 24px auto; padding: 0 16px; color: #1a1a1a; }
    h1 { border-bottom: 2px solid #1a1a1a; padding-bottom: 6px; }
    h2 { margin-top: 32px; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 14px; }
    th, td { border: 1px solid #ccc; padding: 6px 10px; }
    th { background: #f0f0f0; text-align: left; }
    td.right, th.right { text-align: right; }
    .delta-up   { color: #0a6c2f; font-weight: 600; }
    .delta-down { color: #b00020; font-weight: 600; }
    .delta-zero { color: #555; }
    .small { color: #555; font-size: 13px; }
    code { background: #f4f4f4; padding: 1px 4px; border-radius: 3px; }
  `

  const deltaCell = (newF1, oldF1) => {
    if (newF1 == null || oldF1 == null) return '<td class="right delta-zero">—</td>'
    const d = (newF1 - oldF1) * 100
    const cls = Math.abs(d) < 0.05 ? 'delta-zero' : d > 0 ? 'delta-up' : 'delta-down'
    const sign = d > 0 ? '+' : ''
    return `<td class="right ${cls}">${sign}${d.toFixed(1)} pts</td>`
  }

  const parts = []
  parts.push(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Chord Detector — test by Claude</title><style>${css}</style></head><body>`)
  parts.push(`<h1>Chord Detector — &quot;is it working better?&quot; test by Claude</h1>`)
  parts.push(`<p class="small">Generated ${generatedAt} · Ground truth: <code>${path.basename(GT_PATH)}</code> · ${gt.length} notes (lead ${gtBuckets.lead.length} / harmony ${gtBuckets.harmony.length} / bass ${gtBuckets.bass.length}) · Window ${windowStart.toFixed(2)}s → ${windowEnd.toFixed(2)}s</p>`)

  parts.push(`<h2>1. Methodology</h2>`)
  parts.push(`<ul>
    <li>Scorer functions are <strong>copied verbatim</strong> from <code>scripts/chord-detector-phase-score.mjs</code> — ±50 ms onset / rounded-pitch-match F1, greedy per-pitch matching, GT-window filtering, WAV time-origin shift.</li>
    <li><strong>NEW chord-detector</strong> ran <em>this session</em>, <code>full</code> config only (the lean default).</li>
    <li><strong>BASELINE chord-detector</strong> = the May-21 sweep (13 configs × 3 inputs). The <em>best F1 per input across all 13 configs</em> is the comparison anchor — the toughest baseline to beat.</li>
    <li><strong>note-detector-2</strong> is the new Demucs + basic-pitch pipeline (separate project, included as context). Drums track excluded from scoring (basic-pitch is pitched-note only).</li>
    <li><code>frank-mid</code> is the GT MIDI fed through the engine — it's the upper-bound sanity check.</li>
  </ul>`)

  // -------- Table 1: NEW vs BASELINE-best-config -------------------------
  parts.push(`<h2>2. NEW chord-detector vs BASELINE — Overall F1</h2>`)
  parts.push(`<table>
    <thead><tr>
      <th>Input</th>
      <th class="right">NEW (full) F1</th>
      <th class="right">BASELINE best F1</th>
      <th>Best baseline config</th>
      <th class="right">Δ</th>
      <th class="right">NEW notes</th>
      <th class="right">NEW engine s</th>
      <th class="right">BASELINE engine s</th>
    </tr></thead><tbody>`)
  for (const inp of inputs) {
    const row = perInput[inp]
    const nf = row.newCd?.score.overall.f1
    const of = row.oldCdBest?.score.overall.f1
    parts.push(`<tr>
      <td><code>${inp}</code></td>
      ${tdNum(nf != null ? pct(nf) : '—')}
      ${tdNum(of != null ? pct(of) : '—')}
      <td>${row.oldCdBest ? `<code>${row.oldCdBest.config}</code>` : '—'}</td>
      ${deltaCell(nf, of)}
      ${tdNum(row.newCd ? row.newCd.score.noteCount : '—')}
      ${tdNum(row.newCd ? (row.newCd.engineMs / 1000).toFixed(1) : '—')}
      ${tdNum(row.oldCdBest ? (row.oldCdBest.engineMs / 1000).toFixed(1) : '—')}
    </tr>`)
  }
  parts.push(`</tbody></table>`)

  // -------- Table 2: NEW vs BASELINE same-config (full vs full) ----------
  parts.push(`<h2>3. NEW vs BASELINE — same config (<code>full</code>)</h2>`)
  parts.push(`<p class="small">Apples-to-apples: same config in both runs, isolating any code drift in the lean default pipeline.</p>`)
  parts.push(`<table>
    <thead><tr>
      <th>Input</th>
      <th class="right">NEW <code>full</code> F1</th>
      <th class="right">BASELINE <code>full</code> F1</th>
      <th class="right">Δ</th>
      <th class="right">NEW onset F1</th>
      <th class="right">BASELINE onset F1</th>
    </tr></thead><tbody>`)
  for (const inp of inputs) {
    const row = perInput[inp]
    const nf = row.newCd?.score.overall.f1
    const of = row.oldCdFull?.score.overall.f1
    const noOn = row.newCd?.score.onset.f1
    const ooOn = row.oldCdFull?.score.onset.f1
    parts.push(`<tr>
      <td><code>${inp}</code></td>
      ${tdNum(nf != null ? pct(nf) : '—')}
      ${tdNum(of != null ? pct(of) : '—')}
      ${deltaCell(nf, of)}
      ${tdNum(noOn != null ? pct(noOn) : '—')}
      ${tdNum(ooOn != null ? pct(ooOn) : '—')}
    </tr>`)
  }
  parts.push(`</tbody></table>`)

  // -------- Table 3: Per-register F1 (NEW) -------------------------------
  parts.push(`<h2>4. NEW chord-detector — per-register F1</h2>`)
  parts.push(`<table>
    <thead><tr>
      <th>Input</th>
      <th class="right">Lead (MIDI ≥ 60)</th>
      <th class="right">Harmony (48–59)</th>
      <th class="right">Bass (&lt; 48)</th>
      <th class="right">Precision</th>
      <th class="right">Recall</th>
    </tr></thead><tbody>`)
  for (const inp of inputs) {
    const row = perInput[inp]
    const s = row.newCd?.score
    parts.push(`<tr>
      <td><code>${inp}</code></td>
      ${tdNum(s ? pct(s.leadF1.f1) : '—')}
      ${tdNum(s ? pct(s.harmonyF1.f1) : '—')}
      ${tdNum(s ? pct(s.bassF1.f1) : '—')}
      ${tdNum(s ? pct(s.overall.precision) : '—')}
      ${tdNum(s ? pct(s.overall.recall) : '—')}
    </tr>`)
  }
  parts.push(`</tbody></table>`)

  // -------- Table 4: Three-way comparison --------------------------------
  parts.push(`<h2>5. Three-way comparison — overall F1</h2>`)
  parts.push(`<p class="small">Adds note-detector-2 (Demucs + basic-pitch) as context. note-detector-2 takes audio only, so <code>frank-mid</code> is N/A.</p>`)
  parts.push(`<table>
    <thead><tr>
      <th>Input</th>
      <th class="right">NEW chord-detector</th>
      <th class="right">BASELINE chord-detector (best)</th>
      <th class="right">note-detector-2</th>
    </tr></thead><tbody>`)
  for (const inp of inputs) {
    const row = perInput[inp]
    parts.push(`<tr>
      <td><code>${inp}</code></td>
      ${tdNum(row.newCd ? pct(row.newCd.score.overall.f1) : '—')}
      ${tdNum(row.oldCdBest ? pct(row.oldCdBest.score.overall.f1) : '—')}
      ${tdNum(row.nd2 ? pct(row.nd2.score.overall.f1) : '—')}
    </tr>`)
  }
  parts.push(`</tbody></table>`)

  // -------- Verdict ------------------------------------------------------
  parts.push(`<h2>6. Verdict — better, worse, or the same?</h2>`)
  parts.push(`<ul>`)
  for (const inp of inputs) {
    const row = perInput[inp]
    const nf = row.newCd?.score.overall.f1
    const of = row.oldCdBest?.score.overall.f1
    if (nf == null || of == null) {
      parts.push(`<li><strong>${inp}</strong>: data incomplete.</li>`)
      continue
    }
    const d = (nf - of) * 100
    const verdict = Math.abs(d) < 0.5 ? 'about the same (within 0.5 pt)' : d > 0 ? 'BETTER' : 'WORSE'
    parts.push(`<li><strong>${inp}</strong>: NEW ${pct(nf)} vs BASELINE-best ${pct(of)} → <strong>${verdict}</strong> (Δ ${d > 0 ? '+' : ''}${d.toFixed(1)} pts)</li>`)
  }
  parts.push(`</ul>`)

  parts.push(`<p class="small">Source script: <code>scripts/cd-claude-test.mjs</code>. Raw JSON: <code>tmp/chord-detector-test-claude.json</code>.</p>`)
  parts.push(`</body></html>`)
  return parts.join('\n')
}

function mdReport(payload) {
  const { gt, gtBuckets, windowStart, windowEnd, generatedAt, inputs, perInput } = payload
  const lines = []
  lines.push(`# Chord Detector — "is it working better?" test by Claude`)
  lines.push('')
  lines.push(`Generated ${generatedAt}. Ground truth: \`${path.basename(GT_PATH)}\` — ${gt.length} notes (lead ${gtBuckets.lead.length} / harmony ${gtBuckets.harmony.length} / bass ${gtBuckets.bass.length}). Window ${windowStart.toFixed(2)}s → ${windowEnd.toFixed(2)}s.`)
  lines.push('')
  lines.push(`Scorer = verbatim copy of \`scripts/chord-detector-phase-score.mjs\`. NEW = this session's \`full\` config. BASELINE = May-21 sweep, best F1 per input across all 13 configs.`)
  lines.push('')

  const fmtPct = v => v == null ? '—' : pct(v)
  const fmtDelta = (n, o) => (n == null || o == null) ? '—' : `${(n - o) > 0 ? '+' : ''}${((n - o) * 100).toFixed(1)} pts`

  lines.push('## NEW vs BASELINE — overall F1')
  lines.push('')
  lines.push('| Input | NEW (`full`) | BASELINE best | Best baseline cfg | Δ | NEW engine s | BASELINE engine s |')
  lines.push('| --- | ---: | ---: | --- | ---: | ---: | ---: |')
  for (const inp of inputs) {
    const r = perInput[inp]
    lines.push(`| \`${inp}\` | ${fmtPct(r.newCd?.score.overall.f1)} | ${fmtPct(r.oldCdBest?.score.overall.f1)} | ${r.oldCdBest ? '`' + r.oldCdBest.config + '`' : '—'} | ${fmtDelta(r.newCd?.score.overall.f1, r.oldCdBest?.score.overall.f1)} | ${r.newCd ? (r.newCd.engineMs / 1000).toFixed(1) : '—'} | ${r.oldCdBest ? (r.oldCdBest.engineMs / 1000).toFixed(1) : '—'} |`)
  }
  lines.push('')

  lines.push('## NEW vs BASELINE — same config (`full`)')
  lines.push('')
  lines.push('| Input | NEW `full` F1 | BASELINE `full` F1 | Δ | NEW onset F1 | BASELINE onset F1 |')
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: |')
  for (const inp of inputs) {
    const r = perInput[inp]
    lines.push(`| \`${inp}\` | ${fmtPct(r.newCd?.score.overall.f1)} | ${fmtPct(r.oldCdFull?.score.overall.f1)} | ${fmtDelta(r.newCd?.score.overall.f1, r.oldCdFull?.score.overall.f1)} | ${fmtPct(r.newCd?.score.onset.f1)} | ${fmtPct(r.oldCdFull?.score.onset.f1)} |`)
  }
  lines.push('')

  lines.push('## NEW chord-detector — per-register F1')
  lines.push('')
  lines.push('| Input | Lead (≥60) | Harmony (48-59) | Bass (<48) | Precision | Recall |')
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: |')
  for (const inp of inputs) {
    const s = perInput[inp].newCd?.score
    lines.push(`| \`${inp}\` | ${fmtPct(s?.leadF1.f1)} | ${fmtPct(s?.harmonyF1.f1)} | ${fmtPct(s?.bassF1.f1)} | ${fmtPct(s?.overall.precision)} | ${fmtPct(s?.overall.recall)} |`)
  }
  lines.push('')

  lines.push('## Three-way — overall F1')
  lines.push('')
  lines.push('| Input | NEW chord-detector | BASELINE chord-detector (best) | note-detector-2 |')
  lines.push('| --- | ---: | ---: | ---: |')
  for (const inp of inputs) {
    const r = perInput[inp]
    lines.push(`| \`${inp}\` | ${fmtPct(r.newCd?.score.overall.f1)} | ${fmtPct(r.oldCdBest?.score.overall.f1)} | ${fmtPct(r.nd2?.score.overall.f1)} |`)
  }
  lines.push('')

  lines.push('## Verdict')
  lines.push('')
  for (const inp of inputs) {
    const r = perInput[inp]
    const nf = r.newCd?.score.overall.f1, of = r.oldCdBest?.score.overall.f1
    if (nf == null || of == null) { lines.push(`- **${inp}**: data incomplete.`); continue }
    const d = (nf - of) * 100
    const v = Math.abs(d) < 0.5 ? 'about the same (within 0.5 pt)' : d > 0 ? '**BETTER**' : '**WORSE**'
    lines.push(`- **${inp}**: NEW ${pct(nf)} vs BASELINE-best ${pct(of)} → ${v} (Δ ${d > 0 ? '+' : ''}${d.toFixed(1)} pts)`)
  }
  lines.push('')
  return lines.join('\n')
}

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════

function main() {
  const gt = loadGroundTruth(GT_PATH)
  const gtBuckets = bucketByRegister(gt)
  const windowStart = Math.min(...gt.map(n => n.startSec))
  const windowEnd = Math.max(...gt.map(n => n.startSec + n.durationSec))
  const ctx = { gt, gtBuckets, windowStart, windowEnd }

  console.log(`[cd-claude] GT: ${gt.length} notes, window ${windowStart.toFixed(2)}s -> ${windowEnd.toFixed(2)}s`)

  const newCdAll = scoreChordDetectorDir(NEW_CD_DIR, ctx)
  const oldCdAll = scoreChordDetectorDir(OLD_CD_DIR, ctx)
  const nd2All = scoreNd2(ND2_DIR, ctx)

  console.log(`[cd-claude] NEW chord-detector dumps scored: ${Object.keys(newCdAll).length}`)
  console.log(`[cd-claude] BASELINE chord-detector dumps scored: ${Object.keys(oldCdAll).length}`)
  console.log(`[cd-claude] note-detector-2 MIDIs scored: ${Object.keys(nd2All).length}`)

  const newCdFull = bestPerInputForConfig(newCdAll, 'full')
  const oldCdFull = bestPerInputForConfig(oldCdAll, 'full')
  const oldCdBest = bestPerInputAllConfigs(oldCdAll)

  // Inputs present in NEW or OLD (excluding nd2-only — we want the chord-detector lens)
  const allInputs = new Set([
    ...Object.values(newCdAll).map(r => r.input),
    ...Object.values(oldCdAll).map(r => r.input),
  ])
  const inputs = [...allInputs].sort()

  const perInput = {}
  for (const inp of inputs) {
    perInput[inp] = {
      newCd: newCdFull[inp],
      oldCdFull: oldCdFull[inp],
      oldCdBest: oldCdBest[inp],
      nd2: nd2All[inp],
    }
  }

  const payload = {
    gt, gtBuckets, windowStart, windowEnd,
    generatedAt: new Date().toISOString().slice(0, 19) + 'Z',
    inputs, perInput,
  }

  mkdirSync(path.dirname(OUT_HTML), { recursive: true })
  writeFileSync(OUT_HTML, htmlReport(payload))
  writeFileSync(OUT_MD, mdReport(payload))
  // Strip the bulky GT note list from the JSON dump.
  writeFileSync(OUT_JSON, JSON.stringify({
    ...payload,
    gt: `${gt.length} notes (omitted)`,
    gtBuckets: { lead: gtBuckets.lead.length, harmony: gtBuckets.harmony.length, bass: gtBuckets.bass.length },
  }, null, 2))

  console.log(`[cd-claude] wrote ${OUT_HTML}`)
  console.log(`[cd-claude] wrote ${OUT_MD}`)
  console.log(`[cd-claude] wrote ${OUT_JSON}`)
}

main()
