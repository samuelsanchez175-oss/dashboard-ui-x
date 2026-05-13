import { useEffect, useState } from 'react'
import { Music2, Send } from 'lucide-react'

import { subscribeFiles, type StoredFile } from './files-dock/files-store'

const MAX_TRAY_CLIPS = 5

const AUDIO_MIME_PREFIX = 'audio/'
const AUDIO_EXT_RE = /\.(mp3|wav|m4a|flac|aac|ogg|opus)$/i

function isAudioFile(f: StoredFile): boolean {
  if (f.mime?.startsWith(AUDIO_MIME_PREFIX)) return true
  return AUDIO_EXT_RE.test(f.path || f.name || '')
}

function truncateName(name: string, max = 28): string {
  if (name.length <= max) return name
  const dot = name.lastIndexOf('.')
  if (dot > 0 && name.length - dot <= 6) {
    const stem = name.slice(0, dot)
    const ext  = name.slice(dot)
    const keep = Math.max(4, max - ext.length - 1)
    return `${stem.slice(0, keep)}…${ext}`
  }
  return `${name.slice(0, max - 1)}…`
}

interface RecentClipsTrayProps {
  /**
   * Destination route id that should receive the clip when a pill is clicked.
   *
   * When provided, clicks write `inbound-clip-<targetRouteId>` to sessionStorage
   * (the same one-shot key the Mixing Audio Grabber uses for "Send to ‹tool›"
   * hand-offs) and fire a `'dashboard:set-route'` CustomEvent so the shell can
   * navigate. If the current page is already that route, no navigation
   * happens but the receiver must remount or refresh to pick up the key —
   * for in-place ingestion, prefer drag-from-FilesDock or a tool-local
   * "Use this clip" button.
   *
   * When omitted, the tray still renders (read-only preview) but pills are
   * disabled — useful for ZoneHeader contexts that haven't been wired yet.
   */
  targetRouteId?: string
  className?: string
}

/**
 * Horizontal pill row of the 5 most-recent audio clips in the global Files
 * Dock. Designed to live inside `ZoneHeader` below the title block — see
 * `ZoneHeader#recentClipsTray`.
 *
 * Clicking a pill hands the clip off to the configured `targetRouteId` using
 * the agreed `inbound-clip-<routeId>` sessionStorage convention and the
 * `'dashboard:set-route'` event the shell listens for.
 */
export default function RecentClipsTray({ targetRouteId, className = '' }: RecentClipsTrayProps) {
  const [clips, setClips] = useState<StoredFile[]>([])

  useEffect(() => {
    return subscribeFiles(files => {
      const audio = files.filter(isAudioFile).slice(0, MAX_TRAY_CLIPS)
      setClips(audio)
    })
  }, [])

  if (clips.length === 0) return null

  const handleUse = (clip: StoredFile) => {
    if (!targetRouteId) return
    try {
      sessionStorage.setItem(`inbound-clip-${targetRouteId}`, clip.id)
    } catch {
      /* sessionStorage unavailable */
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('dashboard:set-route', { detail: { id: targetRouteId } }),
      )
    }
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${className}`}
      role="region"
      aria-label="Recent audio clips"
    >
      <span
        className="mono text-[10px] uppercase tracking-wide shrink-0"
        style={{ color: 'var(--text-4)' }}
      >
        Recent clips
      </span>
      {clips.map(clip => {
        const interactive = Boolean(targetRouteId)
        const serial = typeof clip.serial === 'number'
          ? String(clip.serial).padStart(3, '0')
          : '—'
        return (
          <button
            key={clip.id}
            type="button"
            onClick={() => handleUse(clip)}
            disabled={!interactive}
            className="group inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition disabled:cursor-default disabled:opacity-70"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-2)',
              boxShadow: 'var(--shadow-sm)',
              maxWidth: '18rem',
            }}
            onMouseEnter={e => {
              if (!interactive) return
              const el = e.currentTarget as HTMLElement
              el.style.background = 'var(--accent-soft)'
              el.style.color = 'var(--accent-fg)'
            }}
            onMouseLeave={e => {
              if (!interactive) return
              const el = e.currentTarget as HTMLElement
              el.style.background = 'var(--bg-card)'
              el.style.color = 'var(--text-2)'
            }}
            title={
              interactive
                ? `Use this clip in the current tool · ${clip.name}`
                : clip.name
            }
            aria-label={
              interactive
                ? `Use clip ${clip.name} (serial ${serial}) in the current tool`
                : `${clip.name} (serial ${serial})`
            }
          >
            <Music2 className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{truncateName(clip.name)}</span>
            <span
              className="mono tabular-nums shrink-0"
              style={{ color: 'var(--text-4)' }}
            >
              #{serial}
            </span>
            {interactive ? (
              <Send className="size-3 shrink-0 opacity-60 group-hover:opacity-100" aria-hidden />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
