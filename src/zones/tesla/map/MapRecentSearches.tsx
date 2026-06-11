import { useCallback, useEffect, useState } from 'react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type MapRecentSearchesProps = {
  /** Visible only when true (parent controls the open/closed state of the dropdown). */
  open: boolean
  /** Called when the user picks a recent term. Parent should set its `searchDraft` + submit. */
  onPick: (term: string) => void
  /** Optional className for outer wrapper. */
  className?: string
}

type RecentEntry = { term: string; at: number }

/* ------------------------------------------------------------------ */
/*  Constants / helpers (module-local)                                 */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'tesla-map-recent-searches'
const CHANGE_EVENT = 'tesla-map-recent-searches-changed'
const MAX_ENTRIES = 8

function readEntries(): RecentEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (e): e is RecentEntry =>
          !!e &&
          typeof e === 'object' &&
          typeof (e as RecentEntry).term === 'string' &&
          typeof (e as RecentEntry).at === 'number',
      )
      .slice(0, MAX_ENTRIES)
  } catch {
    return []
  }
}

function writeEntries(entries: RecentEntry[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)))
  } catch {
    /* ignore quota / disabled storage */
  }
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/*  Imperative API                                                     */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line react-refresh/only-export-components -- imperative helper colocated with the component; fast-refresh only, no runtime impact
export function recordMapSearch(term: string): void {
  const trimmed = (term ?? '').trim()
  if (!trimmed) return
  const key = trimmed.toLowerCase()
  const existing = readEntries()
  const filtered = existing.filter((e) => e.term.trim().toLowerCase() !== key)
  const next: RecentEntry[] = [{ term: trimmed, at: Date.now() }, ...filtered].slice(0, MAX_ENTRIES)
  writeEntries(next)
}

function removeEntry(term: string): void {
  const key = term.trim().toLowerCase()
  const next = readEntries().filter((e) => e.term.trim().toLowerCase() !== key)
  writeEntries(next)
}

function clearEntries(): void {
  writeEntries([])
}

/* ------------------------------------------------------------------ */
/*  Hook: stay live across event + storage                             */
/* ------------------------------------------------------------------ */

function useRecentEntries(): RecentEntry[] {
  const [entries, setEntries] = useState<RecentEntry[]>(() => readEntries())

  useEffect(() => {
    const refresh = () => setEntries(readEntries())
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) refresh()
    }
    window.addEventListener(CHANGE_EVENT, refresh)
    window.addEventListener('storage', onStorage)
    // Ensure first-paint matches latest (e.g. SSR/hydration mismatch guard).
    refresh()
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  return entries
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MapRecentSearches(props: MapRecentSearchesProps) {
  const { open, onPick, className } = props
  const entries = useRecentEntries()

  const handlePick = useCallback(
    (term: string) => {
      // Bump MRU on pick so the most-used terms float to the top.
      recordMapSearch(term)
      onPick(term)
    },
    [onPick],
  )

  const handleRemove = useCallback((term: string) => {
    removeEntry(term)
  }, [])

  const handleClear = useCallback(() => {
    clearEntries()
  }, [])

  if (!open) return null
  if (entries.length === 0) return null

  return (
    <div
      className={
        'rounded-xl shadow-lg px-3 py-2 ' + (className ?? '')
      }
      style={{
        background: 'rgba(247,247,247,0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.9)',
        color: '#374151',
      }}
      role="listbox"
      aria-label="Recent map searches"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span
          className="text-[11px] font-semibold tracking-wider uppercase"
          style={{ color: '#6b7280' }}
        >
          Recent
        </span>
        <button
          type="button"
          onClick={handleClear}
          className="text-[11px] hover:underline"
          style={{ color: '#6b7280' }}
          aria-label="Clear all recent searches"
        >
          Clear all
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 overflow-x-auto">
        {entries.map((e) => (
          <span
            key={e.term + ':' + e.at}
            className="inline-flex items-center gap-1 rounded-full pl-2.5 pr-1 py-0.5 transition-colors"
            style={{
              background: 'rgba(255,255,255,0.85)',
              border: '1px solid rgba(0,0,0,0.06)',
              color: '#374151',
            }}
          >
            <button
              type="button"
              onClick={() => handlePick(e.term)}
              aria-label={`Use recent search: ${e.term}`}
              className="text-[11px] leading-5 hover:opacity-80 max-w-[160px] truncate"
              style={{ color: '#374151' }}
              title={e.term}
            >
              {e.term}
            </button>
            <button
              type="button"
              onClick={() => handleRemove(e.term)}
              aria-label={`Remove ${e.term} from recents`}
              className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] leading-none hover:bg-black/10"
              style={{ color: '#6b7280' }}
            >
              {'×'}
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}
