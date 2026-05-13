import { useCallback, useMemo, useState, type CSSProperties } from 'react'
import { AlertTriangle, CheckCircle2, ClipboardCopy, KeyRound, Loader2, RefreshCw, Stethoscope, XCircle } from 'lucide-react'

import AddDocumentedEnvDialog from '../../components/dev/AddDocumentedEnvDialog'
import Button from '../../components/ui/Button'
import ZoneHeader from '../../components/ZoneHeader'
import { EmptyState, LoadingState } from '../../components/ui/states'
import { CONTAINERS } from '../../lib/design-tokens'
import { formatDiagnosticsMarkdown, summarizeDiagnostics, type DiagnosticCategory } from '../../lib/dashboard-diagnostics'
import { loadCustomDocRows, MAX_CUSTOM_DOC_ROWS, saveCustomDocRows, type CustomDocRow } from '../../lib/dev-documented-env-keys'
import { useDiagnostics } from '../../context/DiagnosticsContext'

const CATEGORY_ORDER: DiagnosticCategory[] = ['bff', 'api', 'integrations', 'browser', 'runtime']

function severityRank(s: 'ok' | 'warn' | 'critical'): number {
  if (s === 'critical') return 0
  if (s === 'warn') return 1
  return 2
}

function SeverityIcon({ severity }: { severity: 'ok' | 'warn' | 'critical' }) {
  if (severity === 'ok') return <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden />
  if (severity === 'warn') return <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden />
  return <XCircle className="size-4 shrink-0 text-rose-600" aria-hidden />
}

type DiagnosticsZoneProps = {
  onNavigate?: (routeId: string) => void
}

export default function DiagnosticsZone({ onNavigate }: DiagnosticsZoneProps) {
  const { report, running, clientErrors, refresh, clearClientErrors } = useDiagnostics()
  const [copyHint, setCopyHint] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [docTick, setDocTick] = useState(0)
  const customRowsSnapshot = useMemo(() => {
    void docTick
    return loadCustomDocRows()
  }, [docTick])

  const groupedChecks = useMemo(() => {
    if (!report) return []
    const map = new Map<DiagnosticCategory, typeof report.checks>()
    for (const c of report.checks) {
      const list = map.get(c.category) ?? []
      list.push(c)
      map.set(c.category, list)
    }
    return CATEGORY_ORDER.filter(cat => map.has(cat)).map(cat => ({
      category: cat,
      checks: (map.get(cat) ?? [])
        .slice()
        .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.id.localeCompare(b.id)),
    }))
  }, [report])

  const summary = useMemo(() => summarizeDiagnostics(report), [report])

  const copyReport = useCallback(async () => {
    if (!report) return
    const md = formatDiagnosticsMarkdown(report, clientErrors)
    try {
      await navigator.clipboard.writeText(md)
      setCopyHint('Copied Markdown report')
    } catch {
      setCopyHint('Clipboard unavailable')
    }
    window.setTimeout(() => setCopyHint(null), 2200)
  }, [report, clientErrors])

  const commitDocRows = useCallback((rows: CustomDocRow[]) => {
    const prev = loadCustomDocRows()
    const next = [...prev, ...rows].slice(-MAX_CUSTOM_DOC_ROWS)
    saveCustomDocRows(next)
    setDocTick(t => t + 1)
  }, [])

  return (
    <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}>
      <div className={`${CONTAINERS.page} space-y-8 py-8`}>
        <ZoneHeader
          title="Diagnostics"
          icon={Stethoscope}
          description={
            <>
              Lightweight BFF and browser checks on load / every 90s (dev). Use{' '}
              <strong className="font-medium" style={{ color: 'var(--text-2)' }}>
                Run full checks
              </strong>{' '}
              to probe RSS and optional YouTube, Gemini, and OpenAI routes when keys are set (uses quotas / feed fetches), plus an env-key audit:{' '}
              <code className="mono rounded px-1 font-mono text-[11px]" style={{ background: 'var(--bg-muted)', color: 'var(--text-1)' }}>
                VITE_*
              </code>{' '}
              from the client bundle and allowlisted server variables via{' '}
              <code className="rounded px-1 font-mono text-[11px]" style={{ background: 'var(--bg-muted)', color: 'var(--text-1)' }}>
                GET /api/diagnostics/env-keys
              </code>{' '}
              (presence only — never values). Captured JavaScript errors appear below.
            </>
          }
          actions={
            <>
              {copyHint ? (
                <span className="text-xs" role="status" style={{ color: 'var(--text-3)' }}>
                  {copyHint}
                </span>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                disabled={!report}
                onClick={() => void copyReport()}
                leading={<ClipboardCopy className="size-3.5 shrink-0" aria-hidden />}
              >
                Copy report
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={running}
                onClick={() => void refresh(true)}
                leading={running ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
              >
                Run full checks
              </Button>
            </>
          }
        />

        <section
          className="rounded-xl border p-5"
          style={{
            borderColor: 'color-mix(in oklab, var(--accent) 28%, var(--border))',
            background:   'color-mix(in oklab, var(--accent-soft) 55%, var(--bg-card))',
          }}
          aria-labelledby="diag-api-keys-heading"
        >
          <h2 id="diag-api-keys-heading" className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--accent-fg)' }}>
            <KeyRound className="size-4 shrink-0" aria-hidden />
            API keys &amp; OAuth clients
          </h2>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
            Use the same dialog as <strong>Settings &amp; API keys</strong> to register variables. For providers like Tesla Fleet that issue a{' '}
            <strong>Client ID</strong> and <strong>Client Secret</strong>, pick <em>Client ID + Secret</em> — the app saves{' '}
            <code className="mono rounded px-1 font-mono text-[11px]" style={{ background: 'var(--bg-muted)', color: 'var(--text-2)' }}>
                YOURAPI_CLIENT_ID
              </code>{' '}
              and{' '}
              <code className="mono rounded px-1 font-mono text-[11px]" style={{ background: 'var(--bg-muted)', color: 'var(--text-2)' }}>
                YOURAPI_CLIENT_SECRET
              </code> so server code and headers line up with the exact names you expect.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white transition hover:opacity-95"
              style={{ background: 'var(--accent)' }}
            >
              <KeyRound className="size-3.5 shrink-0" aria-hidden />
              Add variable or OAuth pair
            </button>
            {onNavigate ? (
              <button
                type="button"
                onClick={() => onNavigate('dev')}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', color: 'var(--text-2)' }}
              >
                Open Settings &amp; API
              </button>
            ) : null}
          </div>
        </section>

        <AddDocumentedEnvDialog
          open={addOpen}
          onClose={() => setAddOpen(false)}
          customRowsSnapshot={customRowsSnapshot}
          onCommitRows={commitDocRows}
        />

        {report ? (
          <section className="grid gap-3 sm:grid-cols-3" aria-label="Summary">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Healthy</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-emerald-950">{summary.ok}</div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-900">Warnings</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-amber-950">{summary.warn}</div>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-rose-900">Critical</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-rose-950">{summary.critical}</div>
            </div>
          </section>
        ) : null}

        {!report && running ? <LoadingState label="Running first diagnostics pass…" /> : null}

        {report ? (
          <section aria-labelledby="diag-checks-heading">
            <h2 id="diag-checks-heading" className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              Check results
            </h2>
            <ul className="space-y-6">
              {groupedChecks.map(group => (
                <li key={group.category}>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                    {group.category}
                  </h3>
                  <ul className="space-y-2">
                    {group.checks.map(c => (
                      <li
                        key={`${group.category}-${c.id}`}
                        className={`rounded-xl border px-4 py-3 ${
                          c.severity === 'ok'
                            ? ''
                            : c.severity === 'warn'
                              ? 'border-amber-200 bg-amber-50/50'
                              : 'border-rose-200 bg-rose-50/50'
                        }`}
                        style={
                          c.severity === 'ok'
                            ? {
                                borderColor: 'var(--border-soft)',
                                background: 'color-mix(in oklab, var(--bg-card-soft) 80%, transparent)',
                              }
                            : undefined
                        }
                      >
                        <div className="flex gap-2">
                          <SeverityIcon severity={c.severity} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-2">
                              <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                                {c.title}
                              </span>
                              <span className="mono font-mono text-[10px]" style={{ color: 'var(--text-4)' }}>
                                {c.id}
                              </span>
                            </div>
                            <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
                              {c.detail}
                            </p>
                            {c.fix ? (
                              <p className="mt-2 text-xs font-medium leading-snug text-violet-900">
                                <span style={{ color: 'var(--text-3)' }}>Suggested fix:</span> {c.fix}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px]" style={{ color: 'var(--text-3)' }}>
              Last BFF round-trip: {report.bffLatencyMs != null ? `${report.bffLatencyMs} ms` : 'n/a'} ·{' '}
              {new Date(report.generatedAt).toLocaleString()}
            </p>
          </section>
        ) : null}

        <section aria-labelledby="diag-errors-heading">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="diag-errors-heading" className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              Captured client errors
            </h2>
            {clientErrors.length > 0 ? (
              <button
                type="button"
                onClick={clearClientErrors}
                className="text-xs font-medium text-violet-700 hover:text-violet-900"
              >
                Clear log
              </button>
            ) : null}
          </div>
          {clientErrors.length === 0 ? (
            <div
              className="rounded-xl border border-dashed"
              style={{ borderColor: 'var(--border-soft)', background: 'color-mix(in oklab, var(--bg-card-soft) 50%, transparent)' }}
            >
              <EmptyState
                title="No client errors captured"
                description={
                  <>
                    No <code style={inlineCodeStyle()}>error</code> or <code style={inlineCodeStyle()}>unhandledrejection</code>{' '}
                    events recorded this session.
                  </>
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border-soft)' }}>
              <table className="min-w-full text-left text-xs">
                <thead
                  className="text-[10px] uppercase tracking-wide"
                  style={{ background: 'var(--bg-card-soft)', color: 'var(--text-3)' }}
                >
                  <tr>
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Kind</th>
                    <th className="px-3 py-2 font-medium">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {[...clientErrors]
                    .slice()
                    .reverse()
                    .map((e, i) => (
                      <tr
                        key={`${e.ts}-${i}`}
                        className="border-b last:border-b-0"
                        style={{
                          borderColor: 'var(--border-soft)',
                          background: 'var(--bg-card)',
                        }}
                      >
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums" style={{ color: 'var(--text-3)' }}>
                          {new Date(e.ts).toLocaleTimeString()}
                        </td>
                        <td className="px-3 py-2 font-medium" style={{ color: 'var(--text-1)' }}>
                          {e.kind}
                        </td>
                        <td className="max-w-[min(520px,55vw)] px-3 py-2" style={{ color: 'var(--text-2)' }}>
                          <span className="break-words">{e.message}</span>
                          {e.source ? (
                            <span className="mono mt-0.5 block font-mono text-[10px]" style={{ color: 'var(--text-4)' }}>
                              {e.source}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function inlineCodeStyle(): CSSProperties {
  return {
    borderRadius: 4,
    padding: '0 4px',
    fontSize: 11,
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    background: 'var(--bg-muted)',
    color: 'var(--text-1)',
  }
}
