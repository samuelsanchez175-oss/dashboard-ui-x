import { useCallback, useEffect, useState } from 'react'
import { openInObsidian, vaultApi, type VaultNoteHit } from '../../lib/vault-api'
import { NoteCard, NoteReader, VaultPage } from './VaultChrome'
import { useVaultStatus } from './useVaultStatus'

export default function VaultMediaZone({ onNavigate }: { onNavigate?: (id: string) => void }) {
  const { status, error: statusError, loading, refresh } = useVaultStatus()
  const [items, setItems] = useState<VaultNoteHit[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [openContent, setOpenContent] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await vaultApi().media()
      setItems(res.media)
    } catch (e: any) {
      setErr(e?.message || 'Failed to load media notes')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <VaultPage
      title="Media Library"
      description="Track notes from 🎵 Media (BPM/key when present). Send ideas into Key Finder or Chord Detector after grabbing audio."
      status={status}
      onRefreshStatus={() => {
        void refresh()
        void load()
      }}
      loading={loading}
      error={statusError || err}
      actions={
        onNavigate ? (
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-[12px] font-medium"
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
              onClick={() => onNavigate('tools-key-finder')}
            >
              Key Finder
            </button>
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-[12px] font-medium"
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
              onClick={() => onNavigate('tools-chord-detector')}
            >
              Chord Detector
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map(m => (
          <NoteCard
            key={m.path}
            name={m.name}
            folder={m.folder}
            snippet={m.snippet}
            mtime={m.mtime}
            meta={[m.bpm && `${m.bpm} BPM`, m.key].filter(Boolean).join(' · ') || undefined}
            onOpen={async () => {
              const f = await vaultApi().file(m.path)
              setOpenPath(m.path)
              setOpenContent(f.content)
            }}
          />
        ))}
      </div>
      {items.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>
          No media notes yet. media-sync under vault automation fills 🎵 Media from YouTube playlists.
        </p>
      )}
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
