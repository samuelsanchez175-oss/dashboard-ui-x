import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { ClipboardCopy, Info, KeyRound, Lock, Plus, Server, Trash2 } from 'lucide-react'
import { SecureVault } from '../../components/vault'
import { DOCUMENTED_ENV_LOGOS } from '../../components/agent-farm/integration-logos'
import {
  buildEnvSnippetFromScratch,
  createCustomDocRow,
  existingEnvKeyNames,
  loadCustomDocRows,
  mergeDocumentedEnvRows,
  normalizeEnvKeyName,
  readDevSettingsScratch,
  saveCustomDocRows,
  writeDevSettingsScratch,
  type CustomDocRow,
  type DocRowScope,
  type MergedDocRow,
} from '../../lib/dev-documented-env-keys'

function maskEnvValue(key: string, value: string | undefined): string {
  if (value === undefined || value === '') return '—'
  if (key === 'MODE' || key === 'DEV' || key === 'PROD' || key === 'SSR') return String(value)
  if (value.length <= 6) return '••••'
  return `${value.slice(0, 3)}…${value.slice(-2)}`
}

export default function DevSettings() {
  const baseId = useId()
  const addDialogTitleId = `${baseId}-add-dialog-title`

  const viteSnapshot = useMemo(() => {
    const env = import.meta.env as Record<string, string | boolean | undefined>
    return Object.keys(env)
      .filter(k => k.startsWith('VITE_') || ['MODE', 'BASE_URL', 'DEV', 'PROD', 'SSR'].includes(k))
      .sort()
      .map(k => ({
        key: k,
        display: maskEnvValue(k, env[k] != null ? String(env[k]) : undefined),
      }))
  }, [])

  const [customRows, setCustomRows] = useState<CustomDocRow[]>(() => loadCustomDocRows())
  const mergedRows = useMemo(() => mergeDocumentedEnvRows(customRows), [customRows])

  const [scratch, setScratch] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const row of mergeDocumentedEnvRows(loadCustomDocRows())) {
      if (row.inputKind !== 'none') init[row.envKey] = readDevSettingsScratch(row.envKey)
    }
    return init
  })

  useEffect(() => {
    setScratch(prev => {
      const next = { ...prev }
      for (const row of mergedRows) {
        if (row.inputKind === 'none') continue
        if (!(row.envKey in next)) next[row.envKey] = readDevSettingsScratch(row.envKey)
      }
      return next
    })
  }, [mergedRows])

  const [copyHint, setCopyHint] = useState<string | null>(null)

  const setRowValue = useCallback((envKey: string, value: string) => {
    writeDevSettingsScratch(envKey, value)
    setScratch(s => ({ ...s, [envKey]: value }))
  }, [])

  const copyEnvSnippet = useCallback(async () => {
    const text = buildEnvSnippetFromScratch(mergedRows, scratch)
    if (!text.trim()) {
      setCopyHint('Nothing to copy — fill in at least one value.')
      window.setTimeout(() => setCopyHint(null), 2500)
      return
    }
    try {
      await navigator.clipboard.writeText(`${text}\n`)
      setCopyHint('Copied lines — paste into .env.local')
      window.setTimeout(() => setCopyHint(null), 2500)
    } catch {
      setCopyHint('Clipboard unavailable')
      window.setTimeout(() => setCopyHint(null), 2500)
    }
  }, [mergedRows, scratch])

  const [addOpen, setAddOpen] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [newKeyRaw, setNewKeyRaw] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newScope, setNewScope] = useState<DocRowScope>('server')
  const [newInputKind, setNewInputKind] = useState<'secret' | 'text'>('secret')

  useEffect(() => {
    if (!addOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAddOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addOpen])

  const openAddModal = useCallback(() => {
    setAddError(null)
    setNewKeyRaw('')
    setNewDesc('')
    setNewScope('server')
    setNewInputKind('secret')
    setAddOpen(true)
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
    const row = createCustomDocRow({
      envKey: normalized,
      scope: newScope,
      description: newDesc,
      inputKind: newInputKind,
    })
    if (!row) {
      setAddError('Could not create row — check the variable name.')
      return
    }
    const next = [...customRows, row]
    setCustomRows(next)
    saveCustomDocRows(next)
    setScratch(s => ({ ...s, [row.envKey]: s[row.envKey] ?? '' }))
    setAddOpen(false)
  }, [customRows, newDesc, newInputKind, newKeyRaw, newScope])

  const removeCustomRow = useCallback(
    (id: string) => {
      const target = customRows.find(r => r.id === id)
      const next = customRows.filter(r => r.id !== id)
      setCustomRows(next)
      saveCustomDocRows(next)
      if (target) {
        writeDevSettingsScratch(target.envKey, '')
        setScratch(s => {
          const copy = { ...s }
          delete copy[target.envKey]
          return copy
        })
      }
    },
    [customRows],
  )

  const [promptPreview, setPromptPreview] = useState<string>('')
  const [presetPreview, setPresetPreview] = useState<string>('')

  const loadLocal = useCallback(async () => {
    try {
      const [md, js] = await Promise.all([
        fetch('/api/local/file?path=prompts/starter.md').then(r => (r.ok ? r.text() : '')),
        fetch('/api/local/file?path=presets/starter.json').then(r => (r.ok ? r.text() : '')),
      ])
      setPromptPreview(md)
      setPresetPreview(js)
    } catch {
      setPromptPreview('(could not load)')
      setPresetPreview('(could not load)')
    }
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadLocal()
    }, 0)
    return () => window.clearTimeout(t)
  }, [loadLocal])

  return (
    <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}>
      <div className="max-w-4xl mx-auto p-8 space-y-10">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <KeyRound className="size-5 text-gray-600" aria-hidden />
            Settings &amp; API keys
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Documented environment variables and a local vault for scratch values. Secrets belong in{' '}
            <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">.env.local</code> (gitignored) — never
            commit real keys.
          </p>
        </div>

        <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-5 space-y-2" aria-labelledby={`${baseId}-safety`}>
          <h2 id={`${baseId}-safety`} className="text-sm font-semibold text-blue-950 flex items-center gap-2">
            <Lock className="size-4" aria-hidden />
            Safe patterns
          </h2>
          <ul className="text-sm text-blue-950/85 list-disc pl-5 space-y-1">
            <li>Copy <code className="text-xs bg-blue-100/80 px-1 rounded">.env.example</code> →{' '}
              <code className="text-xs bg-blue-100/80 px-1 rounded">.env.local</code> and fill values locally.
            </li>
            <li>Server-only keys power Vite middleware routes (YouTube / OpenAI / RSS) — they stay off the client bundle.</li>
            <li>
              Values you type in the table below are saved in <code className="text-xs bg-blue-100/80 px-1 rounded">localStorage</code>{' '}
              for convenience and <strong>do not</strong> replace <code className="text-xs bg-blue-100/80 px-1 rounded">.env.local</code>.
              Use <strong>Copy .env lines</strong>, paste into <code className="text-xs bg-blue-100/80 px-1 rounded">.env.local</code>, then restart{' '}
              <code className="text-xs bg-blue-100/80 px-1 rounded">npm run dev</code>.
            </li>
            <li>
              Use the <strong>+</strong> button to add custom variable rows (stored in this browser). Built-in rows ship with the app and can be extended in code.
            </li>
            <li>Browser vault entries are stored in <code className="text-xs bg-blue-100/80 px-1 rounded">localStorage</code>{' '}
              for convenience only; do not rely on it for production secrets.</li>
          </ul>
        </section>

        <section aria-labelledby={`${baseId}-doc`}>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
            <h2 id={`${baseId}-doc`} className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <Server className="size-4 text-gray-600" aria-hidden />
              Documented keys
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openAddModal}
                className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-100/90"
              >
                <Plus className="size-3.5 shrink-0" aria-hidden />
                Add variable
              </button>
              {copyHint ? (
                <span className="text-xs text-gray-600" role="status">
                  {copyHint}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => void copyEnvSnippet()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
              >
                <ClipboardCopy className="size-3.5 shrink-0 text-gray-600" aria-hidden />
                Copy .env lines
              </button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Variable</th>
                  <th className="px-4 py-3 font-medium w-[5.5rem]">Scope</th>
                  <th className="px-4 py-3 font-medium min-w-[14rem]">Local value</th>
                  <th className="px-4 py-3 font-medium w-[4rem] text-right"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {mergedRows.map((row: MergedDocRow) => {
                  const logoSrc = DOCUMENTED_ENV_LOGOS[row.envKey]
                  const isCustom = !row.builtIn
                  return (
                    <tr key={row.builtIn ? row.envKey : row.id} className="bg-white">
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-start gap-3 min-w-0">
                          {logoSrc ? (
                            <span
                              className="relative h-9 w-9 shrink-0 rounded-lg bg-white ring-1 ring-gray-200 shadow-sm p-1.5 flex items-center justify-center mt-0.5"
                              aria-hidden
                            >
                              <img
                                src={logoSrc}
                                alt=""
                                className="max-h-full max-w-full object-contain"
                                loading="lazy"
                                decoding="async"
                              />
                            </span>
                          ) : (
                            <span
                              className="relative h-9 w-9 shrink-0 rounded-lg bg-gray-50 ring-1 ring-gray-200 flex items-center justify-center mt-0.5 text-gray-400"
                              aria-hidden
                            >
                              <KeyRound className="size-4" />
                            </span>
                          )}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs text-gray-900">{row.envKey}</span>
                              {isCustom ? (
                                <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                                  Custom
                                </span>
                              ) : null}
                            </div>
                            <p className="text-[11px] text-gray-500 mt-1 leading-snug">{row.description}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-gray-700 whitespace-nowrap">{row.scope}</td>
                      <td className="px-4 py-3 align-top">
                        {row.inputKind === 'none' ? (
                          <p className="text-xs text-gray-500 leading-snug">
                            Define concrete names in <code className="bg-gray-100 px-1 rounded">.env.local</code> (e.g.{' '}
                            <code className="bg-gray-100 px-1 rounded">VITE_PUBLIC_API_URL=…</code>). Reload dev after edits.
                          </p>
                        ) : (
                          <label className="block">
                            <span className="sr-only">{row.envKey}</span>
                            <input
                              type={row.inputKind === 'secret' ? 'password' : 'text'}
                              value={scratch[row.envKey] ?? ''}
                              onChange={e => setRowValue(row.envKey, e.target.value)}
                              autoComplete="off"
                              spellCheck={false}
                              placeholder={row.inputKind === 'secret' ? 'Paste key…' : 'Value…'}
                              className="w-full rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2 text-xs font-mono text-gray-900 placeholder:text-gray-400 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/25"
                            />
                          </label>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        {isCustom ? (
                          <button
                            type="button"
                            onClick={() => removeCustomRow(row.id)}
                            className="inline-flex rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                            aria-label={`Remove ${row.envKey}`}
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </button>
                        ) : (
                          <span className="inline-block w-10" aria-hidden />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby={`${baseId}-vite`}>
          <h2 id={`${baseId}-vite`} className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-3">
            <Info className="size-4 text-gray-600" aria-hidden />
            import.meta.env (dev snapshot)
          </h2>
          <p className="text-xs text-gray-500 mb-2">
            Values are masked except safe mode flags. Add <code className="bg-gray-100 px-1 rounded">VITE_*</code>{' '}
            in <code className="bg-gray-100 px-1 rounded">.env.local</code> to surface client-safe config.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {viteSnapshot.map(({ key, display }) => (
              <li
                key={key}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs"
              >
                <span className="font-mono text-gray-700">{key}</span>
                <span className="text-gray-900 tabular-nums">{display}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby={`${baseId}-content`}>
          <h2 id={`${baseId}-content`} className="text-sm font-semibold text-gray-800 mb-3">
            Local content previews
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            Starter files live under <code className="bg-gray-100 px-1 rounded">content/prompts</code> and{' '}
            <code className="bg-gray-100 px-1 rounded">content/presets</code>, served in dev via{' '}
            <code className="bg-gray-100 px-1 rounded">/api/local/file?path=…</code>.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 p-4 bg-gray-50/50">
              <p className="text-xs font-medium text-gray-500 mb-2">prompts/starter.md</p>
              <pre className="text-[11px] text-gray-800 whitespace-pre-wrap max-h-48 overflow-auto font-mono">
                {promptPreview || '—'}
              </pre>
            </div>
            <div className="rounded-xl border border-gray-200 p-4 bg-gray-50/50">
              <p className="text-xs font-medium text-gray-500 mb-2">presets/starter.json</p>
              <pre className="text-[11px] text-gray-800 whitespace-pre-wrap max-h-48 overflow-auto font-mono">
                {presetPreview || '—'}
              </pre>
            </div>
          </div>
        </section>

        <section aria-labelledby={`${baseId}-vault`}>
          <h2 id={`${baseId}-vault`} className="text-sm font-semibold text-gray-800 mb-3">
            Secure vault (browser)
          </h2>
          <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
            <SecureVault />
          </div>
        </section>
      </div>

      {addOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={() => setAddOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={addDialogTitleId}
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 id={addDialogTitleId} className="text-base font-semibold text-gray-900">
              Add documented variable
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              Saved only in this browser. Use upper snake case — same rules as <code className="rounded bg-gray-100 px-1">.env</code> names.
            </p>
            <div className="mt-4 space-y-3">
              <label className="block space-y-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Variable name</span>
                <input
                  value={newKeyRaw}
                  onChange={e => setNewKeyRaw(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="MY_SERVICE_API_KEY"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono text-gray-900 placeholder:text-gray-400 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/25"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Description</span>
                <textarea
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  rows={3}
                  placeholder="What this key is for…"
                  className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/25"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Scope</span>
                  <select
                    value={newScope}
                    onChange={e => setNewScope(e.target.value as DocRowScope)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                  >
                    <option value="server">server</option>
                    <option value="client">client</option>
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Input type</span>
                  <select
                    value={newInputKind}
                    onChange={e => setNewInputKind(e.target.value as 'secret' | 'text')}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                  >
                    <option value="secret">Secret (masked)</option>
                    <option value="text">Plain text</option>
                  </select>
                </label>
              </div>
              {addError ? (
                <p className="text-xs text-rose-600" role="alert">
                  {addError}
                </p>
              ) : null}
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addCustomRow}
                className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700"
              >
                Add row
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
