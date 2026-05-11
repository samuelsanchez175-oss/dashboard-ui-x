import {
  Circle, Square, Play, Trash2, Download, Minus, Plus,
} from 'lucide-react'

interface TransportProps {
  isRecording: boolean
  isPlaying: boolean
  hasNotes: boolean
  bpm: number
  metronomeOn: boolean
  onRecord: () => void
  onPlay: () => void
  onStop: () => void
  onClear: () => void
  onExport: () => void
  onBpmChange: (bpm: number) => void
  onToggleMetronome: () => void
}

export default function Transport({
  isRecording, isPlaying, hasNotes, bpm, metronomeOn,
  onRecord, onPlay, onStop, onClear, onExport, onBpmChange, onToggleMetronome,
}: TransportProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 bg-white rounded-xl border border-gray-200 p-3">
      {/* Record */}
      {!isRecording ? (
        <button
          onClick={onRecord}
          disabled={isPlaying}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40 text-[12px] font-semibold transition-colors"
        >
          <Circle size={11} className="fill-red-600" />
          Record
        </button>
      ) : (
        <button
          onClick={onStop}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 text-[12px] font-semibold transition-colors"
        >
          <Square size={11} className="fill-white" />
          Stop rec
        </button>
      )}

      {/* Play / Stop playback */}
      {!isPlaying ? (
        <button
          onClick={onPlay}
          disabled={!hasNotes || isRecording}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40 text-[12px] font-semibold transition-colors"
        >
          <Play size={11} className="fill-white" />
          Play
        </button>
      ) : (
        <button
          onClick={onStop}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-700 text-white hover:bg-gray-800 text-[12px] font-semibold transition-colors"
        >
          <Square size={11} className="fill-white" />
          Stop
        </button>
      )}

      {/* Clear */}
      <button
        onClick={onClear}
        disabled={!hasNotes || isRecording || isPlaying}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-50 text-gray-600 hover:bg-gray-100 disabled:opacity-40 text-[12px] font-medium transition-colors"
      >
        <Trash2 size={11} />
        Clear
      </button>

      <div className="h-6 w-px bg-gray-200 mx-1" />

      {/* Tempo */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400">Tempo</span>
        <button
          onClick={() => onBpmChange(Math.max(40, bpm - 1))}
          className="w-6 h-6 rounded-md bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-600"
        >
          <Minus size={11} />
        </button>
        <input
          type="number"
          min={40}
          max={240}
          value={bpm}
          onChange={e => onBpmChange(Math.max(40, Math.min(240, +e.target.value || 120)))}
          className="w-14 text-center text-[12px] font-mono text-gray-800 bg-gray-50 border border-gray-200 rounded-md py-1"
        />
        <button
          onClick={() => onBpmChange(Math.min(240, bpm + 1))}
          className="w-6 h-6 rounded-md bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-600"
        >
          <Plus size={11} />
        </button>
        <span className="text-[10px] font-mono text-gray-400">BPM</span>
      </div>

      {/* Metronome toggle */}
      <button
        onClick={onToggleMetronome}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors
          ${metronomeOn
            ? 'bg-purple-100 text-purple-700'
            : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
          }
        `}
      >
        <span className={metronomeOn ? 'animate-pulse' : ''}>●</span>
        Metronome
      </button>

      <div className="flex-1" />

      {/* Export */}
      <button
        onClick={onExport}
        disabled={!hasNotes || isRecording}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-900 text-white hover:bg-black disabled:opacity-40 text-[12px] font-semibold transition-colors"
      >
        <Download size={11} />
        Export .mid
      </button>
    </div>
  )
}
