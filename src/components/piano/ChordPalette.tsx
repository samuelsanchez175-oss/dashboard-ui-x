import { CHORD_QUALITIES, buildChord, midiToName } from './chords'

interface ChordPaletteProps {
  /** When true, each keyboard press plays / highlights the full chord shape below (root = key you press). */
  chordVoicingEnabled: boolean
  onChordVoicingEnabledChange: (on: boolean) => void
  qualityId: string
  onQualityChange: (id: string) => void
  inversion: number
  onInversionChange: (inv: number) => void
}

/** Fixed preview root for the notes strip — shape matches what you get when you press C4 in chord mode. */
const PREVIEW_ROOT_SEMIS = 0
const PREVIEW_OCTAVE = 4

export default function ChordPalette({
  chordVoicingEnabled,
  onChordVoicingEnabledChange,
  qualityId,
  onQualityChange,
  inversion,
  onInversionChange,
}: ChordPaletteProps) {
  const quality = CHORD_QUALITIES.find(q => q.id === qualityId) ?? CHORD_QUALITIES[0]
  const previewMidis = buildChord(PREVIEW_ROOT_SEMIS, PREVIEW_OCTAVE, quality.intervals, inversion)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-gray-800">Chord palette</h3>
        <label className="flex items-center gap-2 cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={chordVoicingEnabled}
            onChange={e => onChordVoicingEnabledChange(e.target.checked)}
            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
          />
          <span className="text-[11px] font-medium text-gray-700">Chord shapes on keyboard</span>
        </label>
      </div>

      <p className="text-[11px] text-gray-500 leading-snug">
        {chordVoicingEnabled ? (
          <>
            Pick quality and inversion, then play — each key you press is the <strong className="text-gray-800">chord root</strong>.
            The main piano lights (and sounds) every note in the chord.
          </>
        ) : (
          <>Turn on <strong className="text-gray-800">Chord shapes on keyboard</strong> to voice chords from the typing keyboard.</>
        )}
      </p>

      <div className="flex items-center justify-between gap-2 rounded-md bg-gray-50 px-3 py-2 border border-gray-100">
        <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400">Shape</span>
        <span className="text-[10px] font-mono text-gray-600 uppercase tracking-wider text-right">
          {quality.label}
          {inversion > 0 ? ` · inv ${inversion}` : ''}
          <span className="text-gray-400 font-normal normal-case"> · e.g. at C4</span>
        </span>
      </div>

      {/* Quality */}
      <div>
        <label className="text-[10px] font-mono uppercase tracking-wider text-gray-400">Quality</label>
        <select
          value={qualityId}
          onChange={e => onQualityChange(e.target.value)}
          className="mt-1 w-full rounded-md border border-gray-200 bg-white py-1.5 px-2 text-[12px] text-gray-700 focus:border-purple-400 focus:outline-none"
        >
          {CHORD_QUALITIES.map(q => (
            <option key={q.id} value={q.id}>{q.label}</option>
          ))}
        </select>
      </div>

      {/* Inversion */}
      <div>
        <label className="text-[10px] font-mono uppercase tracking-wider text-gray-400">Inversion</label>
        <div className="mt-1 flex items-center gap-1 max-w-[11rem]">
          <button
            type="button"
            onClick={() => onInversionChange(Math.max(0, inversion - 1))}
            className="w-8 h-8 rounded-md bg-gray-50 hover:bg-gray-100 text-gray-600 text-sm border border-gray-200"
          >
            −
          </button>
          <span className="flex-1 text-center text-[12px] font-mono text-gray-700">{inversion}</span>
          <button
            type="button"
            onClick={() => onInversionChange(Math.min(3, inversion + 1))}
            className="w-8 h-8 rounded-md bg-gray-50 hover:bg-gray-100 text-gray-600 text-sm border border-gray-200"
          >
            +
          </button>
        </div>
      </div>

      {/* Voicing preview (reference at C4 — actual roots follow your keys) */}
      <div className="rounded-md bg-gray-50 px-3 py-2 border border-gray-100">
        <div className="text-[10px] font-mono uppercase tracking-wider text-gray-400 mb-1">
          Notes at C4 (preview)
        </div>
        <div className="text-[12px] font-mono text-gray-700">
          {previewMidis.map(midiToName).join(' · ')}
        </div>
      </div>
    </div>
  )
}
