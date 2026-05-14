#!/usr/bin/env node
/**
 * One-off MIDI timing audit: chord onset scatter, note density, short-note fraction.
 * Usage: node scripts/audit-chord-midi-timing.mjs [path/to/file.mid]
 * Env: MIDI_PATH, MP3_PATH (optional ffprobe)
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { Midi } = require("@tonejs/midi");

const WINDOW_MS = 60;
const SHORT_NOTE_MS = 80;
const DENSITY_BIN_S = 10;

/** @param {number[]} sorted */
function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function quantiles(values) {
  const s = [...values].sort((a, b) => a - b);
  return {
    p50: percentile(s, 50),
    p90: percentile(s, 90),
    p99: percentile(s, 99),
    n: s.length,
    min: s[0],
    max: s[s.length - 1],
  };
}

const midiPath =
  process.argv[2] ||
  process.env.MIDI_PATH ||
  "/Users/samuel/Downloads/Frank Ocean Acura Integurl Instrumental-chords (5).mid";
const mp3Path =
  process.env.MP3_PATH ||
  "/Users/samuel/Downloads/Frank Ocean Acura Integurl Instrumental.mp3";

const buf = fs.readFileSync(midiPath);
const midi = new Midi(buf);

/** @type {{ tMs: number, durationMs: number, midi: number }[]} */
const notes = [];
for (const track of midi.tracks) {
  for (const n of track.notes) {
    const tMs = n.time * 1000;
    const durationMs = n.duration * 1000;
    notes.push({ tMs, durationMs, midi: n.midi });
  }
}

notes.sort((a, b) => a.tMs - b.tMs);

/**
 * Chord clusters (disjoint): anchor at earliest unconsumed onset; take all onsets in [t0, t0+60ms];
 * if ≥2 distinct MIDI pitches, record max(start)-min(start) and skip past this window; else advance one note.
 */
const scatters = [];
let i = 0;
while (i < notes.length) {
  const t0 = notes[i].tMs;
  let j = i;
  while (j < notes.length && notes[j].tMs <= t0 + WINDOW_MS) j++;
  const cluster = notes.slice(i, j);
  const midis = new Set(cluster.map((n) => n.midi));
  if (midis.size >= 2) {
    const starts = cluster.map((n) => n.tMs);
    scatters.push(Math.max(...starts) - Math.min(...starts));
    i = j;
  } else {
    i += 1;
  }
}

const shortFrac =
  notes.length === 0
    ? 0
    : notes.filter((n) => n.durationMs < SHORT_NOTE_MS).length / notes.length;

const durationSec = midi.duration || 0;
const numBins = Math.max(1, Math.ceil(durationSec / DENSITY_BIN_S));
const density = Array.from({ length: numBins }, () => 0);
for (const n of notes) {
  const b = Math.min(numBins - 1, Math.floor(n.tMs / 1000 / DENSITY_BIN_S));
  density[b]++;
}
const densityMean = density.reduce((a, b) => a + b, 0) / numBins;
const densityMin = Math.min(...density);
const densityMax = Math.max(...density);

const scatterQ = quantiles(scatters);

/** Loose gates (documented for verifier) */
const THRESH = {
  chordScatterP90Ms: 25,
  chordScatterP99Ms: 50,
  shortNoteFracMax: 0.2,
};

const passChord = scatterQ.p90 < THRESH.chordScatterP90Ms && scatterQ.p99 < THRESH.chordScatterP99Ms;
const passShort = shortFrac <= THRESH.shortNoteFracMax;
const verdict = passChord && passShort ? "PASS" : "FAIL";

let ffprobe = null;
try {
  const r = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration:format_tags",
      "-of",
      "default=noprint_wrappers=1",
      mp3Path,
    ],
    { encoding: "utf8" },
  );
  if (r.status === 0) ffprobe = r.stdout.trim();
} catch {
  ffprobe = "(ffprobe not available)";
}

const rows = [
  ["Metric", "Value"],
  ["MIDI path", midiPath],
  ["Total notes", String(notes.length)],
  ["MIDI duration (s)", durationSec.toFixed(3)],
  ["Chord clusters (≥2 pitches, 60ms onset window)", String(scatters.length)],
  ["Chord onset scatter p50 (ms)", Number.isFinite(scatterQ.p50) ? scatterQ.p50.toFixed(2) : "n/a"],
  ["Chord onset scatter p90 (ms)", Number.isFinite(scatterQ.p90) ? scatterQ.p90.toFixed(2) : "n/a"],
  ["Chord onset scatter p99 (ms)", Number.isFinite(scatterQ.p99) ? scatterQ.p99.toFixed(2) : "n/a"],
  ["Chord scatter min/max (ms)", `${scatterQ.min?.toFixed?.(2) ?? "n/a"} / ${scatterQ.max?.toFixed?.(2) ?? "n/a"}`],
  [`Notes < ${SHORT_NOTE_MS}ms (fraction)`, shortFrac.toFixed(4)],
  ["Density per 10s bin (min/mean/max)", `${densityMin} / ${densityMean.toFixed(1)} / ${densityMax}`],
  ["Thresholds", `p90<${THRESH.chordScatterP90Ms}ms, p99<${THRESH.chordScatterP99Ms}ms, short≤${THRESH.shortNoteFracMax}`],
  ["Verdict", verdict],
];

const col0 = Math.max(...rows.map((r) => r[0].length));
for (const [k, v] of rows) {
  console.log(`${k.padEnd(col0)} | ${v}`);
}

if (ffprobe) {
  console.log("\n--- ffprobe (MP3) ---\n" + ffprobe);
}

if (verdict === "FAIL") {
  console.log("\nSuggested next knob: tighten simultaneous chord export (quantize onsets to same tick/" +
    "same ms bucket, e.g. round note starts to nearest 10–20ms grid) or increase chord-detector hop alignment " +
    "so all chord tones share one frame boundary.");
}

process.exit(verdict === "PASS" ? 0 : 1);
