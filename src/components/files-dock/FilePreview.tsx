/**
 * In-app preview modal for a dock file. Replaces the previous "open in new
 * tab" behavior (which Chrome would silently turn into a download for some
 * MIME types). A separate Download button gives explicit save-to-disk.
 *
 *   • image/*           → centered <img> (max 80vh)
 *   • audio/*           → <audio controls> player
 *   • video/*           → <video controls> player
 *   • application/pdf   → <iframe> embed
 *   • text/* + json     → fetched as text and rendered in a <pre>
 *   • anything else     → "Cannot preview — download to view" placeholder
 */

import { Download, ExternalLink, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import type { StoredFile } from './files-store'

interface FilePreviewProps {
  file:    StoredFile
  onClose: () => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024)              return `${bytes} B`
  if (bytes < 1024 * 1024)       return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function isText(mime: string, name: string): boolean {
  if (mime.startsWith('text/'))             return true
  if (mime === 'application/json')          return true
  if (mime === 'application/xml')           return true
  if (mime === 'application/javascript')    return true
  if (mime === 'application/x-yaml')        return true
  // Filename fallback for files saved without a recognized MIME.
  const lower = name.toLowerCase()
  return /\.(txt|md|json|csv|tsv|xml|yaml|yml|log|js|ts|tsx|jsx|css|html?)$/.test(lower)
}

function triggerSave(file: StoredFile): void {
  const url = URL.createObjectURL(file.blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = file.path || file.name
  a.rel      = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export default function FilePreview({ file, onClose }: FilePreviewProps) {
  // Stable object URL for the lifetime of the modal.
  const url = useMemo(() => URL.createObjectURL(file.blob), [file.blob])
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  /* Text content is lazily fetched. */
  const [textContent, setTextContent] = useState<string | null>(null)
  const [textError,   setTextError]   = useState<string | null>(null)
  const isTextMode = isText(file.mime, file.name)

  useEffect(() => {
    if (!isTextMode) return
    let cancelled = false
    void (async () => {
      try {
        const t = await file.blob.text()
        if (!cancelled) setTextContent(t.length > 200_000 ? `${t.slice(0, 200_000)}\n\n— truncated, download to see the full file —` : t)
      } catch (e) {
        if (!cancelled) setTextError(e instanceof Error ? e.message : 'Could not read text')
      }
    })()
    return () => { cancelled = true }
  }, [file.blob, isTextMode])

  /* ── Close on ESC ──────────────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const mime = file.mime || 'application/octet-stream'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${file.name}`}
      className="fixed inset-0 z-[9300] flex items-center justify-center"
      style={{ background: 'rgba(5,5,8,0.78)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative flex max-h-[90vh] w-[min(960px,92vw)] flex-col overflow-hidden rounded-2xl"
        style={{
          background: '#14151b',
          border:     '1px solid rgba(255,255,255,0.10)',
          boxShadow:  '0 24px 72px rgba(0,0,0,0.6), 0 6px 18px rgba(0,0,0,0.4)',
        }}
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <header
          className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold" style={{ color: '#f3f4f6' }}>
              <span className="mono mr-1.5" style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>
                #{String(file.serial ?? 0).padStart(3, '0')}
              </span>
              {file.name}
            </p>
            <p className="mono mt-0.5 truncate text-[10px] uppercase tracking-wide" style={{ color: '#9ca3af' }}>
              {mime} · {formatSize(file.size)}
              {file.source ? ` · ${file.source}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => triggerSave(file)}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition"
            style={{ background: 'rgba(167,139,250,0.18)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.35)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(167,139,250,0.28)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(167,139,250,0.18)' }}
          >
            <Download className="size-3.5" aria-hidden />
            Download
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition"
            style={{ background: 'rgba(255,255,255,0.08)', color: '#d1d5db', border: '1px solid rgba(255,255,255,0.10)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.16)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)' }}
          >
            <ExternalLink className="size-3.5" aria-hidden />
            New tab
          </a>
          <button
            type="button"
            onClick={onClose}
            className="ml-1 inline-flex size-8 items-center justify-center rounded-md transition"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.14)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
            aria-label="Close preview"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <div className="flex min-h-[280px] flex-1 items-center justify-center overflow-auto p-4">
          {mime.startsWith('image/') && (
            <img
              src={url}
              alt={file.name}
              className="max-h-[72vh] max-w-full rounded-lg"
              style={{ background: '#0b0b0f', boxShadow: '0 2px 12px rgba(0,0,0,0.6)' }}
            />
          )}

          {mime.startsWith('audio/') && (
            <div className="flex w-full flex-col items-center gap-4">
              <div
                className="grid size-28 place-items-center rounded-2xl"
                style={{ background: 'rgba(124,58,237,0.18)', color: '#a78bfa', border: '1px solid rgba(255,255,255,0.10)' }}
                aria-hidden
              >
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 6.835V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-.343" />
                  <path d="M14 2v5a1 1 0 0 0 1 1h5" />
                  <path d="M2 19a2 2 0 0 1 4 0v1a2 2 0 0 1-4 0v-4a6 6 0 0 1 12 0v4a2 2 0 0 1-4 0v-1a2 2 0 0 1 4 0" />
                </svg>
              </div>
              <audio
                controls
                preload="metadata"
                src={url}
                className="w-full max-w-[640px]"
              />
            </div>
          )}

          {mime.startsWith('video/') && (
            <video
              controls
              preload="metadata"
              src={url}
              className="max-h-[72vh] max-w-full rounded-lg"
              style={{ background: '#000' }}
            />
          )}

          {mime === 'application/pdf' && (
            <iframe
              src={url}
              title={file.name}
              className="h-[72vh] w-full rounded-lg"
              style={{ background: '#fff', border: '1px solid rgba(255,255,255,0.10)' }}
            />
          )}

          {isTextMode && (
            <pre
              className="mono max-h-[72vh] w-full overflow-auto rounded-lg p-4 text-[12px] leading-relaxed"
              style={{ background: '#0b0b0f', color: '#d1d5db', border: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
            >
              {textError
                ? <span style={{ color: '#fb7185' }}>{textError}</span>
                : textContent ?? 'Loading…'}
            </pre>
          )}

          {!mime.startsWith('image/') &&
           !mime.startsWith('audio/') &&
           !mime.startsWith('video/') &&
           mime !== 'application/pdf' &&
           !isTextMode && (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <div
                className="grid size-16 place-items-center rounded-2xl"
                style={{ background: 'rgba(148,163,184,0.18)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.10)' }}
                aria-hidden
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <p className="text-sm font-medium" style={{ color: '#f3f4f6' }}>
                No inline preview available for this file type.
              </p>
              <p className="text-xs" style={{ color: '#9ca3af' }}>
                Use the <span style={{ color: '#a78bfa', fontWeight: 600 }}>Download</span> or{' '}
                <span style={{ color: '#d1d5db', fontWeight: 600 }}>New tab</span> button above.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
