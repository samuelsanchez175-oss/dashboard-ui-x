import { useCallback, useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { openInObsidian, vaultApi, type VaultNoteHit } from '../../lib/vault-api'
import { NoteCard, NoteReader, VaultPage } from './VaultChrome'
import { useVaultStatus } from './useVaultStatus'

export default function VaultConsoleZone() {
  const { status, error: statusError, loading: statusLoading, refresh } = useVaultStatus()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<VaultNoteHit[]>([])
  const [searching, setSearching] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [openContent, setOpenContent] = useState('')
  const [totalScanned, setTotalScanned] = useState(0)

  const runSearch = useCallback(async (query: string) => {
    setSearching(true)
    setErr(null)
    try {
      const res = await vaultApi().search(query, { limit: 40 })
      setHits(res.hits)
      setTotalScanned(res.totalScanned)
    } catch (e: any) {
      setErr(e?.message || 'Search failed')
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    void runSearch('')
  }, [runSearch])

  const openNote = async (path: string) => {
    try {
      const f = await vaultApi().file(path)
      setOpenPath(path)
      setOpenContent(f.content)
    } catch (e: any) {
      setErr(e?.message || 'Could not open note')
    }
  }

  return (
    <VaultPage
      title="Vault Console"
      description="Search and open notes from your OB CLAUDE second brain. Full-text over handoffs, toolkit, projects, and clippings."
      status={status}
      onRefreshStatus={refresh}
      loading={statusLoading}
      error={statusError || err}
    >
      <form
        className="flex flex-wrap gap-2"
        onSubmit={e => {
          e.preventDefault()
          void runSearch(q)
        }}
      >
        <div
          className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border px-3 py-2"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-input)' }}
        >
          <Search className="size-4 shrink-0" style={{ color: 'var(--text-4)' }} />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search vault… (project, idea, tool, lyric)"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--text-1)' }}
          />
        </div>
        <button
          type="submit"
          className="rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ background: 'var(--accent)' }}
          disabled={searching}
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>

      <p className="mono text-[11px]" style={{ color: 'var(--text-4)' }}>
        {q ? `Results for “${q}”` : 'Recent notes'} · scanned {totalScanned.toLocaleString()} files
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {hits.map(h => (
          <NoteCard
            key={h.path}
            name={h.name}
            folder={h.folder}
            snippet={h.snippet}
            mtime={h.mtime}
            onOpen={() => void openNote(h.path)}
          />
        ))}
      </div>
      {hits.length === 0 && !searching && (
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>
          No hits. Try a shorter query or open Ingest Health if the vault path is wrong.
        </p>
      )}

      {openPath && (
        <NoteReader
          path={openPath}
          content={openContent}
          onClose={() => setOpenPath(null)}
          onObsidian={
            status?.vaultDir
              ? () => openInObsidian(status.vaultDir, openPath)
              : undefined
          }
        />
      )}
    </VaultPage>
  )
}
