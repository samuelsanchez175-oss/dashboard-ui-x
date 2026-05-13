import { useCallback, useEffect, useState } from 'react'
import { ClipboardCopy, ExternalLink, KeyRound, ShieldCheck } from 'lucide-react'

type VirtualKeyInfo = {
  hasKey: boolean
  publicKeyPem: string | null
  fingerprint: string | null
  createdAt: string | null
  publicPemPath: string
}

const ENV_DOMAIN = (import.meta.env.VITE_TESLA_VIRTUAL_KEY_DOMAIN ?? '').trim()

/**
 * Pick a sensible default domain.
 * - If `VITE_TESLA_VIRTUAL_KEY_DOMAIN` is set, use it.
 * - Otherwise fall back to the page's hostname (e.g. `dashboard-ui-delta.vercel.app`),
 *   so the pairing URL looks right out of the box.
 * - Skip localhost — Tesla can't fetch the public key from localhost, and the
 *   pairing URL `https://www.tesla.com/_ak/localhost` is invalid.
 */
function defaultDomain(): string {
  if (ENV_DOMAIN) return ENV_DOMAIN
  if (typeof window === 'undefined') return ''
  const host = window.location.hostname
  if (!host || host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return ''
  return host
}

/**
 * Tesla Virtual Key pairing panel.
 *
 * Lets the user generate a P-256 keypair (server-side), inspect the public-key
 * fingerprint, and copy the Tesla pairing URL — `https://www.tesla.com/_ak/<domain>` —
 * which they open on their phone with the Tesla app installed. Tesla then
 * fetches the public key from `https://<domain>/.well-known/appspecific/com.tesla.3p.public-key.pem`
 * (the BFF writes that file to `public/` when the key is generated).
 *
 * Signed commands need this; REST commands (lock/unlock/honk/flash/climate)
 * work without it on older fleet vehicles.
 */
export default function TeslaVirtualKeyPairing() {
  const [info, setInfo] = useState<VirtualKeyInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState<'url' | 'pem' | 'fp' | null>(null)
  const [domain, setDomain] = useState<string>(defaultDomain())

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/tesla/virtual-key/info')
      const json = (await r.json()) as VirtualKeyInfo & { status?: string; message?: string }
      if (json.status && json.status !== 'ok') {
        setError(json.message ?? 'Could not read virtual key state.')
        setInfo(null)
        return
      }
      setInfo(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const generate = useCallback(async () => {
    setGenerating(true)
    setError(null)
    try {
      const r = await fetch('/api/tesla/virtual-key/generate', { method: 'POST' })
      const json = (await r.json()) as VirtualKeyInfo & { status?: string; message?: string }
      if (json.status && json.status !== 'ok') {
        setError(json.message ?? 'Generate failed.')
        return
      }
      setInfo(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
    }
  }, [])

  const copy = useCallback(async (kind: 'url' | 'pem' | 'fp', text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 1800)
    } catch {
      // Clipboard API may be unavailable in non-secure contexts.
      setError('Clipboard unavailable in this browser context.')
    }
  }, [])

  const pairingUrl = domain ? `https://www.tesla.com/_ak/${domain}` : null
  const wellKnownUrl = domain
    ? `https://${domain}/.well-known/appspecific/com.tesla.3p.public-key.pem`
    : null

  return (
    <section
      className="w-full rounded-xl border p-4 shadow-sm"
      style={{
        borderColor: 'var(--border-soft)',
        background: 'var(--bg-card)',
        boxShadow: 'var(--shadow-sm)',
      }}
      aria-labelledby="tesla-pairing-heading"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2
            id="tesla-pairing-heading"
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide"
            style={{ color: 'var(--text-3)' }}
          >
            <KeyRound className="size-3.5" aria-hidden style={{ color: 'var(--accent)' }} />
            Tesla virtual key (vehicle command signing)
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
            Generates a P-256 keypair, publishes the public key at{' '}
            <code className="mono rounded px-1 text-[10px]" style={{ background: 'var(--bg-muted)', color: 'var(--text-1)' }}>
              /.well-known/appspecific/com.tesla.3p.public-key.pem
            </code>
            , and gives you a pairing link to open on your phone. Required by newer cars; REST commands (lock/unlock/honk/flash/climate) work without it on older vehicles.
          </p>
        </div>
        {info?.hasKey ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 mono text-[10px] font-semibold uppercase tracking-wide"
            style={{ borderColor: 'var(--good)', color: 'var(--good)' }}
          >
            <ShieldCheck className="size-3" aria-hidden /> Key on file
          </span>
        ) : null}
      </header>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-md border px-3 py-2 text-[11px]"
          style={{ borderColor: 'var(--bad)', color: 'var(--bad)', background: 'var(--bad-soft)' }}
        >
          {error}
        </p>
      ) : null}

      <div className="mt-4 grid gap-3">
        <div>
          <label
            htmlFor="tesla-pairing-domain"
            className="block mono text-[9px] uppercase tracking-wide"
            style={{ color: 'var(--text-3)' }}
          >
            Public-key hosting domain
          </label>
          <input
            id="tesla-pairing-domain"
            type="text"
            placeholder="samuel-x-dashboard.example.com"
            value={domain}
            onChange={e => setDomain(e.target.value.trim())}
            className="mt-1 w-full rounded-md border px-2.5 py-1.5 text-[12px] outline-none focus:ring-2"
            style={{
              borderColor: 'var(--border-strong)',
              background: 'var(--bg-card)',
              color: 'var(--text-1)',
            }}
          />
          {!ENV_DOMAIN ? (
            <p className="mt-1 text-[10px]" style={{ color: 'var(--text-4)' }}>
              Auto-filled from the current hostname. Set <code className="mono">VITE_TESLA_VIRTUAL_KEY_DOMAIN</code> in <code className="mono">.env.local</code> to lock it.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={generate}
            disabled={generating || loading}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            <KeyRound className="size-3.5" aria-hidden />
            {info?.hasKey ? 'Re-show key info' : generating ? 'Generating…' : 'Generate virtual key'}
          </button>
          {info?.hasKey ? (
            <span className="mono text-[10px]" style={{ color: 'var(--text-3)' }}>
              Generated {info.createdAt ? new Date(info.createdAt).toLocaleString() : 'recently'}
            </span>
          ) : null}
        </div>

        {info?.hasKey && info.fingerprint ? (
          <div className="space-y-1">
            <p className="mono text-[9px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
              Public key SHA-256 fingerprint
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code
                className="mono break-all rounded px-2 py-1 text-[10px]"
                style={{ background: 'var(--bg-muted)', color: 'var(--text-1)' }}
              >
                {info.fingerprint}
              </code>
              <button
                type="button"
                onClick={() => copy('fp', info.fingerprint ?? '')}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px]"
                style={{ borderColor: 'var(--border-strong)', color: 'var(--text-2)' }}
              >
                <ClipboardCopy className="size-3" aria-hidden />
                {copied === 'fp' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        ) : null}

        {info?.hasKey && wellKnownUrl ? (
          <div className="space-y-1">
            <p className="mono text-[9px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
              Hosted public-key URL (Tesla fetches this)
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={wellKnownUrl}
                target="_blank"
                rel="noreferrer"
                className="mono break-all text-[10px] underline decoration-dotted underline-offset-2"
                style={{ color: 'var(--accent)' }}
              >
                {wellKnownUrl}
              </a>
              <ExternalLink className="size-3 shrink-0" aria-hidden style={{ color: 'var(--text-3)' }} />
            </div>
          </div>
        ) : null}

        {info?.hasKey && pairingUrl ? (
          <div className="space-y-1">
            <p className="mono text-[9px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
              Open on your phone (Tesla app installed) to pair
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code
                className="mono break-all rounded px-2 py-1 text-[10px]"
                style={{ background: 'var(--bg-muted)', color: 'var(--accent)' }}
              >
                {pairingUrl}
              </code>
              <button
                type="button"
                onClick={() => copy('url', pairingUrl)}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px]"
                style={{ borderColor: 'var(--border-strong)', color: 'var(--text-2)' }}
              >
                <ClipboardCopy className="size-3" aria-hidden />
                {copied === 'url' ? 'Copied' : 'Copy'}
              </button>
              <a
                href={pairingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px]"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
              >
                <ExternalLink className="size-3" aria-hidden />
                Open
              </a>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
