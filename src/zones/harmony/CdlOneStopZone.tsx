import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import { Check, Copy, ExternalLink, Truck } from 'lucide-react'

import HarmonyHtmlFrame from './HarmonyHtmlFrame'

type CdlTab = 'marketing' | 'ads'

const CDL_TAB_ORDER: CdlTab[] = ['marketing', 'ads']

/** Live Facebook ads destination — site first, then App Store on iOS. */
export const CDL_FACEBOOK_ADS_URL = 'https://harmony-stack-productions.vercel.app/cdl-get'

function tabLabel(tab: CdlTab): string {
  return tab === 'ads' ? 'Facebook ads URL' : 'Marketing page'
}

export default function CdlOneStopZone() {
  const [tab, setTab] = useState<CdlTab>('marketing')
  const [copied, setCopied] = useState(false)
  const idRoot = useId()

  const tabIds = useMemo(
    () => ({
      marketing: `${idRoot}-tab-marketing`,
      ads: `${idRoot}-tab-ads`,
    }),
    [idRoot],
  )
  const panelIds = useMemo(
    () => ({
      marketing: `${idRoot}-panel-marketing`,
      ads: `${idRoot}-panel-ads`,
    }),
    [idRoot],
  )

  function focusTabButton(next: CdlTab) {
    const el = document.getElementById(tabIds[next])
    if (el instanceof HTMLElement) el.focus()
  }

  function handleTabListKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const cur = CDL_TAB_ORDER.indexOf(tab)
    if (cur < 0) return
    let next: CdlTab | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      next = CDL_TAB_ORDER[(cur + 1) % CDL_TAB_ORDER.length]!
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      next = CDL_TAB_ORDER[(cur - 1 + CDL_TAB_ORDER.length) % CDL_TAB_ORDER.length]!
    } else if (e.key === 'Home') {
      next = CDL_TAB_ORDER[0]!
    } else if (e.key === 'End') {
      next = CDL_TAB_ORDER[CDL_TAB_ORDER.length - 1]!
    }
    if (!next) return
    e.preventDefault()
    setTab(next)
    requestAnimationFrame(() => focusTabButton(next))
  }

  async function copyAdsUrl() {
    try {
      await navigator.clipboard.writeText(CDL_FACEBOOK_ADS_URL)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="zone-canvas flex min-h-0 flex-1 flex-col">
      <header className="zone-topbar flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            <Truck size={12} />
          </div>
          <span className="truncate text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>
            CDL One Stop
          </span>
          <span
            className="mono hidden shrink-0 rounded px-2 py-0.5 text-[10px] sm:inline-flex"
            style={{ background: 'var(--good-soft)', color: 'var(--good)' }}
          >
            ● LIVE
          </span>
        </div>
      </header>

      <div className="zone-inner flex min-h-0 min-w-0 flex-1 flex-col p-0">
        <div
          role="tabpanel"
          id={panelIds.marketing}
          aria-labelledby={tabIds.marketing}
          hidden={tab !== 'marketing'}
          className={tab === 'marketing' ? 'flex min-h-0 min-w-0 flex-1 flex-col' : undefined}
        >
          {tab === 'marketing' ? (
            <HarmonyHtmlFrame
              file="cdl-marketing.html"
              title="CDL One Stop — CDL practice app marketing"
            />
          ) : null}
        </div>

        <div
          role="tabpanel"
          id={panelIds.ads}
          aria-labelledby={tabIds.ads}
          hidden={tab !== 'ads'}
          className={tab === 'ads' ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-auto p-5' : undefined}
        >
          {tab === 'ads' ? (
            <div
              className="mx-auto flex w-full max-w-[640px] flex-col gap-4 rounded-xl p-5"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <div>
                <p
                  className="text-[12px] font-semibold"
                  style={{ color: 'var(--text-3)' }}
                >
                  Facebook ads destination
                </p>
                <h2 className="mt-1 text-[18px] font-semibold" style={{ color: 'var(--text-1)' }}>
                  App Store trigger page
                </h2>
                <p className="mt-2 text-[13px] leading-snug" style={{ color: 'var(--text-2)' }}>
                  Paste this into Facebook Ads as the website URL. People land on your site first, then iPhone, iPad, and Mac open the App Store.
                </p>
              </div>

              <label className="flex flex-col gap-1.5" htmlFor={`${idRoot}-ads-url`}>
                <span className="text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>
                  Saved ads URL
                </span>
                <input
                  id={`${idRoot}-ads-url`}
                  readOnly
                  value={CDL_FACEBOOK_ADS_URL}
                  onFocus={e => e.currentTarget.select()}
                  className="w-full rounded-lg px-3 py-2.5 text-[13px]"
                  style={{
                    background: 'var(--bg-muted)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-1)',
                  }}
                />
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copyAdsUrl()}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold"
                  style={{
                    background: 'var(--accent)',
                    color: 'white',
                  }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Copied' : 'Copy URL'}
                </button>
                <a
                  href={CDL_FACEBOOK_ADS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-medium"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-1)', background: 'var(--bg-card)' }}
                >
                  <ExternalLink size={14} />
                  Open page
                </a>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div
        role="tablist"
        aria-label="CDL One Stop pages"
        onKeyDown={handleTabListKeyDown}
        className="flex shrink-0 items-center gap-0.5 border-t px-3 py-2"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        {CDL_TAB_ORDER.map(t => {
          const isActive = t === tab
          return (
            <button
              key={t}
              type="button"
              role="tab"
              id={tabIds[t]}
              aria-selected={isActive}
              aria-controls={panelIds[t]}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setTab(t)}
              className="rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors"
              style={{
                color: isActive ? 'var(--text-1)' : 'var(--text-3)',
                background: isActive ? 'var(--bg-muted)' : 'transparent',
                boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {tabLabel(t)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
