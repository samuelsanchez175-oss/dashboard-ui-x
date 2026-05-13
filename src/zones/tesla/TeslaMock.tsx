import { useEffect, useMemo, useRef, useState } from 'react'
import { Car, Eye, EyeOff, FlaskConical } from 'lucide-react'
import ZoneHeader from '../../components/ZoneHeader'
import { useMockData } from '../../context/MockDataContext'
import { CONTAINERS } from '../../lib/design-tokens'
import { getAllStoredApiKeys, getApiKey, setApiKey, subscribeApiKeys } from '../../lib/api-keys'
import { isTeslaFleetLiveCredentialPair } from './tesla-fleet-credentials'
import { TeslaFleetGroundTruthChecklist } from './TeslaFleetGroundTruth'
import { TeslaFleetVisuals } from './TeslaFleetVisuals'
import TeslaSetupChecklist from './TeslaSetupChecklist'
import TeslaVirtualKeyPairing from './TeslaVirtualKeyPairing'
import { useTeslaFleetData } from './useTeslaFleetData'

/** Same env names as Settings & API keys → `dev-settings-env-scratch:*` + `x-user-key-*` via `fetchWithKeys`. */
const TESLA_CLIENT_ID = 'TESLA_CLIENT_ID' as const
const TESLA_CLIENT_SECRET = 'TESLA_CLIENT_SECRET' as const

export default function TeslaMock() {
  const dirtyRef = useRef(false)
  const [stored, setStored] = useState<Record<string, string>>(() => getAllStoredApiKeys())
  const [draftId, setDraftId] = useState(() => getApiKey(TESLA_CLIENT_ID))
  const [draftSecret, setDraftSecret] = useState(() => getApiKey(TESLA_CLIENT_SECRET))
  const [revealSecret, setRevealSecret] = useState(false)
  const [saveBanner, setSaveBanner] = useState<'idle' | 'saved'>('idle')

  const fleet = useTeslaFleetData()
  const { mockDataEnabled, toggleMockData } = useMockData()

  useEffect(
    () =>
      subscribeApiKeys(snapshot => {
        setStored(snapshot)
        if (!dirtyRef.current) {
          setDraftId(snapshot[TESLA_CLIENT_ID] ?? '')
          setDraftSecret(snapshot[TESLA_CLIENT_SECRET] ?? '')
        }
      }),
    [],
  )

  const persistedId = stored[TESLA_CLIENT_ID] ?? ''
  const persistedSecret = stored[TESLA_CLIENT_SECRET] ?? ''
  const idSet = persistedId.trim().length > 0
  const secretSet = persistedSecret.trim().length > 0
  const livePair = isTeslaFleetLiveCredentialPair(persistedId, persistedSecret)
  const bothFilled = idSet && secretSet
  const saveDisabled = draftId === persistedId && draftSecret === persistedSecret

  const connectionBadge = useMemo(() => {
    if (fleet.status === 'needs_authorization') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900">
          <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
          OAuth required
        </span>
      )
    }
    if (fleet.status === 'error') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-900">
          <span className="size-1.5 rounded-full bg-red-500" aria-hidden />
          Fleet error
        </span>
      )
    }
    if (livePair) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-900">
          <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
          Live data
        </span>
      )
    }
    if (bothFilled) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900">
          <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
          Saved keys (not live-ready)
        </span>
      )
    }
    if (idSet || secretSet) {
      return (
        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900">
          Incomplete credentials
        </span>
      )
    }
    return (
      <span
        className="inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium"
        style={{
          borderColor: 'var(--border-soft)',
          background: 'var(--bg-card-soft)',
          color: 'var(--text-2)',
        }}
      >
        Demo vehicle
      </span>
    )
  }, [fleet.status, livePair, bothFilled, idSet, secretSet])

  function handleSaveScratch() {
    setApiKey(TESLA_CLIENT_ID, draftId)
    setApiKey(TESLA_CLIENT_SECRET, draftSecret)
    dirtyRef.current = false
    setSaveBanner('saved')
    window.setTimeout(() => setSaveBanner('idle'), 2800)
  }

  return (
    <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-canvas)', color: 'var(--text-1)' }}>
      <div className={`${CONTAINERS.page} space-y-8 pt-8 pb-16`}>
        <div className="flex flex-col gap-4">
          <ZoneHeader
            title="Tesla Fleet"
            icon={Car}
            description="Scratch keys + dev BFF: GET /api/tesla/fleet pulls live Fleet data when a refresh token is saved; without it, use Connect Tesla to complete OAuth once."
            actions={
              <>
                {connectionBadge}
                <button
                  type="button"
                  onClick={() => toggleMockData()}
                  aria-pressed={mockDataEnabled}
                  aria-label={mockDataEnabled ? 'Mock data on, click to turn off' : 'Mock data off, click to turn on'}
                  title={mockDataEnabled ? 'Turn off mock/sample data for the dashboard' : 'Turn on mock/sample data for the dashboard'}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg-canvas)]"
                  style={
                    mockDataEnabled
                      ? {
                          background: 'color-mix(in oklab, var(--accent) 14%, var(--bg-card))',
                          borderColor: 'var(--accent)',
                          color: 'var(--accent)',
                        }
                      : {
                          background: 'var(--bg-card)',
                          borderColor: 'var(--border-strong)',
                          color: 'var(--text-2)',
                        }
                  }
                >
                  <FlaskConical className="size-3.5 shrink-0" aria-hidden />
                  {mockDataEnabled ? 'Mock data: ON' : 'Mock data: OFF'}
                </button>
              </>
            }
          />

          <TeslaSetupChecklist />

          <TeslaVirtualKeyPairing />

          <section
            className="w-full rounded-xl border p-4 shadow-sm"
            style={{
              borderColor: 'var(--border-soft)',
              background: 'var(--bg-card)',
              boxShadow: 'var(--shadow-sm)',
            }}
            aria-labelledby="tesla-creds-heading"
          >
            <h2
              id="tesla-creds-heading"
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-3)' }}
            >
              Fleet API credentials (this browser)
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
              Same scratch storage as <span className="font-medium" style={{ color: 'var(--text-2)' }}>Settings &amp; API keys</span> (
              <code
                className="mono rounded px-1 font-mono text-[10px]"
                style={{ background: 'var(--bg-muted)', color: 'var(--text-1)' }}
              >
                dev-settings-env-scratch:
              </code>
              ). Edit below, then <span className="font-medium" style={{ color: 'var(--text-2)' }}>Save to scratch</span>{' '}
              — values appear on the Settings page as{' '}
              <code
                className="mono rounded px-1 font-mono text-[10px]"
                style={{ background: 'var(--bg-muted)', color: 'var(--text-1)' }}
              >
                {TESLA_CLIENT_ID}
              </code>{' '}
              /{' '}
              <code
                className="mono rounded px-1 font-mono text-[10px]"
                style={{ background: 'var(--bg-muted)', color: 'var(--text-1)' }}
              >
                {TESLA_CLIENT_SECRET}
              </code>{' '}
              and are sent on{' '}
              <code className="rounded px-1 font-mono text-[10px]" style={{ background: 'var(--bg-muted)', color: 'var(--text-1)' }}>
                /api/*
              </code>{' '}
              as{' '}
              <code className="mono rounded px-1 font-mono text-[10px]" style={{ background: 'var(--bg-muted)', color: 'var(--text-1)' }}>
                x-user-key-*
              </code>{' '}
              when the dev BFF reads them.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block min-w-0">
                <span className="mb-1 block text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>
                  Client ID
                </span>
                <input
                  type="text"
                  value={draftId}
                  onChange={e => {
                    dirtyRef.current = true
                    setDraftId(e.target.value)
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste Tesla / third-party client id…"
                  className="w-full rounded-lg border px-3 py-2 font-mono text-xs outline-none ring-violet-500/30 transition focus:border-violet-400 focus:ring-2"
                  style={{
                    borderColor: 'var(--border-soft)',
                    background: 'color-mix(in oklab, var(--bg-card-soft) 80%, transparent)',
                    color: 'var(--text-1)',
                  }}
                />
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>
                  Client secret
                </span>
                <div className="relative">
                  <input
                    type={revealSecret ? 'text' : 'password'}
                    value={draftSecret}
                    onChange={e => {
                      dirtyRef.current = true
                      setDraftSecret(e.target.value)
                    }}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Paste client secret…"
                    className="w-full rounded-lg border py-2 pl-3 pr-10 font-mono text-xs outline-none ring-violet-500/30 transition focus:border-violet-400 focus:ring-2"
                    style={{
                      borderColor: 'var(--border-soft)',
                      background: 'color-mix(in oklab, var(--bg-card-soft) 80%, transparent)',
                      color: 'var(--text-1)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setRevealSecret(v => !v)}
                    className="absolute inset-y-0 right-0 grid w-10 place-items-center text-[color:var(--text-3)] transition-colors hover:text-[color:var(--text-1)]"
                    aria-label={revealSecret ? 'Hide secret' : 'Show secret'}
                    title={revealSecret ? 'Hide' : 'Show'}
                  >
                    {revealSecret ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                  </button>
                </div>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSaveScratch}
                className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700"
              >
                {saveDisabled ? 'Re-save' : 'Save to scratch'}
              </button>
              {saveBanner === 'saved' ? (
                <span className="text-xs font-medium" style={{ color: 'var(--good)' }} role="status">
                  Saved — visible under Settings &amp; API keys (Tesla Fleet)
                </span>
              ) : saveDisabled && idSet && secretSet ? (
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                  Already saved · click Re-save to overwrite
                </span>
              ) : null}
            </div>
          </section>
        </div>

        <TeslaFleetVisuals
          loading={fleet.loading}
          isDemoData={fleet.isDemoData}
          status={fleet.status}
          liveFallbackToDemo={fleet.liveFallbackToDemo}
          lastError={fleet.lastError}
          authorizeUrl={fleet.authorizeUrl}
          units={fleet.units}
          vehicles={fleet.vehicles}
          kpis={fleet.kpis}
          charging={fleet.charging}
          telemetry={fleet.telemetry}
          socSeriesByVehicle={fleet.socSeriesByVehicle}
          lastTripRoute={fleet.lastTripRoute}
        />

        <TeslaFleetGroundTruthChecklist />
      </div>
    </div>
  )
}
