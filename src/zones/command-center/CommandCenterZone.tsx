import { useEffect, useState } from 'react'
import { Compass, Download, ExternalLink, RefreshCw } from 'lucide-react'
import ZoneHeader from '../../components/ZoneHeader'
import Button from '../../components/ui/Button'

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
    <div className="flex h-full flex-col gap-4 pb-6">
      <ZoneHeader
        eyebrow="OBSIDIAN ADVISER"
        title="Project Command Center"
        icon={Compass}
        description="Your active-projects handoff — goal, status, and a paste-ready jump-back-in prompt per project. Refreshed each time you run the vault routine."
        actions={
          <div className="flex items-center gap-2">
            <a href={PDF_URL} download>
              <Button variant="primary" leading={<Download className="size-4" />}>
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
        className="w-full flex-1 rounded-2xl border"
        style={{ minHeight: '72vh', background: '#fff', borderColor: 'var(--border-soft)' }}
      />
    </div>
  )
}
