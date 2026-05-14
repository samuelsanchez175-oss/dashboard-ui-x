import * as Tone from 'tone'
import { midiToTone } from './chords'

/**
 * One recorded note: MIDI number + start time (in seconds, song-local) +
 * duration. We keep things in seconds so MIDI export is trivial.
 */
export interface RecordedNote {
  midi: number
  start: number       // seconds from recording start
  duration: number    // seconds
  velocity: number    // 0–1
}

/**
 * Audio engine — single PolySynth + a metronome click. Lazy-initialised on
 * first user gesture (browser AudioContext policy).
 */
class PianoEngine {
  private synth: Tone.PolySynth | null = null
  private clickHi: Tone.MembraneSynth | null = null
  private clickLo: Tone.MembraneSynth | null = null
  private started = false

  /** Active note start-times keyed by MIDI number, used to compute durations. */
  private active = new Map<number, number>()

  /** All finalized notes for the current recording session. */
  private recorded: RecordedNote[] = []

  /** Wall-clock time when recording started (seconds). null = not recording. */
  private recStart: number | null = null

  private metronomeLoop: number | null = null

  async ensureStarted() {
    if (this.started) return
    await Tone.start()
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.15, sustain: 0.4, release: 0.6 },
    }).toDestination()
    this.synth.volume.value = -6

    this.clickHi = new Tone.MembraneSynth({
      pitchDecay: 0.005, octaves: 4,
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.05 },
    }).toDestination()
    this.clickHi.volume.value = -8

    this.clickLo = new Tone.MembraneSynth({
      pitchDecay: 0.008, octaves: 2,
      envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.05 },
    }).toDestination()
    this.clickLo.volume.value = -14

    this.started = true
  }

  /** Press a key (note-on). */
  async noteOn(midi: number, velocity = 0.8) {
    await this.ensureStarted()
    this.synth!.triggerAttack(midiToTone(midi), Tone.now(), velocity)
    if (this.recStart !== null) {
      this.active.set(midi, performance.now() / 1000 - this.recStart)
    }
  }

  /** Release a key (note-off). */
  noteOff(midi: number) {
    if (!this.synth) return
    this.synth.triggerRelease(midiToTone(midi), Tone.now())
    if (this.recStart !== null && this.active.has(midi)) {
      const start = this.active.get(midi)!
      const now = performance.now() / 1000 - this.recStart
      this.recorded.push({
        midi,
        start,
        duration: Math.max(0.05, now - start),
        velocity: 0.8,
      })
      this.active.delete(midi)
    }
  }

  /** Strike a chord with a fixed gate length, recording each note. */
  async playChord(midis: number[], gateSec = 0.6) {
    await this.ensureStarted()
    for (const m of midis) await this.noteOn(m)
    setTimeout(() => midis.forEach(m => this.noteOff(m)), gateSec * 1000)
  }

  /* ── Recording ── */

  startRecording() {
    this.recorded = []
    this.active.clear()
    this.recStart = performance.now() / 1000
  }

  stopRecording(): RecordedNote[] {
    // Flush any still-held notes.
    if (this.recStart !== null) {
      const now = performance.now() / 1000 - this.recStart
      for (const [midi, start] of this.active) {
        this.recorded.push({
          midi, start,
          duration: Math.max(0.05, now - start),
          velocity: 0.8,
        })
      }
    }
    this.active.clear()
    this.recStart = null
    return [...this.recorded]
  }

  isRecording() { return this.recStart !== null }

  getRecorded(): RecordedNote[] { return [...this.recorded] }

  setRecorded(notes: RecordedNote[]) { this.recorded = [...notes] }

  /** Schedule playback of a recorded sequence. Returns approx duration. */
  async playback(notes: RecordedNote[], onDone?: () => void): Promise<number> {
    await this.ensureStarted()
    if (!notes.length) {
      onDone?.()
      return 0
    }
    const t0 = Tone.now() + 0.1
    let endsAt = 0
    for (const n of notes) {
      const noteName = midiToTone(n.midi)
      this.synth!.triggerAttackRelease(
        noteName,
        Math.max(0.05, n.duration),
        t0 + n.start,
        n.velocity,
      )
      endsAt = Math.max(endsAt, n.start + n.duration)
    }
    setTimeout(() => onDone?.(), (endsAt + 0.2) * 1000)
    return endsAt
  }

  /* ── Metronome ── */

  startMetronome(bpm: number) {
    this.stopMetronome()
    this.ensureStarted()
    const periodMs = 60_000 / bpm
    let beat = 0
    const tick = () => {
      const synth = beat % 4 === 0 ? this.clickHi : this.clickLo
      synth?.triggerAttackRelease(beat % 4 === 0 ? 'C5' : 'C4', 0.03)
      beat++
    }
    tick()
    this.metronomeLoop = window.setInterval(tick, periodMs)
  }

  stopMetronome() {
    if (this.metronomeLoop !== null) {
      clearInterval(this.metronomeLoop)
      this.metronomeLoop = null
    }
  }

  isMetronomeRunning() { return this.metronomeLoop !== null }

  /**
   * Hard-stop everything currently sounding from the polysynth.
   * Use this to interrupt a `playback()` mid-flight (it cancels scheduled
   * releases by releasing all held voices immediately).
   */
  stopAll() {
    if (!this.synth) return
    try {
      this.synth.releaseAll(Tone.now())
    } catch {
      /* synth may already be disposed */
    }
  }
}

export const piano = new PianoEngine()
