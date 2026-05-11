import getRhymingPart from 'rhyming-part'
import { useCallback, useEffect, useId, useState } from 'react'
import { Loader2, Sparkles, Wand2 } from 'lucide-react'
import { findRhymesCmudict, ensureRhymeIndexBuilt, GRAP_THEME_RULES, type RhymeSuggestion } from '../../lib/grap-engine'

export default function GrapEngineStudio() {
  const inputId = useId()
  const [word, setWord] = useState('')
  const [includeSlant, setIncludeSlant] = useState(false)
  const [indexReady, setIndexReady] = useState(false)
  const [indexError, setIndexError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [rhymes, setRhymes] = useState<RhymeSuggestion[]>([])
  const [rhymeKeys, setRhymeKeys] = useState<string[]>([])
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        await ensureRhymeIndexBuilt()
        if (alive) setIndexReady(true)
      } catch {
        if (alive) {
          setIndexError('Could not load CMU pronouncing dictionary chunk.')
          setIndexReady(false)
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const previewKey = word.trim()
    ? (() => {
        const raw = getRhymingPart(word.toLowerCase().trim(), { multiple: false })
        return typeof raw === 'string' && raw ? raw : null
      })()
    : null

  const runSearch = useCallback(async () => {
    const w = word.trim()
    if (!w) {
      setHint('Enter a dictionary headword.')
      setRhymes([])
      setRhymeKeys([])
      return
    }
    setLoading(true)
    setHint(null)
    try {
      const { perfect, near, slant, unknownWord, rhymeKeys: keys } = await findRhymesCmudict({
        inputWord: w,
        maxPerfect: 80,
        maxNear: 48,
        maxSlant: 48,
        includeSlant,
        excludeExact: true,
      })

      setRhymeKeys(keys)
      if (unknownWord) {
        setRhymes([])
        setHint(`No CMU pronunciation for “${w}”. Try another spelling or hyphenation.`)
        return
      }
      const merged =
        includeSlant ? [...perfect, ...near, ...slant] : [...perfect, ...near]
      setRhymes(merged)
      if (!merged.length)
        setHint(`No rhyme matches for keys ${keys.join(' · ') || '(empty)'}`)
    } catch {
      setHint('Rhyme lookup failed — try reloading.')
      setRhymes([])
      setRhymeKeys([])
    } finally {
      setLoading(false)
    }
  }, [word, includeSlant])

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-gray-50 to-white">
      <div className="max-w-[1200px] mx-auto p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles size={22} className="text-purple-600" aria-hidden />
              <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">
                G Rap Engine
              </h1>
            </div>
            <p className="text-[12px] text-gray-500 max-w-xl">
              Journal-grade rhyme discovery: CMUdict ARPAbet keys grouped with the{' '}
              <span className="font-mono text-gray-700">rhyming-part</span> tonic nucleus + optional stress-stripped
              “slant” relatives. Mirrors the lyric journal flow (phonetic-first, pocket-aware).
            </p>
          </div>
          <div className="text-right text-[10px] font-mono text-gray-400 uppercase tracking-wider space-y-1">
            <div>{indexReady ? 'CMU index ready' : indexError ?? 'Hydrating phoneme index…'}</div>
            {previewKey && <div className="text-purple-600 normal-case">live key: {previewKey}</div>}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label htmlFor={inputId} className="block text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">
                Headword
              </label>
              <input
                id={inputId}
                type="text"
                value={word}
                onChange={e => setWord(e.target.value)}
                placeholder="flow, cosmos, violet…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-purple-500 focus:ring-1 focus:ring-purple-400 outline-none"
                onKeyDown={e => {
                  if (e.key === 'Enter') void runSearch()
                }}
                disabled={!indexReady}
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer pb-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={includeSlant}
                onChange={e => setIncludeSlant(e.target.checked)}
                className="rounded border-gray-300 text-purple-600 focus:ring-purple-400"
              />
              Include slant (stress-less family)
            </label>
            <button
              type="button"
              onClick={() => void runSearch()}
              disabled={!indexReady || loading}
              className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="animate-spin size-4" /> : <Wand2 size={16} />}
              Find rhymes
            </button>
          </div>
          {hint && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5" role="status">
              {hint}
            </p>
          )}
          {rhymeKeys.length > 0 && (
            <p className="text-[11px] text-gray-400 font-mono">
              rhyme keys ({rhymeKeys.length}):{' '}
              <span className="text-gray-600">{rhymeKeys.join(' · ')}</span>
            </p>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr,minmax(220px,.35fr)]">
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-[13px] font-semibold text-gray-800 flex items-center justify-between mb-3">
              Suggestions
              <span className="text-[10px] font-mono text-gray-400 uppercase">{rhymes.length} items</span>
            </h2>
            {!rhymes.length && !hint && (
              <p className="text-sm text-gray-400">Try a CMU-listed word above — clusters update instantly.</p>
            )}
            {rhymes.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {rhymes.map(r => (
                  <li key={`${r.tier}:${r.word}`}>
                    <span
                      title={
                        r.tier === 'slant'
                          ? 'Slant — shared vowel base'
                          : r.tier === 'near'
                            ? 'Near — same stressed nucleus'
                            : 'Perfect — nucleus + coda match'
                      }
                      className={`inline-block rounded-full px-3 py-1 text-xs font-medium tabular-nums border ${
                        r.tier === 'slant'
                          ? 'border-amber-200 bg-amber-50 text-amber-900'
                          : r.tier === 'near'
                            ? 'border-blue-200 bg-blue-50 text-blue-900'
                            : 'border-purple-200 bg-purple-50 text-purple-900'
                      }`}
                    >
                      {r.word}
                      {r.tier !== 'perfect' && (
                        <span className="ml-1 text-[9px] uppercase opacity-60">{r.tier}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside className="rounded-xl border border-gray-200 bg-gradient-to-b from-white to-purple-50/40 p-4 shadow-sm space-y-3">
            <h3 className="text-[12px] font-semibold text-gray-800 uppercase tracking-wide">Theme cues (static RAG)</h3>
            <ul className="space-y-2">
              {GRAP_THEME_RULES.map(rule => (
                <li key={rule.id} className="text-[11px] text-gray-600 leading-snug border-l-2 border-purple-200 pl-2">
                  <span className="font-semibold text-gray-800">{rule.title}: </span>
                  {rule.detail}
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </div>
  )
}
