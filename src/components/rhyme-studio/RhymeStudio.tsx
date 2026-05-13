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
import { fetchWithKeys, hasApiKey } from '../../lib/api-keys'
import {
  consumeLastHandoff,
  subscribeHandoff,
  type HandoffPayload,
} from '../../lib/cross-zone-handoff'

/* ── Gemini rhyme helper ─────────────────────────────────────────────────── */

interface GeminiRhymes {
  perfect: string[]
  near: string[]
  slant: string[]
}

/** Extract the first `{ ... }` JSON object from Gemini prose. */
function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim()
  // Strip fenced code blocks: ```json ... ``` or ``` ... ```
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fence ? fence[1].trim() : trimmed
  // Find first balanced JSON object
  const start = body.indexOf('{')
  if (start < 0) throw new Error('no json object in response')
  let depth = 0
  for (let i = start; i < body.length; i++) {
    const ch = body[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        return JSON.parse(body.slice(start, i + 1))
      }
    }
  }
  throw new Error('unbalanced json in response')
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string').map(s => s.trim()).filter(Boolean)
}

function parseGeminiRhymes(raw: string): GeminiRhymes {
  const parsed = extractJsonObject(raw) as Record<string, unknown>
  return {
    perfect: toStringArray(parsed.perfect),
    near:    toStringArray(parsed.near),
    slant:   toStringArray(parsed.slant),
  }
}

const GEMINI_RHYME_SYSTEM =
  'You are a precise rhyming dictionary. Always reply with a single JSON object — no prose, no markdown fences.'

function buildGeminiRhymePrompt(word: string, n: number): string {
  return [
    `Generate ${n} rhymes (perfect, near, slant) for "${word}".`,
    'Return as JSON: { "perfect": string[], "near": string[], "slant": string[] }.',
    'No commentary, no markdown — just the JSON object.',
  ].join(' ')
}

/** Convert a plain word list into the studio's RhymeSuggestion shape. */
function wordsToSuggestions(words: readonly string[], tier: RhymeTier): RhymeSuggestion[] {
  const seen = new Set<string>()
  const out: RhymeSuggestion[] = []
  for (const w of words) {
    const key = w.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ word: w, tier })
  }
  return out
}

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

  /* Gemini-powered rhyme suggestions */
  const [geminiBusy,   setGeminiBusy]   = useState(false)
  const [geminiError,  setGeminiError]  = useState<string | null>(null)
  const [geminiNoKey,  setGeminiNoKey]  = useState<boolean>(() => !hasApiKey('GEMINI_API_KEY'))
  const [handoffHint,  setHandoffHint]  = useState<string | null>(null)

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

  /** Merge a phonetics handoff into the rhyme lists without an API call. */
  const applyPhoneticsHandoff = useCallback((p: HandoffPayload) => {
    if (p.kind !== 'phonetics-to-rhyme') return
    if (p.seedWord) setWord(p.seedWord)
    setRhymeHint(null)
    setRhymeKeys([])
    setPerfect(prev => {
      const merged = [...wordsToSuggestions(p.perfect, 'perfect'), ...prev]
      const seen = new Set<string>()
      return merged.filter(r => {
        const k = r.word.toLowerCase()
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
    })
    setNear(prev => {
      const merged = [...wordsToSuggestions(p.near, 'near'), ...prev]
      const seen = new Set<string>()
      return merged.filter(r => {
        const k = r.word.toLowerCase()
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
    })
    setHandoffHint(`Pre-filled from Phonetics inspector (seed: ${p.seedWord || '—'})`)
    window.setTimeout(() => setHandoffHint(null), 4000)
  }, [])

  /* Mount: consume any pending phonetics→rhyme handoff. */
  useEffect(() => {
    const pending = consumeLastHandoff('phonetics-to-rhyme')
    if (pending) applyPhoneticsHandoff(pending)
  }, [applyPhoneticsHandoff])

  /* Live: also pick up publishes that arrive while Rhyme Studio is mounted. */
  useEffect(() => {
    return subscribeHandoff(p => {
      if (p.kind === 'phonetics-to-rhyme') applyPhoneticsHandoff(p)
    })
  }, [applyPhoneticsHandoff])

  /* Refresh "no key" flag when Settings is edited in another zone. */
  useEffect(() => {
    const onKeys = () => setGeminiNoKey(!hasApiKey('GEMINI_API_KEY'))
    window.addEventListener('dashboard:api-keys-changed', onKeys)
    return () => window.removeEventListener('dashboard:api-keys-changed', onKeys)
  }, [])

  /** Ask Gemini for tiered rhymes for the current `word` and replace lists. */
  const runGeminiRhymes = useCallback(async () => {
    const w = word.trim()
    if (!w) {
      setRhymeHint('Enter a headword.')
      return
    }
    if (!hasApiKey('GEMINI_API_KEY')) {
      setGeminiNoKey(true)
      return
    }
    setGeminiBusy(true)
    setGeminiError(null)
    setRhymeHint(null)
    try {
      const res = await fetchWithKeys('/api/gemini/generate', {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({
          prompt: buildGeminiRhymePrompt(w, 24),
          system: GEMINI_RHYME_SYSTEM,
          maxOutputTokens: 512,
        }),
      })
      const json = (await res.json()) as
        | { ok: true; preview: string | null }
        | { ok?: false; message?: string }
      if (!res.ok || !('ok' in json) || json.ok !== true) {
        const msg = typeof json === 'object' && 'message' in json && typeof json.message === 'string'
          ? json.message
          : `Request failed (${res.status})`
        setGeminiError(msg)
        return
      }
      const previewText = (json as { ok: true; preview: string | null }).preview ?? ''
      if (!previewText.trim()) {
        setGeminiError('Gemini returned an empty response.')
        return
      }
      let parsed: GeminiRhymes
      try {
        parsed = parseGeminiRhymes(previewText)
      } catch {
        setGeminiError('Could not parse JSON from Gemini response.')
        return
      }
      setRhymeKeys([])
      setPerfect(wordsToSuggestions(parsed.perfect, 'perfect'))
      setNear(wordsToSuggestions(parsed.near, 'near'))
      setSlant(wordsToSuggestions(parsed.slant, 'slant'))
      if (!parsed.perfect.length && !parsed.near.length && !parsed.slant.length) {
        setRhymeHint('Gemini returned no rhymes — try a different headword.')
      }
    } catch {
      setGeminiError('Could not reach /api/gemini/generate — is the dev server running?')
    } finally {
      setGeminiBusy(false)
    }
  }, [word])

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
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}>
      <div className="max-w-[1100px] mx-auto p-6 space-y-6">
        <header className="space-y-1">
          <h1 className="text-[22px] font-semibold text-[var(--text-1)] tracking-tight">Rhyme Studio</h1>
          <p className="text-[12px] text-[var(--text-3)] max-w-2xl">
            Dashboard mirror of the Journal Studio rhyme surface: CMUdict tiers (perfect / near / slant) plus the
            same <span className="font-medium text-[var(--text-2)]">Model G → Model Y → Model G v3</span> progression
            (primary + menu). AI line buttons use <span className="font-medium">mock suggestions</span> when{' '}
            <span className="font-medium text-[var(--text-2)]">Mock data</span> is on; local Gemma runs exclusively through{' '}
            <span className="font-mono text-[var(--text-2)]">VITE_LOCAL_LLM_BASE_URL</span>.
          </p>
        </header>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm space-y-3">
          <label htmlFor={draftId} className="block text-[11px] font-medium text-[var(--text-3)] uppercase tracking-wide">
            Draft (optional)
          </label>
          <textarea
            id={draftId}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={4}
            placeholder="Bars for context…"
            className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-4)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none"
          />

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative inline-flex rounded-lg shadow-sm" ref={menuRef}>
              <button
                type="button"
                onClick={runPrimaryAction}
                disabled={aiLoading || !mockDataEnabled}
                title={!mockDataEnabled ? 'Turn on Mock data (Agent Farm Overview) for demo AI lines' : undefined}
                className="inline-flex items-center gap-2 rounded-l-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
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
                title={!mockDataEnabled ? 'Mock data off — enable in Agent Farm (Overview tab)' : undefined}
                className="rounded-r-lg border-l px-2 py-2 text-white disabled:opacity-50"
                style={{
                  background: 'var(--accent)',
                  borderColor: 'color-mix(in oklab, var(--accent) 40%, transparent)',
                }}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <ChevronDown className="size-4" />
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-full z-10 mt-1 min-w-[280px] rounded-lg border border-[var(--border)] bg-[var(--bg-card)] py-1 shadow-lg"
                >
                  {(Object.keys(MODEL_LABEL) as SuggestionModelId[]).map(id => (
                    <button
                      key={id}
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-1)] hover:bg-[var(--bg-hover)]"
                      onClick={() => selectModelAndRun(id)}
                      disabled={!mockDataEnabled}
                    >
                      {id === 'modelG' && <Sparkles className="size-4 text-[var(--accent)] shrink-0" />}
                      {id === 'modelY' && <Grid2x2 className="size-4 text-[var(--accent)] shrink-0" />}
                      {id === 'modelGv3' && <Wand2 className="size-4 text-[var(--accent)] shrink-0" />}
                      {MODEL_LABEL[id]}
                    </button>
                  ))}
                  <div className="my-1 h-px bg-[var(--border-soft)]" />
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-1)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
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
            <p className="text-[11px] text-[var(--text-3)]">
              {mockDataEnabled ? (
                <>
                  Primary tap repeats <span className="font-medium text-[var(--text-2)]">{lastModel}</span>; menu matches Journal
                  labels. Output is mock JSON — not the full Journal AI pipeline.
                </>
              ) : (
                <>
                  Mock suggestion buttons are off — enable{' '}
                  <span className="font-medium text-[var(--text-2)]">Mock data</span> in Agent Farm (Overview tab), or use local Gemma
                  below.
                </>
              )}
            </p>
          </div>

          {showLastPanel && suggestionHistory.length > 0 && (
            <div
              className="rounded-lg border p-3 text-sm text-[var(--text-1)] space-y-1"
              style={{
                background: 'var(--accent-soft)',
                borderColor: 'color-mix(in oklab, var(--accent) 18%, var(--border-soft))',
              }}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--accent-fg)]">Last suggestions</div>
              <ul className="list-disc pl-5 space-y-0.5">
                {suggestionHistory.slice(0, 8).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm space-y-3">
          <h2 className="text-[13px] font-semibold text-[var(--text-1)]">CMU / near rhyme tiers</h2>
          <p className="text-[11px] text-[var(--text-3)]">
            Scoring uses the last stressed ARPAbet nucleus + coda: <span className="font-medium">perfect</span> (match
            both), <span className="font-medium">near</span> (same nucleus), <span className="font-medium">slant</span>{' '}
            (same vowel base). Data: <span className="font-mono">cmu-pronouncing-dictionary</span> npm package (same
            CMU source as Journal tooling).
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px]">
              <label htmlFor={wordId} className="block text-[11px] font-medium text-[var(--text-3)] uppercase tracking-wide mb-1">
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
                className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]"
                placeholder="e.g. rhythm"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-[var(--text-2)] pb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeBroad}
                onChange={e => setIncludeBroad(e.target.checked)}
                className="rounded border-[var(--border-strong)] text-[var(--accent)]"
              />
              Broaden pool (stress-stripped) for near/slant
            </label>
            <button
              type="button"
              onClick={() => void runRhymes()}
              disabled={!indexReady || rhymeLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--text-1)] px-4 py-2 text-sm font-medium text-[var(--bg-card)] disabled:opacity-50"
            >
              {rhymeLoading ? <Loader2 className="size-4 animate-spin" /> : null}
              Find rhymes
            </button>
            <button
              type="button"
              onClick={() => void runGeminiRhymes()}
              disabled={geminiBusy || geminiNoKey || !word.trim()}
              title={geminiNoKey ? 'Set GEMINI_API_KEY in Settings' : 'Tiered rhymes via Gemini'}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {geminiBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
              Generate with Gemini
            </button>
          </div>
          {geminiNoKey && (
            <p className="text-xs rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900">
              Set <span className="font-mono">GEMINI_API_KEY</span> in Settings to generate AI-powered rhymes.
            </p>
          )}
          {handoffHint && (
            <p
              className="text-xs rounded-md px-2 py-1.5"
              style={{
                background: 'var(--accent-soft)',
                color:      'var(--accent-fg)',
                border:     '1px solid color-mix(in oklab, var(--accent) 22%, var(--border))',
              }}
            >
              {handoffHint}
            </p>
          )}
          {geminiError && (
            <p className="text-xs rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-red-800" role="alert">
              {geminiError}
            </p>
          )}
          {rhymeHint && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">{rhymeHint}</p>
          )}
          {rhymeKeys.length > 0 && (
            <p className="text-[11px] font-mono text-[var(--text-4)]">
              keys: <span className="text-[var(--text-2)]">{rhymeKeys.join(' · ')}</span>
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
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-4)] mb-1">{label}</div>
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
                  {!list.length && <li className="text-xs text-[var(--text-4)]">—</li>}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm space-y-2">
          <h2 className="text-[13px] font-semibold text-[var(--text-1)]">Local Gemma (Ollama-style only)</h2>
          <p className="text-[11px] text-[var(--text-3)]">
            Configure <span className="font-mono">VITE_LOCAL_LLM_BASE_URL</span> (e.g.{' '}
            <span className="font-mono">http://127.0.0.1:11434</span>), optional{' '}
            <span className="font-mono">VITE_LOCAL_LLM_MODEL</span>, and optional{' '}
            <span className="font-mono">VITE_RAG_MANIFEST_URL</span> pointing at JSON{' '}
            <code className="text-[10px]">{`{ "snippets": [{ "id", "text" }] }`}</code>. No cloud endpoints.
          </p>
          <p className="text-[10px] font-mono text-[var(--text-3)]">
            status: {cfg.baseUrl ? `base=${cfg.baseUrl} model=${cfg.model}` : 'VITE_LOCAL_LLM_BASE_URL unset'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void tryLocalGemma()}
              disabled={localBusy}
              className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-card)] px-3 py-1.5 text-sm font-medium text-[var(--text-1)] hover:bg-[var(--bg-hover)] disabled:opacity-50"
            >
              {localBusy ? <Loader2 className="inline size-4 animate-spin" /> : null}
              Try local line
            </button>
          </div>
          {localProbe && (
            <pre className="whitespace-pre-wrap rounded-md bg-[var(--bg-cockpit)] text-[var(--text-1)] p-3 text-xs font-mono">{localProbe}</pre>
          )}
        </section>
      </div>
    </div>
  )
}
