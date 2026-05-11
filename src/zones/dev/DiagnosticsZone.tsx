import { useCallback, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ClipboardCopy, Loader2, RefreshCw, Stethoscope, XCircle } from 'lucide-react'

import { formatDiagnosticsMarkdown, summarizeDiagnostics, type DiagnosticCategory } from '../../lib/dashboard-diagnostics'
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

export default function DiagnosticsZone() {
  const { report, running, clientErrors, refresh, clearClientErrors } = useDiagnostics()
  const [copyHint, setCopyHint] = useState<string | null>(null)

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

  return (
    <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}>
      <div className="mx-auto max-w-4xl space-y-8 p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <Stethoscope className="size-5 text-violet-600" aria-hidden />
              Diagnostics
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Lightweight BFF and browser checks on load / every 90s (dev). Use <strong className="font-medium text-gray-700">Run full checks</strong> to probe RSS and optional YouTube, Gemini, and OpenAI routes when keys are set (uses quotas / feed fetches).
              Captured JavaScript errors appear below.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {copyHint ? (
              <span className="text-xs text-gray-600" role="status">
                {copyHint}
              </span>
            ) : null}
            <button
              type="button"
              disabled={!report}
              onClick={() => void copyReport()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-45"
            >
              <ClipboardCopy className="size-3.5 shrink-0" aria-hidden />
              Copy report
            </button>
            <button
              type="button"
              disabled={running}
              onClick={() => void refresh(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-55"
            >
              {running ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
              Run full checks
            </button>
          </div>
        </div>

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

        {!report && running ? (
          <p className="text-sm text-gray-500">Running first diagnostics pass…</p>
        ) : null}

        {report ? (
          <section aria-labelledby="diag-checks-heading">
            <h2 id="diag-checks-heading" className="mb-3 text-sm font-semibold text-gray-800">
              Check results
            </h2>
            <ul className="space-y-6">
              {groupedChecks.map(group => (
                <li key={group.category}>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{group.category}</h3>
                  <ul className="space-y-2">
                    {group.checks.map(c => (
                      <li
                        key={`${group.category}-${c.id}`}
                        className={`rounded-xl border px-4 py-3 ${
                          c.severity === 'ok'
                            ? 'border-gray-200 bg-gray-50/80'
                            : c.severity === 'warn'
                              ? 'border-amber-200 bg-amber-50/50'
                              : 'border-rose-200 bg-rose-50/50'
                        }`}
                      >
                        <div className="flex gap-2">
                          <SeverityIcon severity={c.severity} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-2">
                              <span className="text-sm font-semibold text-gray-900">{c.title}</span>
                              <span className="font-mono text-[10px] text-gray-400">{c.id}</span>
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-gray-700">{c.detail}</p>
                            {c.fix ? (
                              <p className="mt-2 text-xs font-medium leading-snug text-violet-900">
                                <span className="text-gray-600">Suggested fix:</span> {c.fix}
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
            <p className="mt-3 text-[11px] text-gray-500">
              Last BFF round-trip: {report.bffLatencyMs != null ? `${report.bffLatencyMs} ms` : 'n/a'} ·{' '}
              {new Date(report.generatedAt).toLocaleString()}
            </p>
          </section>
        ) : null}

        <section aria-labelledby="diag-errors-heading">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="diag-errors-heading" className="text-sm font-semibold text-gray-800">
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
            <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-4 py-6 text-center text-sm text-gray-500">
              No <code className="rounded bg-gray-100 px-1 text-xs">error</code> or{' '}
              <code className="rounded bg-gray-100 px-1 text-xs">unhandledrejection</code> events recorded this session.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Kind</th>
                    <th className="px-3 py-2 font-medium">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...clientErrors]
                    .slice()
                    .reverse()
                    .map((e, i) => (
                      <tr key={`${e.ts}-${i}`} className="bg-white">
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-600">
                          {new Date(e.ts).toLocaleTimeString()}
                        </td>
                        <td className="px-3 py-2 font-medium text-gray-800">{e.kind}</td>
                        <td className="max-w-[min(520px,55vw)] px-3 py-2 text-gray-700">
                          <span className="break-words">{e.message}</span>
                          {e.source ? (
                            <span className="mt-0.5 block font-mono text-[10px] text-gray-400">{e.source}</span>
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
