/**
 * MIDI file inspector — structure, timing-grid fit, and bar-level loop detection.
 *
 *   node scripts/inspect-midi-file.mjs /path/to/file.mid
 *
 * Used to understand a reference MIDI (e.g. a hand-cleaned target) so the chord
 * detector's "structure / loop" 2nd pass can be designed against real data.
 */
import tonejsMidi from '@tonejs/midi'
import path from 'node:path'

const { Midi } = tonejsMidi
const NN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const nm = (m) => `${NN[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`
const r = (x, d = 3) => Math.round((Number(x) || 0) * 10 ** d) / 10 ** d

const INPUT = process.argv[2]
if (!INPUT) {
  console.error('usage: node scripts/inspect-midi-file.mjs /path/to/file.mid')
  process.exit(1)
}

const buf = await import('node:fs').then((fs) => fs.readFileSync(INPUT))
const midi = new Midi(buf)

const notes = midi.tracks.flatMap((t) =>
  t.notes.map((n) => ({ midi: n.midi, startSec: n.time, durationSec: n.duration, velocity: n.velocity })),
)
notes.sort((a, b) => a.startSec - b.startSec || a.midi - b.midi)

const bpm = midi.header.tempos[0]?.bpm ?? 120
const durationSec = midi.duration
const midis = notes.map((n) => n.midi)

console.log(`=== ${path.basename(INPUT)} ===`)
console.log(`ppq ${midi.header.ppq}  tempo ${r(bpm, 2)}  duration ${r(durationSec, 2)}s`)
console.log(`tracks ${midi.tracks.length}  total notes ${notes.length}`)
midi.tracks.forEach((t, i) => {
  if (t.notes.length) {
    const tm = t.notes.map((n) => n.midi)
    console.log(`  track ${i} "${t.name || ''}" — ${t.notes.length} notes, ${nm(Math.min(...tm))}..${nm(Math.max(...tm))}`)
  }
})
if (notes.length === 0) {
  console.log('no notes — nothing else to analyze')
  process.exit(0)
}

console.log(`pitch range ${nm(Math.min(...midis))}..${nm(Math.max(...midis))}`)
const tsig = midi.header.timeSignatures[0]
console.log(`time signature ${tsig ? tsig.timeSignature.join('/') : '(none — assume 4/4)'}`)

/* ── Timing grid fit ── */
const spqn = 60 / bpm
const grids = {
  '1/4': spqn,
  '1/8': spqn / 2,
  '1/8T': spqn / 3,
  '1/16': spqn / 4,
  '1/16T': spqn / 6,
  '1/32': spqn / 8,
}
console.log('\n[grid fit] % of note starts within 10ms of each grid (anchored at first note):')
const t0 = notes[0].startSec
for (const [label, g] of Object.entries(grids)) {
  const within = notes.filter((n) => {
    const x = n.startSec - t0
    return Math.abs(x - Math.round(x / g) * g) <= 0.01
  }).length
  console.log(`  ${label.padEnd(6)} ${((within / notes.length) * 100).toFixed(0)}%`)
}
const eitherGrid = notes.filter((n) => {
  const x = n.startSec - t0
  const a = Math.abs(x - Math.round(x / grids['1/16']) * grids['1/16'])
  const b = Math.abs(x - Math.round(x / grids['1/16T']) * grids['1/16T'])
  return Math.min(a, b) <= 0.01
}).length
console.log(`  1/16 or 1/16T combined: ${((eitherGrid / notes.length) * 100).toFixed(0)}%`)

/* ── Bar-level loop detection (the algorithm proposed in the design spec) ── */
const beatsPerBar = tsig ? tsig.timeSignature[0] : 4
const barSec = beatsPerBar * spqn
const sixteenthSec = barSec / 16
const totalBars = Math.floor((durationSec - t0) / barSec)
console.log(`\n[loop] barSec ${r(barSec, 3)}s  totalBars ${totalBars}`)
if (totalBars >= 2) {
  const fp = []
  for (let b = 0; b < totalBars; b++) {
    const lo = t0 + b * barSec
    const hi = lo + barSec
    const s = new Set()
    for (const n of notes) {
      if (n.startSec >= lo && n.startSec < hi) {
        s.add(`${n.midi}:${Math.round((n.startSec - lo) / sixteenthSec)}`)
      }
    }
    fp.push(s)
  }
  const sim = (A, B) => {
    if (A.size === 0 && B.size === 0) return 1
    if (A.size === 0 || B.size === 0) return 0
    let inter = 0
    for (const x of A) if (B.has(x)) inter++
    return inter / (A.size + B.size - inter)
  }
  for (const P of [1, 2, 4, 8, 16]) {
    if (2 * P > totalBars) continue
    let sum = 0
    let cnt = 0
    for (let i = 0; i + P < totalBars; i++) {
      sum += sim(fp[i], fp[i + P])
      cnt++
    }
    const mean = cnt ? sum / cnt : 0
    console.log(`  period ${String(P).padStart(2)} bars — mean self-similarity ${r(mean, 3)}${mean >= 0.7 ? '  <= LOOP' : ''}`)
  }
  // average notes per bar (structure density)
  const perBar = fp.map((s) => s.size)
  console.log(`  notes/bar: min ${Math.min(...perBar)} max ${Math.max(...perBar)} avg ${r(perBar.reduce((a, b) => a + b, 0) / perBar.length, 1)}`)
} else {
  console.log('  too short for loop detection')
}

/* ── polyphony + same-pitch overlaps ── */
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
  if (cur > maxPoly) maxPoly = cur
}
const byMidi = new Map()
for (const n of notes) {
  if (!byMidi.has(n.midi)) byMidi.set(n.midi, [])
  byMidi.get(n.midi).push(n)
}
let overlaps = 0
for (const [, arr] of byMidi) {
  arr.sort((a, b) => a.startSec - b.startSec)
  for (let i = 0; i < arr.length - 1; i++) {
    if (arr[i + 1].startSec < arr[i].startSec + arr[i].durationSec - 0.005) overlaps++
  }
}
console.log(`\n[structure] maxPolyphony ${maxPoly}  same-pitch overlaps ${overlaps}`)
const durs = notes.map((n) => n.durationSec).sort((a, b) => a - b)
console.log(`note durations: min ${r(durs[0])} med ${r(durs[durs.length >> 1])} max ${r(durs[durs.length - 1])}`)
console.log(`density ${r(notes.length / durationSec, 2)} notes/sec`)
