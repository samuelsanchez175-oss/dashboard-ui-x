/**
 * Chord theory: each chord quality is an array of semitone offsets from the root.
 * MIDI numbers: C4 = 60, so C4 maj7 = [60, 64, 67, 71].
 */

export const ROOTS = [
  { id: 'C',  label: 'C',  semis: 0 },
  { id: 'Db', label: 'C♯/D♭', semis: 1 },
  { id: 'D',  label: 'D',  semis: 2 },
  { id: 'Eb', label: 'D♯/E♭', semis: 3 },
  { id: 'E',  label: 'E',  semis: 4 },
  { id: 'F',  label: 'F',  semis: 5 },
  { id: 'Gb', label: 'F♯/G♭', semis: 6 },
  { id: 'G',  label: 'G',  semis: 7 },
  { id: 'Ab', label: 'G♯/A♭', semis: 8 },
  { id: 'A',  label: 'A',  semis: 9 },
  { id: 'Bb', label: 'A♯/B♭', semis: 10 },
  { id: 'B',  label: 'B',  semis: 11 },
] as const

export interface ChordQuality {
  id: string
  label: string
  intervals: number[]
}

export const CHORD_QUALITIES: ChordQuality[] = [
  { id: 'maj',    label: 'Major',          intervals: [0, 4, 7] },
  { id: 'min',    label: 'minor',          intervals: [0, 3, 7] },
  { id: 'dim',    label: 'dim',            intervals: [0, 3, 6] },
  { id: 'aug',    label: 'aug',            intervals: [0, 4, 8] },
  { id: 'sus2',   label: 'sus2',           intervals: [0, 2, 7] },
  { id: 'sus4',   label: 'sus4',           intervals: [0, 5, 7] },
  { id: 'maj7',   label: 'Major 7',        intervals: [0, 4, 7, 11] },
  { id: 'min7',   label: 'minor 7',        intervals: [0, 3, 7, 10] },
  { id: 'dom7',   label: '7 (dominant)',   intervals: [0, 4, 7, 10] },
  { id: 'min7b5', label: 'm7♭5 (half-dim)',intervals: [0, 3, 6, 10] },
  { id: 'dim7',   label: 'dim 7',          intervals: [0, 3, 6, 9] },
  { id: 'maj9',   label: 'Major 9',        intervals: [0, 4, 7, 11, 14] },
  { id: 'min9',   label: 'minor 9',        intervals: [0, 3, 7, 10, 14] },
  { id: 'dom9',   label: '9 (dominant)',   intervals: [0, 4, 7, 10, 14] },
  { id: 'add9',   label: 'add9',           intervals: [0, 4, 7, 14] },
  { id: 'min11',  label: 'minor 11',       intervals: [0, 3, 7, 10, 14, 17] },
  { id: 'maj13',  label: 'Major 13',       intervals: [0, 4, 7, 11, 14, 21] },
  { id: 'min13',  label: 'minor 13',       intervals: [0, 3, 7, 10, 14, 21] },
]

/**
 * Compute the MIDI numbers for a chord at a given root + octave.
 * `inversion` rotates the chord upward (1 → 1st inversion, etc.).
 */
export function buildChord(
  rootSemis: number,
  octave: number,
  intervals: number[],
  inversion: number = 0,
): number[] {
  const baseMidi = (octave + 1) * 12 + rootSemis // C4 = 60
  const notes = intervals.map(i => baseMidi + i)
  // Apply inversion by raising the bottom note(s) up an octave.
  const inv = ((inversion % notes.length) + notes.length) % notes.length
  for (let i = 0; i < inv; i++) {
    notes[i] += 12
  }
  return notes.sort((a, b) => a - b)
}

/** Build a chord rooted at the pitch of `triggerMidi` (keyboard key), same octave convention as `buildChord`. */
export function buildChordFromTriggerMidi(
  triggerMidi: number,
  intervals: number[],
  inversion: number = 0,
): number[] {
  const rootSemis = ((triggerMidi % 12) + 12) % 12
  const octave = Math.floor(triggerMidi / 12) - 1
  return buildChord(rootSemis, octave, intervals, inversion)
}

/** Convert a MIDI number to a display name (e.g. 60 → "C4"). */
export function midiToName(midi: number): string {
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
  const octave = Math.floor(midi / 12) - 1
  const name = names[midi % 12]
  return `${name}${octave}`
}

/** Convert MIDI to scientific pitch (e.g. 60 → "C4") for Tone.js. */
export function midiToTone(midi: number): string {
  const sharps = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const octave = Math.floor(midi / 12) - 1
  return `${sharps[midi % 12]}${octave}`
}

/* ───── Scales ───── */

export interface Scale {
  id: string
  label: string
  /** Semitone offsets from the root, ascending within an octave. */
  intervals: number[]
}

export const SCALES: Scale[] = [
  { id: 'none',            label: 'None',                  intervals: [] },
  { id: 'major',           label: 'Major (Ionian)',        intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'minor',           label: 'Natural minor (Aeolian)', intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'harmonic-minor',  label: 'Harmonic minor',        intervals: [0, 2, 3, 5, 7, 8, 11] },
  { id: 'melodic-minor',   label: 'Melodic minor',         intervals: [0, 2, 3, 5, 7, 9, 11] },
  { id: 'dorian',          label: 'Dorian',                intervals: [0, 2, 3, 5, 7, 9, 10] },
  { id: 'phrygian',        label: 'Phrygian',              intervals: [0, 1, 3, 5, 7, 8, 10] },
  { id: 'lydian',          label: 'Lydian',                intervals: [0, 2, 4, 6, 7, 9, 11] },
  { id: 'mixolydian',      label: 'Mixolydian',            intervals: [0, 2, 4, 5, 7, 9, 10] },
  { id: 'locrian',          label: 'Locrian',              intervals: [0, 1, 3, 5, 6, 8, 10] },
  { id: 'major-pent',      label: 'Major pentatonic',      intervals: [0, 2, 4, 7, 9] },
  { id: 'minor-pent',      label: 'Minor pentatonic',      intervals: [0, 3, 5, 7, 10] },
  { id: 'blues',           label: 'Blues',                 intervals: [0, 3, 5, 6, 7, 10] },
  { id: 'chromatic',       label: 'Chromatic',             intervals: [0,1,2,3,4,5,6,7,8,9,10,11] },
]

/**
 * Return a Set of pitch-classes (0–11) that belong to the given scale at root.
 * Used by the keyboard to tint in-scale keys.
 */
export function scalePitchClasses(rootSemis: number, scale: Scale): Set<number> {
  if (!scale.intervals.length) return new Set()
  return new Set(scale.intervals.map(i => (rootSemis + i) % 12))
}
