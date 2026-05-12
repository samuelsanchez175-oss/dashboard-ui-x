/**
 * Settings & API keys page.
 *
 * This page is now the *canonical* source for API credentials inside the
 * dashboard. Keys typed here are persisted in localStorage and automatically
 * injected as `x-user-key-*` headers on every `/api/*` request (see
 * `fetchWithKeys`). The dev BFF prefers those headers over `process.env`,
 * so the same key the user types is what actually powers Gemini, YouTube,
 * RSS, OpenAI, etc.
 *
 * The .env.local file remains a fallback for headless usage; the UI shows
 * an "Active source" badge per row so you always know which is being used.
 */

import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ClipboardCopy,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  Server,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react'

import { SecureVault } from '../../components/vault'
import { DOCUMENTED_ENV_LOGOS } from '../../components/agent-farm/integration-logos'
import { fetchWithKeys, getAllStoredApiKeys, setApiKey, subscribeApiKeys } from '../../lib/api-keys'
import {
  buildEnvSnippetFromScratch,
  createCustomDocRow,
  existingEnvKeyNames,
  loadCustomDocRows,
  mergeDocumentedEnvRows,
  normalizeEnvKeyName,
  saveCustomDocRows,
  type CustomDocRow,
  type DocRowScope,
  type MergedDocRow,
} from '../../lib/dev-documented-env-keys'

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function maskEnvValue(key: string, value: string | undefined): string {
  if (value === undefined || value === '') return '—'
  if (key === 'MODE' || key === 'DEV' || key === 'PROD' || key === 'SSR') return String(value)
  if (value.length <= 6) return '••••'
  return `${value.slice(0, 3)}…${value.slice(-2)}`
}

/** Probe endpoint per built-in env key (used by the per-row Test button). */
function probeRouteForKey(envKey: string): { label: string; url: string; init?: RequestInit } | null {
  switch (envKey) {
    case 'GEMINI_API_KEY':
      return { label: 'Gemini', url: '/api/gemini/ping', init: { method: 'POST', headers: { 'Content-Type': 'application/json' } } }
    case 'YOUTUBE_API_KEY':
    case 'GOOGLE_API_KEY':
      return { label: 'YouTube',   url: '/api/youtube/search?q=ping' }
    case 'OPENAI_API_KEY':
      return { label: 'OpenAI',    url: '/api/openai/ping' }
    case 'RSS_FEED_URLS':
      return { label: 'RSS',       url: '/api/rss?limit=1' }
    case 'AGENT_FARM_YOUTUBE_CHANNEL_ID':
      return { label: 'YT Channel', url: '/api/youtube/channel' }
    default:
      return null
  }
}

type ConfigStatus = Partial<Record<string, boolean>>
type ProbeOutcome = { ok: true; ms: number; note?: string } | { ok: false; ms: number; message: string }

/* ── Component ──────────────────────────────────────────────────────────── */

export default function DevSettings() {
  const baseId = useId()
  const addDialogTitleId = `${baseId}-add-dialog-title`

  /* import.meta.env snapshot for the dev-flags grid */
  const viteSnapshot = useMemo(() => {
    const env = import.meta.env as Record<string, string | boolean | undefined>
    return Object.keys(env)
      .filter(k => k.startsWith('VITE_') || ['MODE', 'BASE_URL', 'DEV', 'PROD', 'SSR'].includes(k))
      .sort()
      .map(k => ({ key: k, display: maskEnvValue(k, env[k] != null ? String(env[k]) : undefined) }))
  }, [])

  /* Manifest + stored values (live-subscribed) */
  const [customRows, setCustomRows] = useState<CustomDocRow[]>(() => loadCustomDocRows())
  const mergedRows = useMemo(() => mergeDocumentedEnvRows(customRows), [customRows])
  const [stored, setStored] = useState<Record<string, string>>(() => getAllStoredApiKeys())
  useEffect(() => subscribeApiKeys(setStored), [])

  /* Server config status — refetched whenever local keys change */
  const [envStatus, setEnvStatus] = useState<ConfigStatus | null>(null)
  const refreshEnvStatus = useCallback(async () => {
    try {
      // Hit the status endpoint WITHOUT auto-injecting keys so we learn the
      // pure .env.local state. (config/status with keys would always be "true".)
      const r = await fetch('/api/config/status', { cache: 'no-store' })
      if (!r.ok) return
      setEnvStatus(await r.json() as ConfigStatus)
    } catch {
      /* BFF unavailable */
    }
  }, [])
  useEffect(() => { void refreshEnvStatus() }, [refreshEnvStatus])

  /* Show/hide secret-input toggle per row */
  const [reveal, setReveal] = useState<Record<string, boolean>>({})
  const toggleReveal = (envKey: string) => setReveal(r => ({ ...r, [envKey]: !r[envKey] }))

  /* Test-button outcomes per row */
  const [probing, setProbing] = useState<Record<string, boolean>>({})
  const [probeResult, setProbeResult] = useState<Record<string, ProbeOutcome>>({})

  const runProbe = useCallback(async (envKey: string) => {
    const route = probeRouteForKey(envKey)
    if (!route) return
    setProbing(s => ({ ...s, [envKey]: true }))
    setProbeResult(s => { const c = { ...s }; delete c[envKey]; return c })
    const t0 = performance.now()
    try {
      const r    = await fetchWithKeys(route.url, route.init)
      const ms   = Math.round(performance.now() - t0)
      const text = await r.text()
      let body: unknown = null
      try { body = JSON.parse(text) } catch { /* not JSON */ }
      const ok = r.ok && (body == null || (typeof body === 'object' && !('ok' in body) || (body as { ok?: boolean }).ok === true))
      if (ok) {
        setProbeResult(s => ({ ...s, [envKey]: { ok: true, ms, note: `${route.label} responded ${r.status}` } }))
      } else {
        const msg = (typeof body === 'object' && body != null && 'message' in body
          ? String((body as { message: string }).message)
          : `${r.status} ${r.statusText}`)
        setProbeResult(s => ({ ...s, [envKey]: { ok: false, ms, message: msg.slice(0, 240) } }))
      }
    } catch (e) {
      const ms = Math.round(performance.now() - t0)
      setProbeResult(s => ({ ...s, [envKey]: { ok: false, ms, message: e instanceof Error ? e.message : 'fetch failed' } }))
    } finally {
      setProbing(s => ({ ...s, [envKey]: false }))
    }
  }, [])

  /* Editing — drives both localStorage AND the live status panel */
  const setRowValue = useCallback((envKey: string, value: string) => {
    setApiKey(envKey, value)
    // The status flag depends on what the BFF sees; if no env value but local
    // value is now set, we still want the dot to flip to green visually.
    void refreshEnvStatus()
  }, [refreshEnvStatus])

  /* Copy snippet for .env.local */
  const [copyHint, setCopyHint] = useState<string | null>(null)
  const copyEnvSnippet = useCallback(async () => {
    const text = buildEnvSnippetFromScratch(mergedRows, stored)
    if (!text.trim()) {
      setCopyHint('Nothing to copy — fill in at least one value.')
      window.setTimeout(() => setCopyHint(null), 2500)
      return
    }
    try {
      await navigator.clipboard.writeText(`${text}\n`)
      setCopyHint('Copied lines — paste into .env.local')
    } catch {
      setCopyHint('Clipboard unavailable')
    }
    window.setTimeout(() => setCopyHint(null), 2500)
  }, [mergedRows, stored])

  /* Add-custom-row dialog */
  const [addOpen, setAddOpen] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [newKeyRaw, setNewKeyRaw] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newScope, setNewScope] = useState<DocRowScope>('server')
  const [newInputKind, setNewInputKind] = useState<'secret' | 'text'>('secret')

  useEffect(() => {
    if (!addOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAddOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addOpen])

  const openAddModal = useCallback(() => {
    setAddError(null); setNewKeyRaw(''); setNewDesc('')
    setNewScope('server'); setNewInputKind('secret'); setAddOpen(true)
  }, [])

  const addCustomRow = useCallback(() => {
    const taken = existingEnvKeyNames(customRows)
    const normalized = normalizeEnvKeyName(newKeyRaw)
    if (!normalized) {
      setAddError('Use upper snake case (e.g. MY_API_KEY). Letters, digits, underscores only.')
      return
    }
    if (taken.has(normalized)) {
      setAddError('That variable name already exists in the table.')
      return
    }
    const row = createCustomDocRow({ envKey: normalized, scope: newScope, description: newDesc, inputKind: newInputKind })
    if (!row) { setAddError('Could not create row — check the variable name.'); return }
    const next = [...customRows, row]
    setCustomRows(next)
    saveCustomDocRows(next)
    setAddOpen(false)
  }, [customRows, newDesc, newInputKind, newKeyRaw, newScope])

  const removeCustomRow = useCallback((id: string) => {
    const target = customRows.find(r => r.id === id)
    const next = customRows.filter(r => r.id !== id)
    setCustomRows(next)
    saveCustomDocRows(next)
    if (target) setApiKey(target.envKey, '')
  }, [customRows])

  /* Local content previews — unchanged */
  const [promptPreview, setPromptPreview] = useState<string>('')
  const [presetPreview, setPresetPreview] = useState<string>('')
  const loadLocal = useCallback(async () => {
    try {
      const [md, js] = await Promise.all([
        fetch('/api/local/file?path=prompts/starter.md').then(r => (r.ok ? r.text() : '')),
        fetch('/api/local/file?path=presets/starter.json').then(r => (r.ok ? r.text() : '')),
      ])
      setPromptPreview(md); setPresetPreview(js)
    } catch {
      setPromptPreview('(could not load)'); setPresetPreview('(could not load)')
    }
  }, [])
  useEffect(() => {
    const t = window.setTimeout(() => { void loadLocal() }, 0)
    return () => window.clearTimeout(t)
  }, [loadLocal])

  return (
    <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}>
      <div className="mx-auto max-w-4xl space-y-10 p-8">

        {/* ── Page heading ──────────────────────────────────────────── */}
        <header>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>
            <KeyRound className="size-5" style={{ color: 'var(--accent)' }} aria-hidden />
            Settings &amp; API keys
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-3)' }}>
            Keys typed here are stored in <code style={chipStyle()}>localStorage</code> and sent to the dev BFF as{' '}
            <code style={chipStyle()}>x-user-key-*</code> headers. The server prefers your typed value over{' '}
            <code style={chipStyle()}>.env.local</code> — so this page is the canonical source for Gemini / YouTube /
            OpenAI / RSS credentials. The <code style={chipStyle()}>.env.local</code> path remains a fallback.
          </p>
        </header>

        {/* ── Safe-patterns callout ─────────────────────────────────── */}
        <section
          className="space-y-2 rounded-xl p-5"
          style={{ background: 'var(--accent-soft)', border: '1px solid color-mix(in oklab, var(--accent) 25%, var(--border))' }}
          aria-labelledby={`${baseId}-safety`}
        >
          <h2 id={`${baseId}-safety`} className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--accent-fg)' }}>
            <Lock className="size-4" aria-hidden />
            How key resolution works
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm" style={{ color: 'var(--text-2)' }}>
            <li>Type a value below → it&apos;s used for every matching <code style={chipStyle()}>/api/*</code> call from this browser.</li>
            <li>Leave a row blank → the BFF falls back to <code style={chipStyle()}>.env.local</code> (if set).</li>
            <li><strong>ENV</strong> badge = your <code style={chipStyle()}>.env.local</code> has the key. <strong>LOCAL</strong> badge = you typed one. <strong>BOTH</strong> means your typed key wins.</li>
            <li>Use <strong>Test</strong> to ping the corresponding upstream API with the value you typed.</li>
            <li>Secrets in <code style={chipStyle()}>localStorage</code> are not encrypted — use this for dev only.</li>
          </ul>
        </section>

        {/* ── Documented keys table ─────────────────────────────────── */}
        <section aria-labelledby={`${baseId}-doc`}>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <h2 id={`${baseId}-doc`} className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              <Server className="size-4" style={{ color: 'var(--text-3)' }} aria-hidden />
              Documented keys
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openAddModal}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                style={{ background: 'var(--accent-soft)', border: '1px solid color-mix(in oklab, var(--accent) 30%, var(--border))', color: 'var(--accent-fg)' }}
              >
                <Plus className="size-3.5 shrink-0" aria-hidden />
                Add variable
              </button>
              {copyHint && (
                <span className="text-xs" role="status" style={{ color: 'var(--good)' }}>{copyHint}</span>
              )}
              <button
                type="button"
                onClick={() => void copyEnvSnippet()}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-1)', boxShadow: 'var(--shadow-sm)' }}
              >
                <ClipboardCopy className="size-3.5 shrink-0" aria-hidden />
                Copy .env lines
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
            <table className="min-w-full text-sm">
              <thead style={{ background: 'var(--bg-muted)', color: 'var(--text-3)' }}>
                <tr className="text-left text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Variable</th>
                  <th className="px-4 py-3 font-medium" style={{ width: '6rem' }}>Source</th>
                  <th className="px-4 py-3 font-medium" style={{ minWidth: '14rem' }}>Local value</th>
                  <th className="px-4 py-3 font-medium text-right" style={{ width: '8rem' }}>Test / Remove</th>
                </tr>
              </thead>
              <tbody>
                {mergedRows.map((row: MergedDocRow) => (
                  <KeyRow
                    key={row.builtIn ? row.envKey : row.id}
                    row={row}
                    storedValue={stored[row.envKey] ?? ''}
                    envSet={Boolean(envStatus?.[row.envKey])}
                    reveal={Boolean(reveal[row.envKey])}
                    onReveal={() => toggleReveal(row.envKey)}
                    onChange={value => setRowValue(row.envKey, value)}
                    onRemove={row.builtIn ? null : () => removeCustomRow(row.id)}
                    probe={probeResult[row.envKey] ?? null}
                    probing={Boolean(probing[row.envKey])}
                    onProbe={() => void runProbe(row.envKey)}
                    canProbe={probeRouteForKey(row.envKey) !== null}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Vite env snapshot ─────────────────────────────────────── */}
        <section aria-labelledby={`${baseId}-vite`}>
          <h2 id={`${baseId}-vite`} className="mb-3 flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            <Info className="size-4" style={{ color: 'var(--text-3)' }} aria-hidden />
            <code style={chipStyle()}>import.meta.env</code> (dev snapshot)
          </h2>
          <p className="mb-2 text-xs" style={{ color: 'var(--text-3)' }}>
            Values are masked except safe mode flags. Add <code style={chipStyle()}>VITE_*</code> in{' '}
            <code style={chipStyle()}>.env.local</code> to surface client-safe config.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {viteSnapshot.map(({ key, display }) => (
              <li
                key={key}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-xs"
                style={{ background: 'var(--bg-card-soft)', border: '1px solid var(--border-soft)' }}
              >
                <span className="font-mono" style={{ color: 'var(--text-2)' }}>{key}</span>
                <span className="tabular-nums" style={{ color: 'var(--text-1)' }}>{display}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Local content previews ────────────────────────────────── */}
        <section aria-labelledby={`${baseId}-content`}>
          <h2 id={`${baseId}-content`} className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            Local content previews
          </h2>
          <p className="mb-3 text-xs" style={{ color: 'var(--text-3)' }}>
            Starter files live under <code style={chipStyle()}>content/prompts</code> and{' '}
            <code style={chipStyle()}>content/presets</code>, served in dev via{' '}
            <code style={chipStyle()}>/api/local/file?path=…</code>.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              { title: 'prompts/starter.md',   body: promptPreview },
              { title: 'presets/starter.json', body: presetPreview },
            ].map(p => (
              <div
                key={p.title}
                className="rounded-xl p-4"
                style={{ background: 'var(--bg-card-soft)', border: '1px solid var(--border)' }}
              >
                <p className="mb-2 text-xs font-medium" style={{ color: 'var(--text-3)' }}>{p.title}</p>
                <pre className="max-h-48 overflow-auto font-mono text-[11px]" style={{ color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>
                  {p.body || '—'}
                </pre>
              </div>
            ))}
          </div>
        </section>

        {/* ── Secure vault (browser) ────────────────────────────────── */}
        <section aria-labelledby={`${baseId}-vault`}>
          <h2 id={`${baseId}-vault`} className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            Secure vault (browser)
          </h2>
          <div className="overflow-hidden rounded-xl" style={{ background: 'var(--bg-card-soft)', border: '1px solid var(--border)' }}>
            <SecureVault />
          </div>
        </section>
      </div>

      {/* ── Add-row dialog ───────────────────────────────────────────── */}
      {addOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(5,5,8,0.6)', backdropFilter: 'blur(4px)' }}
          role="presentation"
          onClick={() => setAddOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={addDialogTitleId}
            className="w-full max-w-md rounded-2xl p-6 shadow-xl"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 id={addDialogTitleId} className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>
              Add documented variable
            </h3>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
              Saved only in this browser. Use upper snake case — same rules as <code style={chipStyle()}>.env</code> names.
            </p>
            <div className="mt-4 space-y-3">
              <DialogField label="Variable name">
                <input
                  value={newKeyRaw}
                  onChange={e => setNewKeyRaw(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="MY_SERVICE_API_KEY"
                  className="w-full rounded-lg px-3 py-2 font-mono text-sm outline-none transition"
                  style={inputStyle()}
                />
              </DialogField>
              <DialogField label="Description">
                <textarea
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  rows={3}
                  placeholder="What this key is for…"
                  className="w-full resize-y rounded-lg px-3 py-2 text-sm outline-none transition"
                  style={inputStyle()}
                />
              </DialogField>
              <div className="grid gap-3 sm:grid-cols-2">
                <DialogField label="Scope">
                  <select
                    value={newScope}
                    onChange={e => setNewScope(e.target.value as DocRowScope)}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none transition"
                    style={inputStyle()}
                  >
                    <option value="server">server</option>
                    <option value="client">client</option>
                  </select>
                </DialogField>
                <DialogField label="Input type">
                  <select
                    value={newInputKind}
                    onChange={e => setNewInputKind(e.target.value as 'secret' | 'text')}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none transition"
                    style={inputStyle()}
                  >
                    <option value="secret">Secret (masked)</option>
                    <option value="text">Plain text</option>
                  </select>
                </DialogField>
              </div>
              {addError && (
                <p className="text-xs" role="alert" style={{ color: 'var(--bad)' }}>{addError}</p>
              )}
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="rounded-lg px-4 py-2 text-xs font-medium transition"
                style={{ background: 'var(--bg-card-soft)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addCustomRow}
                className="rounded-lg px-4 py-2 text-xs font-semibold text-white transition"
                style={{ background: 'var(--accent)' }}
              >
                Add row
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

function KeyRow({
  row, storedValue, envSet, reveal, onReveal, onChange, onRemove,
  probe, probing, onProbe, canProbe,
}: {
  row:        MergedDocRow
  storedValue: string
  envSet:     boolean
  reveal:     boolean
  onReveal:   () => void
  onChange:   (value: string) => void
  onRemove:   (() => void) | null
  probe:      ProbeOutcome | null
  probing:    boolean
  onProbe:    () => void
  canProbe:   boolean
}) {
  const logoSrc  = DOCUMENTED_ENV_LOGOS[row.envKey]
  const isCustom = !row.builtIn
  const hasLocal = storedValue.trim().length > 0

  /** Compute the "active source" badge — what the BFF will actually use. */
  const source: 'BOTH' | 'LOCAL' | 'ENV' | 'NONE' =
    hasLocal && envSet ? 'BOTH'
    : hasLocal         ? 'LOCAL'
    : envSet           ? 'ENV'
    : 'NONE'

  return (
    <tr style={{ borderBottom: '1px solid var(--border-soft)' }}>
      {/* ── Variable cell ───────────────────────────────────────────── */}
      <td className="px-4 py-3 align-top">
        <div className="flex min-w-0 items-start gap-3">
          {logoSrc ? (
            <span
              className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg p-1.5"
              style={{ background: '#ffffff', boxShadow: '0 0 0 1px var(--border)' }}
              aria-hidden
            >
              <img src={logoSrc} alt="" className="max-h-full max-w-full object-contain" loading="lazy" decoding="async" />
            </span>
          ) : (
            <span
              className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{ background: 'var(--bg-card-soft)', color: 'var(--text-4)', boxShadow: '0 0 0 1px var(--border)' }}
              aria-hidden
            >
              <KeyRound className="size-4" />
            </span>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs" style={{ color: 'var(--text-1)' }}>{row.envKey}</span>
              {isCustom && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }}
                >
                  Custom
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--text-3)' }}>{row.description}</p>
          </div>
        </div>
      </td>

      {/* ── Source badge ────────────────────────────────────────────── */}
      <td className="px-4 py-3 align-top whitespace-nowrap">
        <SourceBadge source={source} />
      </td>

      {/* ── Value input ─────────────────────────────────────────────── */}
      <td className="px-4 py-3 align-top">
        {row.inputKind === 'none' ? (
          <p className="text-xs leading-snug" style={{ color: 'var(--text-3)' }}>
            Define concrete names in <code style={chipStyle()}>.env.local</code>. Reload dev after edits.
          </p>
        ) : (
          <div className="flex items-center gap-1.5">
            <label className="relative block flex-1">
              <span className="sr-only">{row.envKey}</span>
              <input
                type={row.inputKind === 'secret' && !reveal ? 'password' : 'text'}
                value={storedValue}
                onChange={e => onChange(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder={row.inputKind === 'secret' ? 'Paste key…' : 'Value…'}
                className="w-full rounded-lg px-3 py-2 pr-9 font-mono text-xs outline-none transition"
                style={inputStyle()}
              />
              {row.inputKind === 'secret' && (
                <button
                  type="button"
                  onClick={onReveal}
                  className="absolute inset-y-0 right-0 grid w-9 place-items-center"
                  style={{ color: 'var(--text-3)' }}
                  aria-label={reveal ? 'Hide value' : 'Show value'}
                  title={reveal ? 'Hide' : 'Show'}
                >
                  {reveal ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
                </button>
              )}
            </label>
          </div>
        )}
        {probe && (
          <p
            className="mt-1.5 text-[11px] leading-snug"
            role="status"
            style={{ color: probe.ok ? 'var(--good)' : 'var(--bad)' }}
          >
            {probe.ok
              ? <><CheckCircle2 className="-mt-0.5 mr-1 inline size-3.5" aria-hidden /> OK · {probe.ms} ms{probe.note ? ` · ${probe.note}` : ''}</>
              : <><XCircle      className="-mt-0.5 mr-1 inline size-3.5" aria-hidden /> {probe.message}</>}
          </p>
        )}
      </td>

      {/* ── Test / Remove ───────────────────────────────────────────── */}
      <td className="px-4 py-3 align-top text-right">
        <div className="inline-flex items-center gap-1.5">
          {canProbe && (
            <button
              type="button"
              onClick={onProbe}
              disabled={probing}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition disabled:opacity-55"
              style={{ background: 'var(--bg-card-soft)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
              title="Ping the matching upstream API with this key"
            >
              {probing ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Zap className="size-3" aria-hidden />}
              Test
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex rounded-lg p-2 transition"
              style={{ background: 'var(--bg-card-soft)', border: '1px solid var(--border)', color: 'var(--text-3)' }}
              aria-label={`Remove ${row.envKey}`}
              title={`Remove ${row.envKey}`}
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

function SourceBadge({ source }: { source: 'BOTH' | 'LOCAL' | 'ENV' | 'NONE' }) {
  const palette: Record<typeof source, { bg: string; fg: string; label: string; tip: string }> = {
    BOTH:  { bg: 'var(--accent-soft)', fg: 'var(--accent-fg)', label: 'BOTH',  tip: 'Both .env and a local-typed value are present; the local typed value wins for /api/* calls.' },
    LOCAL: { bg: 'var(--good-soft)',   fg: 'var(--good)',      label: 'LOCAL', tip: 'You typed this value here. Sent to the BFF as x-user-key-* on each /api/* call.' },
    ENV:   { bg: 'var(--bg-muted)',    fg: 'var(--text-2)',    label: 'ENV',   tip: 'Resolved from .env.local at server start.' },
    NONE:  { bg: 'var(--bad-soft)',    fg: 'var(--bad)',       label: 'NONE',  tip: 'No value set — features depending on this key will fail until you paste one or set it in .env.local.' },
  }
  const p = palette[source]
  return (
    <span
      className="mono inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: p.bg, color: p.fg }}
      title={p.tip}
    >
      {p.label}
    </span>
  )
}

function DialogField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>{label}</span>
      {children}
    </label>
  )
}

/* ── Inline style helpers ────────────────────────────────────────────────── */

function chipStyle(): React.CSSProperties {
  return {
    fontFamily:  "'DM Mono', monospace",
    fontSize:    11,
    padding:     '1px 5px',
    borderRadius: 4,
    background:  'var(--bg-muted)',
    color:       'var(--text-2)',
  }
}

function inputStyle(): React.CSSProperties {
  return {
    background: 'var(--bg-input)',
    border:     '1px solid var(--border)',
    color:      'var(--text-1)',
  }
}
