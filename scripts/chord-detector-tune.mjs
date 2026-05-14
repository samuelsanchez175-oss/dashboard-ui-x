/**
 * Chord-detector accuracy tuning harness.
 *
 * Drives the real in-browser pipeline (Spotify Basic Pitch + NeuralNote-style post +
 * Viterbi chord decode) headlessly via Playwright, against a fixed control clip, and
 * scores the output against a known ground truth. Used by the iteration loop in
 * `docs/chord-detector-tuning-log.md`.
 *
 *   node scripts/chord-detector-tune.mjs [iterationLabel]
 *
 * Requires the dev server on http://localhost:5175 (npm run dev) and the DEV-only
 * `window.__chordDetectorTest` hook in ToolsChordDetectorPage.tsx.
 *
 * Ground truth — engraved score "Acura Integurl": B major, 70 BPM, 4/4, solo piano.
 */
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const DEV_ORIGIN = 'http://localhost:5175'
const CONTROL_MP3 = '/Users/samuel/Downloads/Frank Ocean Acura Integurl Instrumental.mp3'
const ROUTE_ID = 'tools-chord-detector'
const OUT_DIR = path.resolve('tmp/chord-tune')

/* ── Ground truth ─────────────────────────────────────────────────────────── */
const TRUTH = { keyLabel: 'B major', keyRootPc: 11, keyMode: 'major', bpm: 70 }
/** B-major pitch classes: B C# D# E F# G# A#  →  11 1 3 4 6 8 10. */
const KEY_PCS = new Set([11, 1, 3, 4, 6, 8, 10])
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const pc = (midi) => ((Math.round(midi) % 12) + 12) % 12
const midiName = (midi) => `${NOTE_NAMES[pc(midi)]}${Math.floor(Math.round(midi) / 12) - 1}`
const round = (x, d = 2) => {
  const m = 10 ** d
  return Math.round((Number(x) || 0) * m) / m
}

/* ── Drive the browser ────────────────────────────────────────────────────── */
async function captureAnalysis() {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const consoleErrors = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))

  await page.goto(DEV_ORIGIN, { waitUntil: 'networkidle', timeout: 60_000 })

  // Dispatch the route event until the chord-detector file input mounts (handles the
  // race where the app's route listener isn't attached yet right after boot).
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
  await page.setInputFiles(inputSel, CONTROL_MP3)

  // Wait for: busy cleared + a fresh runId + a non-null result.
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
    // Surface what the page got stuck on instead of a bare Playwright timeout.
    const state = await page
      .evaluate((before) => {
        const t = window.__chordDetectorTest
        return {
          hookPresent: !!t,
          busy: t?.busy ?? null,
          runId: t?.runId ?? null,
          beforeRunId: before,
          error: t?.error ?? null,
          hasResult: !!t?.result,
        }
      }, beforeRunId)
      .catch(() => null)
    console.error('STUCK — __chordDetectorTest:', JSON.stringify(state))
    console.error('page console errors:', JSON.stringify(consoleErrors.slice(-10)))
    await browser.close()
    throw waitErr
  }

  const payload = await page.evaluate(() => {
    const t = window.__chordDetectorTest
    const r = t.result
    return {
      error: t.error ?? null,
      bpm: r.bpm,
      bpmSource: r.bpmSource,
      durationSec: r.durationSec,
      inputType: r.inputType,
      estimatedKey: r.estimatedKey,
      uniqueChordCount: r.uniqueChordCount,
      pitchClassHistogram: r.pitchClassHistogram,
      segments: r.segments.map((s) => ({
        label: s.label,
        rootPc: s.rootPc,
        quality: s.quality,
        startSec: s.startSec,
        durationSec: s.durationSec,
      })),
      leadNotes: r.leadNotes.map((n) => ({
        midi: n.midi,
        startSec: n.startSec,
        durationSec: n.durationSec,
        velocity: n.velocity,
      })),
    }
  })

  await browser.close()
  return { ...payload, consoleErrors }
}

/* ── Score against ground truth ───────────────────────────────────────────── */
function score(a) {
  const notes = a.leadNotes
  const segs = a.segments
  const dur = a.durationSec || 0

  // Lead-note pitch-class accuracy (the primary hallucination proxy).
  let noteDur = 0
  let ookNoteDur = 0
  let ookNoteCount = 0
  for (const n of notes) {
    noteDur += n.durationSec
    if (!KEY_PCS.has(pc(n.midi))) {
      ookNoteDur += n.durationSec
      ookNoteCount++
    }
  }
  const outOfKeyPct = noteDur > 0 ? (ookNoteDur / noteDur) * 100 : 0
  const outOfKeyCountPct = notes.length ? (ookNoteCount / notes.length) * 100 : 0

  // Octave spread / register sanity.
  const midis = notes.map((n) => Math.round(n.midi))
  const minMidi = midis.length ? Math.min(...midis) : 0
  const maxMidi = midis.length ? Math.max(...midis) : 0
  const octaveSpread = midis.length ? Math.floor(maxMidi / 12) - Math.floor(minMidi / 12) : 0

  // Chord harmonic-rhythm + diatonic-root sanity.
  let chordDur = 0
  let ookChordDur = 0
  let augSusDur = 0
  let dimDur = 0
  for (const s of segs) {
    chordDur += s.durationSec
    if (!KEY_PCS.has(((s.rootPc % 12) + 12) % 12)) ookChordDur += s.durationSec
    if (s.quality === 'aug' || s.quality === 'sus4') augSusDur += s.durationSec
    if (s.quality === 'dim') dimDur += s.durationSec
  }
  const outOfKeyChordPct = chordDur > 0 ? (ookChordDur / chordDur) * 100 : 0
  const augSusChordPct = chordDur > 0 ? (augSusDur / chordDur) * 100 : 0
  const dimChordPct = chordDur > 0 ? (dimDur / chordDur) * 100 : 0
  const avgChordDurSec = segs.length ? chordDur / segs.length : 0

  // Tempo: reject integer-factor octave errors (140 / 35 instead of 70).
  const bpmErr = Math.abs(a.bpm - TRUTH.bpm)
  const bpmOctaveError =
    Math.abs(a.bpm - TRUTH.bpm * 2) < 8 ||
    Math.abs(a.bpm - TRUTH.bpm / 2) < 5 ||
    Math.abs(a.bpm - TRUTH.bpm * 1.5) < 6

  const keyCorrect =
    a.estimatedKey?.rootPc === TRUTH.keyRootPc && a.estimatedKey?.mode === TRUTH.keyMode
  const notesPerSec = dur > 0 ? notes.length / dur : 0

  // Composite hallucination score (lower = better). Each term is reported below too.
  const hallucinationScore =
    outOfKeyPct * 1.0 +
    outOfKeyChordPct * 0.75 +
    augSusChordPct * 0.5 +
    (keyCorrect ? 0 : 20) +
    (bpmOctaveError ? 25 : Math.min(10, bpmErr))

  return {
    key: a.estimatedKey?.label ?? '—',
    keyConfidence: round(a.estimatedKey?.confidence, 3),
    keyCorrect,
    bpm: round(a.bpm, 2),
    bpmSource: a.bpmSource,
    bpmError: round(bpmErr, 2),
    bpmOctaveError,
    durationSec: round(dur, 2),
    noteCount: notes.length,
    notesPerSec: round(notesPerSec, 2),
    chordCount: segs.length,
    uniqueChords: a.uniqueChordCount,
    avgChordDurSec: round(avgChordDurSec, 2),
    outOfKeyPct: round(outOfKeyPct, 2),
    outOfKeyCountPct: round(outOfKeyCountPct, 2),
    ookNoteCount,
    outOfKeyChordPct: round(outOfKeyChordPct, 2),
    augSusChordPct: round(augSusChordPct, 2),
    dimChordPct: round(dimChordPct, 2),
    octaveSpread,
    midiRange: midis.length ? `${midiName(minMidi)}..${midiName(maxMidi)}` : '—',
    hallucinationScore: round(hallucinationScore, 2),
  }
}

/* ── Main ─────────────────────────────────────────────────────────────────── */
async function main() {
  const label = process.argv[2] || `run-${Date.now()}`
  const a = await captureAnalysis()
  if (a.error) throw new Error(`analysis returned an error: ${a.error}`)
  const m = score(a)

  // Out-of-key pitch-class breakdown (which wrong notes, by total duration).
  const ookByPc = {}
  for (const n of a.leadNotes) {
    const p = pc(n.midi)
    if (!KEY_PCS.has(p)) ookByPc[NOTE_NAMES[p]] = round((ookByPc[NOTE_NAMES[p]] || 0) + n.durationSec, 2)
  }
  // Non-diatonic chord roots that showed up.
  const ookChordRoots = [
    ...new Set(
      a.segments
        .filter((s) => !KEY_PCS.has(((s.rootPc % 12) + 12) % 12))
        .map((s) => s.label),
    ),
  ]

  mkdirSync(OUT_DIR, { recursive: true })
  const outPath = path.join(OUT_DIR, `${label}.json`)
  writeFileSync(outPath, JSON.stringify({ label, metrics: m, ookByPc, ookChordRoots, raw: a }, null, 2))

  // Compact summary (kept short on purpose).
  console.log(`── chord-detector tune — ${label} ──`)
  console.log(`KEY            ${m.key}  (conf ${m.keyConfidence})  ${m.keyCorrect ? 'OK' : 'WRONG vs B major'}`)
  console.log(`BPM            ${m.bpm}  src=${m.bpmSource}  err=${m.bpmError}${m.bpmOctaveError ? '  OCTAVE-ERROR' : ''}`)
  console.log(`DURATION       ${m.durationSec}s`)
  console.log(`NOTES          ${m.noteCount}  (${m.notesPerSec}/s)  range ${m.midiRange}  octSpread ${m.octaveSpread}`)
  console.log(`CHORDS         ${m.chordCount}  unique ${m.uniqueChords}  avgDur ${m.avgChordDurSec}s`)
  console.log(`OUT-OF-KEY     notes ${m.outOfKeyPct}% dur / ${m.outOfKeyCountPct}% count (${m.ookNoteCount} notes)`)
  console.log(`               chords ${m.outOfKeyChordPct}% root  aug/sus ${m.augSusChordPct}%  dim ${m.dimChordPct}%`)
  console.log(`OOK pitch-classes (dur s): ${JSON.stringify(ookByPc)}`)
  console.log(`OOK chord labels:          ${JSON.stringify(ookChordRoots)}`)
  console.log(`HALLUCINATION  ${m.hallucinationScore}   (lower = better)`)
  if (a.consoleErrors.length) console.log(`page console errors: ${a.consoleErrors.length} (see ${outPath})`)
  console.log(`raw → ${outPath}`)
}

main().catch((e) => {
  console.error(e?.stack || String(e))
  process.exit(1)
})
