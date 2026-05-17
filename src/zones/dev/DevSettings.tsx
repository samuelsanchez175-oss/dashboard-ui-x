/**
 * Settings & API keys — canonical scratch store for server keys the BFF reads via
 * `x-user-key-*` (see `fetchWithKeys`). See `#settings-key-resolution` on-page
 * for precedence vs `.env.local`.
 */

import { Fragment, useCallback, useEffect, useId, useMemo, useState, type CSSProperties } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  ExternalLink,
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

import { explainProbeError } from './probe-error-guidance'

import { SecureVault } from '../../components/vault'
import AddDocumentedEnvDialog from '../../components/dev/AddDocumentedEnvDialog'
import ZoneHeader from '../../components/ZoneHeader'
import { DOCUMENTED_ENV_LOGOS } from '../../components/agent-farm/integration-logos'
import { CONTAINERS, SURFACES } from '../../lib/design-tokens'
import { fetchWithKeys, getAllStoredApiKeys, setApiKey, subscribeApiKeys } from '../../lib/api-keys'
import {
  buildDisplayDocGroups,
  buildEnvSnippetFromScratch,
  loadCustomDocRows,
  MAX_CUSTOM_DOC_ROWS,
  mergeDocumentedEnvRows,
  saveCustomDocRows,
  type CustomDocRow,
  type MergedDocRow,
} from '../../lib/dev-documented-env-keys'
import {
  DEV_SETTINGS_ENV_MODEL,
  DEV_SETTINGS_SECTION_META,
  probeRouteForStorageKey,
  type DevSettingsEnvModelEntry,
  type DevSettingsRetrievalLink,
} from '../../lib/dev-settings-env-model'

function maskEnvValue(key: string, value: string | undefined): string {
  if (value === undefined || value === '') return '—'
  if (key === 'MODE' || key === 'DEV' || key === 'PROD' || key === 'SSR') return String(value)
  if (value.length <= 6) return '••••'
  return `${value.slice(0, 3)}…${value.slice(-2)}`
}

type ConfigStatus = Partial<Record<string, boolean>>
type ProbeOutcome = { ok: true; ms: number; note?: string } | { ok: false; ms: number; message: string }

type DevSettingsProps = {
  onNavigate?: (routeId: string) => void
}

function harmonyOverrideHint(storedHarmony: string): string {
  const t = storedHarmony.trim()
  if (t) {
    return 'Overrides GEMINI_API_KEY for: Harmony Client Projects (`/api/harmony/client-projects/*`).'
  }
  return 'Falls back to GEMINI_API_KEY when empty.'
}

export default function DevSettings({ onNavigate }: DevSettingsProps) {
  const baseId = useId()

  const viteSnapshot = useMemo(() => {
    const env = import.meta.env as Record<string, string | boolean | undefined>
    return Object.keys(env)
      .filter(k => k.startsWith('VITE_') || ['MODE', 'BASE_URL', 'DEV', 'PROD', 'SSR'].includes(k))
      .sort()
      .map(k => ({ key: k, display: maskEnvValue(k, env[k] != null ? String(env[k]) : undefined) }))
  }, [])

  const [customRows, setCustomRows] = useState<CustomDocRow[]>(() => loadCustomDocRows())
  const mergedRows = useMemo(() => mergeDocumentedEnvRows(customRows), [customRows])
  const viteMetaRow = useMemo(() => mergedRows.find(r => r.builtIn && r.envKey === 'VITE_*') ?? null, [mergedRows])
  const customOnlyGroups = useMemo(() => {
    const customs = mergedRows.filter((r): r is CustomDocRow => !r.builtIn)
    return buildDisplayDocGroups(customs)
  }, [mergedRows])

  const [stored, setStored] = useState<Record<string, string>>(() => getAllStoredApiKeys())
  useEffect(() => subscribeApiKeys(setStored), [])

  useEffect(() => {
    const sync = () => setCustomRows(loadCustomDocRows())
    window.addEventListener('dev-custom-doc-rows-changed', sync)
    return () => window.removeEventListener('dev-custom-doc-rows-changed', sync)
  }, [])

  const [envStatus, setEnvStatus] = useState<ConfigStatus | null>(null)
  const refreshEnvStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/config/status', { cache: 'no-store' })
      if (!r.ok) return
      setEnvStatus(await r.json() as ConfigStatus)
    } catch {
      /* BFF unavailable */
    }
  }, [])
  useEffect(() => { void refreshEnvStatus() }, [refreshEnvStatus])

  const [reveal, setReveal] = useState<Record<string, boolean>>({})
  const toggleReveal = (envKey: string) => setReveal(r => ({ ...r, [envKey]: !r[envKey] }))

  const [expandUsedIn, setExpandUsedIn] = useState<Record<string, boolean>>({})
  const toggleUsedIn = (id: string) => setExpandUsedIn(s => ({ ...s, [id]: !s[id] }))

  const [probing, setProbing] = useState<Record<string, boolean>>({})
  const [probeResult, setProbeResult] = useState<Record<string, ProbeOutcome>>({})

  const runProbe = useCallback(async (envKey: string) => {
    const route = probeRouteForStorageKey(envKey)
    if (!route) return
    setProbing(s => ({ ...s, [envKey]: true }))
    setProbeResult(s => { const c = { ...s }; delete c[envKey]; return c })
    const t0 = performance.now()
    try {
      const r = await fetchWithKeys(route.url, route.init)
      const ms = Math.round(performance.now() - t0)
      const text = await r.text()
      let body: unknown = null
      try { body = JSON.parse(text) } catch { /* not JSON */ }
      const ok = r.ok && (body == null || (typeof body === 'object' && !('ok' in body) || (body as { ok?: boolean }).ok === true))
      if (ok) {
        setProbeResult(s => ({ ...s, [envKey]: { ok: true, ms, note: `${route.label} ${r.status}` } }))
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

  const setRowValue = useCallback((envKey: string, value: string, supportsScratch: boolean) => {
    if (!supportsScratch) return
    setApiKey(envKey, value)
    void refreshEnvStatus()
  }, [refreshEnvStatus])

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

  const [addOpen, setAddOpen] = useState(false)
  const commitNewDocRows = useCallback((rows: CustomDocRow[]) => {
    setCustomRows(prev => {
      const next = [...prev, ...rows].slice(-MAX_CUSTOM_DOC_ROWS)
      saveCustomDocRows(next)
      return next
    })
  }, [])

  const removeCustomRow = useCallback((id: string) => {
    const target = customRows.find(r => r.id === id)
    if (!target) return
    if (target.oauthPairId) {
      const victims = customRows.filter(r => r.oauthPairId === target.oauthPairId)
      const next = customRows.filter(r => r.oauthPairId !== target.oauthPairId)
      setCustomRows(next)
      saveCustomDocRows(next)
      victims.forEach(v => setApiKey(v.envKey, ''))
      return
    }
    const next = customRows.filter(r => r.id !== id)
    setCustomRows(next)
    saveCustomDocRows(next)
    setApiKey(target.envKey, '')
  }, [customRows])

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
      <div className={`${CONTAINERS.hub} space-y-8 py-6 md:py-8`}>

        <ZoneHeader
          title="Settings & API keys"
          icon={KeyRound}
          description={
            <>
              Scratch values live in <code style={chipStyle()}>localStorage</code> and ride on <code style={chipStyle()}>/api/*</code> as{' '}
              <code style={chipStyle()}>x-user-key-*</code> when supported — the dev BFF prefers them over <code style={chipStyle()}>.env.local</code>.{' '}
              <a href="#settings-key-resolution" className="font-medium underline decoration-dotted underline-offset-2" style={{ color: 'var(--accent)' }}>
                How resolution works
              </a>
              {onNavigate && (
                <>
                  {' · '}
                  <button
                    type="button"
                    onClick={() => onNavigate('dev-diagnostics')}
                    className="font-medium underline decoration-dotted underline-offset-2"
                    style={{ color: 'var(--accent)' }}
                  >
                    Diagnostics
                  </button>
                </>
              )}
            </>
          }
        />

        <section
          id="settings-key-resolution"
          className="space-y-2 rounded-lg border p-4"
          style={{ background: 'var(--accent-soft)', borderColor: 'color-mix(in oklab, var(--accent) 22%, var(--border))' }}
          aria-labelledby={`${baseId}-resolve`}
        >
          <h2 id={`${baseId}-resolve`} className="flex items-center gap-2 text-xs font-semibold md:text-sm" style={{ color: 'var(--accent-fg)' }}>
            <Lock className="size-3.5 shrink-0 md:size-4" aria-hidden />
            Key resolution (single source)
          </h2>
          <ul className="list-disc space-y-0.5 pl-4 text-[11px] leading-snug md:text-xs" style={{ color: 'var(--text-2)' }}>
            <li>Non-empty scratch wins for keys the BFF reads via <code style={chipStyle()}>pickKey</code> (see each row&apos;s Source note).</li>
            <li><strong>ENV</strong> = set in server <code style={chipStyle()}>.env.local</code>; <strong>LOCAL</strong> = scratch only; <strong>BOTH</strong> = scratch wins.</li>
            <li><strong>Test</strong> hits the mapped route with <code style={chipStyle()}>fetchWithKeys</code> (same headers as the rest of the app).</li>
            <li>Scratch is not encrypted — dev-only. Rows marked &quot;server <code style={chipStyle()}>.env</code> only&quot; ignore browser headers.</li>
          </ul>
        </section>

        <section aria-labelledby={`${baseId}-doc`} id="settings-api-keys">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <h2 id={`${baseId}-doc`} className="flex items-center gap-2 text-xs font-semibold md:text-sm" style={{ color: 'var(--text-1)' }}>
              <Server className="size-3.5 shrink-0 md:size-4" style={{ color: 'var(--text-3)' }} aria-hidden />
              Integration keys
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition md:text-xs"
                style={{ background: 'var(--accent-soft)', border: '1px solid color-mix(in oklab, var(--accent) 28%, var(--border))', color: 'var(--accent-fg)' }}
              >
                <Plus className="size-3 shrink-0" aria-hidden />
                Add variable / OAuth
              </button>
              {copyHint && <span className="text-[11px]" role="status" style={{ color: 'var(--good)' }}>{copyHint}</span>}
              <button
                type="button"
                onClick={() => void copyEnvSnippet()}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition md:text-xs"
                style={{ ...SURFACES.cardStyle, color: 'var(--text-1)' }}
              >
                <ClipboardCopy className="size-3 shrink-0" aria-hidden />
                Copy .env lines
              </button>
            </div>
          </div>

          {/* Cards laid out by API-key UNIT, grouped by provider section. An
              entry's `group` field collapses N related entries into ONE card
              with stacked input rows (OAuth pairs, key+base-URL duos, local
              LLM trio, audio tooling pair) so the user only sees as many
              cards as there are independent credentials. The "one key, many
              zones" relationship is communicated via the Powers chips at
              the top of each card. */}
          <div className="space-y-6">
            {DEV_SETTINGS_SECTION_META.map(section => {
              const rows = DEV_SETTINGS_ENV_MODEL.filter(r => r.sectionId === section.id)
              if (!rows.length) return null

              /* Group entries by `group` field. Entries without a group get
               * their own "group of one" — same render path either way. The
               * first occurrence of each group keeps its position in `rows`
               * so card ordering stays stable. */
              const groups: { key: string; entries: DevSettingsEnvModelEntry[] }[] = []
              const groupIndex = new Map<string, number>()
              for (const entry of rows) {
                const key = entry.group ?? entry.id
                const existing = groupIndex.get(key)
                if (existing != null) {
                  groups[existing]!.entries.push(entry)
                } else {
                  groupIndex.set(key, groups.length)
                  groups.push({ key, entries: [entry] })
                }
              }

              const storedValues: Record<string, string> = {}
              const envSets: Record<string, boolean> = {}
              const reveals: Record<string, boolean> = {}
              const probes: Record<string, ProbeOutcome | null> = {}
              const probings: Record<string, boolean> = {}
              for (const entry of rows) {
                storedValues[entry.storageKey] = stored[entry.storageKey] ?? ''
                envSets[entry.storageKey] = Boolean(envStatus?.[entry.storageKey])
                reveals[entry.storageKey] = Boolean(reveal[entry.storageKey])
                probes[entry.storageKey] = probeResult[entry.storageKey] ?? null
                probings[entry.storageKey] = Boolean(probing[entry.storageKey])
              }

              return (
                <section key={section.id} className="flex flex-col gap-2.5">
                  <h2
                    className="text-[10px] font-semibold uppercase tracking-[0.15em]"
                    style={{ color: 'var(--text-3)' }}
                  >
                    {section.title}
                  </h2>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {groups.map(group => {
                      const includesHarmony = group.entries.some(
                        e => e.storageKey === 'HARMONY_CLIENT_PROJECTS_AI_KEY',
                      )
                      return (
                        <ModelEnvCard
                          key={group.key}
                          entries={group.entries}
                          storedValues={storedValues}
                          envSets={envSets}
                          harmonyHint={
                            includesHarmony
                              ? harmonyOverrideHint(stored.HARMONY_CLIENT_PROJECTS_AI_KEY ?? '')
                              : undefined
                          }
                          reveals={reveals}
                          onReveal={k => toggleReveal(k)}
                          onChange={(k, v, supportsLocalScratch) =>
                            setRowValue(k, v, supportsLocalScratch)
                          }
                          expanded={Boolean(expandUsedIn[group.key])}
                          onToggleExpand={() => toggleUsedIn(group.key)}
                          probes={probes}
                          probing={probings}
                          onProbe={k => void runProbe(k)}
                        />
                      )
                    })}
                  </div>
                  {section.id === 'client-vite' && viteMetaRow && (
                    <ViteMetaCard row={viteMetaRow} />
                  )}
                </section>
              )
            })}
          </div>

          {(customOnlyGroups.length > 0) && (
            <div className="mt-6 overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
              <div
                className="border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-wide md:px-4 md:text-xs"
                style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-2)' }}
              >
                Custom &amp; OAuth
              </div>
              <div className="overflow-x-auto">
                <table
                  className="w-full text-left text-[11px] md:text-xs"
                  style={{ minWidth: '960px', tableLayout: 'fixed' }}
                >
                  {/* Proportional column widths — see main table above for rationale. */}
                  <colgroup>
                    <col style={{ width: '15rem' }} /> {/* Key(s) */}
                    <col style={{ width: '10rem' }} /> {/* Role */}
                    <col style={{ width: '17rem' }} /> {/* Notes */}
                    <col style={{ width: '11rem' }} /> {/* Source */}
                    <col style={{ width: '13rem' }} /> {/* Local value */}
                    <col style={{ width: '6rem' }} />  {/* Actions */}
                  </colgroup>
                  <thead style={{ color: 'var(--text-3)' }}>
                    <tr className="border-b" style={{ borderColor: 'var(--border-soft)' }}>
                      <th className="px-2 py-2 font-medium md:px-3">Key(s)</th>
                      <th className="px-2 py-2 font-medium md:px-3">Role</th>
                      <th className="px-2 py-2 font-medium md:px-3">Notes</th>
                      <th className="px-2 py-2 font-medium md:px-3">Source</th>
                      <th className="px-2 py-2 font-medium md:px-3">Local value</th>
                      <th className="px-2 py-2 text-right font-medium md:px-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customOnlyGroups.map(group => {
                      if (group.kind === 'single') {
                        const row = group.row
                        if (row.builtIn) return null
                        return (
                          <CustomEnvRow
                            key={row.id}
                            row={row}
                            storedValue={stored[row.envKey] ?? ''}
                            envSet={Boolean(envStatus?.[row.envKey])}
                            reveal={Boolean(reveal[row.envKey])}
                            onReveal={() => toggleReveal(row.envKey)}
                            onChange={value => setRowValue(row.envKey, value, true)}
                            onRemove={() => removeCustomRow(row.id)}
                            probe={probeResult[row.envKey] ?? null}
                            probing={Boolean(probing[row.envKey])}
                            onProbe={() => void runProbe(row.envKey)}
                            canProbe={probeRouteForStorageKey(row.envKey) !== null}
                          />
                        )
                      }
                      return (
                        <Fragment key={`oauth-${group.pairId}`}>
                          <tr style={{ borderBottom: '1px solid var(--border-soft)' }}>
                            <td
                              colSpan={6}
                              className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide md:px-3"
                              style={{
                                background: 'color-mix(in oklab, var(--accent-soft) 88%, transparent)',
                                color: 'var(--accent-fg)',
                              }}
                            >
                              OAuth · {group.label}
                            </td>
                          </tr>
                          <CustomEnvRow
                            key={group.clientId.id}
                            row={group.clientId}
                            storedValue={stored[group.clientId.envKey] ?? ''}
                            envSet={Boolean(envStatus?.[group.clientId.envKey])}
                            reveal={Boolean(reveal[group.clientId.envKey])}
                            onReveal={() => toggleReveal(group.clientId.envKey)}
                            onChange={value => setRowValue(group.clientId.envKey, value, true)}
                            onRemove={() => removeCustomRow(group.clientId.id)}
                            probe={probeResult[group.clientId.envKey] ?? null}
                            probing={Boolean(probing[group.clientId.envKey])}
                            onProbe={() => void runProbe(group.clientId.envKey)}
                            canProbe={probeRouteForStorageKey(group.clientId.envKey) !== null}
                          />
                          <CustomEnvRow
                            key={group.clientSecret.id}
                            row={group.clientSecret}
                            storedValue={stored[group.clientSecret.envKey] ?? ''}
                            envSet={Boolean(envStatus?.[group.clientSecret.envKey])}
                            reveal={Boolean(reveal[group.clientSecret.envKey])}
                            onReveal={() => toggleReveal(group.clientSecret.envKey)}
                            onChange={value => setRowValue(group.clientSecret.envKey, value, true)}
                            onRemove={() => removeCustomRow(group.clientSecret.id)}
                            probe={probeResult[group.clientSecret.envKey] ?? null}
                            probing={Boolean(probing[group.clientSecret.envKey])}
                            onProbe={() => void runProbe(group.clientSecret.envKey)}
                            canProbe={probeRouteForStorageKey(group.clientSecret.envKey) !== null}
                          />
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <section aria-labelledby={`${baseId}-vite`}>
          <h2 id={`${baseId}-vite`} className="mb-2 flex items-center gap-2 text-xs font-semibold md:text-sm" style={{ color: 'var(--text-1)' }}>
            <Info className="size-3.5 shrink-0 md:size-4" style={{ color: 'var(--text-3)' }} aria-hidden />
            <code style={chipStyle()}>import.meta.env</code>
            <span className="font-normal" style={{ color: 'var(--text-3)' }}>(dev snapshot)</span>
          </h2>
          <p className="mb-2 text-[11px] md:text-xs" style={{ color: 'var(--text-3)' }}>
            Masked snapshot; add <code style={chipStyle()}>VITE_*</code> to <code style={chipStyle()}>.env.local</code> and restart dev.
          </p>
          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {viteSnapshot.map(({ key, display }) => (
              <li
                key={key}
                className="flex items-center justify-between rounded-md border px-2 py-1.5 text-[11px] md:text-xs"
                style={{ background: 'var(--bg-card-soft)', borderColor: 'var(--border-soft)' }}
              >
                <span className="mono truncate font-mono" style={{ color: 'var(--text-2)' }}>{key}</span>
                <span className="ml-2 shrink-0 tabular-nums" style={{ color: 'var(--text-1)' }}>{display}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby={`${baseId}-content`}>
          <h2 id={`${baseId}-content`} className="mb-2 text-xs font-semibold md:text-sm" style={{ color: 'var(--text-1)' }}>
            Local content previews
          </h2>
          <p className="mb-2 text-[11px] md:text-xs" style={{ color: 'var(--text-3)' }}>
            <code style={chipStyle()}>content/prompts</code> / <code style={chipStyle()}>content/presets</code> via <code style={chipStyle()}>/api/local/file?path=…</code>
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              { title: 'prompts/starter.md', body: promptPreview },
              { title: 'presets/starter.json', body: presetPreview },
            ].map(p => (
              <div
                key={p.title}
                className="rounded-lg border p-3"
                style={{ background: 'var(--bg-card-soft)', borderColor: 'var(--border)' }}
              >
                <p className="mb-1.5 text-[11px] font-medium md:text-xs" style={{ color: 'var(--text-3)' }}>{p.title}</p>
                <pre className="max-h-40 overflow-auto font-mono text-[10px] md:text-[11px]" style={{ color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>
                  {p.body || '—'}
                </pre>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby={`${baseId}-vault`}>
          <h2 id={`${baseId}-vault`} className="mb-2 text-xs font-semibold md:text-sm" style={{ color: 'var(--text-1)' }}>
            Secure vault (browser)
          </h2>
          <div className="overflow-hidden rounded-lg border" style={{ background: 'var(--bg-card-soft)', borderColor: 'var(--border)' }}>
            <SecureVault />
          </div>
        </section>
      </div>

      <AddDocumentedEnvDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        customRowsSnapshot={customRows}
        onCommitRows={commitNewDocRows}
      />
    </div>
  )
}

/**
 * ProbeFixHint — when a "Test" probe fails, parse the upstream error string
 * into a human-readable hint + deep links to the provider page that fixes the
 * problem (enable the API, edit key restrictions, top up billing, etc.).
 *
 * Renders nothing when the message isn't recognized AND the storage key has
 * no known landing page.
 */
function ProbeFixHint({ message, storageKey }: { message: string; storageKey: string }) {
  const guidance = explainProbeError(message, storageKey)
  if (!guidance) return null
  return (
    <div
      className="mt-1.5 rounded-md border px-2 py-1.5 text-[10px] leading-snug"
      style={{
        borderColor: 'color-mix(in oklab, var(--bad) 25%, var(--border))',
        background: 'color-mix(in oklab, var(--bad) 6%, var(--bg-card))',
        color: 'var(--text-2)',
      }}
    >
      <p className="font-semibold" style={{ color: 'var(--text-1)' }}>
        {guidance.headline}
      </p>
      <p className="mt-0.5">{guidance.body}</p>
      {guidance.links.length > 0 ? (
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {guidance.links.map(link => (
            <li key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-medium"
                style={{
                  borderColor: 'var(--border-strong)',
                  background: 'var(--bg-card)',
                  color: 'var(--accent)',
                }}
              >
                <ExternalLink className="size-2.5" aria-hidden />
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/**
 * Card-style render of a logical API-key UNIT — either one entry (single
 * field) or a group of related entries (e.g. OAuth pair, OpenAI key + base
 * URL, local LLM trio) rendered as one card with stacked input rows.
 *
 * The card uses the FIRST entry's metadata for chrome (logo, header title,
 * Powers chips, one-line purpose, retrieval links, "Where used"). Each
 * entry then gets its own input row with a `groupFieldLabel` above it,
 * its own paste/reveal/test, its own source pill — so per-field state
 * stays clearly attributed even when several keys share a card.
 */
function ModelEnvCard({
  entries,
  storedValues,
  envSets,
  harmonyHint,
  reveals,
  onReveal,
  onChange,
  expanded,
  onToggleExpand,
  probes,
  probing,
  onProbe,
}: {
  entries: readonly DevSettingsEnvModelEntry[]
  storedValues: Record<string, string>
  envSets: Record<string, boolean>
  harmonyHint?: string
  reveals: Record<string, boolean>
  onReveal: (storageKey: string) => void
  onChange: (storageKey: string, value: string, supportsLocalScratch: boolean) => void
  expanded: boolean
  onToggleExpand: () => void
  probes: Record<string, ProbeOutcome | null>
  probing: Record<string, boolean>
  onProbe: (storageKey: string) => void
}) {
  const primary = entries[0]!
  const isGrouped = entries.length > 1
  const logoSrc = DOCUMENTED_ENV_LOGOS[primary.storageKey]
  const cardTitle = primary.groupTitle ?? primary.label
  // For grouped cards, "optional" should be true only when EVERY field is
  // optional — if any is required, the card carries the required-feeling
  // and we hide the OPT badge.
  const allOptional = entries.every(e => e.optional)
  // Aggregate unique Powers chips across the group. Order preserved by
  // walking entries; chips dedup'd by string.
  const allPowers: string[] = []
  const seenPowers = new Set<string>()
  for (const e of entries) {
    for (const p of e.powers ?? []) {
      if (!seenPowers.has(p)) {
        seenPowers.add(p)
        allPowers.push(p)
      }
    }
  }
  // Aggregate "Where used" lines across the group, prefixed with the
  // storageKey when there's more than one entry so users can attribute
  // each route to the right field.
  const allUsedIn: string[] = []
  for (const e of entries) {
    for (const line of e.usedIn) {
      allUsedIn.push(isGrouped ? `[${e.storageKey}] ${line}` : line)
    }
  }
  // Combined retrieval links (dedup by href so two entries from the same
  // provider don't double up).
  const allRetrievalLinks: { label: string; href: string }[] = []
  const seenHrefs = new Set<string>()
  for (const e of entries) {
    for (const link of e.retrievalLinks ?? []) {
      if (!seenHrefs.has(link.href)) {
        seenHrefs.add(link.href)
        allRetrievalLinks.push(link)
      }
    }
  }

  return (
    <article
      className="overflow-hidden rounded-lg border"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
    >
      {/* Header strip: logo, card title, env-var summary */}
      <header
        className="flex items-start justify-between gap-3 border-b px-3 py-2.5 md:px-4"
        style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-card-soft)' }}
      >
        <div className="flex min-w-0 items-start gap-2.5">
          <LogoCell logoSrc={logoSrc} label={cardTitle} />
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-[13px] font-semibold leading-tight text-[var(--text-1)] md:text-[14px]">
              {cardTitle}
              {allOptional && (
                <span
                  className="rounded bg-[var(--bg-muted)] px-1 py-0 text-[9px] font-semibold uppercase text-[var(--text-3)]"
                  title="Optional — the dashboard works without this card."
                >
                  opt
                </span>
              )}
            </h3>
            <p
              className="mono mt-0.5 font-mono text-[10px] leading-tight md:text-[11px]"
              style={{ color: 'var(--text-3)' }}
            >
              {isGrouped
                ? `${entries.length} fields · ${entries.map(e => e.storageKey).join(' · ')}`
                : `${primary.storageKey} · ${primary.role}`}
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-3 px-3 py-3 md:px-4">
        {/* Powers chips — aggregated across every entry in the group so
            users see ALL features the card lights up, not just one. */}
        {allPowers.length > 0 && (
          <div>
            <p
              className="mb-1 text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-3)' }}
            >
              Powers
            </p>
            <div className="flex flex-wrap gap-1">
              {allPowers.map(p => (
                <span
                  key={p}
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-tight md:text-[11px]"
                  style={{
                    background: 'var(--accent-soft)',
                    color: 'var(--accent-fg)',
                    border: '1px solid color-mix(in oklab, var(--accent) 28%, var(--border))',
                  }}
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* One-line purpose — pulled from the PRIMARY (first) entry. For
            grouped cards this should be a meta description of the whole
            card ("one Google Cloud key covers everything", etc). */}
        <p className="text-[11px] leading-relaxed md:text-[12px]" style={{ color: 'var(--text-2)' }}>
          {primary.oneLinePurpose}
        </p>

        {/* Harmony-override live hint (only when this card includes the
            Harmony override entry) */}
        {harmonyHint && (
          <p
            className="text-[10px] leading-snug md:text-[11px]"
            style={{ color: 'var(--accent-fg)' }}
          >
            {harmonyHint}
          </p>
        )}

        {/* One input row per entry. Each row has its own field label
            (`groupFieldLabel` or fall back to `entry.label`), source pill,
            paste field, optional Test button, and probe result. */}
        <div className="flex flex-col gap-3">
          {entries.map(entry => (
            <ModelEnvFieldRow
              key={entry.id}
              entry={entry}
              showLabel={isGrouped}
              storedValue={storedValues[entry.storageKey] ?? ''}
              envSet={Boolean(envSets[entry.storageKey])}
              reveal={Boolean(reveals[entry.storageKey])}
              onReveal={() => onReveal(entry.storageKey)}
              onChange={v => onChange(entry.storageKey, v, entry.supportsLocalScratch)}
              probe={probes[entry.storageKey] ?? null}
              probing={Boolean(probing[entry.storageKey])}
              onProbe={() => onProbe(entry.storageKey)}
            />
          ))}
        </div>

        {/* Source resolution note (shared key / fallback chain explanation) */}
        {primary.sourceResolutionNote && (
          <p className="text-[10px] leading-snug" style={{ color: 'var(--text-3)' }}>
            {primary.sourceResolutionNote}
          </p>
        )}

        {/* Footer row: Where-used toggle (technical detail) + Get-key links */}
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-t pt-2.5"
          style={{ borderColor: 'var(--border-soft)' }}
        >
          {allUsedIn.length > 0 ? (
            <button
              type="button"
              onClick={onToggleExpand}
              className="inline-flex items-center gap-0.5 text-[10px] font-medium md:text-[11px]"
              style={{ color: 'var(--accent)' }}
              aria-expanded={expanded}
            >
              {expanded ? <ChevronDown className="size-3" aria-hidden /> : <ChevronRight className="size-3" aria-hidden />}
              Where used (technical)
            </button>
          ) : (
            <span />
          )}
          <RetrievalLinksList links={allRetrievalLinks} />
        </div>

        {/* Expanded technical "where used" list (aggregated across the group) */}
        {expanded && allUsedIn.length > 0 && (
          <ul
            className="list-disc space-y-0.5 pl-4 text-[10px] leading-snug md:text-[11px]"
            style={{ color: 'var(--text-3)' }}
          >
            {allUsedIn.map(line => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </article>
  )
}

/**
 * Per-entry row rendered inside `ModelEnvCard`. Renders the field label (when
 * the card is a group), source pill, paste input, optional Test button, and
 * any probe result / fix hint. One row per entry; encapsulating it keeps the
 * card itself readable when groups contain 2-3 stacked fields.
 */
function ModelEnvFieldRow({
  entry,
  showLabel,
  storedValue,
  envSet,
  reveal,
  onReveal,
  onChange,
  probe,
  probing,
  onProbe,
}: {
  entry: DevSettingsEnvModelEntry
  /** When true (grouped card), render the field label above the input. */
  showLabel: boolean
  storedValue: string
  envSet: boolean
  reveal: boolean
  onReveal: () => void
  onChange: (v: string) => void
  probe: ProbeOutcome | null
  probing: boolean
  onProbe: () => void
}) {
  const hasLocal = entry.supportsLocalScratch && storedValue.trim().length > 0
  const source: 'BOTH' | 'LOCAL' | 'ENV' | 'NONE' =
    !entry.supportsLocalScratch
      ? (envSet ? 'ENV' : 'NONE')
      : hasLocal && envSet ? 'BOTH'
        : hasLocal ? 'LOCAL'
          : envSet ? 'ENV'
            : 'NONE'
  const canProbe = probeRouteForStorageKey(entry.storageKey) !== null
  const fieldLabel = entry.groupFieldLabel ?? entry.label

  return (
    <div className="flex flex-col gap-1.5">
      {/* Field label + source pill row */}
      {showLabel && (
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor={`env-input-${entry.id}`}
            className="text-[11px] font-medium md:text-[12px]"
            style={{ color: 'var(--text-2)' }}
          >
            {fieldLabel}
            {entry.optional && (
              <span
                className="ml-1.5 rounded bg-[var(--bg-muted)] px-1 py-0 text-[9px] font-semibold uppercase text-[var(--text-3)]"
                title="Optional field"
              >
                opt
              </span>
            )}
          </label>
          <SourceBadge source={source} />
        </div>
      )}

      {/* Input + Test button (or the appropriate fallback rendering) */}
      {entry.inputKind === 'none' ? (
        <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
          Informational — no value to set here.
        </p>
      ) : !entry.supportsLocalScratch ? (
        <p className="text-[11px] leading-snug" style={{ color: 'var(--text-3)' }}>
          Server <code style={chipStyle()}>.env.local</code> only — not sent as{' '}
          <code style={chipStyle()}>x-user-key-*</code>.
        </p>
      ) : (
        <div className="flex flex-wrap items-stretch gap-2">
          <label className="relative block min-w-0 flex-1" style={{ minWidth: '12rem' }}>
            <span className="sr-only">{entry.storageKey}</span>
            <input
              id={`env-input-${entry.id}`}
              type={entry.inputKind === 'secret' && !reveal ? 'password' : 'text'}
              value={storedValue}
              onChange={e => onChange(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder={
                entry.inputKind === 'secret'
                  ? `Paste ${fieldLabel}…`
                  : `Enter ${fieldLabel.toLowerCase()}…`
              }
              className="w-full rounded-md px-2.5 py-2 pr-9 font-mono text-[11px] outline-none md:text-[12px]"
              style={inputStyle()}
            />
            {entry.inputKind === 'secret' && (
              <button
                type="button"
                onClick={onReveal}
                className="absolute inset-y-0 right-0 grid w-9 place-items-center"
                style={{ color: 'var(--text-3)' }}
                aria-label={reveal ? 'Hide' : 'Show'}
              >
                {reveal ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
              </button>
            )}
          </label>
          {canProbe && (
            <button
              type="button"
              onClick={onProbe}
              disabled={probing}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border px-3 py-2 text-[11px] font-semibold disabled:opacity-50 md:text-[12px]"
              style={{ background: 'var(--bg-card-soft)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
            >
              {probing ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Zap className="size-3.5" aria-hidden />}
              Test
            </button>
          )}
        </div>
      )}

      {/* For single-entry cards (no group label row), show the source pill
          inline below the input so it still appears somewhere visible. */}
      {!showLabel && entry.inputKind !== 'none' && (
        <div className="flex justify-end">
          <SourceBadge source={source} />
        </div>
      )}

      {/* Probe result + fix hint */}
      {probe && entry.supportsLocalScratch && entry.inputKind !== 'none' && (
        <div>
          <p
            className="text-[10px] md:text-[11px]"
            role="status"
            style={{ color: probe.ok ? 'var(--good)' : 'var(--bad)' }}
          >
            {probe.ok ? (
              <>
                <CheckCircle2 className="mr-0.5 inline size-3" aria-hidden />
                Test passed — {probe.ms} ms{probe.note ? ` · ${probe.note}` : ''}
              </>
            ) : (
              <>
                <XCircle className="mr-0.5 inline size-3" aria-hidden />
                {probe.message}
              </>
            )}
          </p>
          {!probe.ok ? <ProbeFixHint message={probe.message} storageKey={entry.storageKey} /> : null}
        </div>
      )}
    </div>
  )
}

/**
 * Informational card for the Vite client wildcard — no input, just spells out
 * how `VITE_*` env vars get exposed to the browser bundle. Sits at the bottom
 * of the "Client (Vite-inlined)" section.
 */
function ViteMetaCard({ row }: { row: MergedDocRow }) {
  return (
    <article
      className="rounded-lg border px-3 py-2.5 md:px-4"
      style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-muted)' }}
    >
      <div className="flex items-start gap-2.5">
        <LogoCell logoSrc={DOCUMENTED_ENV_LOGOS['VITE_*']} label="Vite" />
        <div className="min-w-0">
          <p className="mono font-mono text-[11px] font-semibold md:text-[12px]" style={{ color: 'var(--text-1)' }}>
            {row.envKey}
          </p>
          <p className="mt-0.5 text-[10px] leading-snug md:text-[11px]" style={{ color: 'var(--text-3)' }}>
            {row.description}
          </p>
          <p className="mt-1 text-[10px] leading-snug md:text-[11px]" style={{ color: 'var(--text-3)' }}>
            Informational — client bundle only exposes <code style={chipStyle()}>VITE_*</code>{' '}
            names present at dev-server start.
          </p>
        </div>
      </div>
    </article>
  )
}

function CustomEnvRow({
  row, storedValue, envSet, reveal, onReveal, onChange, onRemove,
  probe, probing, onProbe, canProbe,
}: {
  row: CustomDocRow
  storedValue: string
  envSet: boolean
  reveal: boolean
  onReveal: () => void
  onChange: (value: string) => void
  onRemove: () => void
  probe: ProbeOutcome | null
  probing: boolean
  onProbe: () => void
  canProbe: boolean
}) {
  const logoSrc = DOCUMENTED_ENV_LOGOS[row.envKey]
  const hasLocal = storedValue.trim().length > 0
  const source: 'BOTH' | 'LOCAL' | 'ENV' | 'NONE' =
    hasLocal && envSet ? 'BOTH' : hasLocal ? 'LOCAL' : envSet ? 'ENV' : 'NONE'

  return (
    <tr className="border-b align-top" style={{ borderColor: 'var(--border-soft)' }}>
      <td className="px-2 py-2 md:px-3">
        <div className="flex gap-2">
          <LogoCell logoSrc={logoSrc} />
          <div className="min-w-0">
            <p className="mono font-mono text-[10px] md:text-[11px]">{row.envKey}</p>
            <span className="mt-0.5 inline-block rounded px-1 py-0 text-[9px] font-semibold uppercase" style={{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }}>Custom</span>
          </div>
        </div>
      </td>
      <td className="px-2 py-2 text-[var(--text-3)] md:px-3">Custom</td>
      <td className="max-w-[14rem] px-2 py-2 text-[10px] leading-snug md:px-3 md:text-[11px]" style={{ color: 'var(--text-2)' }}>
        {row.description}
      </td>
      <td className="px-2 py-2 md:px-3"><SourceBadge source={source} /></td>
      <td className="px-2 py-2 md:px-3">
        <label className="relative block">
          <span className="sr-only">{row.envKey}</span>
          <input
            type={row.inputKind === 'secret' && !reveal ? 'password' : 'text'}
            value={storedValue}
            onChange={e => onChange(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder={row.inputKind === 'secret' ? 'Paste…' : '…'}
            className="w-full rounded-md px-2 py-1.5 pr-8 font-mono text-[10px] outline-none md:text-[11px]"
            style={inputStyle()}
          />
          {row.inputKind === 'secret' && (
            <button type="button" onClick={onReveal} className="absolute inset-y-0 right-0 grid w-8 place-items-center" style={{ color: 'var(--text-3)' }} aria-label={reveal ? 'Hide' : 'Show'}>
              {reveal ? <EyeOff className="size-3" aria-hidden /> : <Eye className="size-3" aria-hidden />}
            </button>
          )}
        </label>
        {probe && (
          <>
            <p className="mt-1 text-[9px]" role="status" style={{ color: probe.ok ? 'var(--good)' : 'var(--bad)' }}>
              {probe.ok ? `OK ${probe.ms} ms` : probe.message}
            </p>
            {!probe.ok ? <ProbeFixHint message={probe.message} storageKey={row.envKey} /> : null}
          </>
        )}
      </td>
      <td className="px-2 py-2 text-right md:px-3">
        <div className="inline-flex gap-1">
          {canProbe && (
            <button type="button" onClick={onProbe} disabled={probing} className="rounded-md border px-2 py-1 text-[10px] font-semibold" style={{ borderColor: 'var(--border)', background: 'var(--bg-card-soft)' }}>
              {probing ? <Loader2 className="size-3 animate-spin" /> : <Zap className="size-3" />}
            </button>
          )}
          <button type="button" onClick={onRemove} className="rounded-md border p-1.5" style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }} aria-label="Remove">
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </div>
      </td>
    </tr>
  )
}

function RetrievalLinksList({ links }: { links: readonly DevSettingsRetrievalLink[] | undefined }) {
  if (!links?.length) {
    return <span className="text-[10px] tabular-nums md:text-[11px]" style={{ color: 'var(--text-4)' }}>—</span>
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
      {links.map(link => (
        <li key={`${link.href}-${link.label}`}>
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-medium underline decoration-dotted underline-offset-2 md:text-[11px]"
            style={{ color: 'var(--accent)' }}
          >
            {link.label}
          </a>
        </li>
      ))}
    </ul>
  )
}

function LogoCell({ logoSrc, label }: { logoSrc?: string; label?: string }) {
  return logoSrc ? (
    <span
      className="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md p-1 md:h-8 md:w-8"
      style={{ background: 'var(--bg-card)', boxShadow: '0 0 0 1px var(--border)' }}
      aria-hidden={!label}
    >
      <img src={logoSrc} alt={label ?? ''} className="max-h-full max-w-full object-contain" loading="lazy" decoding="async" />
    </span>
  ) : (
    <span className="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md md:h-8 md:w-8" style={{ background: 'var(--bg-card-soft)', boxShadow: '0 0 0 1px var(--border)' }} aria-hidden>
      <KeyRound className="size-3.5 text-[var(--text-4)]" />
    </span>
  )
}

function SourceBadge({ source }: { source: 'BOTH' | 'LOCAL' | 'ENV' | 'NONE' }) {
  const palette: Record<typeof source, { bg: string; fg: string; label: string; tip: string }> = {
    BOTH:  { bg: 'var(--accent-soft)', fg: 'var(--accent-fg)', label: 'BOTH',  tip: 'Env + scratch; scratch wins on /api/*.' },
    LOCAL: { bg: 'var(--good-soft)',   fg: 'var(--good)',      label: 'LOCAL', tip: 'Scratch only — sent as x-user-key-*.' },
    ENV:   { bg: 'var(--bg-muted)',    fg: 'var(--text-2)',    label: 'ENV',   tip: 'Server .env.local only.' },
    NONE:  { bg: 'var(--bad-soft)',    fg: 'var(--bad)',       label: 'NONE',  tip: 'Unset — dependent features fail until configured.' },
  }
  const p = palette[source]
  return (
    <span
      className="inline-flex rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide"
      style={{ background: p.bg, color: p.fg }}
      title={p.tip}
    >
      {p.label}
    </span>
  )
}

function chipStyle(): CSSProperties {
  return {
    fontFamily: "'DM Mono', monospace",
    fontSize: 10,
    padding: '0 4px',
    borderRadius: 3,
    background: 'var(--bg-muted)',
    color: 'var(--text-2)',
  }
}

function inputStyle(): CSSProperties {
  return {
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    color: 'var(--text-1)',
  }
}
