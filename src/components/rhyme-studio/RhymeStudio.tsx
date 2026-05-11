import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  ChevronDown,
  Clock,
  Grid2x2,
  Loader2,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { findRhymesCmudict, ensureRhymeIndexBuilt, type RhymeSuggestion, type RhymeTier } from '../../lib/grap-engine'
import {
  getLocalLlmConfig,
  isLocalLlmConfigured,
  suggestLineWithLocalGemma,
} from '../../lib/local-llm/gemma-local'
import { useMockData } from '../../context/MockDataContext'

/** Mirrors `SuggestionModel` labels from The Final Journal AI — UI + route only (no cloud APIs). */
type SuggestionModelId = 'modelG' | 'modelY' | 'modelGv3'

const MODEL_LABEL: Record<SuggestionModelId, string> = {
  modelG: 'Suggest Next Lines with Model G',
  modelY: 'Suggest Next Lines with Model Y',
  modelGv3: 'Suggest Next Lines with Model G v3',
}

const MOCK_LINES: Record<SuggestionModelId, string[]> = {
  modelG: [
    'Yeah — mirrored sparkle tap; Journal routes stay on device.',
    'Model G flow (dashboard) is copy + progression, not full parity.',
  ],
  modelY: [
    'Model Y lane: stacked bars, different colorway.',
    'Still mock text — wire your backend when you are ready.',
  ],
  modelGv3: [
    'Model G v3 — wand icon, same control surface hook as Journal.',
    'Point VITE_LOCAL_LLM_BASE_URL at Ollama for local Gemma.',
  ],
}

function tierBadgeClass(tier: RhymeTier): string {
  if (tier === 'perfect') return 'border-emerald-200 bg-emerald-50 text-emerald-900'
  if (tier === 'near') return 'border-blue-200 bg-blue-50 text-blue-900'
  return 'border-amber-200 bg-amber-50 text-amber-900'
}

function tierShort(tier: RhymeTier): string {
  if (tier === 'perfect') return 'perfect'
  if (tier === 'near') return 'near'
  return 'slant'
}

export default function RhymeStudio() {
  const draftId = useId()
  const wordId = useId()
  const { mockDataEnabled } = useMockData()

  const [draft, setDraft] = useState('')

  const [lastModel, setLastModel] = useState<SuggestionModelId>('modelG')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const [aiLoading, setAiLoading] = useState(false)
  const [suggestionHistory, setSuggestionHistory] = useState<string[]>([])
  const [showLastPanel, setShowLastPanel] = useState(false)

  const [word, setWord] = useState('')
  const [includeBroad, setIncludeBroad] = useState(true)
  const [indexReady, setIndexReady] = useState(false)
  const [rhymeLoading, setRhymeLoading] = useState(false)
  const [perfect, setPerfect] = useState<RhymeSuggestion[]>([])
  const [near, setNear] = useState<RhymeSuggestion[]>([])
  const [slant, setSlant] = useState<RhymeSuggestion[]>([])
  const [rhymeKeys, setRhymeKeys] = useState<string[]>([])
  const [rhymeHint, setRhymeHint] = useState<string | null>(null)

  const [localProbe, setLocalProbe] = useState<string | null>(null)
  const [localBusy, setLocalBusy] = useState(false)

  useEffect(() => {
    void ensureRhymeIndexBuilt().then(() => setIndexReady(true)).catch(() => setIndexReady(false))
  }, [])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const pushMockSuggestions = useCallback((id: SuggestionModelId) => {
    const lines = MOCK_LINES[id]
    setSuggestionHistory(h => [...lines, ...h].slice(0, 12))
    setShowLastPanel(true)
  }, [])

  const runPrimaryAction = useCallback(() => {
    if (aiLoading) return
    if (!mockDataEnabled) return
    setAiLoading(true)
    window.setTimeout(() => {
      pushMockSuggestions(lastModel)
      setAiLoading(false)
    }, 420)
  }, [aiLoading, lastModel, pushMockSuggestions, mockDataEnabled])

  const selectModelAndRun = useCallback(
    (id: SuggestionModelId) => {
      if (!mockDataEnabled) return
      setLastModel(id)
      setMenuOpen(false)
      setAiLoading(true)
      window.setTimeout(() => {
        pushMockSuggestions(id)
        setAiLoading(false)
      }, 420)
    },
    [pushMockSuggestions, mockDataEnabled],
  )

  const SparkleIcon = lastModel === 'modelY' ? Grid2x2 : lastModel === 'modelGv3' ? Wand2 : Sparkles

  const runRhymes = useCallback(async () => {
    const w = word.trim()
    if (!w) {
      setRhymeHint('Enter a headword.')
      return
    }
    setRhymeLoading(true)
    setRhymeHint(null)
    try {
      const result = await findRhymesCmudict({
        inputWord: w,
        maxPerfect: 72,
        maxNear: 56,
        maxSlant: 48,
        includeSlant: includeBroad,
        excludeExact: true,
      })
      setRhymeKeys(result.rhymeKeys)
      if (result.unknownWord) {
        setPerfect([])
        setNear([])
        setSlant([])
        setRhymeHint(`No CMU entry for “${w}”.`)
        return
      }
      setPerfect(result.perfect)
      setNear(result.near)
      setSlant(result.slant)
      if (!result.perfect.length && !result.near.length && !result.slant.length) {
        setRhymeHint(`No scored rhymes for keys ${result.rhymeKeys.join(' · ') || '(empty)'}`)
      }
    } catch {
      setRhymeHint('Rhyme lookup failed.')
      setPerfect([])
      setNear([])
      setSlant([])
    } finally {
      setRhymeLoading(false)
    }
  }, [word, includeBroad])

  const tryLocalGemma = useCallback(async () => {
    if (!isLocalLlmConfigured()) {
      setLocalProbe('Set VITE_LOCAL_LLM_BASE_URL to your Ollama base URL (local only).')
      return
    }
    setLocalBusy(true)
    setLocalProbe(null)
    try {
      const text = await suggestLineWithLocalGemma(
        `Given this draft, suggest one follow-up couplet:\n${draft || '(empty draft)'}`,
      )
      setLocalProbe(text)
    } catch (e) {
      setLocalProbe(e instanceof Error ? e.message : 'Local request failed.')
    } finally {
      setLocalBusy(false)
    }
  }, [draft])

  const cfg = getLocalLlmConfig()

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-gray-50 to-white">
      <div className="max-w-[1100px] mx-auto p-6 space-y-6">
        <header className="space-y-1">
          <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Rhyme Studio</h1>
          <p className="text-[12px] text-gray-500 max-w-2xl">
            Dashboard mirror of the Journal Studio rhyme surface: CMUdict tiers (perfect / near / slant) plus the
            same <span className="font-medium text-gray-700">Model G → Model Y → Model G v3</span> progression
            (primary + menu). AI line buttons use <span className="font-medium">mock suggestions</span> when{' '}
            <span className="font-medium text-gray-700">Mock data</span> is on; local Gemma runs exclusively through{' '}
            <span className="font-mono text-gray-600">VITE_LOCAL_LLM_BASE_URL</span>.
          </p>
        </header>

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
          <label htmlFor={draftId} className="block text-[11px] font-medium text-gray-500 uppercase tracking-wide">
            Draft (optional)
          </label>
          <textarea
            id={draftId}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={4}
            placeholder="Bars for context…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-purple-500 focus:ring-1 focus:ring-purple-400 outline-none"
          />

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative inline-flex rounded-lg shadow-sm" ref={menuRef}>
              <button
                type="button"
                onClick={runPrimaryAction}
                disabled={aiLoading || !mockDataEnabled}
                title={!mockDataEnabled ? 'Turn on Mock data (Production overview) for demo AI lines' : undefined}
                className="inline-flex items-center gap-2 rounded-l-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                aria-label={`AI suggestions, ${lastModel}`}
              >
                {aiLoading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <SparkleIcon className="size-4" aria-hidden />
                )}
                Run ({lastModel === 'modelG' ? 'G' : lastModel === 'modelY' ? 'Y' : 'G v3'})
              </button>
              <button
                type="button"
                onClick={() => setMenuOpen(o => !o)}
                disabled={!mockDataEnabled}
                title={!mockDataEnabled ? 'Mock data off — enable on Production overview' : undefined}
                className="rounded-r-lg border-l border-purple-500/40 bg-purple-600 px-2 py-2 text-white hover:bg-purple-700 disabled:opacity-50"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <ChevronDown className="size-4" />
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-full z-10 mt-1 min-w-[280px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                >
                  {(Object.keys(MODEL_LABEL) as SuggestionModelId[]).map(id => (
                    <button
                      key={id}
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
                      onClick={() => selectModelAndRun(id)}
                      disabled={!mockDataEnabled}
                    >
                      {id === 'modelG' && <Sparkles className="size-4 text-purple-600 shrink-0" />}
                      {id === 'modelY' && <Grid2x2 className="size-4 text-purple-600 shrink-0" />}
                      {id === 'modelGv3' && <Wand2 className="size-4 text-purple-600 shrink-0" />}
                      {MODEL_LABEL[id]}
                    </button>
                  ))}
                  <div className="my-1 h-px bg-gray-100" />
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-40"
                    disabled={suggestionHistory.length === 0}
                    onClick={() => {
                      setMenuOpen(false)
                      setShowLastPanel(true)
                    }}
                  >
                    <Clock className="size-4 shrink-0" />
                    Open Last Suggestions
                  </button>
                </div>
              )}
            </div>
            <p className="text-[11px] text-gray-500">
              {mockDataEnabled ? (
                <>
                  Primary tap repeats <span className="font-medium text-gray-700">{lastModel}</span>; menu matches Journal
                  labels. Output is mock JSON — not the full Journal AI pipeline.
                </>
              ) : (
                <>
                  Mock suggestion buttons are off — enable{' '}
                  <span className="font-medium text-gray-700">Mock data</span> on Production overview, or use local Gemma
                  below.
                </>
              )}
            </p>
          </div>

          {showLastPanel && suggestionHistory.length > 0 && (
            <div className="rounded-lg border border-purple-100 bg-purple-50/50 p-3 text-sm text-gray-800 space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-purple-800">Last suggestions</div>
              <ul className="list-disc pl-5 space-y-0.5">
                {suggestionHistory.slice(0, 8).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-[13px] font-semibold text-gray-800">CMU / near rhyme tiers</h2>
          <p className="text-[11px] text-gray-500">
            Scoring uses the last stressed ARPAbet nucleus + coda: <span className="font-medium">perfect</span> (match
            both), <span className="font-medium">near</span> (same nucleus), <span className="font-medium">slant</span>{' '}
            (same vowel base). Data: <span className="font-mono">cmu-pronouncing-dictionary</span> npm package (same
            CMU source as Journal tooling).
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px]">
              <label htmlFor={wordId} className="block text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">
                Headword
              </label>
              <input
                id={wordId}
                type="text"
                value={word}
                onChange={e => setWord(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void runRhymes()
                }}
                disabled={!indexReady}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="e.g. rhythm"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-600 pb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeBroad}
                onChange={e => setIncludeBroad(e.target.checked)}
                className="rounded border-gray-300 text-purple-600"
              />
              Broaden pool (stress-stripped) for near/slant
            </label>
            <button
              type="button"
              onClick={() => void runRhymes()}
              disabled={!indexReady || rhymeLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {rhymeLoading ? <Loader2 className="size-4 animate-spin" /> : null}
              Find rhymes
            </button>
          </div>
          {rhymeHint && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">{rhymeHint}</p>
          )}
          {rhymeKeys.length > 0 && (
            <p className="text-[11px] font-mono text-gray-400">
              keys: <span className="text-gray-600">{rhymeKeys.join(' · ')}</span>
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            {(
              [
                ['Perfect', perfect],
                ['Near', near],
                ['Slant', slant],
              ] as const
            ).map(([label, list]) => (
              <div key={label}>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</div>
                <ul className="flex flex-wrap gap-1.5">
                  {list.map(r => (
                    <li key={`${label}:${r.word}`}>
                      <span
                        className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${tierBadgeClass(r.tier)}`}
                      >
                        {r.word}
                        <span className="ml-1 text-[9px] uppercase opacity-60">{tierShort(r.tier)}</span>
                      </span>
                    </li>
                  ))}
                  {!list.length && <li className="text-xs text-gray-400">—</li>}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-2">
          <h2 className="text-[13px] font-semibold text-gray-800">Local Gemma (Ollama-style only)</h2>
          <p className="text-[11px] text-gray-500">
            Configure <span className="font-mono">VITE_LOCAL_LLM_BASE_URL</span> (e.g.{' '}
            <span className="font-mono">http://127.0.0.1:11434</span>), optional{' '}
            <span className="font-mono">VITE_LOCAL_LLM_MODEL</span>, and optional{' '}
            <span className="font-mono">VITE_RAG_MANIFEST_URL</span> pointing at JSON{' '}
            <code className="text-[10px]">{`{ "snippets": [{ "id", "text" }] }`}</code>. No cloud endpoints.
          </p>
          <p className="text-[10px] font-mono text-gray-500">
            status: {cfg.baseUrl ? `base=${cfg.baseUrl} model=${cfg.model}` : 'VITE_LOCAL_LLM_BASE_URL unset'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void tryLocalGemma()}
              disabled={localBusy}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {localBusy ? <Loader2 className="inline size-4 animate-spin" /> : null}
              Try local line
            </button>
          </div>
          {localProbe && (
            <pre className="whitespace-pre-wrap rounded-md bg-gray-900 text-gray-100 p-3 text-xs font-mono">{localProbe}</pre>
          )}
        </section>
      </div>
    </div>
  )
}
