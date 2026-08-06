import { useState } from 'react'
import { Plus, Images } from 'lucide-react'

import {
  openFilesDock, userCloseFilesDock, receiveDockOrFileDrop,
} from '../files-dock/files-store'
import { fileInputTools, toolAcceptsMime } from '../../lib/toolsRegistry'
import { startDropRun } from '../../lib/tool-drop-run'
import { useGlobalDrag } from '../../hooks/useGlobalDrag'
import { useGalleryFiles } from './useGalleryFiles'

/**
 * Floating bottom-right button. Opens/closes the Gallery drawer. While a file is
 * dragged it becomes a drop target that routes the file to the first tool that
 * accepts its type (then opens the gallery).
 */
export default function GalleryFab() {
  const { files, open } = useGalleryFiles()
  const { dragging } = useGlobalDrag()
  const [over, setOver] = useState(false)

  const toggle = () => (open ? userCloseFilesDock() : openFilesDock())

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setOver(false)
    const f = await receiveDockOrFileDrop(e)
    if (f) {
      const tool = fileInputTools().find(t => toolAcceptsMime(t, f.type || 'application/octet-stream'))
      if (tool) await startDropRun(tool, f, f instanceof File ? f.name : undefined)
    }
    openFilesDock()
  }

  return (
    <button
      onClick={toggle}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      title={open ? 'Close gallery' : 'Open gallery'}
      aria-label="Gallery"
      className="fixed z-30 flex items-center justify-center rounded-full shadow-lg transition"
      style={{
        // Sits above the bottom-right Tweaks pill so the two don't collide.
        bottom: 84, right: 24,
        width: 56, height: 56,
        background: 'var(--accent)', color: '#fff',
        transform: over ? 'scale(1.1)' : 'scale(1)',
        boxShadow: dragging ? '0 0 0 6px color-mix(in srgb, var(--accent) 25%, transparent)' : undefined,
      }}
    >
      {open ? <Images size={22} /> : <Plus size={24} />}
      {files.length > 0 && (
        <span
          className="absolute -right-1 -top-1 flex items-center justify-center rounded-full px-1 text-[10px] font-bold"
          style={{ minWidth: 20, height: 20, background: 'var(--text-1)', color: 'var(--bg-sidebar)' }}
        >
          {files.length}
        </span>
      )}
    </button>
  )
}
