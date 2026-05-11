/**
 * WhoSampled deep-links — opens their search in a new tab with a query derived from filenames.
 * No server proxy or scraping; subject to WhoSampled search UI and catalog coverage.
 */

const WHOSAMPLED_SEARCH_BASE = 'https://www.whosampled.com/search/'

export type WhoSampledFilenameQueries = {
  /** Filename without extension; trimmed. */
  primary: string
  /** Heuristic cleanup for “type beat” filenames (prefix strips, etc.). */
  simplified: string
}

/** Strip extension and collapse whitespace. */
export function filenameStem(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '').replace(/\s+/g, ' ').trim()
}

/**
 * Build one or two useful queries from a track filename.
 * Example: "(FREE) Gunna Type Beat - Superstar Aura.mp3"
 * → primary keeps detail; simplified favors "Gunna Superstar Aura".
 */
export function filenameToWhoSampledQueries(fileName: string): WhoSampledFilenameQueries {
  const primary = filenameStem(fileName)
  let simplified = primary
    .replace(/^\([^)]*\)\s*/g, '')
    .replace(/^\[[^\]]*\]\s*/g, '')
    .replace(/\s*[\u3010\[][^\]\u3011]*[\]\u3011]\s*/g, '')
    .replace(/\s*-\s*type\s+beat\s*/gi, ' ')
    .replace(/\s*type\s+beat\s*/gi, ' ')
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!simplified) simplified = primary

  return { primary, simplified }
}

export function whoSampledSearchUrl(query: string): string {
  const q = query.trim()
  const url = new URL(WHOSAMPLED_SEARCH_BASE)
  url.searchParams.set('q', q)
  return url.toString()
}

export function openWhoSampledSearch(query: string): void {
  const url = whoSampledSearchUrl(query)
  window.open(url, '_blank', 'noopener,noreferrer')
}
