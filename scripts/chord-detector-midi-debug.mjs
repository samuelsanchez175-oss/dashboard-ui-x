/**
 * Chord-detector MIDI-export debug harness.
 *
 * Drives the real in-browser pipeline headlessly, captures the DEV-only per-stage
 * lead-note snapshots (`window.__chordPipelineStages`) plus the final result, and
 * traces the four reported MIDI-export bugs to the stage that causes each:
 *   1. note start times not recognized / off-grid
 *   2. output structure not correct
 *   3. missing top (highest) notes
 *   4. one sustained note split into two
 *
 *   node scripts/chord-detector-midi-debug.mjs [/path/to/audio]   (default: Notes.wav)
 *
 * Requires the dev server on http://localhost:5175 and the DEV-only hooks in
 * ToolsChordDetectorPage.tsx (`__chordDetectorTest`) + chord-detector-engine.ts
 * (`__chordPipelineStages`).
 */
import { chromium } from '@playwright/test'
import tonejsMidi from '@tonejs/midi'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const { Midi } = tonejsMidi

const DEV_ORIGIN = 'http://localhost:5175'
const ROUTE_ID = 'tools-chord-detector'
const OUT_DIR = path.resolve('tmp/chord-midi-debug')
const INPUT = process.argv[2] || '/Users/samuel/Desktop/Notes.wav'
const LABEL = path.basename(INPUT).replace(/\.[^.]+$/, '').replace(/\s+/g, '_')

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const midiName = (m) => `${NOTE_NAMES[((Math.round(m) % 12) + 12) % 12]}${Math.floor(Math.round(m) / 12) - 1}`
const r2 = (x, d = 3) => {
  const f = 10 ** d
  return Math.round((Number(x) || 0) * f) / f
}

/* ── Drive the browser ────────────────────────────────────────────────────── */
async function capture() {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const consoleErrors = []
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))

  await page.goto(DEV_ORIGIN, { waitUntil: 'networkidle', timeout: 60_000 })

  const inputSel = '[data-testid="chord-detector-file-input"]'
  let mounted = false
  for (let i = 0; i < 20 && !mounted; i++) {
    await page.evaluate(
      (id) => window.dispatchEvent(new CustomEvent('dashboard:set-route', { detail: { id } })),
      ROUTE_ID,
    )
    mounted = await page
      .waitForSelector(inputSel, { state: 'attached', timeout: 1500 })
      .then(() => true)
      .catch(() => false)
  }
  if (!mounted) {
    await browser.close()
    throw new Error('chord-detector file input never mounted — is the dev server up?')
  }

  const beforeRunId = await page.evaluate(() => window.__chordDetectorTest?.runId ?? 0)
  await page.setInputFiles(inputSel, INPUT)

  try {
    await page.waitForFunction(
      (before) => {
        const t = window.__chordDetectorTest
        return !!t && t.busy === false && t.runId > before && !!t.result
      },
      beforeRunId,
      { timeout: 300_000, polling: 750 },
    )
  } catch (waitErr) {
    const state = await page
      .evaluate((before) => {
        const t = window.__chordDetectorTest
        return { hookPresent: !!t, busy: t?.busy ?? null, runId: t?.runId ?? null, beforeRunId: before, error: t?.error ?? null }
      }, beforeRunId)
      .catch(() => null)
    console.error('STUCK — __chordDetectorTest:', JSON.stringify(state))
    console.error('page console errors:', JSON.stringify(consoleErrors.slice(-8)))
    await browser.close()
    throw waitErr
  }

  const payload = await page.evaluate(() => {
    const t = window.__chordDetectorTest
    const r = t.result
    const trim = (ns) =>
      (ns || []).map((n) => ({
        midi: Math.round(n.midi),
        startSec: n.startSec,
        durationSec: n.durationSec,
        velocity: n.velocity,
      }))
    return {
      error: t.error ?? null,
      bpm: r.bpm,
      bpmSource: r.bpmSource,
      durationSec: r.durationSec,
      segmentCount: r.segments.length,
      leadNotes: trim(r.leadNotes),
      bpRawNotes: trim(window.__bpRawNotes || []),
      loop: r.loop ?? null,
      validationReport: t.validationReport ?? null,
      stages: (window.__chordPipelineStages || []).map((s) => ({
        stage: s.stage,
        count: s.count,
        notes: trim(s.notes),
      })),
    }
  })

  await browser.close()
  return { ...payload, consoleErrors }
}

/* ── Bug 3: where do top notes die? ───────────────────────────────────────── */
function traceTopNotes(stages) {
  // Per stage: count, maxMidi, how many notes in the top register.
  const table = stages.map((s) => {
    const midis = s.notes.map((n) => n.midi)
    return {
      stage: s.stage,
      count: s.count,
      maxMidi: midis.length ? Math.max(...midis) : 0,
      hi72: midis.filter((m) => m >= 72).length, // >= C5
      hi84: midis.filter((m) => m >= 84).length, // >= C6
    }
  })
  // Distinct high pitches present in raw, and the last stage each survives in.
  const raw = stages[0]
  const hiPitchesRaw = [...new Set(raw.notes.filter((n) => n.midi >= 72).map((n) => n.midi))].sort((a, b) => b - a)
  const survival = hiPitchesRaw.map((m) => {
    let lastStage = '(none)'
    let lastCount = 0
    for (const s of stages) {
      const c = s.notes.filter((n) => n.midi === m).length
      if (c > 0) {
        lastStage = s.stage
        lastCount = c
      }
    }
    const rawCount = raw.notes.filter((n) => n.midi === m).length
    return { pitch: midiName(m), midi: m, rawCount, lastStage, lastCount }
  })
  return { table, survival }
}

/* ── Bug 4: same-pitch notes split into consecutive fragments ─────────────── */
function findSplits(notes, gapMax = 0.35) {
  const byMidi = new Map()
  for (const n of notes) {
    if (!byMidi.has(n.midi)) byMidi.set(n.midi, [])
    byMidi.get(n.midi).push(n)
  }
  const splits = []
  for (const [m, arr] of byMidi) {
    arr.sort((a, b) => a.startSec - b.startSec)
    for (let i = 0; i < arr.length - 1; i++) {
      const a = arr[i]
      const b = arr[i + 1]
      const gap = b.startSec - (a.startSec + a.durationSec)
      if (gap <= gapMax) {
        splits.push({
          pitch: midiName(m),
          gapSec: r2(gap),
          a: `${r2(a.startSec)}+${r2(a.durationSec)}`,
          b: `${r2(b.startSec)}+${r2(b.durationSec)}`,
        })
      }
    }
  }
  return splits.sort((x, y) => x.gapSec - y.gapSec)
}

/* ── Bug 1: are note starts on a musical grid? ────────────────────────────── */
function gridAnalysis(notes, bpm) {
  if (!notes.length || !(bpm > 0)) return null
  const sixteenth = 60 / bpm / 4
  const sixteenthTriplet = 60 / bpm / 6
  const devs = notes.map((n) => {
    const d16 = Math.abs(n.startSec - Math.round(n.startSec / sixteenth) * sixteenth)
    const d16t = Math.abs(n.startSec - Math.round(n.startSec / sixteenthTriplet) * sixteenthTriplet)
    return Math.min(d16, d16t)
  })
  devs.sort((a, b) => a - b)
  const mean = devs.reduce((a, b) => a + b, 0) / devs.length
  const within = (ms) => devs.filter((d) => d <= ms / 1000).length / devs.length
  return {
    sixteenthSec: r2(sixteenth),
    sixteenthTripletSec: r2(sixteenthTriplet),
    meanDevMs: r2(mean * 1000, 1),
    medianDevMs: r2(devs[devs.length >> 1] * 1000, 1),
    maxDevMs: r2(devs[devs.length - 1] * 1000, 1),
    pctWithin10ms: r2(within(10) * 100, 1),
    pctWithin25ms: r2(within(25) * 100, 1),
  }
}

/* ── Bug 2: structure — polyphony + overlaps ──────────────────────────────── */
function structure(notes) {
  // Max simultaneous voices via a sweep line.
  const evts = []
  for (const n of notes) {
    evts.push({ t: n.startSec, d: 1 })
    evts.push({ t: n.startSec + n.durationSec, d: -1 })
  }
  evts.sort((a, b) => a.t - b.t || a.d - b.d)
  let cur = 0
  let maxPoly = 0
  for (const e of evts) {
    cur += e.d
    maxPoly = Math.max(maxPoly, cur)
  }
  const midis = notes.map((n) => n.midi)
  return {
    noteCount: notes.length,
    maxPolyphony: maxPoly,
    midiRange: midis.length ? `${midiName(Math.min(...midis))}..${midiName(Math.max(...midis))}` : '—',
    firstStartSec: notes.length ? r2(Math.min(...notes.map((n) => n.startSec))) : null,
  }
}

/* ── Main ─────────────────────────────────────────────────────────────────── */
async function main() {
  console.log(`input: ${INPUT}`)
  const a = await capture()
  if (a.error) throw new Error(`analysis error: ${a.error}`)
  if (!a.stages.length) throw new Error('no __chordPipelineStages captured — is the engine instrumentation present + dev server reloaded?')

  // Prepend the true pre-ghost-filter Basic Pitch output as stage "-1-bpTrueRaw".
  if (a.bpRawNotes && a.bpRawNotes.length) {
    a.stages.unshift({ stage: '-1-bpTrueRaw', count: a.bpRawNotes.length, notes: a.bpRawNotes })
  }

  const finalNotes = a.leadNotes
  const top = traceTopNotes(a.stages)
  const splits = findSplits(finalNotes)
  const rawSplits = findSplits(a.stages[0].notes)
  const grid = gridAnalysis(finalNotes, a.bpm)
  const struct = structure(finalNotes)

  // Reconstruct the exported MIDI exactly as buildChordMidiBlob does.
  const midi = new Midi()
  midi.header.setTempo(a.bpm)
  const track = midi.addTrack()
  track.name = 'Notes'
  for (const n of finalNotes) {
    track.addNote({
      midi: Math.min(127, Math.max(0, Math.round(n.midi))),
      time: Math.max(0, n.startSec),
      duration: Math.max(1 / 32, n.durationSec),
      velocity: Math.max(0.2, Math.min(1, n.velocity)),
    })
  }

  mkdirSync(OUT_DIR, { recursive: true })
  const outPath = path.join(OUT_DIR, `${LABEL}.json`)
  writeFileSync(outPath, JSON.stringify({ input: INPUT, bpm: a.bpm, bpmSource: a.bpmSource, durationSec: a.durationSec, stages: a.stages, finalNotes, splits, top, grid, struct }, null, 2))

  /* ── Report ── */
  console.log(`\n=== ${LABEL}  |  bpm ${a.bpm} (${a.bpmSource})  dur ${r2(a.durationSec, 2)}s  segments ${a.segmentCount} ===`)

  console.log(`\n[per-stage]  stage : count  maxMidi  ≥C5  ≥C6`)
  let prev = null
  for (const row of top.table) {
    const lost = prev ? prev.count - row.count : 0
    const hiLost = prev ? prev.hi72 - row.hi72 : 0
    const flag = hiLost > 0 ? `  <-- ${hiLost} hi-note(s) dropped` : ''
    console.log(
      `  ${row.stage.padEnd(18)} ${String(row.count).padStart(4)}  ${midiName(row.maxMidi).padStart(5)}  ${String(row.hi72).padStart(3)}  ${String(row.hi84).padStart(3)}${lost ? `   (-${lost})` : ''}${flag}`,
    )
    prev = row
  }

  const lastStage = top.table[top.table.length - 1]?.stage ?? ''
  console.log(`\n[Bug 3 — top-note survival]  high pitches (≥C5) in raw BP output:`)
  for (const s of top.survival.slice(0, 14)) {
    const verdict = s.lastStage === lastStage ? 'survives' : `LOST after ${s.lastStage}`
    console.log(`  ${s.pitch.padEnd(5)} raw×${s.rawCount}  -> ${verdict}`)
  }

  console.log(`\n[Bug 4 — same-pitch splits]  final: ${splits.length}   raw BP: ${rawSplits.length}  (gap ≤ 0.35s)`)
  for (const s of splits.slice(0, 8)) console.log(`  ${s.pitch.padEnd(5)} gap ${s.gapSec}s   [${s.a}] -> [${s.b}]`)

  console.log(`\n[Bug 1 — start-time grid]  ${grid ? JSON.stringify(grid) : 'n/a'}`)
  // Does quantize / align actually move starts?
  const byStage = Object.fromEntries(a.stages.map((s) => [s.stage, s.notes]))
  const sameStarts = (x, y) => {
    if (!x || !y || x.length !== y.length) return `differ (count ${x?.length} vs ${y?.length})`
    let moved = 0
    for (let i = 0; i < x.length; i++) if (Math.abs(x[i].startSec - y[i].startSec) > 1e-4) moved++
    return `${moved}/${x.length} starts moved`
  }
  console.log(`  8-rmsRefine -> 9-neuralNotePost : ${sameStarts(byStage['8-rmsRefine'], byStage['9-neuralNotePost'])}`)
  console.log(`  9-neuralNotePost -> 10-onsetAlign : ${sameStarts(byStage['9-neuralNotePost'], byStage['10-onsetAlign'])}`)

  console.log(`\n[Bug 2 — structure]  ${JSON.stringify(struct)}`)
  console.log(`  reconstructed MIDI: ppq ${midi.header.ppq}, tempo ${r2(midi.header.tempos[0]?.bpm, 2)}, notes ${track.notes.length}`)
  console.log(`  first 6 notes (tick @start+dur): ${track.notes.slice(0, 6).map((n) => `${NOTE_NAMES[n.midi % 12]}${Math.floor(n.midi / 12) - 1}@${n.ticks}+${n.durationTicks}`).join('  ')}`)

  /* ── Part 3 — Loop + Output check + 2nd-pass duration-grid fit ── */
  if (a.loop) {
    const L = a.loop
    if (L.found) {
      console.log(`\n[Part 3 — Loop]  ${L.barCount} bar${L.barCount > 1 ? 's' : ''} ×${L.repeats}  (confidence ${r2(L.confidence, 2)}, totalBars ${L.totalBars})`)
    } else {
      console.log(`\n[Part 3 — Loop]  none  (totalBars ${L.totalBars}; through-composed or clip too short)`)
    }
  }

  // 2nd pass: durations on the 1/16 grid — before (stage 13) vs after (final).
  const durOnGridPct = (notes) => {
    if (!notes?.length || !(a.bpm > 0)) return null
    const g16 = 60 / a.bpm / 4
    const tol = 0.01
    const ok = notes.filter((n) => Math.abs(n.durationSec - Math.round(n.durationSec / g16) * g16) <= tol).length
    return r2((ok / notes.length) * 100, 1)
  }
  const before = a.stages.find((s) => s.stage === '13-finalMerge')?.notes
  const beforePct = durOnGridPct(before)
  const afterPct = durOnGridPct(finalNotes)
  if (beforePct != null && afterPct != null) {
    console.log(`[Part 3 — 2nd pass]  note-length grid fit  ${beforePct}% (stage 13)  ->  ${afterPct}% (final, stage 14)`)
  }

  if (a.validationReport) {
    const V = a.validationReport
    console.log(`\n[Part 3 — Output check]  ${V.passCount}/${V.checks.length} OK`)
    for (const c of V.checks) {
      const tag = c.status === 'pass' ? '✔' : '⚠'
      console.log(`  ${tag} ${c.label.padEnd(28)} ${c.detail}`)
    }
  } else {
    console.log(`\n[Part 3 — Output check]  not captured (page hook didn't expose validationReport)`)
  }

  if (a.consoleErrors.length) console.log(`\npage console errors: ${a.consoleErrors.length}`)
  console.log(`\nraw -> ${outPath}`)
}

main().catch((e) => {
  console.error(e?.stack || String(e))
  process.exit(1)
})
