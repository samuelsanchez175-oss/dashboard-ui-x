import { useCallback, useEffect, useState } from 'react'
import { openInObsidian, vaultApi, type VaultNoteHit } from '../../lib/vault-api'
import { NoteCard, NoteReader, VaultPage } from './VaultChrome'
import { useVaultStatus } from './useVaultStatus'

export default function VaultClippingsZone() {
  const { status, error: statusError, loading, refresh } = useVaultStatus()
  const [items, setItems] = useState<VaultNoteHit[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [openContent, setOpenContent] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await vaultApi().clippings()
      setItems(res.clippings)
    } catch (e: any) {
      setErr(e?.message || 'Failed to load clippings')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <VaultPage
      title="Clipping Digest"
      description="AI Toolkit imports, Vault Alamo clippings, and saved research — the stuff you collected but never studied."
      status={status}
      onRefreshStatus={() => {
        void refresh()
        void load()
      }}
      loading={loading}
      error={statusError || err}
    >
      <p className="text-sm" style={{ color: 'var(--text-3)' }}>
        {items.length} recent clippings / toolkit notes. Open one, distill in Obsidian, or search the Console for themes.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map(c => (
          <NoteCard
            key={c.path}
            name={c.name}
            folder={c.folder}
            mtime={c.mtime}
            onOpen={async () => {
              const f = await vaultApi().file(c.path)
              setOpenPath(c.path)
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
