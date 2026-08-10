import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, MessageSquare, RefreshCw, Send, Sparkles } from 'lucide-react'
import { fetchWithKeys } from '../../lib/api-keys'
import { openInObsidian } from '../../lib/vault-api'
import { VaultPage } from './VaultChrome'
import { useVaultStatus } from './useVaultStatus'

type Source = { path: string; title: string; score: number; snippet: string }
type Msg = { role: 'user' | 'assistant'; text: string; sources?: Source[] }

export default function VaultRagZone() {
  const { status, error: statusError, loading, refresh } = useVaultStatus()
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: 'assistant',
      text: 'Ask anything about your vault — handoffs, projects, clippings, media. I retrieve notes then answer with Grok.',
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [indexMeta, setIndexMeta] = useState<{ chunkCount?: number; builtAt?: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadRagStatus = useCallback(async () => {
    try {
      const res = await fetchWithKeys('/api/vault/rag/status')
      const j = await res.json()
      setIndexMeta({ chunkCount: j.chunkCount, builtAt: j.builtAt })
    } catch { /* */ }
  }, [])

  useEffect(() => {
    void loadRagStatus()
  }, [loadRagStatus])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, busy])

  const rebuild = async () => {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetchWithKeys('/api/vault/rag/rebuild', { method: 'POST' })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error || 'Rebuild failed')
      setIndexMeta({ chunkCount: j.chunkCount, builtAt: j.builtAt })
      setMsgs(m => [
        ...m,
        { role: 'assistant', text: `Index rebuilt — ${j.chunkCount?.toLocaleString?.() ?? j.chunkCount} chunks from ${j.vaultDir}.` },
      ])
    } catch (e: any) {
      setErr(e?.message || 'Rebuild failed')
    } finally {
      setBusy(false)
    }
  }

  const send = async () => {
    const q = input.trim()
    if (!q || busy) return
    setInput('')
    setMsgs(m => [...m, { role: 'user', text: q }])
    setBusy(true)
    setErr(null)
    try {
      const res = await fetchWithKeys('/api/vault/rag/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      const j = await res.json()
      if (j.indexMeta) setIndexMeta({ chunkCount: j.indexMeta.chunkCount, builtAt: j.indexMeta.builtAt })
      if (!j.ok && !j.answer) throw new Error(j.error || 'Chat failed')
      setMsgs(m => [
        ...m,
        {
          role: 'assistant',
          text: j.answer || j.error || 'No answer',
          sources: j.sources,
        },
      ])
    } catch (e: any) {
      setErr(e?.message || 'Chat failed — is the dev server running? Is `grok` CLI available?')
      setMsgs(m => [...m, { role: 'assistant', text: `Error: ${e?.message || 'request failed'}` }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <VaultPage
      title="Vault RAG Chat"
      description="True retrieve-then-generate over your second brain. Local chunk index + Grok for answers with citations."
      status={status}
      onRefreshStatus={() => {
        void refresh()
        void loadRagStatus()
      }}
      loading={loading}
      error={statusError || err}
      actions={
        <button
          type="button"
          onClick={() => void rebuild()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium disabled:opacity-50"
          style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
        >
          <RefreshCw className={`size-3.5 ${busy ? 'animate-spin' : ''}`} />
          Rebuild index
        </button>
      }
    >
      <div
        className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-[12px]"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
      >
        <Sparkles className="size-3.5" style={{ color: 'var(--accent-fg)' }} />
        <span style={{ color: 'var(--text-2)' }}>
          {indexMeta?.chunkCount != null
            ? `${indexMeta.chunkCount.toLocaleString()} chunks`
            : 'Index not built yet — rebuild or ask a question (auto-builds)'}
        </span>
        {indexMeta?.builtAt && (
          <span className="mono text-[10px]" style={{ color: 'var(--text-4)' }}>
            built {new Date(indexMeta.builtAt).toLocaleString()}
          </span>
        )}
      </div>

      <div
        className="flex min-h-[420px] flex-col overflow-hidden rounded-xl border"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', maxHeight: 'min(70vh, 720px)' }}
      >
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {msgs.map((m, i) => (
            <div
              key={i}
              className={`max-w-[92%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                m.role === 'user' ? 'ml-auto' : ''
              }`}
              style={{
                background: m.role === 'user' ? 'var(--accent-soft)' : 'var(--bg-card-soft)',
                color: m.role === 'user' ? 'var(--accent-fg)' : 'var(--text-2)',
                border: '1px solid var(--border-soft)',
              }}
            >
              <div className="mono mb-1 text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>
                {m.role === 'user' ? 'You' : 'Vault + Grok'}
              </div>
              <div className="whitespace-pre-wrap">{m.text}</div>
              {m.sources && m.sources.length > 0 && (
                <div className="mt-3 space-y-1 border-t pt-2" style={{ borderColor: 'var(--border-soft)' }}>
                  <div className="mono text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>
                    Sources
                  </div>
                  {m.sources.slice(0, 6).map((s, j) => (
                    <button
                      key={s.path + j}
                      type="button"
                      className="block w-full truncate text-left text-[11px] underline-offset-2 hover:underline"
                      style={{ color: 'var(--accent-fg)' }}
                      onClick={() => status?.vaultDir && openInObsidian(status.vaultDir, s.path)}
                      title={s.snippet}
                    >
                      [{j + 1}] {s.path}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-3)' }}>
              <Loader2 className="size-4 animate-spin" /> Retrieving + generating…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          className="flex gap-2 border-t p-3"
          style={{ borderColor: 'var(--border)' }}
          onSubmit={e => {
            e.preventDefault()
            void send()
          }}
        >
          <div
            className="flex flex-1 items-center gap-2 rounded-lg border px-3 py-2"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-input)' }}
          >
            <MessageSquare className="size-4 shrink-0" style={{ color: 'var(--text-4)' }} />
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="What was I doing on CarViews? Summarize CDL open work…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              style={{ color: 'var(--text-1)' }}
              disabled={busy}
            />
          </div>
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            <Send className="size-3.5" />
            Ask
          </button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          'What projects are most active from recent handoffs?',
          'Summarize open work on CDL One Stop',
          'What music / production tools have I been building?',
          'What collection themes show up in my vault?',
        ].map(s => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => {
              setInput(s)
            }}
            className="rounded-full px-3 py-1 text-[11px]"
            style={{ border: '1px solid var(--border)', color: 'var(--text-3)', background: 'var(--bg-hover)' }}
          >
            {s}
          </button>
        ))}
      </div>
    </VaultPage>
  )
}
