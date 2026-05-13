import { Midi } from '@tonejs/midi'
import { ArrowLeft, Download, Drum, Play, Square, Waves } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import Button from '../../components/ui/Button'
import ZoneHeader from '../../components/ZoneHeader'
import { encodeMonoPcm16Wav, triggerDownload } from '../../lib/pcm-wav'
import StudioToolsHeader from './StudioToolsHeader'

interface ToolsMetronomeExportPageProps {
  onNavigate: (routeId: string) => void
}

const BPM_MIN = 40
const BPM_MAX = 240

function clampBpm(n: number): number {
  return Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(n)))
}

function playClick(ctx: AudioContext | OfflineAudioContext, time: number, accented: boolean): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = accented ? 1320 : 880
  osc.connect(gain)
  gain.connect(ctx.destination)
  const peak = accented ? 0.38 : 0.26
  gain.gain.setValueAtTime(0, time)
  gain.gain.linearRampToValueAtTime(peak, time + 0.003)
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.07)
  osc.start(time)
  osc.stop(time + 0.075)
}

async function renderClickWavAsync(opts: {
  bpm: number
  accentEvery: number
  totalBeats: number
  sampleRate: number
}): Promise<{ blob: Blob; durationSec: number }> {
  const secPerBeat = 60 / opts.bpm
  const durationSec = opts.totalBeats * secPerBeat + 0.15
  const length = Math.ceil(durationSec * opts.sampleRate)
  const offline = new OfflineAudioContext(1, length, opts.sampleRate)

  for (let i = 0; i < opts.totalBeats; i++) {
    const t = i * secPerBeat
    const accented = opts.accentEvery > 0 && i % opts.accentEvery === 0
    playClick(offline, t, accented)
  }

  const buf = await offline.startRendering()
  const mono = buf.getChannelData(0)
  const blob = encodeMonoPcm16Wav(new Float32Array(mono), opts.sampleRate)
  return { blob, durationSec }
}

export default function ToolsMetronomeExportPage({ onNavigate }: ToolsMetronomeExportPageProps) {
  const [bpm, setBpm] = useState(100)
  const [beatsPerBar, setBeatsPerBar] = useState(4)
  const [accentEvery, setAccentEvery] = useState(4)
  const [bars, setBars] = useState(8)
  const [previewOn, setPreviewOn] = useState(false)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number>(0)
  const nextBeatRef = useRef<number>(0)
  const beatIdxRef = useRef<number>(0)

  const secPerBeat = useMemo(() => 60 / bpm, [bpm])

  const ensureCtx = useCallback((): AudioContext => {
    let ctx = audioCtxRef.current
    if (!ctx || ctx.state === 'closed') {
      ctx = new AudioContext()
      audioCtxRef.current = ctx
    }
    return ctx
  }, [])

  useEffect(() => {
    if (!previewOn) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      return
    }

    const ctx = ensureCtx()
    void ctx.resume()

    nextBeatRef.current = ctx.currentTime + 0.06
    beatIdxRef.current = 0

    const tick = (): void => {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') return
      const c = audioCtxRef.current
      const lookahead = 0.14
      while (nextBeatRef.current < c.currentTime + lookahead) {
        const t = nextBeatRef.current
        const i = beatIdxRef.current
        const accented = accentEvery > 0 && i % accentEvery === 0
        playClick(c, t, accented)
        nextBeatRef.current += secPerBeat
        beatIdxRef.current++
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }, [previewOn, secPerBeat, accentEvery, ensureCtx])

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      void audioCtxRef.current?.close().catch(() => {})
      audioCtxRef.current = null
    }
  }, [])

  const maxBarsByDuration =
    beatsPerBar * secPerBeat > 0 ? 30 / (beatsPerBar * secPerBeat) : 999
  const exportBarsClamp = Math.max(1, Math.min(Math.floor(maxBarsByDuration) || 1, bars))
  const totalBeatsExport = exportBarsClamp * beatsPerBar

  const exportWav = useCallback(async () => {
    const sampleRate = 48000
    const exportBars = Math.max(1, Math.min(Math.floor(maxBarsByDuration) || 1, bars))
    const beats = exportBars * beatsPerBar
    const { blob } = await renderClickWavAsync({ bpm, accentEvery, totalBeats: beats, sampleRate })
    triggerDownload(blob, `metronome_${bpm}bpm_${exportBars}bars.wav`)
  }, [accentEvery, bpm, bars, beatsPerBar, maxBarsByDuration])

  const exportMidi = useCallback(() => {
    const midi = new Midi()
    midi.header.setTempo(bpm)
    const track = midi.addTrack()
    const exportBars = Math.max(1, Math.min(Math.floor(maxBarsByDuration) || 1, bars))
    const beatsCount = exportBars * beatsPerBar
    let t = 0
    const step = secPerBeat
    const noteDur = Math.min(0.06, step * 0.45)

    for (let i = 0; i < beatsCount; i++) {
      const vel = accentEvery > 0 && i % accentEvery === 0 ? 0.95 : 0.72
      track.addNote({ midi: 76, time: t, duration: noteDur, velocity: vel })
      t += step
    }

    const arr = midi.toArray()
    const blob = new Blob([arr as BlobPart], { type: 'audio/midi' })
    triggerDownload(blob, `metronome_${bpm}bpm_${exportBars}bars.mid`)
  }, [accentEvery, bpm, bars, beatsPerBar, maxBarsByDuration, secPerBeat])

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}
    >
      <StudioToolsHeader
        toolId="tools-metronome-export"
        crumbs={[{ label: 'Workspace' }, { label: 'Tools' }, { label: 'Metronome Export', emphasis: true }]}
        leftExtra={
          <button
            type="button"
            onClick={() => onNavigate('tools-hub')}
            className="mr-2 rounded-lg border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition hover:bg-slate-50"
            aria-label="Back to Tools Hub"
          >
            <ArrowLeft className="size-4" strokeWidth={2} />
          </button>
        }
      />

      <div className="flex-1 overflow-auto px-8 pb-16 pt-8">
        <div className="mx-auto w-full max-w-3xl">
          <ZoneHeader
            eyebrow="UTILITY"
            title="Metronome / click export"
            icon={Drum}
            description={<>Preview clicks in real time and export a WAV (or MIDI) click track capped at roughly 30 seconds. Accents repeat every <span className="font-medium" style={{ color: 'var(--text-2)' }}>N</span> beats — default matches beats per measure.</>}
            className="mb-8"
          />

          <div
            className="space-y-5 rounded-2xl p-8"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
          >
            <label className="block">
              <span className="mono text-[11px] uppercase tracking-wide text-slate-500">BPM ({BPM_MIN}–{BPM_MAX})</span>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <input
                  type="number"
                  min={BPM_MIN}
                  max={BPM_MAX}
                  value={bpm}
                  onChange={e => setBpm(clampBpm(Number(e.target.value)))}
                  className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums outline-none ring-emerald-500 focus:ring-2"
                />
                <input
                  type="range"
                  min={BPM_MIN}
                  max={BPM_MAX}
                  value={bpm}
                  onChange={e => setBpm(clampBpm(Number(e.target.value)))}
                  className="h-2 min-w-[160px] flex-1 accent-emerald-600"
                />
              </div>
            </label>

            <label className="block">
              <span className="mono text-[11px] uppercase tracking-wide text-slate-500">Time signature (beats / bar)</span>
              <input
                type="number"
                min={2}
                max={12}
                value={beatsPerBar}
                onChange={e =>
                  setBeatsPerBar(Math.min(12, Math.max(2, Math.round(Number(e.target.value) || 4))))
                }
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
              />
            </label>

            <label className="block">
              <span className="mono text-[11px] uppercase tracking-wide text-slate-500">
                Accent every N beats (downbeat pattern)
              </span>
              <input
                type="number"
                min={1}
                max={16}
                value={accentEvery}
                onChange={e =>
                  setAccentEvery(Math.min(16, Math.max(1, Math.round(Number(e.target.value) || 1))))
                }
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
              />
            </label>

            <label className="block">
              <span className="mono text-[11px] uppercase tracking-wide text-slate-500">
                Bars to export (clamped to ~30s max)
              </span>
              <input
                type="number"
                min={1}
                max={256}
                value={bars}
                onChange={e => setBars(Math.max(1, Math.min(256, Math.round(Number(e.target.value) || 1))))}
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
              />
              <p className="mt-1 text-xs text-slate-400">
                ~{totalBeatsExport} beats · max ~{maxBarsByDuration.toFixed(1)} bars at this tempo before 30s cap
              </p>
            </label>

            <div
              className="flex flex-wrap gap-2 pt-6"
              style={{ borderTop: '1px solid var(--border-soft)' }}
            >
              <Button
                variant={previewOn ? 'destructive' : 'primary'}
                onClick={() => {
                  if (previewOn) setPreviewOn(false)
                  else {
                    void ensureCtx().resume()
                    setPreviewOn(true)
                  }
                }}
                leading={previewOn ? <Square className="size-4" /> : <Play className="size-4" />}
              >
                {previewOn ? 'Stop preview' : 'Live preview'}
              </Button>
              <button
                type="button"
                onClick={() => void exportWav()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-white"
              >
                <Waves className="size-4" />
                Download WAV
              </button>
              <button
                type="button"
                onClick={exportMidi}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-white"
              >
                <Download className="size-4" />
                Download MIDI
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
