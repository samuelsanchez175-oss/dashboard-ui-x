/**
 * Local-only history for Tools → Key & BPM finder (recent successful analyses).
 */

import type { MixClipAnalysisSource } from '../mixing/mixing-audio-idb'

const STORAGE_KEY = 'ui-dashboard-x-key-finder-history'
const MAX_ENTRIES = 40

export type KeyFinderHistoryEntry = {
  id: string
  analyzedAt: number
  fileName: string
  key: string
  bpm: number
  scale: string | null
  source: MixClipAnalysisSource
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `kf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function loadKeyFinderHistory(): KeyFinderHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const out: KeyFinderHistoryEntry[] = []
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue
      const o = row as Record<string, unknown>
      if (
        typeof o.id === 'string' &&
        typeof o.analyzedAt === 'number' &&
        typeof o.fileName === 'string' &&
        typeof o.key === 'string' &&
        typeof o.bpm === 'number' &&
        (o.scale === null || typeof o.scale === 'string') &&
        typeof o.source === 'string'
      ) {
        out.push({
          id: o.id,
          analyzedAt: o.analyzedAt,
          fileName: o.fileName,
          key: o.key,
          bpm: o.bpm,
          scale: o.scale,
          source: o.source as MixClipAnalysisSource,
        })
      }
    }
    return out
  } catch {
    return []
  }
}

function persist(entries: KeyFinderHistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    /* quota / private mode */
  }
}

/** Append newest run; keeps chronological order ascending by `analyzedAt` (oldest → newest). */
export function appendKeyFinderHistory(entry: {
  fileName: string
  key: string
  bpm: number
  scale: string | null
  source: MixClipAnalysisSource
  analyzedAt: number
}): KeyFinderHistoryEntry[] {
  const prev = loadKeyFinderHistory()
  const row: KeyFinderHistoryEntry = {
    id: newId(),
    analyzedAt: entry.analyzedAt,
    fileName: entry.fileName,
    key: entry.key,
    bpm: entry.bpm,
    scale: entry.scale,
    source: entry.source,
  }
  const next = [...prev, row].sort((a, b) => a.analyzedAt - b.analyzedAt).slice(-MAX_ENTRIES)
  persist(next)
  return next
}

export function clearKeyFinderHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
