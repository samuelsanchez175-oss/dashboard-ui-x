#!/usr/bin/env node
/**
 * Proxy metrics for chord-export MIDI QA: low-register rate, same-pitch runs.
 * Usage: node scripts/chord-midi-extra-metrics.mjs [path.mid]
 */
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const { Midi } = require("@tonejs/midi");

const BASS_MIDI = 48;
const midiPath =
  process.argv[2] ||
  "/Users/samuel/Downloads/Frank Ocean Acura Integurl Instrumental-chords (5).mid";

const buf = fs.readFileSync(midiPath);
const midi = new Midi(buf);

/** @type {{ tMs: number; durationMs: number; midi: number }[]} */
const notes = [];
for (const track of midi.tracks) {
  for (const n of track.notes) {
    notes.push({
      tMs: n.time * 1000,
      durationMs: n.duration * 1000,
      midi: n.midi,
    });
  }
}
notes.sort((a, b) => a.tMs - b.tMs);

const durationSec = midi.duration || 0;
const minutes = Math.max(durationSec / 60, 1e-9);
const bassCount = notes.filter((n) => n.midi < BASS_MIDI).length;
const bassPerMin = bassCount / minutes;

let maxRun = 0;
let run = 0;
let prevMidi = NaN;
for (const n of notes) {
  if (n.midi === prevMidi) {
    run++;
    maxRun = Math.max(maxRun, run);
  } else {
    prevMidi = n.midi;
    run = 1;
    maxRun = Math.max(maxRun, 1);
  }
}

/** Same pitch re-onset within 45 ms (blip / duplicate attack proxy). */
let blipPairs = 0;
for (let i = 1; i < notes.length; i++) {
  const a = notes[i - 1];
  const b = notes[i];
  if (a.midi === b.midi && b.tMs - a.tMs > 0 && b.tMs - a.tMs < 45) blipPairs++;
}

console.log("MIDI path |", midiPath);
console.log("Duration (s) |", durationSec.toFixed(3));
console.log("Total notes |", notes.length);
console.log(`Notes with MIDI < ${BASS_MIDI} |`, bassCount);
console.log(`Notes MIDI < ${BASS_MIDI} per minute |`, bassPerMin.toFixed(1));
console.log("Max consecutive same MIDI (sorted by onset) |", maxRun);
console.log("Same-pitch pairs with onset gap <45ms |", blipPairs);
