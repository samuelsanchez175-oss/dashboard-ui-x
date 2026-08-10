import { useCallback, useEffect, useState } from 'react'
import { Check, ClipboardCopy } from 'lucide-react'
import { openInObsidian, vaultApi, type VaultHandoff } from '../../lib/vault-api'
import { formatVaultDate } from '../../lib/vault-api'
import { NoteReader, VaultPage } from './VaultChrome'
import { useVaultStatus } from './useVaultStatus'

export default function VaultHandoffsZone() {
  const { status, error: statusError, loading, refresh } = useVaultStatus()
  const [items, setItems] = useState<VaultHandoff[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [openContent, setOpenContent] = useState('')

  const load = useCallback(async () => {
    setErr(null)
    try {
      const res = await vaultApi().handoffs(50)
      setItems(res.handoffs)
    } catch (e: any) {
      setErr(e?.message || 'Failed to load handoffs')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const copyResume = async (h: VaultHandoff) => {
    const text = h.resume || h.name
    try {
      await navigator.clipboard.writeText(text)
      setCopied(h.path)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      setErr('Clipboard unavailable')
    }
  }

  const openFull = async (path: string) => {
    const f = await vaultApi().file(path)
    setOpenPath(path)
    setOpenContent(f.content)
  }

  return (
    <VaultPage
      title="Handoff Resume"
      description="Pick up where Claude Code left off. Copy paste-ready resume blocks from auto-ingested session handoffs."
      status={status}
      onRefreshStatus={() => {
        void refresh()
        void load()
      }}
      loading={loading}
      error={statusError || err}
    >
      <div className="density-stack">
        {items.map(h => (
          <article
            key={h.path}
            className="rounded-lg border p-4"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="mono text-[10px] uppercase tracking-wider" style={{ color: 'var(--accent-fg)' }}>
                  {h.project} · {h.status}
                </div>
                <h2 className="mt-1 text-[15px] font-semibold" style={{ color: 'var(--text-1)' }}>
                  {h.name}
                </h2>
                <div className="mono mt-0.5 text-[10px]" style={{ color: 'var(--text-4)' }}>
                  {formatVaultDate(h.mtime)}
                  {h.source ? ` · ${h.source}` : ''}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copyResume(h)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium"
                  style={{
                    background: copied === h.path ? 'var(--accent-soft)' : 'var(--bg-hover)',
                    color: copied === h.path ? 'var(--accent-fg)' : 'var(--text-1)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {copied === h.path ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />}
                  {copied === h.path ? 'Copied' : 'Copy resume'}
                </button>
                <button
                  type="button"
                  onClick={() => void openFull(h.path)}
                  className="rounded-lg px-3 py-1.5 text-[12px]"
                  style={{ border: '1px solid var(--border)', color: 'var(--text-2)' }}
                >
                  Full note
                </button>
              </div>
            </div>
            {h.resume && (
              <pre
                className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-md border p-3 text-[12px] leading-relaxed mono"
                style={{ background: 'var(--bg-card-soft)', borderColor: 'var(--border-soft)', color: 'var(--text-2)' }}
              >
                {h.resume}
              </pre>
            )}
          </article>
        ))}
        {items.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>
            No handoffs found. Run Ingest Health → Run chat ingest after Claude Code sessions.
          </p>
        )}
      </div>

      {openPath && (
        <NoteReader
          path={openPath}
          content={openContent}
          onClose={() => setOpenPath(null)}
          onObsidian={status?.vaultDir ? () => openInObsidian(status.vaultDir, openPath) : undefined}
        />
      )}
    </VaultPage>
  )
}
