/**
 * Lightweight "files you made in tools" tray — replaces the broken Files Dock UX.
 * Lists recent artifacts from the files store and offers Send-to routing for audio.
 */
import { useEffect, useState } from 'react'
import { ArrowUpRight, FileAudio, Trash2, X } from 'lucide-react'
import {
  subscribeFiles,
  deleteFile,
  type StoredFile,
} from './files-dock/files-store'

const SEND_TARGETS: { id: string; label: string }[] = [
  { id: 'tools-key-finder', label: 'Key Finder' },
  { id: 'tools-chord-detector', label: 'Chord Detector' },
  { id: 'tools-sample-slicer', label: 'Sample Slicer' },
  { id: 'tools-stem-splitter', label: 'Stem Splitter' },
]

function sendClip(routeId: string, dockId: string) {
  try {
    sessionStorage.setItem(`inbound-clip-${routeId}`, dockId)
  } catch { /* */ }
  window.dispatchEvent(new CustomEvent('dashboard:set-route', { detail: { id: routeId } }))
}

export default function StudioArtifactsTray({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [files, setFiles] = useState<StoredFile[]>([])

  useEffect(() => {
    if (!open) return
    return subscribeFiles(list => setFiles(list.slice(0, 24)))
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed bottom-16 right-4 z-[8500] flex w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border shadow-lg"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border)',
        maxHeight: 'min(420px, 60vh)',
      }}
    >
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{ borderColor: 'var(--border)' }}
      >
        <div>
          <div className="mono text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>
            Studio artifacts
          </div>
          <div className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>
            Recent tool outputs
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1"
          style={{ color: 'var(--text-3)' }}
          aria-label="Close artifacts tray"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {files.length === 0 ? (
          <p className="p-3 text-[12px]" style={{ color: 'var(--text-3)' }}>
            Nothing yet. Grab a YouTube clip or export from a tool — files show up here for Send-to.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {files.map(f => (
              <li
                key={f.id}
                className="rounded-lg border p-2"
                style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-card-soft)' }}
              >
                <div className="flex items-start gap-2">
                  <FileAudio className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--accent-fg)' }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-medium" style={{ color: 'var(--text-1)' }}>
                      {f.name}
                    </div>
                    <div className="mono text-[10px]" style={{ color: 'var(--text-4)' }}>
                      {(f.size / 1024).toFixed(0)} KB
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {SEND_TARGETS.map(t => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => sendClip(t.id, f.id)}
                          className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium"
                          style={{
                            background: 'var(--bg-hover)',
                            color: 'var(--text-2)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          {t.label} <ArrowUpRight className="size-2.5" />
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void deleteFile(f.id)}
                    className="rounded p-1"
                    style={{ color: 'var(--text-4)' }}
                    title="Remove"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
