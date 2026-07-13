import { useEffect, useState } from 'react'
import { Check, ClipboardCopy, Compass, Download, ExternalLink, RefreshCw } from 'lucide-react'
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

interface Meta {
  updated?: string
  projects?: number
}

export default function CommandCenterZone() {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [copied, setCopied] = useState(false)

  async function copyRefreshPrompt() {
    try {
      await navigator.clipboard.writeText(REFRESH_PROMPT)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked — no-op; user can still Download PDF / Open full page */
    }
  }

  useEffect(() => {
    let alive = true
    fetch(META_URL, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(m => {
        if (alive) setMeta(m)
      })
      .catch(() => {
        /* meta is optional — the iframe still renders */
      })
    return () => {
      alive = false
    }
  }, [])

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
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
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

      {meta?.updated && (
        <div
          className="flex items-center gap-2 text-[13px]"
          style={{ color: 'var(--text)', opacity: 0.6 }}
        >
          <RefreshCw className="size-3.5" />
          Last refreshed {meta.updated}
          {meta.projects ? ` · ${meta.projects} active projects` : ''}
        </div>
      )}

          <iframe
            title="Project Command Center"
            src={HTML_URL}
            className="w-full rounded-2xl border"
            style={{ height: '80vh', background: '#fff', borderColor: 'var(--border-soft)' }}
          />
        </div>
      </div>
    </div>
  )
}
