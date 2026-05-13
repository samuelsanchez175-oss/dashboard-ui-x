import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronRight, ClipboardCopy, ExternalLink, Loader2, RefreshCw, XCircle } from 'lucide-react'

import { getAllStoredApiKeys, subscribeApiKeys } from '../../lib/api-keys'

type VirtualKeyInfo = {
  hasKey: boolean
  fingerprint: string | null
}

type FleetProbe = {
  status?: string
  message?: string
  /** BFF emits camelCase; accept snake_case too for resilience. */
  authorizeUrl?: string
  authorize_url?: string
  /** The exact redirect URI the BFF will send to Tesla — must be registered in your Tesla developer portal verbatim. */
  redirectUri?: string
  redirect_uri?: string
  error?: string
}

type StepState = 'ok' | 'warn' | 'todo' | 'pending'

type Step = {
  id: string
  num: number
  title: string
  state: StepState
  detail: string
  cta?: { label: string; href?: string; onClick?: () => void; external?: boolean }
}

const TESLA_CLIENT_ID = 'TESLA_CLIENT_ID'
const TESLA_CLIENT_SECRET = 'TESLA_CLIENT_SECRET'
const TESLA_REFRESH_TOKEN = 'TESLA_REFRESH_TOKEN'

function StepIcon({ state }: { state: StepState }) {
  if (state === 'ok') return <CheckCircle2 className="size-4" aria-hidden style={{ color: 'var(--good)' }} />
  if (state === 'warn') return <AlertCircle className="size-4" aria-hidden style={{ color: 'var(--warn)' }} />
  if (state === 'todo') return <XCircle className="size-4" aria-hidden style={{ color: 'var(--bad)' }} />
  return <Loader2 className="size-4 animate-spin" aria-hidden style={{ color: 'var(--text-3)' }} />
}

/**
 * Tesla setup checklist — diagnoses exactly which step is blocking live data.
 *
 * Tesla Fleet API needs 6 things wired together. This panel polls each step
 * and tells you what to do next.
 */
export default function TeslaSetupChecklist() {
  const [keys, setKeys] = useState<Record<string, string>>(() => getAllStoredApiKeys())
  const [virtualKey, setVirtualKey] = useState<VirtualKeyInfo | null>(null)
  const [probe, setProbe] = useState<FleetProbe | null>(null)
  const [probing, setProbing] = useState(false)
  const [oauthProbing, setOauthProbing] = useState(false)
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [partnerStatus, setPartnerStatus] = useState<'unknown' | 'registered' | 'not-registered'>('unknown')
  const [partnerBusy, setPartnerBusy] = useState(false)
  const [partnerMsg, setPartnerMsg] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const checkPartnerStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/tesla/partner-status')
      const j = (await r.json()) as { status?: string }
      if (j.status === 'registered') setPartnerStatus('registered')
      else if (j.status === 'not-registered') setPartnerStatus('not-registered')
      else setPartnerStatus('unknown')
    } catch {
      setPartnerStatus('unknown')
    }
  }, [])

  const registerPartner = useCallback(async () => {
    setPartnerBusy(true)
    setPartnerMsg(null)
    try {
      const r = await fetch('/api/tesla/partner-register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      const j = (await r.json()) as { status?: string; message?: string }
      if (j.status === 'ok') {
        setPartnerStatus('registered')
        setPartnerMsg(j.message ?? 'Registered with Tesla.')
      } else {
        setPartnerMsg(j.message ?? 'Registration failed. See network tab for details.')
      }
    } catch (e) {
      setPartnerMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setPartnerBusy(false)
    }
  }, [])

  const copy = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey(prev => (prev === key ? null : prev)), 1800)
    } catch {
      // Clipboard API may be blocked in iframes / non-secure contexts.
    }
  }, [])

  useEffect(() => subscribeApiKeys(snapshot => setKeys(snapshot)), [])

  // Tick once a second so "Last checked X seconds ago" updates without manual refresh.
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  /**
   * Re-check splits into two stages:
   *   1. FAST — refresh the local virtual-key info (single FS read on the BFF).
   *   2. SLOW — probe `/api/tesla/fleet` only to extract the `authorizeUrl`
   *      for step 5's CTA. Aborted after 6s so the button never hangs.
   * Saved-keys + refresh_token presence come from the live `keys` state
   * (already subscribed via `subscribeApiKeys`) — no fetch needed.
   */
  const refresh = useCallback(async () => {
    // Cancel any in-flight fleet probe from a previous click.
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setProbing(true)
    setOauthProbing(true)

    // STAGE 1 — fast virtual-key info read.
    try {
      const r = await fetch('/api/tesla/virtual-key/info', { signal: ctrl.signal })
      const vk = (await r.json().catch(() => null)) as VirtualKeyInfo | null
      setVirtualKey(vk)
    } catch {
      // Aborted or network error — leave previous state.
    } finally {
      setProbing(false)
      // Always bump the "last checked" timestamp so the user sees the
      // button did something even if the fleet probe is still running.
      setLastCheckedAt(Date.now())
    }

    // STAGE 2 — fleet probe with 6s timeout, only used to surface authorizeUrl.
    const timeoutId = window.setTimeout(() => ctrl.abort(), 6000)
    try {
      const r = await fetch('/api/tesla/fleet', { signal: ctrl.signal })
      const fleet = (await r.json().catch(() => null)) as FleetProbe | null
      setProbe(fleet)
    } catch {
      // Timed out or aborted — don't clobber probe state.
    } finally {
      window.clearTimeout(timeoutId)
      setOauthProbing(false)
    }

    // STAGE 3 — partner status (fire-and-forget; doesn't block UI).
    void checkPartnerStatus()
  }, [checkPartnerStatus])

  useEffect(() => {
    void refresh()
    // Don't re-fire on identity changes of refresh — it's stable via useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const clientIdSaved = (keys[TESLA_CLIENT_ID] ?? '').trim().length > 0
  const clientSecretSaved = (keys[TESLA_CLIENT_SECRET] ?? '').trim().length > 0
  const refreshTokenSaved = (keys[TESLA_REFRESH_TOKEN] ?? '').trim().length > 0
  const hostname = typeof window !== 'undefined' ? window.location.hostname : ''
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0'

  const steps: readonly Step[] = useMemo(() => {
    const list: Step[] = []

    list.push({
      id: 'virtual-key',
      num: 1,
      title: 'Virtual key generated',
      state: virtualKey?.hasKey ? 'ok' : probing ? 'pending' : 'todo',
      detail: virtualKey?.hasKey
        ? `Fingerprint ${virtualKey.fingerprint?.slice(0, 23) ?? 'unknown'}…`
        : 'Click Generate in the Virtual Key panel below.',
    })

    list.push({
      id: 'hosting',
      num: 2,
      title: 'Public key hosted on a real domain',
      state: virtualKey?.hasKey ? (isLocal ? 'warn' : 'ok') : 'pending',
      detail: isLocal
        ? `Currently serving from localhost. Tesla cannot fetch http://${hostname}/.well-known/... — deploy to your production domain (e.g. Vercel) so the .pem file is publicly reachable.`
        : `Serving from ${hostname}. Tesla will fetch https://${hostname}/.well-known/appspecific/com.tesla.3p.public-key.pem`,
      cta:
        virtualKey?.hasKey && !isLocal
          ? {
              label: 'Open hosted PEM',
              href: `https://${hostname}/.well-known/appspecific/com.tesla.3p.public-key.pem`,
              external: true,
            }
          : undefined,
    })

    list.push({
      id: 'client-id',
      num: 3,
      title: 'TESLA_CLIENT_ID saved',
      state: clientIdSaved ? 'ok' : 'todo',
      detail: clientIdSaved
        ? `Saved (last 6: …${(keys[TESLA_CLIENT_ID] ?? '').slice(-6)})`
        : 'Paste your Tesla developer-portal Client ID into the Fleet API credentials card and click Save.',
    })

    list.push({
      id: 'client-secret',
      num: 4,
      title: 'TESLA_CLIENT_SECRET saved',
      state: clientSecretSaved ? 'ok' : 'todo',
      detail: clientSecretSaved
        ? 'Saved (value hidden).'
        : 'Paste your Tesla Client Secret into the Fleet API credentials card and click Save.',
    })

    // Partner registration — Tesla REQUIRES this before OAuth + data calls work.
    // One-click action: BFF does the client_credentials grant + posts to
    // /api/1/partner_accounts. Custom render below shows the "Register" button.
    const partnerKnown = partnerStatus !== 'unknown'
    const partnerOk = partnerStatus === 'registered'
    list.push({
      id: 'partner',
      num: 5,
      title: 'Registered with Tesla as partner',
      state: !clientIdSaved || !clientSecretSaved || isLocal
        ? 'pending'
        : partnerOk
          ? 'ok'
          : partnerKnown
            ? 'todo'
            : 'pending',
      detail: !clientIdSaved || !clientSecretSaved
        ? 'Save client ID + secret first.'
        : isLocal
          ? 'Open this dashboard from the deployed domain to register.'
          : partnerOk
            ? `Domain ${hostname} is registered with Tesla. OAuth + Fleet data calls should now be accepted.`
            : partnerBusy
              ? 'Registering with Tesla…'
              : partnerMsg ??
                `One-time registration. Click the button to POST your domain (${hostname}) to /api/1/partner_accounts. Tesla will fetch the .pem file you hosted in step 2 to verify ownership.`,
    })

    // OAuth step: primarily driven by refresh_token presence in saved keys
    // (instant), with the fleet probe only used to surface authorizeUrl.
    const oauthOk = refreshTokenSaved
    const redirectUri = probe?.redirectUri ?? probe?.redirect_uri ?? ''
    list.push({
      id: 'oauth',
      num: 6,
      title: 'OAuth completed (refresh_token saved)',
      state: oauthOk
        ? 'ok'
        : !clientIdSaved || !clientSecretSaved
          ? 'pending'
          : oauthProbing
            ? 'pending'
            : 'todo',
      detail: oauthOk
        ? 'Refresh token on file. Live data should be flowing.'
        : !clientIdSaved || !clientSecretSaved
          ? 'Complete steps 3 and 4 first.'
          : oauthProbing
            ? 'Checking with Tesla…'
            : redirectUri
              ? `Before clicking Connect Tesla: open your Tesla developer-portal app and add this exact URL to Allowed Redirect URIs — ${redirectUri} — otherwise Tesla rejects the OAuth with "redirect_uri not registered".`
              : 'Click "Connect Tesla" below to start the OAuth flow. Tesla will redirect to /api/tesla/oauth/callback and the dashboard will save the refresh token.',
      cta: probe?.authorizeUrl ?? probe?.authorize_url
        ? { label: 'Connect Tesla', href: (probe?.authorizeUrl ?? probe?.authorize_url) as string, external: true }
        : undefined,
    })

    // Step 5b: insert a dedicated row for the redirect URI when we have one
    // and OAuth isn't done — surfaces the copy-paste-able URL prominently.
    if (!oauthOk && redirectUri && clientIdSaved && clientSecretSaved) {
      list.push({
        id: 'oauth-redirect-uri',
        num: 6,
        title: 'Tesla developer-portal redirect URI (copy → paste)',
        state: 'todo',
        detail: redirectUri,
      })
    }

    // Vehicle pairing (signed commands) is now OPTIONAL and lives in its own
    // panel below — it's not part of the read-only happy path.
    return list
  }, [
    virtualKey,
    probe,
    probing,
    oauthProbing,
    clientIdSaved,
    clientSecretSaved,
    refreshTokenSaved,
    isLocal,
    hostname,
    keys,
    partnerStatus,
    partnerBusy,
    partnerMsg,
  ])

  const okCount = steps.filter(s => s.state === 'ok').length
  const totalCount = steps.length
  const allOk = okCount === totalCount

  return (
    <section
      className="w-full rounded-xl border p-4 shadow-sm"
      style={{
        borderColor: allOk ? 'var(--good)' : 'var(--border-soft)',
        background: 'var(--bg-card)',
        boxShadow: 'var(--shadow-sm)',
      }}
      aria-labelledby="tesla-setup-checklist-heading"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2
            id="tesla-setup-checklist-heading"
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide"
            style={{ color: 'var(--text-3)' }}
          >
            Tesla setup — {okCount} of {totalCount} steps done
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
            Live data needs all six steps wired. Each row below tells you what to do next.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={refresh}
            disabled={probing}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 mono text-[10px] uppercase tracking-wide disabled:opacity-50"
            style={{ borderColor: 'var(--border-strong)', color: 'var(--text-2)' }}
          >
            <RefreshCw className={`size-3 ${probing ? 'animate-spin' : ''}`} aria-hidden />
            {probing ? 'Checking…' : 'Re-check'}
          </button>
          {lastCheckedAt ? (
            <span className="mono text-[9px]" style={{ color: 'var(--text-4)' }}>
              {(() => {
                const s = Math.max(0, Math.floor((nowTick - lastCheckedAt) / 1000))
                if (s < 2) return 'Checked just now'
                if (s < 60) return `Checked ${s}s ago`
                const m = Math.floor(s / 60)
                return `Checked ${m}m ago`
              })()}
              {oauthProbing ? ' · OAuth probe running…' : ''}
            </span>
          ) : null}
        </div>
      </header>

      <ol className="mt-3 space-y-2">
        {steps.map(step => (
          <li
            key={step.id}
            className="flex flex-wrap items-start gap-3 rounded-lg border px-3 py-2"
            style={{
              borderColor:
                step.state === 'ok'
                  ? 'var(--good)'
                  : step.state === 'warn'
                    ? 'var(--warn)'
                    : step.state === 'todo'
                      ? 'var(--bad)'
                      : 'var(--border-soft)',
              background:
                step.state === 'ok'
                  ? 'color-mix(in oklab, var(--good) 6%, var(--bg-card))'
                  : step.state === 'warn'
                    ? 'color-mix(in oklab, var(--warn) 6%, var(--bg-card))'
                    : step.state === 'todo'
                      ? 'color-mix(in oklab, var(--bad) 6%, var(--bg-card))'
                      : 'var(--bg-card)',
            }}
          >
            <StepIcon state={step.state} />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold" style={{ color: 'var(--text-1)' }}>
                {step.num}. {step.title}
              </p>
              {step.id === 'oauth-redirect-uri' ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <code
                    className="mono break-all rounded px-2 py-1 text-[10px]"
                    style={{ background: 'var(--bg-muted)', color: 'var(--text-1)' }}
                  >
                    {step.detail}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy('redirect-uri', step.detail)}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px]"
                    style={{ borderColor: 'var(--border-strong)', color: 'var(--text-2)' }}
                  >
                    <ClipboardCopy className="size-3" aria-hidden />
                    {copiedKey === 'redirect-uri' ? 'Copied' : 'Copy'}
                  </button>
                  <a
                    href="https://developer.tesla.com/dashboard"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px]"
                    style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                  >
                    <ExternalLink className="size-3" aria-hidden />
                    Tesla dashboard
                  </a>
                </div>
              ) : (
                <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
                  {step.detail}
                </p>
              )}
              {step.id === 'partner' && step.state === 'todo' ? (
                <button
                  type="button"
                  onClick={registerPartner}
                  disabled={partnerBusy}
                  className="mt-2 inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm disabled:opacity-50"
                  style={{ background: 'var(--accent)' }}
                >
                  {partnerBusy ? 'Registering…' : 'Register with Tesla'}
                </button>
              ) : null}
            </div>
            {step.cta ? (
              step.cta.href ? (
                <a
                  href={step.cta.href}
                  target={step.cta.external ? '_blank' : undefined}
                  rel={step.cta.external ? 'noreferrer' : undefined}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm"
                  style={{ background: 'var(--accent)' }}
                >
                  {step.cta.label}
                  {step.cta.external ? <ExternalLink className="size-3" aria-hidden /> : <ChevronRight className="size-3" aria-hidden />}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={step.cta.onClick}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm"
                  style={{ background: 'var(--accent)' }}
                >
                  {step.cta.label}
                  <ChevronRight className="size-3" aria-hidden />
                </button>
              )
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  )
}
