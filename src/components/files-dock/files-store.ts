/**
 * IndexedDB-backed store for files surfaced in the global Files Dock.
 *
 * Anything that produces a file the user might want to revisit (MP3 grabs,
 * Key-Finder uploads, dropped audio, etc.) calls `addDownloadedFile()` — the
 * dock subscribes via `subscribeFiles()` and re-renders.
 *
 * A custom-event bridge (`dashboard:file-downloaded`) lets any module trigger
 * an add without importing this file directly, keeping coupling loose.
 *
 * **Tool ↔ dock contract:** which tools push or consume dock files is described
 * by `ToolDef.dock` in `src/lib/toolsRegistry.ts` (`toolsWithDock()`). Lane tabs
 * are defined in `dock-lanes.ts` (`LANES`) from registry `pinTab` values plus a
 * virtual `all` lane; `filesDockShell.setPinTab()` syncs the active lane when the
 * shell route changes (`MainContent`).
 */

import type React from 'react'

import { isDockLaneTabId, LANES } from './dock-lanes'

const DB_NAME = 'dashboard-files-dock-v1'
const STORE   = 'files'
const MAX_FILES = 24

export const FILE_EVENT = 'dashboard:file-downloaded' as const

/**
 * Custom DataTransfer MIME used when a dock item is dragged onto an internal
 * drop zone (Key Finder, Chord Detector, etc). Payload is the StoredFile.id;
 * the receiving zone looks up the blob via `getFileById`.
 */
export const DOCK_DRAG_MIME = 'application/x-dashboard-file-id' as const

export type StoredFile = {
  id:        string
  name:      string
  /** Original filename including extension. */
  path:      string
  blob:      Blob
  size:      number
  mime:      string
  addedAt:   number
  /**
   * Monotonically-ascending serial assigned at insert time (001, 002, …).
   * Survives deletes — a deleted file's number is never reused.
   */
  serial:    number
  /** Optional context (source page, subtitle text). */
  source?:   string
  /** Optional dock lane id (`downloads`, `analysis`, …) — see `LANES` / `dock.pinTab`. */
  lane?:     string
}

const SERIAL_KEY = 'dashboard-files-dock-serial-v1'

/** Monotonic counter persisted in localStorage. Skipped numbers are never reused. */
function nextSerial(): number {
  try {
    const raw  = localStorage.getItem(SERIAL_KEY)
    const cur  = raw ? parseInt(raw, 10) : 0
    const next = Number.isFinite(cur) ? cur + 1 : 1
    localStorage.setItem(SERIAL_KEY, String(next))
    return next
  } catch {
    // localStorage unavailable — fall back to a time-based serial that still
    // sorts correctly within a single session.
    return Math.floor(Date.now() / 1000) % 1_000_000
  }
}

export type FileEventDetail = {
  /** Blob/File payload. */
  blob:    Blob
  name:    string
  /** Optional descriptive source — e.g. "YouTube grab", "Key finder". */
  source?: string
  /**
   * Optional lane id aligned with `dock.pinTab` / `LANES`.
   * When omitted, lane matching uses `source` heuristics until callers pass `lane`.
   */
  lane?:   string
}

/* ── IDB plumbing ────────────────────────────────────────────────────────── */

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
  })
}

async function txList(): Promise<StoredFile[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const st = tx.objectStore(STORE)
    const q  = st.getAll()
    q.onerror   = () => reject(q.error)
    q.onsuccess = () => {
      const rows = (q.result as StoredFile[]) ?? []
      resolve(rows.sort((a, b) => b.addedAt - a.addedAt))
    }
  })
}

let migrationPromise: Promise<void> | null = null
/**
 * Backfill serials for legacy rows that pre-date the serial counter. Oldest
 * file gets the lowest serial; runs once per session.
 */
async function migrateMissingSerials(): Promise<void> {
  if (migrationPromise) return migrationPromise
  migrationPromise = (async () => {
    try {
      const all = await txList()
      const needsSerial = all
        .filter(f => typeof f.serial !== 'number')
        .sort((a, b) => a.addedAt - b.addedAt)
      if (!needsSerial.length) return
      for (const row of needsSerial) {
        const patched: StoredFile = { ...row, serial: nextSerial() }
        await txPut(patched)
      }
    } catch {
      /* IDB unavailable */
    }
  })()
  return migrationPromise
}

async function txPut(row: StoredFile): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(row)
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  })
}

async function txDelete(id: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  })
}

async function txClear(): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).clear()
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  })
}

/* ── Pub/sub (in-memory across one tab) ──────────────────────────────────── */

const listeners = new Set<(files: StoredFile[]) => void>()
let lastSnapshot: StoredFile[] = []

async function emit(): Promise<void> {
  const next = await txList()
  lastSnapshot = next
  for (const cb of listeners) cb(next)
}

export function subscribeFiles(cb: (files: StoredFile[]) => void): () => void {
  listeners.add(cb)
  // Push current snapshot immediately.
  cb(lastSnapshot)
  // Then hydrate from IDB if we haven't yet.
  void (async () => {
    try {
      await migrateMissingSerials()
      lastSnapshot = await txList()
      cb(lastSnapshot)
    } catch {
      /* IDB unavailable — keep empty */
    }
  })()
  return () => { listeners.delete(cb) }
}

/* ── Public API ──────────────────────────────────────────────────────────── */

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `f-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export async function addDownloadedFile(opts: FileEventDetail): Promise<StoredFile> {
  const id = newId()
  const row: StoredFile = {
    id,
    name:    opts.name,
    path:    opts.name,
    blob:    opts.blob,
    size:    opts.blob.size,
    mime:    opts.blob.type || 'application/octet-stream',
    addedAt: Date.now(),
    serial:  nextSerial(),
    source:  opts.source,
    ...(opts.lane ? { lane: opts.lane } : {}),
  }
  await txPut(row)

  // Cap stored count — drop oldest if over.
  const all = await txList()
  if (all.length > MAX_FILES) {
    const overflow = all.slice(MAX_FILES)
    await Promise.all(overflow.map(o => txDelete(o.id)))
  }

  await emit()
  return row
}

/** Look up a single dock entry by id (used by drop-zone receivers). */
export async function getFileById(id: string): Promise<StoredFile | null> {
  if (!id) return null
  const cached = lastSnapshot.find(f => f.id === id)
  if (cached) return cached
  try {
    const all = await txList()
    return all.find(f => f.id === id) ?? null
  } catch {
    return null
  }
}

/**
 * Generic helper any drop-zone can use to accept either OS files or a dock
 * item being dragged from FilesDock. Returns the resolved File/Blob or null.
 */
export async function receiveDockOrFileDrop(
  e: React.DragEvent | DragEvent,
): Promise<File | Blob | null> {
  const dt = (e as DragEvent).dataTransfer ?? (e as React.DragEvent).dataTransfer
  if (!dt) return null
  // Internal dock drag wins (richer metadata).
  const dockId = dt.getData(DOCK_DRAG_MIME)
  if (dockId) {
    const found = await getFileById(dockId)
    if (found) {
      // Wrap as a File so receivers expecting `.name` keep working.
      return new File([found.blob], found.name, { type: found.mime })
    }
  }
  // Fallback: OS-level file drop.
  const f = dt.files?.[0]
  return f ?? null
}

export async function deleteFile(id: string): Promise<void> {
  await txDelete(id)
  await emit()
}

export async function clearAllFiles(): Promise<void> {
  await txClear()
  await emit()
}

/** Open the file in a new tab via object URL (works for audio/img/PDF/etc.). */
export function openFile(file: StoredFile): void {
  const url = URL.createObjectURL(file.blob)
  const w   = window.open(url, '_blank', 'noopener,noreferrer')
  if (!w) {
    // Popup blocked — fall back to download anchor.
    const a = document.createElement('a')
    a.href     = url
    a.download = file.path || file.name
    a.rel      = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  // Best-effort: revoke after 60s.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/* ── Custom-event bridge ─────────────────────────────────────────────────── */

if (typeof window !== 'undefined') {
  window.addEventListener(FILE_EVENT, (e: Event) => {
    const ce = e as CustomEvent<FileEventDetail>
    if (!ce.detail?.blob || !ce.detail.name) return
    void addDownloadedFile(ce.detail)
  })
}

/** Loose-coupling helper for non-React modules. */
export function dispatchFileDownload(detail: FileEventDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<FileEventDetail>(FILE_EVENT, { detail }))
}

/* ── Dock shell (visibility + future tab intent) ───────────────────────── */

type DockShellListener = () => void
const dockShellListeners = new Set<DockShellListener>()

/** When true, `FilesDock` shows its chrome even with zero files (tool `openOnLaunch`). */
let dockForcedOpen = false
/** Canonical lane/tab id for a future tabbed dock; stored per active tool route. */
let dockPinTab: string | undefined

/** Active lane tab in the dock UI (`all` or a registry `pinTab` id). */
let activeLane = 'all'

function emitDockShell(): void {
  for (const cb of dockShellListeners) cb()
}

export function getActiveLane(): string {
  return activeLane
}

/** User-selected lane from the dock tab strip. */
export function setDockActiveLane(id: string): void {
  if (!LANES.some(l => l.id === id)) return
  if (activeLane === id) return
  activeLane = id
  emitDockShell()
}

export function subscribeDockShell(cb: DockShellListener): () => void {
  dockShellListeners.add(cb)
  cb()
  return () => { dockShellListeners.delete(cb) }
}

export function getDockForcedOpen(): boolean {
  return dockForcedOpen
}

export function getDockPinTab(): string | undefined {
  return dockPinTab
}

/** Show the dock chrome (empty drop zone) until `closeFilesDock` or a route change clears it. */
export function openFilesDock(): void {
  if (dockForcedOpen) return
  dockForcedOpen = true
  if (dockPinTab && isDockLaneTabId(dockPinTab) && activeLane !== dockPinTab) {
    activeLane = dockPinTab
  }
  emitDockShell()
}

export function closeFilesDock(): void {
  if (!dockForcedOpen) return
  dockForcedOpen = false
  emitDockShell()
}

export function setDockPinTab(tab: string | undefined): void {
  const pinChanged = dockPinTab !== tab
  if (!pinChanged && !(tab && isDockLaneTabId(tab) && activeLane !== tab)) return
  if (pinChanged) dockPinTab = tab
  if (tab && isDockLaneTabId(tab) && activeLane !== tab) {
    activeLane = tab
  }
  emitDockShell()
}

/**
 * Imperative dock UI control for route/tool consumers (`MainContent`, etc.).
 */
export const filesDockShell = {
  open:  openFilesDock,
  close: closeFilesDock,
  setPinTab: setDockPinTab,
  getPinTab:  getDockPinTab,
  getForcedOpen: getDockForcedOpen,
  getActiveLane,
  setActiveLane: setDockActiveLane,
}
