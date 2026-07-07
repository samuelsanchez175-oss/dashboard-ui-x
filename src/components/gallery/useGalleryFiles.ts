import { useEffect, useState } from 'react'

import {
  subscribeFiles,
  subscribeDockShell,
  getDockForcedOpen,
  type StoredFile,
} from '../files-dock/files-store'

/**
 * Gallery data + open-state hook. Reads the same IndexedDB-backed `files-store`
 * the old FilesDock used, and reuses the dock "shell" open/close state machine
 * so tool `openOnLaunch` intents (via `filesDockShell.open()`) still surface the
 * gallery. The gallery UI replaces the FilesDock tray; the store is unchanged.
 */
export function useGalleryFiles() {
  const [files, setFiles] = useState<StoredFile[]>([])
  const [open, setOpen] = useState<boolean>(getDockForcedOpen())

  useEffect(() => subscribeFiles(setFiles), [])
  useEffect(() => subscribeDockShell(() => setOpen(getDockForcedOpen())), [])

  return { files, open }
}
