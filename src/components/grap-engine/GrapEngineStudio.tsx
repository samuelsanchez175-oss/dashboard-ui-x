import getRhymingPart from 'rhyming-part'
import { useCallback, useEffect, useId, useState } from 'react'
import { Loader2, Sparkles, Wand2 } from 'lucide-react'
import { findRhymesCmudict, ensureRhymeIndexBuilt, GRAP_THEME_RULES, type RhymeSuggestion } from '../../lib/grap-engine'
import { Card, SectionHeader, Icon } from '../ui'

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
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-card)' }}>
      <div className="max-w-[1200px] mx-auto p-8 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Icon icon={Sparkles} size="md" style={{ color: 'var(--accent-fg)' }} />
              <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>
                G Rap Engine
              </h1>
            </div>
            <p className="text-[12px] max-w-xl" style={{ color: 'var(--text-3)' }}>
              Journal-grade rhyme discovery: CMUdict ARPAbet keys grouped with the{' '}
              <span className="font-mono" style={{ color: 'var(--text-2)' }}>rhyming-part</span> tonic nucleus + optional stress-stripped
              “slant” relatives. Mirrors the lyric journal flow (phonetic-first, pocket-aware).
            </p>
          </div>
          <div className="text-right text-[10px] font-mono uppercase tracking-wider space-y-1" style={{ color: 'var(--text-4)' }}>
            <div>{indexReady ? 'CMU index ready' : indexError ?? 'Hydrating phoneme index…'}</div>
            {previewKey && <div className="normal-case" style={{ color: 'var(--accent-fg)' }}>live key: {previewKey}</div>}
          </div>
        </div>

        <Card padding="sm" className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label htmlFor={inputId} className="block text-[11px] font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--text-3)' }}>
                Headword
              </label>
              <input
                id={inputId}
                type="text"
                value={word}
                onChange={e => setWord(e.target.value)}
                placeholder="flow, cosmos, violet…"
                className="w-full rounded-lg px-3 py-2 text-sm placeholder:opacity-60 outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                style={{
                  border: '1px solid var(--border)',
                  color: 'var(--text-1)',
                  background: 'var(--bg-card)',
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') void runSearch()
                }}
                disabled={!indexReady}
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer pb-2 text-xs" style={{ color: 'var(--text-2)' }}>
              <input
                type="checkbox"
                checked={includeSlant}
                onChange={e => setIncludeSlant(e.target.checked)}
                className="rounded"
                style={{
                  borderColor: 'var(--border)',
                  accentColor: 'var(--accent)',
                }}
              />
              Include slant (stress-less family)
            </label>
            <button
              type="button"
              onClick={() => void runSearch()}
              disabled={!indexReady || loading}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{
                background: 'var(--accent)',
                color: 'var(--accent-fg)',
                boxShadow: 'var(--shadow-sm)',
              }}
              onMouseEnter={e => {
                if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--accent-hover)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'var(--accent)'
              }}
            >
              {loading ? <Loader2 className="animate-spin size-4" /> : <Icon icon={Wand2} size="sm" />}
              Find rhymes
            </button>
          </div>
          {hint && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5" role="status">
              {hint}
            </p>
          )}
          {rhymeKeys.length > 0 && (
            <p className="text-[11px] font-mono" style={{ color: 'var(--text-4)' }}>
              rhyme keys ({rhymeKeys.length}):{' '}
              <span style={{ color: 'var(--text-2)' }}>{rhymeKeys.join(' · ')}</span>
            </p>
          )}
        </Card>

        <div className="grid gap-4 lg:grid-cols-[1fr,minmax(220px,.35fr)]">
          <Card padding="sm" role="region" aria-label="Suggestions">
            <SectionHeader
              size="sm"
              trailing={<span className="text-[10px] font-mono uppercase" style={{ color: 'var(--text-4)' }}>{rhymes.length} items</span>}
              className="mb-3"
            >
              Suggestions
            </SectionHeader>
            {!rhymes.length && !hint && (
              <p className="text-sm" style={{ color: 'var(--text-4)' }}>Try a CMU-listed word above — clusters update instantly.</p>
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
                            : ''
                      }`}
                      style={
                        r.tier === 'perfect'
                          ? {
                              borderColor: 'var(--accent-soft-2)',
                              background: 'var(--accent-soft)',
                              color: 'var(--accent-fg)',
                            }
                          : undefined
                      }
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
          </Card>

          <Card padding="sm" role="complementary" aria-label="Theme cues" className="space-y-3">
            <SectionHeader size="sm">Theme cues (static RAG)</SectionHeader>
            <ul className="space-y-2">
              {GRAP_THEME_RULES.map(rule => (
                <li
                  key={rule.id}
                  className="text-[11px] leading-snug pl-2"
                  style={{ color: 'var(--text-3)', borderLeft: '2px solid var(--accent-soft-2)' }}
                >
                  <span className="font-semibold" style={{ color: 'var(--text-2)' }}>{rule.title}: </span>
                  {rule.detail}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}
