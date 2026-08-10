import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, ClipboardCopy, Compass, Download, ExternalLink, RefreshCw } from 'lucide-react'
import ZoneHeader from '../../components/ZoneHeader'
import Button from '../../components/ui/Button'
import { CONTAINERS } from '../../lib/design-tokens'

/**
 * The paste-ready prompt that re-runs the whole handoff refresh. Copied to the
 * clipboard by the "Copy refresh prompt" button — drop it into Claude Code from
 * the vault to regenerate this document with current info.
 */
const REFRESH_PROMPT = `/vault-routine task1

Refresh the Project Command Center. Re-scan the vault AND my code roots (~/dev and ~/Desktop/CLAUDE WORLD.nosync) AND recent sessions for every active project — including any that aren't documented in the vault yet — and infer each project's current end goal and status from all the info. Rebuild 00_Project_Command_Center.md, re-render the branded CPW-style PDF handoff into "📄 Handoff Sheets/", copy it to ~/Downloads, and republish it to the Samuel X Dashboard (Daily Brief → Project Command Center) with a commit + push to Vercel. Use the current project names.`

/**
 * Project Command Center zone — the Obsidian adviser handoff, published here by
 * the vault's `/vault-routine task1` run. That routine renders the handoff to
 * `📄 Handoff Sheets/` in the OB CLAUDE vault, then copies the HTML + PDF into
 * `public/command-center/` (via `scripts/refresh-command-center.mjs`) and pushes,
 * so the deployed dashboard always shows the latest read. This zone only renders
 * the committed file; it never re-derives.
 */

const HTML_URL = '/command-center/latest.html'
const PDF_URL = '/command-center/latest.pdf'
const META_URL = '/command-center/meta.json'

/** BFF endpoint that runs `npm run refresh:command-center` on the local Mac. */
const REFRESH_ENDPOINT = '/api/command-center/refresh'

interface Meta {
  updated?: string
  projects?: number
}

/** Stale if the snapshot is older than 2 days. */
function isStale(updated?: string): boolean {
  if (!updated) return true
  const d = new Date(updated)
  if (isNaN(d.getTime())) return true
  return Date.now() - d.getTime() > 2 * 24 * 60 * 60 * 1000
}

export default function CommandCenterZone() {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [copied, setCopied] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [iframeKey, setIframeKey] = useState(0)
  const aliveRef = useRef(true)

  async function copyRefreshPrompt() {
    try {
      await navigator.clipboard.writeText(REFRESH_PROMPT)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked — no-op; user can still Download PDF / Open full page */
    }
  }

  /** Fetch meta.json (cache-busted) and update state. */
  const loadMeta = useCallback(async () => {
    try {
      const res = await fetch(`${META_URL}?t=${Date.now()}`, { cache: 'no-store' })
      if (res.ok) {
        const m = (await res.json()) as Meta
        if (aliveRef.current) setMeta(m)
      }
    } catch {
      /* meta is optional — the iframe still renders */
    }
  }, [])

  useEffect(() => {
    aliveRef.current = true
    loadMeta()
    return () => {
      aliveRef.current = false
    }
  }, [loadMeta])

  /**
   * Hit the local BFF endpoint to re-run `scripts/refresh-command-center.mjs`
   * (copies the newest handoff HTML+PDF from the vault into public/). Then
   * reload the iframe + meta so the new content is visible immediately.
   */
  const refreshFromVault = useCallback(async () => {
    setRefreshing(true)
    setRefreshError(null)
    try {
      const res = await fetch(REFRESH_ENDPOINT, { method: 'POST' })
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText)
        throw new Error(text || `HTTP ${res.status}`)
      }
      // Reload the iframe (bust cache) + re-fetch meta.
      setIframeKey(k => k + 1)
      await loadMeta()
    } catch (err) {
      setRefreshError(
        err instanceof Error
          ? err.message
          : 'Refresh failed — is the dev server running on localhost?',
      )
    } finally {
      setRefreshing(false)
    }
  }, [loadMeta])

  const stale = isStale(meta?.updated)

  return (
    <div
      className="flex-1 overflow-auto"
      style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}
    >
      <div className={`${CONTAINERS.page} py-8`}>
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <ZoneHeader
        eyebrow="OBSIDIAN ADVISER"
        title="Project Command Center"
        icon={Compass}
        description="Your active-projects handoff — goal, status, and a paste-ready jump-back-in prompt per project. Refreshed each time you run the vault routine."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              onClick={refreshFromVault}
              disabled={refreshing}
              leading={
                refreshing
                  ? <RefreshCw className="size-4 animate-spin" />
                  : <RefreshCw className="size-4" />
              }
              title="Re-copy the latest handoff from the vault into the dashboard (runs locally)"
            >
              {refreshing ? 'Refreshing…' : 'Refresh from vault'}
            </Button>
            <Button
              variant="secondary"
              onClick={copyRefreshPrompt}
              leading={copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
              title="Copy the prompt that regenerates this document with current info"
            >
              {copied ? 'Copied!' : 'Copy refresh prompt'}
            </Button>
            <a href={PDF_URL} download>
              <Button variant="secondary" leading={<Download className="size-4" />}>
                Download PDF
              </Button>
            </a>
            <a href={HTML_URL} target="_blank" rel="noreferrer">
              <Button variant="ghost" leading={<ExternalLink className="size-4" />}>
                Open full page
              </Button>
            </a>
          </div>
        }
      />

      {/* Status row: last refreshed + staleness warning */}
      <div className="flex flex-wrap items-center gap-3 text-[13px]" style={{ color: 'var(--text-3)' }}>
        {meta?.updated ? (
          <span className="flex items-center gap-1.5">
            <RefreshCw className="size-3.5" />
            Last refreshed {meta.updated}
            {meta.projects ? ` · ${meta.projects} active projects` : ''}
          </span>
        ) : null}
        {stale && meta?.updated && (
          <span
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium"
            style={{
              background: 'color-mix(in oklab, #f97316 12%, transparent)',
              color: '#f97316',
              border: '1px solid color-mix(in oklab, #f97316 25%, transparent)',
            }}
          >
            <AlertTriangle className="size-3.5" />
            Snapshot is stale — run Refresh or copy the prompt above to update
          </span>
        )}
      </div>

      {/* Refresh error toast */}
      {refreshError && (
        <div
          className="rounded-xl px-4 py-3 text-[13px]"
          style={{
            background: 'color-mix(in oklab, #dc2626 8%, transparent)',
            color: 'var(--bad, #dc2626)',
            border: '1px solid color-mix(in oklab, #dc2626 20%, transparent)',
          }}
        >
          {refreshError}
        </div>
      )}

          <iframe
            key={iframeKey}
            title="Project Command Center"
            src={`${HTML_URL}?t=${Date.now()}`}
            className="w-full rounded-2xl border"
            style={{ height: '80vh', background: '#fff', borderColor: 'var(--border-soft)' }}
          />
        </div>
      </div>
    </div>
  )
}
