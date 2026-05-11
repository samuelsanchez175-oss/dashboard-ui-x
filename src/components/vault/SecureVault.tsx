import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  ClipboardCopy,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  Trash2,
} from 'lucide-react'
import { VAULT_KEY_TYPES, getKeyType } from './keyTypes'
import { loadVaultEntries, saveVaultEntries } from './storage'
import type { VaultEntry } from './types'

function newEntry(): VaultEntry {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  return {
    id,
    envKey: '',
    keyTypeId: 'custom',
    value: '',
    note: '',
  }
}

export default function SecureVault() {
  const baseId = useId()
  const [entries, setEntries] = useState<VaultEntry[]>(() => loadVaultEntries())
  const skipNextPersist = useRef(true)
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => new Set())
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (skipNextPersist.current) {
      skipNextPersist.current = false
      return
    }
    saveVaultEntries(entries)
  }, [entries])

  const toggleVisible = useCallback((id: string) => {
    setVisibleIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const addRow = useCallback(() => {
    setEntries(prev => [...prev, newEntry()])
  }, [])

  const removeRow = useCallback((id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id))
    setVisibleIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const updateRow = useCallback((id: string, patch: Partial<VaultEntry>) => {
    setEntries(prev =>
      prev.map(e => (e.id === id ? { ...e, ...patch } : e)),
    )
  }, [])

  const onTypeChange = useCallback((id: string, keyTypeId: string) => {
    const t = getKeyType(keyTypeId)
    setEntries(prev =>
      prev.map(e => {
        if (e.id !== id) return e
        const next = { ...e, keyTypeId }
        if (t && t.suggestedEnvVar && (e.envKey === '' || e.envKey === getKeyType(e.keyTypeId)?.suggestedEnvVar)) {
          next.envKey = t.suggestedEnvVar
        }
        return next
      }),
    )
  }, [])

  const envBlock = useMemo(() => {
    return entries
      .filter(e => e.envKey.trim() && e.value)
      .map(e => `${e.envKey.trim()}=${e.value}`)
      .join('\n')
  }, [entries])

  const copyText = useCallback(async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      setCopied('error')
      setTimeout(() => setCopied(null), 2000)
    }
  }, [])

  return (
    <div className="flex-1 overflow-auto bg-[#fafafa] text-gray-900">
      <div className="max-w-4xl mx-auto p-8 space-y-8">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-gray-900">
            <KeyRound className="size-6 text-gray-600" strokeWidth={1.5} />
            <h1 className="text-xl font-semibold tracking-tight">Vault</h1>
          </div>
          <p className="text-sm text-gray-500 max-w-2xl leading-relaxed">
            Local-only API keys in this browser (<code className="text-xs bg-gray-100 px-1 rounded">localStorage</code>
            ). Use the prefilled types for faster entry, then copy lines into{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">.env.local</code> for Vite — not a substitute for
            production secret managers.
          </p>
        </header>

        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
            <span className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Entries</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => copyText('env', envBlock)}
                disabled={!envBlock}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                <ClipboardCopy className="size-3.5" />
                Copy .env block
              </button>
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
              >
                <Plus className="size-3.5" />
                Add key
              </button>
            </div>
          </div>

          {copied === 'env' && (
            <p className="px-4 py-2 text-xs text-emerald-600 bg-emerald-50 border-b border-emerald-100">
              Copied .env block to clipboard.
            </p>
          )}
          {copied === 'error' && (
            <p className="px-4 py-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">
              Clipboard blocked — select and copy manually.
            </p>
          )}

          <ul className="divide-y divide-gray-100">
            {entries.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-gray-400">
                No keys yet. Click <strong className="text-gray-600">Add key</strong> — each row uses a{' '}
                <span className="font-mono text-gray-500">+</span> line style for the variable name.
              </li>
            ) : (
              entries.map((row, idx) => {
                const type = getKeyType(row.keyTypeId)
                const visId = `${baseId}-${row.id}`
                const masked = !visibleIds.has(row.id)
                return (
                  <li key={row.id} className="px-4 py-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
                      <span className="select-none">+</span>
                      <span className="text-gray-500">{idx + 1}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <label className="sm:col-span-4 space-y-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          Type
                        </span>
                        <select
                          value={row.keyTypeId}
                          onChange={e => onTypeChange(row.id, e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-200"
                        >
                          {VAULT_KEY_TYPES.map(t => (
                            <option key={t.id} value={t.id}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="sm:col-span-4 space-y-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          Env name
                        </span>
                        <input
                          value={row.envKey}
                          onChange={e => updateRow(row.id, { envKey: e.target.value })}
                          placeholder={type?.suggestedEnvVar || 'MY_API_KEY'}
                          autoComplete="off"
                          spellCheck={false}
                          className="w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-200"
                        />
                      </label>
                      <label className="sm:col-span-4 space-y-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          Note (optional)
                        </span>
                        <input
                          value={row.note}
                          onChange={e => updateRow(row.id, { note: e.target.value })}
                          placeholder="preview / project"
                          className="w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-200"
                        />
                      </label>
                      <label className="sm:col-span-10 space-y-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          Secret
                        </span>
                        <div className="flex gap-1">
                          <input
                            id={visId}
                            type={masked ? 'password' : 'text'}
                            value={row.value}
                            onChange={e => updateRow(row.id, { value: e.target.value })}
                            placeholder={type?.placeholder ?? 'paste value'}
                            autoComplete="off"
                            spellCheck={false}
                            className="flex-1 min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-200"
                          />
                          <button
                            type="button"
                            onClick={() => toggleVisible(row.id)}
                            className="shrink-0 rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
                            aria-label={masked ? 'Show secret' : 'Hide secret'}
                          >
                            {masked ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              copyText(
                                row.id,
                                row.envKey.trim() ? `${row.envKey.trim()}=${row.value}` : row.value,
                              )
                            }
                            disabled={!row.value && !row.envKey}
                            className="shrink-0 rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                            aria-label="Copy line"
                          >
                            <ClipboardCopy className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            className="shrink-0 rounded-lg border border-red-100 p-2 text-red-500 hover:bg-red-50"
                            aria-label="Remove row"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </label>
                    </div>
                  </li>
                )
              })
            )}
          </ul>
        </section>

        <p className="text-xs text-gray-400">
          For in-app access later: <code className="bg-gray-100 px-1 rounded">readVaultValue(&apos;ANTHROPIC_API_KEY&apos;)</code>{' '}
          from <code className="bg-gray-100 px-1 rounded">src/components/vault/storage</code> (client bundle — still not for
          server secrets).
        </p>
      </div>
    </div>
  )
}
