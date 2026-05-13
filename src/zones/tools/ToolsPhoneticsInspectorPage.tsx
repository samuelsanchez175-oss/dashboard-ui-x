import {
  ArrowLeft,
  BookText,
  ClipboardCopy,
  Loader2,
  MicVocal,
  Music2,
  Quote,
  Sparkles,
  Tag,
  Waves,
} from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'

import Button from '../../components/ui/Button'
import ZoneHeader from '../../components/ZoneHeader'
import {
  buildAnchorFromPhonetics,
  buildFigurativePhraseCues,
  buildModelGv3Prompt,
  buildPhoneticsRhymePanel,
  findBarsByPhonetic,
  findLexiconByTheme,
  loadGroundTruthBars,
  loadLexiconTerms,
  lookupWordPronunciations,
  type FigurativePhraseCue,
  type GroundTruthBar,
  type LexiconTerm,
  type PhoneticsRhymePanel,
  type RapAnchor,
} from '../../lib/grap-engine'
import {
  publishHandoff,
  setLastHandoff,
} from '../../lib/cross-zone-handoff'
import StudioToolsHeader from './StudioToolsHeader'

interface ToolsPhoneticsInspectorPageProps {
  onNavigate: (routeId: string) => void
}

type PhoneticsRow = { word: string; prons: string[]; error?: string }

function tokenizeLyrics(raw: string): string[] {
  return raw
    .split(/\s+/)
    .map(w => w.replace(/^[^\w']+/, '').replace(/[^\w']+$/, ''))
    .filter(Boolean)
}

/* ── Style helpers (theme-aware) ─────────────────────────────────────────── */

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border:     '1px solid var(--border)',
  boxShadow:  'var(--shadow-sm)',
}

const softCardStyle: React.CSSProperties = {
  background: 'var(--bg-card-soft)',
  border:     '1px solid var(--border-soft)',
}

const monoLabel: React.CSSProperties = { color: 'var(--text-4)', fontFamily: "'DM Mono', monospace" }

function Tile({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof Sparkles
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl p-5" style={cardStyle}>
      <header className="mb-3 flex items-center gap-2.5">
        <span
          className="grid size-8 shrink-0 place-items-center rounded-lg"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }}
          aria-hidden
        >
          <Icon className="size-4" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{title}</h2>
          {hint && <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>{hint}</p>}
        </div>
      </header>
      {children}
    </section>
  )
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function ToolsPhoneticsInspectorPage({ onNavigate }: ToolsPhoneticsInspectorPageProps) {
  const [input,                setInput]                = useState('')
  const [rows,                 setRows]                 = useState<PhoneticsRow[]>([])
  const [busy,                 setBusy]                 = useState(false)
  const [lyricsAtLastAnalyze,  setLyricsAtLastAnalyze]  = useState<string | null>(null)
  const [figurativeCues,       setFigurativeCues]       = useState<FigurativePhraseCue[] | null>(null)
  const [rhymePanel,           setRhymePanel]           = useState<PhoneticsRhymePanel | null>(null)
  const [extrasBusy,           setExtrasBusy]           = useState(false)
  const [rhymeRefreshBusy,     setRhymeRefreshBusy]     = useState(false)
  const [rhymeSeedManual,      setRhymeSeedManual]      = useState<string | null>(null)

  /* Model G v3 pipeline state */
  const [anchor,   setAnchor]   = useState<RapAnchor | null>(null)
  const [gtBars,   setGtBars]   = useState<GroundTruthBar[]>([])
  const [lexicon,  setLexicon]  = useState<LexiconTerm[]>([])
  const [prompt,   setPrompt]   = useState<string>('')
  const [aiBars,   setAiBars]   = useState<string | null>(null)
  const [aiBusy,   setAiBusy]   = useState(false)
  const [aiError,  setAiError]  = useState<string | null>(null)
  const [copyHint, setCopyHint] = useState<string | null>(null)
  const [sendHint, setSendHint] = useState<string | null>(null)

  const lastSnapRef = useRef<string | null>(null)

  /* ── enrichment helpers (existing rhyme/figurative + new Model G v3) ─── */

  const runFullEnrichment = useCallback(
    async (next: PhoneticsRow[], snap: string, manualSeed: string | null, rawInput: string) => {
      setExtrasBusy(true)
      setFigurativeCues(null)
      setRhymePanel(null)
      setAnchor(null)
      setGtBars([])
      setLexicon([])
      setPrompt('')
      setAiBars(null)
      setAiError(null)
      try {
        const [cues, rhymes] = await Promise.all([
          buildFigurativePhraseCues(next, { maxSeeds: 5 }).catch(() => [] as FigurativePhraseCue[]),
          buildPhoneticsRhymePanel(next, { manualSeedWord: manualSeed }).catch(
            () =>
              ({
                seedWord:               '',
                seedFromManual:         false,
                featuredNearRhymes:     [],
                perfect:                [],
                near:                   [],
                consonantStyle:         [],
                consonantMatchKeys:     [],
                unknownSeed:            true,
              }) satisfies PhoneticsRhymePanel,
          ),
        ])
        if (lastSnapRef.current !== snap) return
        setFigurativeCues(cues)
        setRhymePanel(rhymes)

        // Model G v3 anchor + retrievals
        const rapAnchor = buildAnchorFromPhonetics(rawInput, next)
        setAnchor(rapAnchor)

        let matchedBars: GroundTruthBar[] = []
        try {
          const all     = await loadGroundTruthBars()
          const target  = rapAnchor?.rhymeWord
            ? next.find(r => r.word.toLowerCase() === rapAnchor.rhymeWord.toLowerCase())?.prons[0] ?? ''
            : ''
          matchedBars   = findBarsByPhonetic(all, target, 6)
        } catch { /* CSV unavailable */ }
        if (lastSnapRef.current !== snap) return
        setGtBars(matchedBars)

        let picks: LexiconTerm[] = []
        try {
          const terms   = await loadLexiconTerms()
          const themeHint = matchedBars[0]?.primaryTone ?? 'wealth'
          picks         = findLexiconByTheme(terms, themeHint, 6)
        } catch { /* lexicon unavailable */ }
        if (lastSnapRef.current !== snap) return
        setLexicon(picks)

        setPrompt(buildModelGv3Prompt({ userInput: rawInput, anchor: rapAnchor }))
      } finally {
        setExtrasBusy(false)
      }
    },
    [],
  )

  const runRhymeOnly = useCallback(async (next: PhoneticsRow[], snap: string, manualSeed: string | null) => {
    setRhymeRefreshBusy(true)
    try {
      const rhymes = await buildPhoneticsRhymePanel(next, { manualSeedWord: manualSeed }).catch(
        () =>
          ({
            seedWord:           '',
            seedFromManual:     false,
            featuredNearRhymes: [],
            perfect:            [],
            near:               [],
            consonantStyle:     [],
            consonantMatchKeys: [],
            unknownSeed:        true,
          }) satisfies PhoneticsRhymePanel,
      )
      if (lastSnapRef.current !== snap) return
      setRhymePanel(rhymes)
    } finally {
      setRhymeRefreshBusy(false)
    }
  }, [])

  const analyze = useCallback(async () => {
    const tokens = [...new Set(tokenizeLyrics(input))]
    setBusy(true)
    setFigurativeCues(null)
    setRhymePanel(null)
    setRhymeSeedManual(null)

    try {
      const next = (await Promise.all(
        tokens.map(async word => {
          try {
            const prons = await lookupWordPronunciations(word)
            return { word, prons } satisfies PhoneticsRow
          } catch (e) {
            return {
              word,
              prons: [],
              error: e instanceof Error ? e.message : 'Lookup failed',
            } satisfies PhoneticsRow
          }
        }),
      )) satisfies PhoneticsRow[]
      setRows(next)
      const snap = input.trim()
      setLyricsAtLastAnalyze(snap)
      lastSnapRef.current = snap

      await runFullEnrichment(next, snap, null, input)
    } finally {
      setBusy(false)
    }
  }, [input, runFullEnrichment])

  const refreshRhymesForSeed = useCallback(
    async (manual: string | null) => {
      const snap = lyricsAtLastAnalyze
      if (snap === null || !rows.length) return
      lastSnapRef.current = snap
      await runRhymeOnly(rows, snap, manual)
    },
    [lyricsAtLastAnalyze, rows, runRhymeOnly],
  )

  const onPickRhymeSeedRow = useCallback(
    (word: string, row: PhoneticsRow) => {
      if (!row.prons.length || row.error) return
      const nextManual = rhymeSeedManual?.toLowerCase() === word.toLowerCase() ? null : word
      setRhymeSeedManual(nextManual)
      void refreshRhymesForSeed(nextManual)
    },
    [refreshRhymesForSeed, rhymeSeedManual],
  )

  /** Push the current rhyme panel data over the cross-zone handoff bus. */
  const sendToRhymeStudio = useCallback(() => {
    if (!rhymePanel || rhymePanel.unknownSeed) return
    const payload = {
      kind:     'phonetics-to-rhyme' as const,
      seedWord: rhymePanel.seedWord,
      perfect:  rhymePanel.perfect.map(p => p.word),
      near:     rhymePanel.near.map(p => p.word),
    }
    setLastHandoff(payload)
    publishHandoff(payload)
    setSendHint('Sent to Rhyme Studio — opening it…')
    window.setTimeout(() => setSendHint(null), 2400)
    // Navigate to Rhyme Studio so the user lands on the consumer side.
    onNavigate('rhyme-studio')
  }, [onNavigate, rhymePanel])

  const copyPrompt = useCallback(async () => {
    if (!prompt) return
    try {
      await navigator.clipboard.writeText(prompt)
      setCopyHint('Prompt copied')
    } catch {
      setCopyHint('Clipboard unavailable')
    }
    window.setTimeout(() => setCopyHint(null), 1800)
  }, [prompt])

  const runGemini = useCallback(async () => {
    if (!prompt) return
    setAiBusy(true)
    setAiError(null)
    setAiBars(null)
    try {
      const { fetchWithKeys } = await import('../../lib/api-keys')
      const res = await fetchWithKeys('/api/gemini/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ prompt, maxOutputTokens: 320 }),
      })
      const json = (await res.json()) as { ok: true; preview: string | null } | { ok?: false; message?: string }
      if (!res.ok || !('ok' in json) || json.ok !== true) {
        const msg = typeof json === 'object' && 'message' in json && typeof json.message === 'string'
          ? json.message
          : `Request failed (${res.status})`
        setAiError(msg)
        return
      }
      setAiBars(((json as { ok: true; preview: string | null }).preview ?? '').trim())
    } catch {
      setAiError('Could not reach /api/gemini/generate — is the dev server running with GEMINI_API_KEY set?')
    } finally {
      setAiBusy(false)
    }
  }, [prompt])

  const lyricsMatchAnalyze = lyricsAtLastAnalyze !== null && input.trim() === lyricsAtLastAnalyze
  const showExtras         = rows.length > 0 && lyricsMatchAnalyze && !extrasBusy
  const showFigurativeTile = showExtras && figurativeCues !== null
  const showRhymeTile      = showExtras && rhymePanel !== null
  const showAnchorTile     = showExtras && anchor !== null
  const showGtBarsTile     = showExtras && gtBars.length > 0
  const showLexiconTile    = showExtras && lexicon.length > 0
  const showPromptTile     = showExtras && prompt.length > 0

  const unknownCount = useMemo(() => rows.filter(r => !r.prons.length && !r.error).length, [rows])

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{ background: 'var(--bg-canvas)' }}
    >
      <StudioToolsHeader
        toolId="tools-phonetics-inspector"
        crumbs={[{ label: 'Workspace' }, { label: 'Tools' }, { label: 'Phonetics inspector', emphasis: true }]}
        leftExtra={
          <button
            type="button"
            onClick={() => onNavigate('tools-hub')}
            className="mr-2 rounded-lg p-2 transition"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-2)', boxShadow: 'var(--shadow-sm)' }}
            aria-label="Back to Tools Hub"
          >
            <ArrowLeft className="size-4" strokeWidth={2} />
          </button>
        }
      />

      <div className="flex-1 overflow-auto px-8 pb-20 pt-8">
        <div className="mx-auto w-full max-w-3xl">
          <ZoneHeader
            eyebrow="UTILITY"
            title="Lyric ↔ phonetics"
            icon={BookText}
            description={<>Tokenizes pasted lyrics and looks up pronunciations from the CMU dictionary (ARPAbet). After analyze the page surfaces a <strong style={{ color: 'var(--text-1)' }}>Model G v3 / SUPERG</strong> pipeline ported from the AI-Journal app: phonetic anchor, figures of speech, real Gunna / Young Thug bars matched by phonetic ending, authority-lexicon picks, and a ready-to-run prompt.</>}
            className="mb-6"
          />

          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            rows={8}
            placeholder="Paste lyrics here…"
            className="mb-3 w-full rounded-xl p-4 text-sm shadow-inner outline-none transition"
            style={{
              background: 'var(--bg-input)',
              border:     '1px solid var(--border)',
              color:      'var(--text-1)',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
          <Button
            variant="primary"
            size="lg"
            className="mb-8"
            disabled={busy || !input.trim()}
            onClick={() => void analyze()}
            leading={busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
          >
            {busy ? 'Analyzing…' : 'Analyze words'}
          </Button>

          {rows.length > 0 && (
            <div className="space-y-6">
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                Unique words · <span className="font-semibold" style={{ color: 'var(--text-2)' }}>{rows.length}</span>
                {unknownCount > 0 && (
                  <span className="ml-1" style={{ color: 'var(--warn)' }}>({unknownCount} unknown in CMU)</span>
                )}
              </p>

              {/* ── CMU table (with seed-picker buttons) ───────────────── */}
              <div className="overflow-hidden rounded-xl" style={cardStyle}>
                <table className="w-full border-collapse text-left text-sm">
                  <thead style={{ background: 'var(--bg-muted)', color: 'var(--text-3)' }}>
                    <tr className="text-[11px] font-semibold uppercase tracking-wide">
                      <th className="px-4 py-2" style={{ borderBottom: '1px solid var(--border)' }}>Word</th>
                      <th className="px-4 py-2" style={{ borderBottom: '1px solid var(--border)' }}>Pronunciation(s)</th>
                      <th className="px-4 py-2" style={{ borderBottom: '1px solid var(--border)' }}>Known</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const seedSelected =
                        rhymeSeedManual !== null && r.word.trim().toLowerCase() === rhymeSeedManual.toLowerCase()
                      const canPickSeed = r.prons.length > 0 && !r.error
                      return (
                        <tr
                          key={r.word}
                          style={{
                            borderBottom: '1px solid var(--border-soft)',
                            background:   seedSelected ? 'var(--accent-soft)' : 'transparent',
                          }}
                        >
                          <td className="px-4 py-2.5">
                            <button
                              type="button"
                              disabled={!canPickSeed || extrasBusy || rhymeRefreshBusy}
                              onClick={() => onPickRhymeSeedRow(r.word, r)}
                              className="mono font-medium underline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                              style={{
                                color:  canPickSeed && !extrasBusy && !rhymeRefreshBusy ? 'var(--accent-fg)' : 'var(--text-1)',
                                cursor: canPickSeed && !extrasBusy && !rhymeRefreshBusy ? 'pointer' : 'default',
                              }}
                              title={canPickSeed
                                ? 'Use this word as the rhyme seed (click again to clear)'
                                : 'Needs a CMU pronunciation to rhyme from'}
                            >
                              {r.word}
                            </button>
                          </td>
                          <td className="mono px-4 py-2.5 text-xs" style={{ color: 'var(--text-2)' }}>
                            {r.error ? <span style={{ color: 'var(--bad)' }}>{r.error}</span> : null}
                            {!r.error && (r.prons.length
                              ? r.prons.join(' · ')
                              : <span style={{ color: 'var(--text-4)' }}>—</span>)}
                          </td>
                          <td className="px-4 py-2.5">
                            {r.error ? (
                              <span className="rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: 'var(--bad-soft)', color: 'var(--bad)' }}>Error</span>
                            ) : r.prons.length ? (
                              <span className="rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: 'var(--good-soft)', color: 'var(--good)' }}>Yes</span>
                            ) : (
                              <span className="rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>Unknown</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {extrasBusy && lyricsMatchAnalyze && (
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                  Warming CMU rhyme index, ground-truth bars, lexicon and Model G v3 prompt…
                </p>
              )}
              {rhymeRefreshBusy && lyricsMatchAnalyze && !extrasBusy && (
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>Updating rhyme suggestions for your seed…</p>
              )}

              {/* ── 1) Phonetic anchor ─────────────────────────────────── */}
              {showAnchorTile && anchor && (
                <Tile
                  icon={Waves}
                  title="Phonetic anchor (last bar)"
                  hint="Tonic vowel + coda + syllable target Model G v3 will match."
                >
                  <dl className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <dt className="mono text-[10px] uppercase tracking-wide" style={monoLabel}>Rhyme target</dt>
                      <dd className="mt-1 text-lg font-semibold" style={{ color: 'var(--text-1)' }}>{anchor.rhymeWord}</dd>
                    </div>
                    <div>
                      <dt className="mono text-[10px] uppercase tracking-wide" style={monoLabel}>Phonetic ending</dt>
                      <dd className="mono mt-1 text-sm font-medium" style={{ color: 'var(--accent-fg)' }}>
                        {anchor.rhymeEnding || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="mono text-[10px] uppercase tracking-wide" style={monoLabel}>Syllable target</dt>
                      <dd className="mt-1 text-lg font-semibold tabular-nums" style={{ color: 'var(--text-1)' }}>{anchor.syllableTarget}</dd>
                    </div>
                    <div>
                      <dt className="mono text-[10px] uppercase tracking-wide" style={monoLabel}>Stress pattern</dt>
                      <dd className="mono mt-1 text-base font-medium" style={{ color: 'var(--text-2)' }}>
                        {anchor.stressPattern || '—'}
                      </dd>
                    </div>
                  </dl>
                </Tile>
              )}

              {/* ── Existing rhyme panel ───────────────────────────────── */}
              {showRhymeTile && rhymePanel && (
                <section
                  className="rounded-2xl p-5"
                  style={{ ...cardStyle, opacity: rhymeRefreshBusy ? 0.7 : 1 }}
                  aria-labelledby="rhyme-suggestions-heading"
                >
                  <header className="mb-3 flex items-center gap-2.5">
                    <span
                      className="grid size-8 shrink-0 place-items-center rounded-lg"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }}
                      aria-hidden
                    >
                      <Music2 className="size-4" strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 id="rhyme-suggestions-heading" className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                        Rhyme suggestions
                      </h2>
                      <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                        Tight / near / consonant-style from CMUdict. Click a word in the table above to switch seeds.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={sendToRhymeStudio}
                      disabled={rhymePanel.unknownSeed}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition disabled:opacity-50"
                      style={{
                        background: 'var(--accent)',
                        color:      '#fff',
                      }}
                      title="Open Rhyme Studio pre-filled with this seed + suggestions"
                    >
                      <Sparkles className="size-3.5" aria-hidden />
                      Send to Rhyme Studio
                    </button>
                  </header>
                  {sendHint && (
                    <p
                      className="mb-3 rounded-md px-2 py-1.5 text-[11px]"
                      style={{
                        background: 'var(--accent-soft)',
                        color:      'var(--accent-fg)',
                        border:     '1px solid color-mix(in oklab, var(--accent) 22%, var(--border))',
                      }}
                    >
                      {sendHint}
                    </p>
                  )}

                  {rhymePanel.unknownSeed ? (
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                      No rhyme seed: paste CMU-known content words, or click a known row to pick a seed.
                    </p>
                  ) : (
                    <>
                      <p className="mb-3 text-[11px]" style={{ color: 'var(--text-2)' }}>
                        Seed:{' '}
                        <span className="mono font-semibold" style={{ color: 'var(--text-1)' }}>{rhymePanel.seedWord}</span>
                        <span className="ml-1" style={{ color: rhymePanel.seedFromManual ? 'var(--accent-fg)' : 'var(--text-3)' }}>
                          {rhymePanel.seedFromManual ? '(from your row pick)' : '(longest known token, stopwords skipped)'}
                        </span>
                      </p>

                      {rhymePanel.featuredNearRhymes.length > 0 && (
                        <div className="mb-4 rounded-lg px-3 py-3" style={{ background: 'var(--accent-soft)', border: '1px solid color-mix(in oklab, var(--accent) 25%, var(--border))' }}>
                          <div className="mono mb-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--accent-fg)' }}>
                            Near rhymes (top 5)
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {rhymePanel.featuredNearRhymes.map(s => (
                              <span
                                key={s.word}
                                className="mono rounded-md px-2.5 py-1 text-sm font-medium"
                                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-1)', boxShadow: 'var(--shadow-sm)' }}
                              >
                                {s.word}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="space-y-3">
                        {[
                          { label: 'Rhymes (tight)', list: rhymePanel.perfect.map(p => p.word) },
                          { label: 'Near rhymes (looser)', list: rhymePanel.near.map(p => p.word) },
                        ].map(group => (
                          <div key={group.label} className="rounded-lg px-3 py-2.5" style={softCardStyle}>
                            <div className="mono mb-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                              {group.label}
                            </div>
                            {group.list.length ? (
                              <p className="mono text-xs leading-relaxed" style={{ color: 'var(--text-1)' }}>
                                {group.list.join(' · ')}
                              </p>
                            ) : (
                              <p className="text-xs" style={{ color: 'var(--text-3)' }}>No matches in the current cap.</p>
                            )}
                          </div>
                        ))}
                        <div className="rounded-lg px-3 py-2.5" style={softCardStyle}>
                          <div className="mono mb-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                            Consonant-style matches
                          </div>
                          {rhymePanel.consonantMatchKeys.length > 0 && (
                            <p className="mb-1.5 text-[10px]" style={{ color: 'var(--text-3)' }}>
                              Cluster key(s):{' '}
                              <span className="mono" style={{ color: 'var(--text-2)' }}>{rhymePanel.consonantMatchKeys.join(' · ')}</span>
                            </p>
                          )}
                          {rhymePanel.consonantStyle.length ? (
                            <p className="mono text-xs leading-relaxed" style={{ color: 'var(--text-1)' }}>
                              {rhymePanel.consonantStyle.join(' · ')}
                            </p>
                          ) : (
                            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                              {rhymePanel.consonantMatchKeys.length
                                ? 'No extra matches beyond rhyme tiers (tiers shown above).'
                                : 'No closing consonant pair detected for this seed in CMU.'}
                            </p>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </section>
              )}

              {/* ── 2) Figures of speech ───────────────────────────────── */}
              {showFigurativeTile && figurativeCues && (
                <Tile
                  icon={Quote}
                  title="Phrases & figurative speech"
                  hint="Simile / metaphor / punchline scaffolds seeded from CMU rhyme tiers."
                >
                  {figurativeCues.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                      No phrase prompts yet (need CMU-known content words with rhyme neighbors).
                    </p>
                  ) : (
                    <ul className="space-y-2.5">
                      {figurativeCues.map(c => (
                        <li
                          key={`${c.seed}-${c.rhyme}`}
                          className="rounded-lg px-3 py-2 text-xs leading-snug"
                          style={softCardStyle}
                        >
                          <span className="mono text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                            {c.seed} · {c.rhyme}{' '}
                            <span className="lowercase" style={{ color: 'var(--accent-fg)' }}>({c.tier})</span>
                          </span>
                          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--text-1)' }}>{c.line}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Tile>
              )}

              {/* ── 3) Ground-truth Gunna / Young Thug bars ────────────── */}
              {showGtBarsTile && (
                <Tile
                  icon={MicVocal}
                  title="Real bars (Gunna / Young Thug ground truth)"
                  hint="Matched by phonetic ending. Reference only — never copy verbatim."
                >
                  <ul className="space-y-2">
                    {gtBars.map(b => (
                      <li
                        key={b.textId || `${b.artist}-${b.text}`}
                        className="rounded-xl p-3"
                        style={softCardStyle}
                      >
                        <p className="text-sm leading-snug" style={{ color: 'var(--text-1)' }}>{b.text}</p>
                        <p className="mono mt-1.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
                          {b.artist} · {b.song} · {b.year ?? '—'} · ending{' '}
                          <span style={{ color: 'var(--accent-fg)' }}>{b.phoneticEnding || '—'}</span>
                          {b.primaryTone && <> · <span style={{ color: 'var(--text-2)' }}>{b.primaryTone}</span></>}
                        </p>
                      </li>
                    ))}
                  </ul>
                </Tile>
              )}

              {/* ── 4) Authority lexicon picks ─────────────────────────── */}
              {showLexiconTile && (
                <Tile
                  icon={Tag}
                  title="Authority lexicon picks (brands · motifs · phrases)"
                  hint="Sampled from the AI-Journal scene jargon CSV. Implication, not declaration."
                >
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {lexicon.map((t, i) => (
                      <li
                        key={`${t.term}-${i}`}
                        className="rounded-xl p-3"
                        style={softCardStyle}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{t.term}</span>
                          {t.eraScene && (
                            <span className="mono shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase" style={{ background: 'var(--bg-muted)', color: 'var(--text-3)' }}>
                              {t.eraScene}
                            </span>
                          )}
                        </div>
                        {t.notes && <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--text-3)' }}>{t.notes}</p>}
                        {t.themePrimary && (
                          <p className="mono mt-1.5 text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-4)' }}>
                            {t.themePrimary} · {t.category}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </Tile>
              )}

              {/* ── 5) Model G v3 prompt + Run with Gemini ─────────────── */}
              {showPromptTile && (
                <Tile
                  icon={Sparkles}
                  title="Model G v3 prompt (SUPERG)"
                  hint="System prompt + rhyme anchor constraints + your bars. Copy or run."
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void copyPrompt()}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition"
                      style={{ background: 'var(--bg-card-soft)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                    >
                      <ClipboardCopy className="size-3.5" aria-hidden />
                      Copy prompt
                    </button>
                    <button
                      type="button"
                      onClick={() => void runGemini()}
                      disabled={aiBusy}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white transition disabled:opacity-55"
                      style={{ background: 'var(--accent)' }}
                    >
                      {aiBusy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />}
                      Run with Gemini
                    </button>
                    <span className="mono text-[10px]" style={{ color: 'var(--text-4)' }}>POST /api/gemini/generate</span>
                    {copyHint && <span className="text-[11px]" style={{ color: 'var(--good)' }}>{copyHint}</span>}
                  </div>

                  <pre
                    className="mono mt-3 max-h-64 overflow-auto rounded-xl p-3 text-[11px] leading-relaxed"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-soft)', color: 'var(--text-2)' }}
                  >
                    {prompt}
                  </pre>

                  {aiError && (
                    <p className="mt-3 rounded-lg px-3 py-2 text-xs" role="alert" style={{ background: 'var(--bad-soft)', color: 'var(--bad)', border: '1px solid color-mix(in oklab, var(--bad) 25%, transparent)' }}>
                      {aiError}
                    </p>
                  )}
                  {aiBars && (
                    <div
                      className="mt-3 whitespace-pre-wrap rounded-xl p-3 text-sm leading-relaxed"
                      style={{ background: 'var(--bg-card-soft)', border: '1px solid color-mix(in oklab, var(--accent) 25%, var(--border))', color: 'var(--text-1)' }}
                    >
                      <p className="mono mb-2 text-[10px] uppercase tracking-wide" style={{ color: 'var(--accent-fg)' }}>
                        4 bars · Model G v3
                      </p>
                      {aiBars}
                    </div>
                  )}
                </Tile>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
