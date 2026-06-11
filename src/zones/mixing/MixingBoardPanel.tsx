import { useState } from 'react'
import { Loader2, Music2, Sparkles } from 'lucide-react'

const STORAGE_KEY = 'mixing-zone-ai-notes'

type StoredNotes = { draft: string; summary: string; updatedAt: string }

function loadStored(): StoredNotes | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const j = JSON.parse(raw) as Partial<StoredNotes>
    if (typeof j.draft !== 'string' || typeof j.summary !== 'string') return null
    return { draft: j.draft, summary: j.summary, updatedAt: typeof j.updatedAt === 'string' ? j.updatedAt : '' }
  } catch { return null }
}

function buildMixNotesPrompt(roughNotes: string): string {
  return `You are assisting a mix engineer during a session.

From the rough notes below, respond with ONLY:
• 3–5 very short bullets.
• Split between concrete CHANGES made or planned and OPPORTUNITIES / next listens.
• No title line, no preamble, no closing — bullets only.
• Total under ~80 words. Use "• " for each line.

Rough notes:
---
${roughNotes.trim()}
---`
}

export default function MixingBoardPanel() {
  const [stored]              = useState(loadStored)
  const [draft,   setDraft]   = useState(stored?.draft ?? '')
  const [summary, setSummary] = useState(stored?.summary ?? '')
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const persist = (d: string, s: string) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ draft: d, summary: s, updatedAt: new Date().toISOString() }))
  }

  const runAiNotes = async () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    setBusy(true); setError(null)
    try {
      const { fetchWithKeys } = await import('../../lib/api-keys')
      const res  = await fetchWithKeys('/api/gemini/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: buildMixNotesPrompt(trimmed), maxOutputTokens: 220 }),
      })
      const json = (await res.json()) as { ok: true; preview: string | null } | { ok?: false; message?: string }
      if (!res.ok || !json || !('ok' in json) || json.ok !== true) {
        setError(typeof json === 'object' && 'message' in json && typeof json.message === 'string'
          ? json.message : `Request failed (${res.status})`)
        return
      }
      const text = ((json as { ok: true; preview: string | null }).preview ?? '').trim()
      setSummary(text); persist(trimmed, text)
    } catch {
      setError('Could not reach the AI endpoint. Is the dev server running with GEMINI_API_KEY set?')
    } finally { setBusy(false) }
  }

  const clearStored = () => {
    localStorage.removeItem(STORAGE_KEY)
    setDraft(''); setSummary(''); setError(null)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-4">
      {/* DAW bridges */}
      <div
        className="rounded-xl p-6 space-y-4"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
          <Music2 className="size-4" style={{ color: 'var(--text-2)' }} aria-hidden />
          DAW bridges (MIDI-first)
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>
          This project treats <strong className="font-medium" style={{ color: 'var(--text-1)' }}>MIDI</strong> as the primary
          interchange — use <strong className="font-medium" style={{ color: 'var(--text-1)' }}>Vocals → Piano</strong> for capture
          and export, then bring clips into{' '}
          <strong className="font-medium" style={{ color: 'var(--text-1)' }}>Logic Pro</strong> or{' '}
          <strong className="font-medium" style={{ color: 'var(--text-1)' }}>FL Studio</strong> for full mixing workflows.
        </p>
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          Session notes (below) stay in this browser only — local-first. Requires{' '}
          <code
            className="rounded text-[11px] px-1"
            style={{ background: 'var(--bg-muted)', color: 'var(--text-2)' }}
          >
            GEMINI_API_KEY
          </code>{' '}
          for AI tighten-up.
        </p>
      </div>

      {/* AI session notes */}
      <section
        className="rounded-xl p-6 space-y-4"
        style={{
          background:  'linear-gradient(to bottom, var(--accent-soft) 0%, var(--bg-card) 100%)',
          border:      '1px solid color-mix(in oklab, var(--accent) 20%, var(--border))',
          boxShadow:   'var(--shadow-sm)',
        }}
        aria-labelledby="mix-ai-notes-heading"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 id="mix-ai-notes-heading" className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
            <Sparkles className="size-4" style={{ color: 'var(--accent-fg)' }} aria-hidden />
            AI session notes
          </h2>
          {(draft.trim() || summary.trim()) && (
            <button
              type="button"
              onClick={clearStored}
              className="text-xs font-medium underline underline-offset-2 transition"
              style={{ color: 'var(--text-3)' }}
            >
              Clear
            </button>
          )}
        </div>
        <p className="text-xs" style={{ color: 'var(--text-2)' }}>
          Jot rough changes and ideas — AI turns them into a short bullet list of{' '}
          <span className="font-medium" style={{ color: 'var(--text-1)' }}>changes</span> vs{' '}
          <span className="font-medium" style={{ color: 'var(--text-1)' }}>opportunities</span>.
        </p>

        <label htmlFor="mix-rough-notes" className="block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
          Rough notes
        </label>
        <textarea
          id="mix-rough-notes"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={5}
          placeholder="e.g. bumped vocal gain -1dB after chorus; kick feels hollow…"
          className="w-full rounded-lg px-3 py-2 text-sm resize-y min-h-[100px] outline-none transition"
          style={{
            background: 'var(--bg-input)',
            border:     '1px solid var(--border)',
            color:      'var(--text-1)',
          }}
          onFocus={e  => (e.target.style.borderColor = 'var(--accent)')}
          onBlur={e   => (e.target.style.borderColor = 'var(--border)')}
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void runAiNotes()}
            disabled={busy || !draft.trim()}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 disabled:pointer-events-none transition"
            style={{ background: 'var(--accent)' }}
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
            {busy ? 'Working…' : 'Tighten with AI'}
          </button>
          <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>Runs through POST /api/gemini/generate</span>
        </div>

        {error && (
          <p
            className="text-xs rounded-lg px-3 py-2"
            role="alert"
            style={{ color: 'var(--bad)', background: 'var(--bad-soft)', border: '1px solid color-mix(in oklab, var(--bad) 20%, transparent)' }}
          >
            {error}
          </p>
        )}

        {summary.trim() && (
          <div
            className="rounded-lg px-4 py-3"
            style={{ background: 'var(--bg-card)', border: '1px solid color-mix(in oklab, var(--accent) 20%, var(--border))' }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--accent-fg)' }}>
              Concise recap
            </p>
            <div className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-1)' }}>
              {summary}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
