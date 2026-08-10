import { useCallback, useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { openInObsidian, vaultApi, type VaultNoteHit } from '../../lib/vault-api'
import { NoteCard, NoteReader, VaultPage } from './VaultChrome'
import { useVaultStatus } from './useVaultStatus'

export default function VaultLyricsZone({ onNavigate }: { onNavigate?: (id: string) => void }) {
  const { status, error: statusError, loading, refresh } = useVaultStatus()
  const [q, setQ] = useState('')
  const [items, setItems] = useState<VaultNoteHit[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [openContent, setOpenContent] = useState('')

  const load = useCallback(async (query?: string) => {
    try {
      const res = await vaultApi().lyrics(query)
      setItems(res.notes)
    } catch (e: any) {
      setErr(e?.message || 'Failed to load lyric corpus notes')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <VaultPage
      title="Lyric Study"
      description="Penwork · Model G · LLM Builder notes from the vault. Search lines/themes, then jump to Rhyme Studio or Phonetics."
      status={status}
      onRefreshStatus={() => {
        void refresh()
        void load(q || undefined)
      }}
      loading={loading}
      error={statusError || err}
      actions={
        onNavigate ? (
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-[12px] font-medium"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent-fg)', border: '1px solid var(--border)' }}
              onClick={() => onNavigate('rhyme-studio')}
            >
              Rhyme Studio
            </button>
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-[12px]"
              style={{ border: '1px solid var(--border)', color: 'var(--text-2)' }}
              onClick={() => onNavigate('tools-phonetics-inspector')}
            >
              Phonetics
            </button>
          </div>
        ) : undefined
      }
    >
      <form
        className="flex gap-2"
        onSubmit={e => {
          e.preventDefault()
          void load(q || undefined)
        }}
      >
        <div
          className="flex flex-1 items-center gap-2 rounded-lg border px-3 py-2"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-input)' }}
        >
          <Search className="size-4" style={{ color: 'var(--text-4)' }} />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search lyric / Model G notes…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--text-1)' }}
          />
        </div>
        <button type="submit" className="rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ background: 'var(--accent)' }}>
          Search
        </button>
      </form>

      <div className="grid gap-2 sm:grid-cols-2">
        {items.map(n => (
          <NoteCard
            key={n.path}
            name={n.name}
            folder={n.folder}
            snippet={n.snippet}
            mtime={n.mtime}
            onOpen={async () => {
              const f = await vaultApi().file(n.path)
              setOpenPath(n.path)
              setOpenContent(f.content)
            }}
          />
        ))}
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
