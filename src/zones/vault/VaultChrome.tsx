/**
 * Shared chrome for Vault / second-brain zones.
 */
import type { ReactNode } from 'react'
import { AlertTriangle, Brain, Loader2, RefreshCw } from 'lucide-react'
import ZoneHeader from '../../components/ZoneHeader'
import { CONTAINERS, TYPOGRAPHY } from '../../lib/design-tokens'
import type { VaultStatus } from '../../lib/vault-api'
import { daysSince, formatVaultDate } from '../../lib/vault-api'

export function VaultPage({
  title,
  description,
  actions,
  children,
  status,
  onRefreshStatus,
  loading,
  error,
}: {
  title: string
  description: string
  actions?: ReactNode
  children: ReactNode
  status?: VaultStatus | null
  onRefreshStatus?: () => void
  loading?: boolean
  error?: string | null
}) {
  const staleDays = status?.lastIngest != null ? daysSince(status.lastIngest) : null
  const briefStale = status?.lastBrief != null ? daysSince(status.lastBrief) : null

  return (
    <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}>
      <div className={`${CONTAINERS.page} py-[var(--space-page-y)] density-stack`}>
        <ZoneHeader
          eyebrow="SECOND BRAIN · OB CLAUDE"
          title={title}
          icon={Brain}
          description={description}
          actions={actions}
        />

        {status && (
          <div
            className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-[12px]"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
          >
            <span className="mono text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
              Vault
            </span>
            <span className="truncate mono text-[11px]" style={{ color: 'var(--text-2)' }} title={status.vaultDir}>
              {status.exists ? status.vaultDir : 'NOT FOUND'}
            </span>
            <span style={{ color: 'var(--text-3)' }}>·</span>
            <span style={{ color: 'var(--text-2)' }}>{status.noteCount.toLocaleString()} notes</span>
            <span style={{ color: 'var(--text-3)' }}>·</span>
            <span style={{ color: 'var(--text-2)' }}>{status.handoffCount} handoffs</span>
            {staleDays != null && staleDays > 7 && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 mono text-[10px] uppercase tracking-wide"
                style={{ background: 'var(--warn-soft)', color: 'var(--warn)', border: '1px solid var(--border)' }}
              >
                <AlertTriangle className="size-3" />
                Ingest {staleDays}d old
              </span>
            )}
            {briefStale != null && briefStale > 7 && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 mono text-[10px] uppercase tracking-wide"
                style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}
              >
                Brief {briefStale}d old
              </span>
            )}
            {onRefreshStatus && (
              <button
                type="button"
                onClick={onRefreshStatus}
                className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px]"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
              >
                <RefreshCw className="size-3" /> Refresh
              </button>
            )}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-3)' }}>
            <Loader2 className="size-4 animate-spin" /> Loading vault…
          </div>
        )}
        {error && (
          <div
            className="rounded-lg border px-4 py-3 text-sm"
            style={{ borderColor: 'var(--bad)', background: 'var(--bad-soft)', color: 'var(--bad)' }}
          >
            {error}
          </div>
        )}

        {children}
      </div>
    </div>
  )
}

/** Pull leading emoji(s) from a vault folder path so cards can show a big lane icon. */
export function splitFolderEmoji(folder: string): { emoji: string; label: string } {
  const top = (folder || '').split('/')[0]?.trim() || ''
  if (!top) return { emoji: '📄', label: '(root)' }
  // Extended pictographics + presentation selectors / ZWJ sequences
  const m = top.match(
    /^((?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\uFE0F|\u200D|\p{Emoji_Modifier})+)\s*(.*)$/u,
  )
  if (m?.[1]) {
    return { emoji: m[1].trim(), label: (m[2] || top).trim() || top }
  }
  return { emoji: '📁', label: top }
}

export function NoteCard({
  name,
  folder,
  snippet,
  mtime,
  onOpen,
  meta,
}: {
  name: string
  folder: string
  snippet?: string
  mtime?: number
  onOpen: () => void
  meta?: string
}) {
  const { emoji, label } = splitFolderEmoji(folder)
  // Deeper path after top segment (e.g. Handoffs/sub)
  const rest = folder.includes('/') ? folder.split('/').slice(1).join(' / ') : ''

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-lg border p-3 text-left transition-colors hover:brightness-110"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-start gap-3">
        {/* Lane emoji — large, next to card body so vault folders scan easily */}
        <span
          className="grid size-11 shrink-0 place-items-center rounded-lg text-[1.35rem] leading-none"
          style={{
            background: 'var(--bg-hover)',
            border: '1px solid var(--border-soft)',
          }}
          aria-hidden
        >
          {emoji}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className={`${TYPOGRAPHY.sectionTitle} truncate`} style={{ color: 'var(--text-1)' }}>
                {name}
              </div>
              <div
                className="mt-0.5 truncate text-[11px] font-medium"
                style={{ color: 'var(--text-3)' }}
              >
                <span style={{ color: 'var(--text-2)' }}>{label}</span>
                {rest ? (
                  <span className="mono text-[10px]" style={{ color: 'var(--text-4)' }}>
                    {' '}
                    / {rest}
                  </span>
                ) : null}
                {meta ? (
                  <span className="mono text-[10px]" style={{ color: 'var(--text-4)' }}>
                    {' '}
                    · {meta}
                  </span>
                ) : null}
              </div>
            </div>
            {mtime != null && (
              <span className="shrink-0 mono text-[10px]" style={{ color: 'var(--text-4)' }}>
                {formatVaultDate(mtime)}
              </span>
            )}
          </div>
          {snippet && (
            <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
              {snippet}
            </p>
          )}
        </div>
      </div>
    </button>
  )
}

export function NoteReader({
  path,
  content,
  onClose,
  onObsidian,
}: {
  path: string
  content: string
  onClose: () => void
  onObsidian?: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border sm:rounded-2xl"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between gap-2 border-b px-4 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="min-w-0">
            <div className="mono text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>
              Note
            </div>
            <div className="truncate text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              {path}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {onObsidian && (
              <button
                type="button"
                onClick={onObsidian}
                className="rounded-lg px-3 py-1.5 text-[12px] font-medium"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent-fg)', border: '1px solid var(--border)' }}
              >
                Open Obsidian
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-[12px]"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-2)' }}
            >
              Close
            </button>
          </div>
        </div>
        <pre
          className="flex-1 overflow-auto whitespace-pre-wrap p-4 text-[13px] leading-relaxed mono"
          style={{ color: 'var(--text-2)' }}
        >
          {content}
        </pre>
      </div>
    </div>
  )
}
