/**
 * Real Reach Lab panels — vault-grounded SEO / social / research drafts via Grok RAG.
 */
import { useCallback, useEffect, useState } from 'react'
import { ClipboardCopy, Loader2, Sparkles } from 'lucide-react'
import { vaultApi } from '../../lib/vault-api'
import { GlowCard } from '../ui/GlowCard'

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <GlowCard customSize glowColor="purple" className={`min-w-0 rounded-xl ${className}`}>
      {children}
    </GlowCard>
  )
}

export function ReachSEOPanel() {
  const [project, setProject] = useState('')
  const [topic, setTopic] = useState('App Store / landing SEO')
  const [projects, setProjects] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [sources, setSources] = useState<{ path: string; title: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    void vaultApi()
      .projects()
      .then(r => {
        const names = r.projects.map(p => p.name).filter(n => !n.startsWith('(')).slice(0, 30)
        setProjects(names)
        if (names[0]) setProject(names[0])
      })
      .catch(() => {})
  }, [])

  const generate = async () => {
    setBusy(true)
    setErr(null)
    try {
      const r = await vaultApi().reachDraft({ channel: 'seo', project, topic })
      if (!r.ok) throw new Error(r.error || 'Draft failed')
      setDraft(r.draft || '')
      setSources((r.sources || []).map(s => ({ path: s.path, title: s.title })))
    } catch (e: any) {
      setErr(e?.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-[var(--text-1)]">SEO workspace</h2>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Titles, meta, FAQ — grounded in vault project notes via RAG + Grok. No fake rankings.
        </p>
      </div>
      <Card className="space-y-3 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-[var(--text-4)]">
            Project
            <select
              value={project}
              onChange={e => setProject(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]"
            >
              {projects.map(p => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-[var(--text-4)]">
            Topic
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void generate()}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          Generate SEO pack
        </button>
        {err && <p className="text-xs text-amber-300">{err}</p>}
        {draft && (
          <div className="relative">
            <button
              type="button"
              className="absolute right-2 top-2 rounded-md p-1.5 text-[var(--text-3)] hover:bg-[var(--bg-hover)]"
              onClick={() => void navigator.clipboard.writeText(draft)}
              title="Copy"
            >
              <ClipboardCopy className="size-4" />
            </button>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card-soft)] p-4 text-[12px] leading-relaxed text-[var(--text-2)]">
              {draft}
            </pre>
          </div>
        )}
        {sources.length > 0 && (
          <ul className="text-[11px] text-[var(--text-4)]">
            {sources.map(s => (
              <li key={s.path}>· {s.path}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

export function ReachSocialPanel() {
  const [channel, setChannel] = useState<'twitter' | 'linkedin' | 'instagram' | 'thread'>('twitter')
  const [project, setProject] = useState('')
  const [topic, setTopic] = useState('weekly progress update')
  const [projects, setProjects] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [calendar, setCalendar] = useState<{ day: string; idea: string }[]>([])

  useEffect(() => {
    void vaultApi()
      .projects()
      .then(r => {
        const names = r.projects.map(p => p.name).filter(n => !n.startsWith('(')).slice(0, 30)
        setProjects(names)
        if (names[0]) setProject(names[0])
      })
      .catch(() => {})
  }, [])

  const generate = async () => {
    setBusy(true)
    setErr(null)
    try {
      const r = await vaultApi().reachDraft({ channel, project, topic })
      if (!r.ok) throw new Error(r.error || 'Draft failed')
      setDraft(r.draft || '')
      // simple 7-day skeleton from project name
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      setCalendar(
        days.map((day, i) => ({
          day,
          idea:
            i === 0
              ? `Hook: ${project} progress`
              : i === 3
                ? 'Behind-the-scenes / build log'
                : i === 6
                  ? 'CTA: try / waitlist / App Store'
                  : `Angle ${i + 1} — ${topic}`,
        })),
      )
    } catch (e: any) {
      setErr(e?.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-[var(--text-1)]">Social posting desk</h2>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Kill blank-page friction. Drafts use your vault status — not invented metrics.
        </p>
      </div>
      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap gap-2">
          {(['twitter', 'linkedin', 'instagram', 'thread'] as const).map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setChannel(c)}
              className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide"
              style={{
                background: channel === c ? 'var(--accent-soft)' : 'var(--bg-hover)',
                color: channel === c ? 'var(--accent-fg)' : 'var(--text-3)',
                border: `1px solid ${channel === c ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-[var(--text-4)]">
            Project
            <select
              value={project}
              onChange={e => setProject(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]"
            >
              {projects.map(p => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-[var(--text-4)]">
            Angle
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void generate()}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          Draft posts
        </button>
        {err && <p className="text-xs text-amber-300">{err}</p>}
        {draft && (
          <div className="relative">
            <button
              type="button"
              className="absolute right-2 top-2 rounded-md p-1.5 text-[var(--text-3)]"
              onClick={() => void navigator.clipboard.writeText(draft)}
            >
              <ClipboardCopy className="size-4" />
            </button>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card-soft)] p-4 text-[12px] text-[var(--text-2)]">
              {draft}
            </pre>
          </div>
        )}
      </Card>
      {calendar.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-[var(--text-1)]">7-day skeleton</h3>
          <ul className="mt-3 divide-y divide-[var(--border-soft)]">
            {calendar.map(row => (
              <li key={row.day} className="flex gap-3 py-2 text-sm">
                <span className="w-10 shrink-0 font-mono text-[var(--text-4)]">{row.day}</span>
                <span className="text-[var(--text-2)]">{row.idea}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

export function ReachResearchPanel() {
  const [q, setQ] = useState('What should I post about from recent handoffs?')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState<{ path: string; title: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const run = useCallback(async () => {
    setBusy(true)
    setErr(null)
    try {
      const r = await vaultApi().ragChat(q)
      if (!r.ok && !r.answer) throw new Error(r.error || 'Research failed')
      setAnswer(r.answer || '')
      setSources((r.sources || []).map(s => ({ path: s.path, title: s.title })))
    } catch (e: any) {
      setErr(e?.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }, [q])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-[var(--text-1)]">Market research (vault RAG)</h2>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Research your own corpus first — gaps, themes, and angles before inventing campaigns.
        </p>
      </div>
      <Card className="space-y-3 p-5">
        <textarea
          value={q}
          onChange={e => setQ(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          Research
        </button>
        {err && <p className="text-xs text-amber-300">{err}</p>}
        {answer && (
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card-soft)] p-4 text-[12px] text-[var(--text-2)]">
            {answer}
          </pre>
        )}
        {sources.length > 0 && (
          <ul className="text-[11px] text-[var(--text-4)]">
            {sources.slice(0, 8).map(s => (
              <li key={s.path}>· {s.path}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

export function ReachSnapshotBar() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const refresh = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await vaultApi().refreshSnapshots({})
      setMsg(r.ok ? 'Snapshots refresh finished (ingest/brief/CC/RAG/pulse).' : `Refresh issues: ${r.error || r.stderr}`)
    } catch (e: any) {
      setMsg(e?.message || 'Refresh failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-[var(--text-1)]">Vault snapshots</div>
        <div className="text-xs text-[var(--text-3)]">
          Terminal pipeline: chat-ingest → brief → command center → RAG index → Grok pulse
        </div>
        {msg && <div className="mt-1 text-xs text-[var(--text-2)]">{msg}</div>}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void refresh()}
        className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        Refresh snapshots
      </button>
    </div>
  )
}
