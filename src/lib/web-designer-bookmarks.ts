export interface WebDesignerBookmark {
  id: string
  url: string
  title: string
  faviconUrl: string | null
  starredAt: number
}

export function normalizeUrl(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  try {
    if (/^https?:\/\//i.test(t)) return new URL(t).href
    return new URL(`https://${t}`).href
  } catch {
    return null
  }
}

export function defaultTitleForUrl(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, '')
  } catch {
    return href
  }
}

/** Public favicon lookup (no API key). */
export function faviconUrlForPage(href: string): string | null {
  try {
    const host = new URL(href).hostname
    if (!host) return null
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`
  } catch {
    return null
  }
}

/** Route id for a starred web-designer bookmark (sidebar). */
export function webDesignerBookmarkNavId(bookmarkId: string): string {
  return `web-designer:${bookmarkId}`
}

export function parseWebDesignerBookmarkNavId(routeId: string): string | null {
  if (!routeId.startsWith('web-designer:')) return null
  return routeId.slice('web-designer:'.length) || null
}
