import { useCallback, useEffect, useState } from 'react'
import { Play, RefreshCw } from 'lucide-react'
import { formatVaultDate, vaultApi } from '../../lib/vault-api'
import { VaultPage } from './VaultChrome'
import { useVaultStatus } from './useVaultStatus'

export default function VaultIngestZone() {
  const { status, error: statusError, loading, refresh } = useVaultStatus()
  const [themes, setThemes] = useState<{
    folders: { folder: string; count: number }[]
    keywords: { word: string; count: number }[]
    insight: string
    total: number
  } | null>(null)
  const [logs, setLogs] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const loadThemes = useCallback(async () => {
    try {
      const t = await vaultApi().themes()
      setThemes({
        folders: t.folders,
        keywords: t.keywords,
        insight: t.insight,
        total: t.total,
      })
    } catch (e: any) {
      setErr(e?.message || 'Themes failed')
    }
  }, [])

  const loadLogs = useCallback(async () => {
    try {
      const l = await vaultApi().logs('ingest')
      setLogs(l.logs)
    } catch {
      setLogs('(no ingest log yet)')
    }
  }, [])

  useEffect(() => {
    void loadThemes()
    void loadLogs()
  }, [loadThemes, loadLogs])

  const runIngest = async () => {
    setBusy('ingest')
    setMsg(null)
    setErr(null)
    try {
      const r = await vaultApi().runIngest()
      setMsg(r.ok ? 'Chat ingest finished.' : `Ingest error: ${r.error || r.stderr}`)
      await refresh()
      await loadLogs()
    } catch (e: any) {
      setErr(e?.message || 'Ingest failed')
    } finally {
      setBusy(null)
    }
  }

  const runBrief = async () => {
    setBusy('brief')
    setMsg(null)
    setErr(null)
    try {
      const r = await vaultApi().runBrief()
      setMsg(r.ok ? 'Daily brief script finished.' : `Brief error: ${r.error || r.stderr}`)
      await refresh()
    } catch (e: any) {
      setErr(e?.message || 'Brief failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <VaultPage
      title="Ingest Health"
      description="Fix the write path, run chat ingest / brief, read logs, and see what your collection pattern actually looks like."
      status={status}
      onRefreshStatus={() => {
        void refresh()
        void loadThemes()
        void loadLogs()
      }}
      loading={loading}
      error={statusError || err}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <section
          className="rounded-lg border p-4 density-stack"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text-1)' }}>
            Path & freshness
          </h2>
          <dl className="space-y-2 text-[13px]">
            <div className="flex justify-between gap-2">
              <dt style={{ color: 'var(--text-3)' }}>Resolved vault</dt>
              <dd className="mono text-right text-[11px]" style={{ color: 'var(--text-1)' }}>
                {status?.vaultDir ?? '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt style={{ color: 'var(--text-3)' }}>Exists</dt>
              <dd style={{ color: status?.exists ? 'var(--good)' : 'var(--bad)' }}>
                {status?.exists ? 'yes' : 'no'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt style={{ color: 'var(--text-3)' }}>Last ingest log mtime</dt>
              <dd style={{ color: 'var(--text-1)' }}>{formatVaultDate(status?.lastIngest ?? null)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt style={{ color: 'var(--text-3)' }}>Last brief file mtime</dt>
              <dd style={{ color: 'var(--text-1)' }}>{formatVaultDate(status?.lastBrief ?? null)}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void runIngest()}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              <Play className="size-3.5" />
              {busy === 'ingest' ? 'Running…' : 'Run chat ingest'}
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void runBrief()}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium disabled:opacity-50"
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            >
              <RefreshCw className="size-3.5" />
              {busy === 'brief' ? 'Running…' : 'Run daily brief'}
            </button>
          </div>
          {msg && (
            <p className="text-[12px]" style={{ color: 'var(--good)' }}>
              {msg}
            </p>
          )}
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-4)' }}>
            Default vault is now <strong style={{ color: 'var(--text-2)' }}>Pictures/OB CLAUDE vault</strong> (not the
            old ~/dev path). Override with env <code className="mono">VAULT_DIR</code>.
          </p>
        </section>

        <section
          className="rounded-lg border p-4"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text-1)' }}>
            Collection pattern
          </h2>
          {themes && (
            <>
              <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
                {themes.insight}
              </p>
              <div className="mt-3">
                <div className="mono text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>
                  Top folders
                </div>
                <ul className="mt-1 space-y-1">
                  {themes.folders.slice(0, 12).map(f => (
                    <li key={f.folder} className="flex justify-between text-[12px]">
                      <span className="truncate" style={{ color: 'var(--text-2)' }}>
                        {f.folder}
                      </span>
                      <span className="mono tabular-nums" style={{ color: 'var(--text-1)' }}>
                        {f.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-4">
                <div className="mono text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>
                  Recurring keywords (filename signal)
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {themes.keywords.slice(0, 24).map(k => (
                    <span
                      key={k.word}
                      className="rounded-full px-2 py-0.5 mono text-[10px]"
                      style={{ background: 'var(--bg-hover)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
                    >
                      {k.word} · {k.count}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <section
        className="rounded-lg border p-4"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <h2 className="mb-2 text-[15px] font-semibold" style={{ color: 'var(--text-1)' }}>
          Ingest log (tail)
        </h2>
        <pre
          className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border p-3 text-[11px] mono"
          style={{ background: 'var(--bg-app)', borderColor: 'var(--border-soft)', color: 'var(--text-3)' }}
        >
          {logs || '—'}
        </pre>
      </section>
    </VaultPage>
  )
}
