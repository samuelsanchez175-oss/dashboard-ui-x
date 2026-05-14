#!/usr/bin/env npx tsx
/**
 * Re-apply `alignChordOnsetsInLeadNotes` to all notes in a MIDI file and print the same
 * chord-scatter quantiles as `audit-chord-midi-timing.mjs` (60 ms onset clusters).
 * Use to verify onset-align tuning without re-exporting from the app.
 */
import fs from 'node:fs'
import { createRequire } from 'node:module'
import {
  alignChordOnsetsInLeadNotes,
  CHORD_ONSET_ALIGN,
  type LeadNote,
} from '../src/zones/tools/chord-detector-melody.ts'

const require = createRequire(import.meta.url)
const { Midi } = require('@tonejs/midi') as typeof import('@tonejs/midi')

const WINDOW_MS = 60

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]!
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo)
}

function quantiles(values: number[]) {
  const s = [...values].sort((a, b) => a - b)
  return {
    p50: percentile(s, 50),
    p90: percentile(s, 90),
    p99: percentile(s, 99),
    n: s.length,
    min: s[0],
    max: s[s.length - 1],
  }
}

function chordScatterMs(notes: { tMs: number; midi: number }[]): number[] {
  const sorted = [...notes].sort((a, b) => a.tMs - b.tMs)
  const scatters: number[] = []
  let i = 0
  while (i < sorted.length) {
    const t0 = sorted[i]!.tMs
    let j = i
    while (j < sorted.length && sorted[j]!.tMs <= t0 + WINDOW_MS) j++
    const cluster = sorted.slice(i, j)
    const midis = new Set(cluster.map(n => n.midi))
    if (midis.size >= 2) {
      const starts = cluster.map(n => n.tMs)
      scatters.push(Math.max(...starts) - Math.min(...starts))
      i = j
    } else {
      i += 1
    }
  }
  return scatters
}

const midiPath =
  process.argv[2] ||
  '/Users/samuel/Downloads/Frank Ocean Acura Integurl Instrumental-chords (5).mid'

const buf = fs.readFileSync(midiPath)
const midi = new Midi(buf)

let bpm = 120
const tempos = midi.header.tempos
if (tempos?.length) {
  if (tempos.length === 1) bpm = Math.round(tempos[0]!.bpm)
  else {
    const ppq = midi.header.ppq || 480
    let weighted = 0
    let totalSec = 0
    for (let i = 0; i < tempos.length; i++) {
      const cur = tempos[i]!
      const nextTicks = i + 1 < tempos.length ? tempos[i + 1]!.ticks : cur.ticks + ppq * 4
      const tickSpan = Math.max(1, nextTicks - cur.ticks)
      const span = (tickSpan / ppq) * (60 / cur.bpm)
      weighted += cur.bpm * span
      totalSec += span
    }
    bpm = Math.round(totalSec > 0 ? weighted / totalSec : tempos[0]!.bpm)
  }
}

const lead: LeadNote[] = []
for (const track of midi.tracks) {
  if (track.channel === 9) continue
  for (const n of track.notes) {
    lead.push({
      midi: n.midi,
      startSec: n.time,
      durationSec: Math.max(1e-6, n.duration),
      velocity: n.velocity,
    })
  }
}

const aligned = alignChordOnsetsInLeadNotes(lead, { ...CHORD_ONSET_ALIGN, bpm })
const tNotes = aligned.map(n => ({ tMs: n.startSec * 1000, midi: Math.round(n.midi) }))
const scatters = chordScatterMs(tNotes)
const q = quantiles(scatters)

const THRESH = { chordScatterP90Ms: 25, chordScatterP99Ms: 50 }
const pass = q.p90 < THRESH.chordScatterP90Ms && q.p99 < THRESH.chordScatterP99Ms

console.log('--- Re-align scatter (alignChordOnsets on parsed MIDI) ---')
console.log(`MIDI path | ${midiPath}`)
console.log(`Notes (aligned) | ${aligned.length}`)
console.log(`BPM used | ${bpm}`)
console.log(`Chord onset scatter p50 (ms) | ${Number.isFinite(q.p50) ? q.p50.toFixed(2) : 'n/a'}`)
console.log(`Chord onset scatter p90 (ms) | ${Number.isFinite(q.p90) ? q.p90.toFixed(2) : 'n/a'}`)
console.log(`Chord onset scatter p99 (ms) | ${Number.isFinite(q.p99) ? q.p99.toFixed(2) : 'n/a'}`)
console.log(`Thresholds | p90<${THRESH.chordScatterP90Ms}ms, p99<${THRESH.chordScatterP99Ms}ms`)
console.log(`Verdict (re-align sim) | ${pass ? 'PASS' : 'FAIL'}`)

process.exit(pass ? 0 : 1)
