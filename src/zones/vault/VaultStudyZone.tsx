import { useCallback, useEffect, useState } from 'react'
import { openInObsidian, vaultApi, type VaultNoteHit } from '../../lib/vault-api'
import { formatVaultDate } from '../../lib/vault-api'
import { NoteCard, NoteReader, VaultPage } from './VaultChrome'
import { useVaultStatus } from './useVaultStatus'

type ProjectRow = {
  name: string
  count: number
  lastMtime: number
  recent: VaultNoteHit[]
}

export default function VaultStudyZone() {
  const { status, error: statusError, loading, refresh } = useVaultStatus()
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [cc, setCc] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [openContent, setOpenContent] = useState('')

  const load = useCallback(async () => {
    setErr(null)
    try {
      const res = await vaultApi().projects()
      setProjects(res.projects)
      setCc(res.commandCenterExcerpt)
      if (!selected && res.projects[0]) setSelected(res.projects[0].name)
    } catch (e: any) {
      setErr(e?.message || 'Failed to load projects')
    }
  }, [selected])

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, [])

  const active = projects.find(p => p.name === selected)

  const openNote = async (path: string) => {
    const f = await vaultApi().file(path)
    setOpenPath(path)
    setOpenContent(f.content)
  }

  return (
    <VaultPage
      title="Project Study"
      description="Browse vault projects by folder — recent notes, counts, and Command Center context for deeper study."
      status={status}
      onRefreshStatus={() => {
        void refresh()
        void load()
      }}
      loading={loading}
      error={statusError || err}
    >
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="density-stack">
          {projects.slice(0, 40).map(p => (
            <button
              key={p.name}
              type="button"
              onClick={() => setSelected(p.name)}
              className="w-full rounded-lg border px-3 py-2 text-left text-[13px] transition-colors"
              style={{
                background: selected === p.name ? 'var(--accent-soft)' : 'var(--bg-card)',
                borderColor: selected === p.name ? 'var(--accent)' : 'var(--border)',
                color: selected === p.name ? 'var(--accent-fg)' : 'var(--text-1)',
              }}
            >
              <div className="font-medium line-clamp-2">{p.name}</div>
              <div className="mono mt-0.5 text-[10px]" style={{ color: 'var(--text-4)' }}>
                {p.count} notes · {formatVaultDate(p.lastMtime)}
              </div>
            </button>
          ))}
        </aside>

        <div className="density-stack min-w-0">
          {active ? (
            <>
              <div
                className="rounded-lg border p-4"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
              >
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text-1)' }}>
                  {active.name}
                </h2>
                <p className="mt-1 text-sm" style={{ color: 'var(--text-3)' }}>
                  {active.count} notes in this lane · last touch {formatVaultDate(active.lastMtime)}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {active.recent.map(n => (
                  <NoteCard
                    key={n.path}
                    name={n.name}
                    folder={n.folder}
                    mtime={n.mtime}
                    onOpen={() => void openNote(n.path)}
                  />
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>Select a project folder.</p>
          )}

          {cc && (
            <details
              className="rounded-lg border p-4"
              style={{ background: 'var(--bg-card-soft)', borderColor: 'var(--border)' }}
            >
              <summary className="cursor-pointer text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                Command Center excerpt (vault)
              </summary>
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-[11px] mono" style={{ color: 'var(--text-3)' }}>
                {cc}
              </pre>
            </details>
          )}
        </div>
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
