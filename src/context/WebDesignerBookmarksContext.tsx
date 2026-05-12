import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { WebDesignerBookmark } from '../lib/web-designer-bookmarks'
import { defaultTitleForUrl, faviconUrlForPage } from '../lib/web-designer-bookmarks'

const BOOKMARKS_KEY = 'ui-web-designer-bookmarks'
const ACTIVITY_KEY = 'ui-web-designer-activity'

export type WebDesignerActivityKind = 'saved' | 'info' | 'warning'

export interface WebDesignerActivityEvent {
  id: string
  kind: WebDesignerActivityKind
  message: string
  at: number
}

interface WebDesignerBookmarksState {
  bookmarks:      WebDesignerBookmark[]
  addBookmark:    (input: { url: string; title?: string }) => WebDesignerBookmark | null
  removeBookmark: (id: string) => void
  getBookmark:    (id: string) => WebDesignerBookmark | undefined
  isUrlStarred:   (url: string) => boolean
  toggleStar:     (url: string, titleHint?: string) => void
  activity:       WebDesignerActivityEvent[]
  pushActivity:   (kind: WebDesignerActivityKind, message: string) => void
}

const WebDesignerBookmarksContext = createContext<WebDesignerBookmarksState | null>(null)

function loadBookmarks(): WebDesignerBookmark[] {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (b): b is WebDesignerBookmark =>
        typeof b === 'object' &&
        b != null &&
        typeof (b as WebDesignerBookmark).id === 'string' &&
        typeof (b as WebDesignerBookmark).url === 'string',
    )
  } catch {
    return []
  }
}

function loadActivity(): WebDesignerActivityEvent[] {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (e): e is WebDesignerActivityEvent =>
          typeof e === 'object' &&
          e != null &&
          typeof (e as WebDesignerActivityEvent).id === 'string' &&
          typeof (e as WebDesignerActivityEvent).message === 'string',
      )
      .slice(-40)
  } catch {
    return []
  }
}

export function WebDesignerBookmarksProvider({ children }: { children: React.ReactNode }) {
  const [bookmarks, setBookmarks] = useState<WebDesignerBookmark[]>(loadBookmarks)
  const [activity, setActivity]   = useState<WebDesignerActivityEvent[]>(loadActivity)

  const writeBookmarks = useCallback((next: WebDesignerBookmark[]) => {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(next))
    setBookmarks(next)
  }, [])

  const pushActivity = useCallback((kind: WebDesignerActivityKind, message: string) => {
    const row: WebDesignerActivityEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind,
      message,
      at: Date.now(),
    }
    setActivity(prev => {
      const next = [...prev, row].slice(-40)
      localStorage.setItem(ACTIVITY_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const getBookmark = useCallback(
    (id: string) => bookmarks.find(b => b.id === id),
    [bookmarks],
  )

  const isUrlStarred = useCallback(
    (url: string) => bookmarks.some(b => b.url === url),
    [bookmarks],
  )

  const addBookmark = useCallback(
    (input: { url: string; title?: string }): WebDesignerBookmark | null => {
      const href = input.url.trim()
      if (!href) return null
      const prev = loadBookmarks()
      const existing = prev.find(b => b.url === href)
      if (existing) return existing
      const id =
        typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `wd-${Date.now()}`
      const title = (input.title && input.title.trim()) || defaultTitleForUrl(href)
      const row: WebDesignerBookmark = {
        id,
        url: href,
        title,
        faviconUrl: faviconUrlForPage(href),
        starredAt: Date.now(),
      }
      writeBookmarks([row, ...prev])
      pushActivity('saved', `Starred · ${title}`)
      return row
    },
    [pushActivity, writeBookmarks],
  )

  const removeBookmark = useCallback(
    (id: string) => {
      const prev = loadBookmarks()
      writeBookmarks(prev.filter(b => b.id !== id))
    },
    [writeBookmarks],
  )

  const toggleStar = useCallback(
    (url: string, titleHint?: string) => {
      const prev = loadBookmarks()
      const hit = prev.find(b => b.url === url)
      if (hit) {
        writeBookmarks(prev.filter(b => b.id !== hit.id))
        pushActivity('info', `Removed star · ${hit.title}`)
        return
      }
      const id =
        typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `wd-${Date.now()}`
      const title = (titleHint && titleHint.trim()) || defaultTitleForUrl(url)
      const row: WebDesignerBookmark = {
        id,
        url,
        title,
        faviconUrl: faviconUrlForPage(url),
        starredAt: Date.now(),
      }
      writeBookmarks([row, ...prev])
      pushActivity('saved', `Starred · ${title}`)
    },
    [pushActivity, writeBookmarks],
  )

  const value = useMemo(
    () => ({
      bookmarks,
      addBookmark,
      removeBookmark,
      getBookmark,
      isUrlStarred,
      toggleStar,
      activity,
      pushActivity,
    }),
    [activity, addBookmark, bookmarks, getBookmark, isUrlStarred, pushActivity, removeBookmark, toggleStar],
  )

  return (
    <WebDesignerBookmarksContext.Provider value={value}>
      {children}
    </WebDesignerBookmarksContext.Provider>
  )
}

/** @see CustomZonesContext — hook co-located with provider. */
// eslint-disable-next-line react-refresh/only-export-components -- context module pattern
export function useWebDesignerBookmarks() {
  const ctx = useContext(WebDesignerBookmarksContext)
  if (!ctx) throw new Error('useWebDesignerBookmarks must be used within WebDesignerBookmarksProvider')
  return ctx
}
