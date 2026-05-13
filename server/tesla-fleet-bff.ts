/**
 * Dev BFF: Tesla Fleet API proxy (OAuth + vehicle reads).
 * Secrets arrive only via `x-user-key-*` headers from fetchWithKeys — never logged.
 */

import { randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { generateVirtualKey, getVirtualKeyInfo } from './tesla-virtual-key'

const TESLA_AUTH_AUTHORIZE = 'https://auth.tesla.com/oauth2/v3/authorize'
const TESLA_AUTH_TOKEN = 'https://auth.tesla.com/oauth2/v3/token'

const DEFAULT_REDIRECT = 'http://localhost:5175/api/tesla/oauth/callback'

/**
 * Build the redirect URI for the current request — auto-detects the actual
 * host so OAuth works on localhost AND any deployed domain (Vercel, custom
 * domain, tunnel, etc.) without manual configuration.
 *
 * Precedence:
 *   1. `x-user-key-tesla-redirect-uri` header (Settings override)
 *   2. `TESLA_REDIRECT_URI` env var (server-side pin)
 *   3. Auto-detect: `${x-forwarded-proto || 'http'}://${host}/api/tesla/oauth/callback`
 *   4. Fall back to the localhost dev default
 *
 * **The chosen URI must be registered verbatim in your Tesla developer portal**
 * as an Allowed Redirect URI. Mismatch → Tesla returns
 * `"The 'redirect_uri' supplied is not registered for this 'client_id'"`.
 */
function resolveRedirectUri(req: IncomingMessage, env: NodeJS.ProcessEnv): string {
  const headerOverride = pickHeader(req, 'TESLA_REDIRECT_URI')
  if (headerOverride) return headerOverride
  const envOverride = env.TESLA_REDIRECT_URI
  if (envOverride) return envOverride
  const host = (req.headers.host ?? '').trim()
  if (host) {
    const fwdProto = req.headers['x-forwarded-proto']
    const proto = typeof fwdProto === 'string'
      ? fwdProto.split(',')[0]!.trim()
      : Array.isArray(fwdProto)
        ? fwdProto[0] ?? 'http'
        : host.startsWith('localhost') || host.startsWith('127.0.0.1')
          ? 'http'
          : 'https'
    return `${proto}://${host}/api/tesla/oauth/callback`
  }
  return DEFAULT_REDIRECT
}
const OAUTH_SCOPE =
  'openid offline_access vehicle_device_data vehicle_cmds vehicle_charging_cmds'

type TokenCacheEntry = { accessToken: string; expiresAtMs: number }
const accessTokenByClientId = new Map<string, TokenCacheEntry>()

function jsonRes(res: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', Buffer.byteLength(body))
  res.end(body)
}

function htmlRes(res: ServerResponse, status: number, html: string) {
  const body = Buffer.from(html, 'utf8')
  res.statusCode = status
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Content-Length', body.length)
  res.end(body)
}

function pathnameOnly(url: string | undefined): string {
  if (!url) return '/'
  try {
    return new URL(url, 'http://localhost').pathname
  } catch {
    return '/'
  }
}

function pickHeader(req: IncomingMessage, envKey: string): string {
  const headerName = `x-user-key-${envKey.toLowerCase().replace(/_/g, '-')}`
  const raw = req.headers[headerName]
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (Array.isArray(raw) && raw[0]?.trim()) return raw[0]!.trim()
  return ''
}

function randomHex(n = 16): string {
  return randomBytes(n).toString('hex')
}

function fleetHostForRegion(regionRaw: string): string {
  const r = regionRaw.trim().toLowerCase() === 'eu' ? 'eu' : 'na'
  return `https://fleet-api.prd.${r}.vn.cloud.tesla.com`
}

function errPayload(message: string, err: unknown): { status: 'error'; message: string; detail: string } {
  const detail =
    err instanceof Error
      ? `${err.name}: ${err.message}${err.stack ? `\n${err.stack.slice(0, 800)}` : ''}`
      : String(err)
  return { status: 'error', message, detail }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return null
  return JSON.parse(raw) as unknown
}

async function postForm(url: string, fields: Record<string, string>): Promise<{ ok: true; json: unknown } | { ok: false; status: number; text: string }> {
  const body = new URLSearchParams(fields).toString()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': 'UI-Dashboard-X/0.1 (dev; Tesla token)',
    },
    body,
  })
  const text = await res.text()
  if (!res.ok) return { ok: false, status: res.status, text: text.slice(0, 500) }
  try {
    return { ok: true, json: JSON.parse(text) as unknown }
  } catch {
    return { ok: false, status: res.status, text: text.slice(0, 500) }
  }
}

function parseTokenResponse(json: unknown): { access_token: string; expires_in?: number } | null {
  if (!json || typeof json !== 'object') return null
  const o = json as Record<string, unknown>
  const at = o.access_token
  if (typeof at !== 'string' || !at) return null
  const ei = o.expires_in
  return {
    access_token: at,
    expires_in: typeof ei === 'number' ? ei : undefined,
  }
}

function parseRefreshFromTokenResponse(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null
  const rt = (json as Record<string, unknown>).refresh_token
  return typeof rt === 'string' && rt ? rt : null
}

async function getAccessTokenCached(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ ok: true; accessToken: string } | { ok: false; message: string; detail?: string }> {
  const now = Date.now()
  const cached = accessTokenByClientId.get(clientId)
  if (cached && cached.expiresAtMs > now + 15_000) {
    return { ok: true, accessToken: cached.accessToken }
  }

  const tr = await postForm(TESLA_AUTH_TOKEN, {
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  })
  if (!tr.ok) {
    return {
      ok: false,
      message: `Tesla token refresh failed (HTTP ${tr.status}).`,
      detail: tr.text,
    }
  }
  const parsed = parseTokenResponse(tr.json)
  if (!parsed) {
    return { ok: false, message: 'Tesla token response missing access_token.', detail: JSON.stringify(tr.json).slice(0, 400) }
  }
  const ttlMs = Math.min(Math.max((parsed.expires_in ?? 300) * 1000, 60_000), 300_000)
  accessTokenByClientId.set(clientId, { accessToken: parsed.access_token, expiresAtMs: now + ttlMs })
  return { ok: true, accessToken: parsed.access_token }
}

function invalidateAccessTokenCache(clientId: string) {
  accessTokenByClientId.delete(clientId)
}

async function fleetGetJson(
  fleetBase: string,
  pathWithQuery: string,
  accessToken: string,
): Promise<{ ok: true; status: number; json: unknown } | { ok: false; status: number; text: string }> {
  const url = `${fleetBase}${pathWithQuery}`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'User-Agent': 'UI-Dashboard-X/0.1 (dev; Tesla Fleet)',
    },
  })
  const text = await res.text()
  if (!res.ok) return { ok: false, status: res.status, text: text.slice(0, 800) }
  try {
    return { ok: true, status: res.status, json: JSON.parse(text) as unknown }
  } catch {
    return { ok: false, status: res.status, text: text.slice(0, 200) }
  }
}

/** POST counterpart to fleetGetJson — used for wake_up + future command endpoints. */
async function fleetPostJson(
  fleetBase: string,
  pathWithQuery: string,
  accessToken: string,
  body: unknown = {},
): Promise<{ ok: true; status: number; json: unknown } | { ok: false; status: number; text: string }> {
  const url = `${fleetBase}${pathWithQuery}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'UI-Dashboard-X/0.1 (dev; Tesla Fleet)',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) return { ok: false, status: res.status, text: text.slice(0, 800) }
  try {
    return { ok: true, status: res.status, json: JSON.parse(text) as unknown }
  } catch {
    return { ok: false, status: res.status, text: text.slice(0, 200) }
  }
}

const WAKE_POLL_DELAY_MS = 2000
const WAKE_MAX_POLLS = 5

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Wake a sleeping vehicle then poll until it reports `online`, up to ~10s.
 * Mirrors the Tesla iOS app pattern: `POST .../wake_up`, then poll the vehicles
 * list until state flips to `online`. Returns `true` when the vehicle is awake.
 */
async function wakeVehicle(
  fleetBase: string,
  vehicleId: string,
  accessToken: string,
): Promise<boolean> {
  const wakeRes = await fleetPostJson(
    fleetBase,
    `/api/1/vehicles/${encodeURIComponent(vehicleId)}/wake_up`,
    accessToken,
  )
  if (!wakeRes.ok) return false
  for (let i = 0; i < WAKE_MAX_POLLS; i++) {
    await sleep(WAKE_POLL_DELAY_MS)
    const probe = await fleetGetJson(
      fleetBase,
      `/api/1/vehicles/${encodeURIComponent(vehicleId)}`,
      accessToken,
    )
    if (probe.ok) {
      const inner = unwrapFleetResponse(probe.json) as { state?: unknown } | null
      if (inner && typeof inner === 'object' && inner.state === 'online') return true
    }
  }
  return false
}

function unwrapFleetResponse(json: unknown): unknown {
  if (json && typeof json === 'object' && 'response' in json) {
    return (json as { response: unknown }).response
  }
  return json
}

type VehicleSummary = {
  id: string | number
  vin?: string
  display_name?: string
  state?: string
}

function parseVehicleList(json: unknown): VehicleSummary[] {
  const inner = unwrapFleetResponse(json)
  if (!Array.isArray(inner)) return []
  return inner
    .map((row): VehicleSummary | null => {
      if (!row || typeof row !== 'object') return null
      const o = row as Record<string, unknown>
      const id = o.id
      if (typeof id !== 'number' && typeof id !== 'string') return null
      return {
        id,
        vin: typeof o.vin === 'string' ? o.vin : undefined,
        display_name: typeof o.display_name === 'string' ? o.display_name : undefined,
        state: typeof o.state === 'string' ? o.state : undefined,
      }
    })
    .filter((x): x is VehicleSummary => x != null)
}

function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32
}

/** Heuristic: Fleet REST typically reports interior temp in °C (two-digit); already-Fahrenheit reads huge. */
function interiorTempFahrenheit(raw: unknown): number | null {
  if (raw == null || typeof raw !== 'number' || Number.isNaN(raw)) return null
  if (raw > 85) return raw
  return celsiusToFahrenheit(raw)
}

function buildAuthorizeUrl(params: {
  clientId: string
  redirectUri: string
  state: string
}): string {
  const u = new URL(TESLA_AUTH_AUTHORIZE)
  u.searchParams.set('client_id', params.clientId)
  u.searchParams.set('redirect_uri', params.redirectUri)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', OAUTH_SCOPE)
  u.searchParams.set('state', params.state)
  return u.toString()
}

function oauthCallbackHtml(): string {
  const eventName = 'dashboard:api-keys-changed'
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tesla OAuth — Dashboard</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem; background: #0b0b10; color: #e8e8ef; }
    a { color: #a78bfa; }
    .box { max-width: 520px; padding: 1.25rem; border: 1px solid #2a2a35; border-radius: 12px; background: #12121a; }
    pre { white-space: pre-wrap; word-break: break-all; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="box">
    <h1 style="font-size:1.1rem;margin:0 0 0.5rem">Tesla connection</h1>
    <p id="msg" style="margin:0;font-size:14px">Finishing sign-in…</p>
    <pre id="detail" style="margin-top:1rem"></pre>
    <p style="margin-top:1rem;font-size:13px"><a href="/">← Back to dashboard</a></p>
  </div>
  <script>
    (function () {
      var msg = document.getElementById('msg');
      var detail = document.getElementById('detail');
      var prefix = ${JSON.stringify('dev-settings-env-scratch:')};
      var rtKey = ${JSON.stringify('TESLA_REFRESH_TOKEN')};
      var eventName = ${JSON.stringify(eventName)};

      function setError(text, extra) {
        msg.textContent = 'Could not complete Tesla sign-in.';
        detail.textContent = (text || '') + (extra ? ('\\n' + extra) : '');
      }

      var qs = new URLSearchParams(window.location.search);
      var code = qs.get('code');
      var state = qs.get('state');
      if (!code) {
        setError('Missing ?code= in redirect URL. Start again from the Tesla Fleet zone.');
        return;
      }

      function headerName(envKey) {
        return 'x-user-key-' + envKey.toLowerCase().replace(/_/g, '-');
      }

      var clientId = localStorage.getItem(prefix + 'TESLA_CLIENT_ID') || '';
      var clientSecret = localStorage.getItem(prefix + 'TESLA_CLIENT_SECRET') || '';
      var redirectUri = window.location.origin + window.location.pathname;

      if (!clientId || !clientSecret) {
        setError('Missing TESLA_CLIENT_ID / TESLA_CLIENT_SECRET in this browser scratch storage.', 'Open the dashboard Tesla Fleet page, paste keys, Save to scratch, then retry OAuth.');
        return;
      }

      fetch('/api/tesla/exchange-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          [headerName('TESLA_CLIENT_ID')]: clientId,
          [headerName('TESLA_CLIENT_SECRET')]: clientSecret,
        },
        body: JSON.stringify({ code: code, redirect_uri: redirectUri, state: state }),
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          var j = x.j || {};
          if (j.status === 'ok' && j.refresh_token) {
            localStorage.setItem(prefix + rtKey, String(j.refresh_token));
            try { window.dispatchEvent(new CustomEvent(eventName)); } catch (e) {}
            msg.innerHTML = 'Connected! Your refresh token was saved in this browser. <strong>Close this tab</strong> and refresh the <a href="/">Tesla Fleet</a> zone.';
            detail.textContent = '';
            return;
          }
          setError(j.message || 'Exchange failed', j.detail || '');
        })
        .catch(function (e) {
          setError(e && e.message ? e.message : String(e));
        });
    })();
  </script>
</body>
</html>`
}

async function handleGetFleet(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const clientId = pickHeader(req, 'TESLA_CLIENT_ID')
    const clientSecret = pickHeader(req, 'TESLA_CLIENT_SECRET')
    const refreshToken = pickHeader(req, 'TESLA_REFRESH_TOKEN')
    const vinFilter = pickHeader(req, 'TESLA_VIN').toUpperCase()
    const region = pickHeader(req, 'TESLA_REGION') || 'na'
    const redirectUri = resolveRedirectUri(req, process.env)

    if (!clientId || !clientSecret) {
      jsonRes(res, 200, {
        status: 'error',
        message: 'Tesla Fleet client ID and client secret are required (scratch keys TESLA_CLIENT_ID / TESLA_CLIENT_SECRET).',
        detail: 'missing_client_credentials',
      })
      return
    }

    if (!refreshToken) {
      const state = randomHex(12)
      const authorizeUrl = buildAuthorizeUrl({ clientId, redirectUri, state })
      jsonRes(res, 200, {
        status: 'needs_authorization',
        authorizeUrl,
        redirectUri,
        oauthState: state,
        message:
          'Tesla user authorization required. Visit authorizeUrl to grant access and store the resulting refresh_token in scratch key TESLA_REFRESH_TOKEN. The redirectUri above MUST be registered in your Tesla developer portal as an Allowed Redirect URI for this client_id.',
      })
      return
    }

    const fleetBase = fleetHostForRegion(region)

    let access = await getAccessTokenCached(clientId, clientSecret, refreshToken)
    if (!access.ok) {
      jsonRes(res, 200, { status: 'error', message: access.message, detail: access.detail ?? '' })
      return
    }

    let listRes = await fleetGetJson(fleetBase, '/api/1/vehicles', access.accessToken)
    if (!listRes.ok && listRes.status === 401) {
      invalidateAccessTokenCache(clientId)
      const refreshed = await getAccessTokenCached(clientId, clientSecret, refreshToken)
      if (!refreshed.ok) {
        jsonRes(res, 200, { status: 'error', message: refreshed.message, detail: refreshed.detail ?? '' })
        return
      }
      access = refreshed
      listRes = await fleetGetJson(fleetBase, '/api/1/vehicles', access.accessToken)
    }
    if (!listRes.ok) {
      jsonRes(res, 200, {
        status: 'error',
        message: `Could not list vehicles (HTTP ${listRes.status}).`,
        detail: listRes.text,
      })
      return
    }

    let vehicles = parseVehicleList(listRes.json)
    if (vinFilter) {
      vehicles = vehicles.filter(v => (v.vin ?? '').toUpperCase() === vinFilter)
    }
    vehicles = vehicles.slice(0, 10)

    const q =
      'endpoints=' + encodeURIComponent('charge_state;drive_state;vehicle_state;climate_state')

    // Snapshot the access token into a plain string so the closure below can
    // freely reassign it on a 401 refresh without fighting TypeScript's narrowing.
    let currentAccessToken: string = access.accessToken

    /**
     * Fetch rich vehicle_data for one vehicle. On 401, refreshes the access
     * token once. On 408 / vehicle_unavailable / asleep states, calls wake_up
     * and retries once. Parallelizable — does NOT mutate shared rows array.
     */
    const fetchOneVehicle = async (v: VehicleSummary): Promise<Record<string, unknown>> => {
      const idStr = String(v.id)
      const path = `/api/1/vehicles/${encodeURIComponent(idStr)}/vehicle_data?${q}`
      let vd = await fleetGetJson(fleetBase, path, currentAccessToken)
      // Token expired mid-fetch — refresh and retry once.
      if (!vd.ok && vd.status === 401) {
        invalidateAccessTokenCache(clientId)
        const again = await getAccessTokenCached(clientId, clientSecret, refreshToken)
        if (again.ok) {
          currentAccessToken = again.accessToken
          vd = await fleetGetJson(fleetBase, path, currentAccessToken)
        }
      }
      // Vehicle asleep / unavailable — wake and retry once (Tesla app pattern).
      if (!vd.ok && (vd.status === 408 || /vehicle_unavailable|asleep/i.test(vd.text))) {
        const awake = await wakeVehicle(fleetBase, idStr, currentAccessToken)
        if (awake) {
          vd = await fleetGetJson(fleetBase, path, currentAccessToken)
        }
      }
      // Still unavailable — return an offline row so the fleet KPIs stay consistent.
      if (!vd.ok) {
        return {
          id: idStr,
          vin: (v.vin ?? '').toUpperCase(),
          display_name: v.display_name ?? 'Vehicle',
          displayName: v.display_name ?? 'Vehicle',
          state: 'offline',
          online: false,
          battery_level: 0,
          batteryPercent: 0,
          battery_range: 0,
          rangeMiles: 0,
          odometer: 0,
          odometerMiles: 0,
          car_version: '—',
          softwareVersion: '—',
          latitude: 0,
          longitude: 0,
          lat: 0,
          lng: 0,
          inside_temp: null,
          interiorTempF: null,
          charging: false,
          chargingState: 'unknown',
          chargerPowerKw: 0,
          chargeLimitPct: null,
          minutesToFullCharge: null,
          locked: null,
          shiftState: null,
          outsideTempF: null,
          climateOn: null,
          sentryMode: null,
        }
      }

      const resp = unwrapFleetResponse(vd.json)
      if (!resp || typeof resp !== 'object') {
        return {
          id: idStr,
          vin: (v.vin ?? '').toUpperCase(),
          display_name: v.display_name ?? 'Vehicle',
          displayName: v.display_name ?? 'Vehicle',
          state: 'unknown',
          online: false,
        }
      }
      const o = resp as Record<string, unknown>
      const cs = (o.charge_state && typeof o.charge_state === 'object' ? o.charge_state : {}) as Record<string, unknown>
      const ds = (o.drive_state && typeof o.drive_state === 'object' ? o.drive_state : {}) as Record<string, unknown>
      const vs = (o.vehicle_state && typeof o.vehicle_state === 'object' ? o.vehicle_state : {}) as Record<string, unknown>
      const cl = (o.climate_state && typeof o.climate_state === 'object' ? o.climate_state : {}) as Record<string, unknown>

      const vin = String(o.vin ?? v.vin ?? '').toUpperCase()
      const displayName = String(o.display_name ?? v.display_name ?? 'Vehicle')
      const state = String(o.state ?? v.state ?? 'unknown')
      const online = state === 'online'
      const batteryLevel = Number(cs.battery_level ?? 0)
      const batteryRange = Number(cs.est_battery_range ?? cs.battery_range ?? 0)
      const odometer = Number(vs.odometer ?? 0)
      const carVersion = String(vs.car_version ?? '—')
      const lat = Number(ds.latitude ?? ds.native_latitude ?? 0)
      const lng = Number(ds.longitude ?? ds.native_longitude ?? 0)
      const insideRaw = cl.inside_temp
      const insideTemp =
        insideRaw != null && typeof insideRaw === 'number' ? interiorTempFahrenheit(insideRaw) : null
      const outsideRaw = cl.outside_temp
      const outsideTemp =
        outsideRaw != null && typeof outsideRaw === 'number' ? interiorTempFahrenheit(outsideRaw) : null
      const chargingState = String(cs.charging_state ?? 'unknown')
      const charging = chargingState === 'Charging'
      const chargerPowerKw = Number(cs.charger_power ?? 0)
      const chargeLimitPct = cs.charge_limit_soc != null ? Number(cs.charge_limit_soc) : null
      const minutesToFull = cs.minutes_to_full_charge != null ? Number(cs.minutes_to_full_charge) : null
      const locked = typeof vs.locked === 'boolean' ? vs.locked : null
      const sentryMode = typeof vs.sentry_mode === 'boolean' ? vs.sentry_mode : null
      const shiftState = typeof ds.shift_state === 'string' ? ds.shift_state : null
      const climateOn = typeof cl.is_climate_on === 'boolean' ? cl.is_climate_on : null

      return {
        id: idStr,
        vin,
        display_name: displayName,
        displayName,
        state,
        online,
        battery_level: batteryLevel,
        batteryPercent: batteryLevel,
        battery_range: batteryRange,
        rangeMiles: batteryRange,
        odometer,
        odometerMiles: odometer,
        car_version: carVersion,
        softwareVersion: carVersion,
        latitude: lat,
        longitude: lng,
        lat,
        lng,
        inside_temp: insideTemp,
        interiorTempF: insideTemp,
        outsideTempF: outsideTemp,
        charging,
        chargingState,
        chargerPowerKw,
        chargeLimitPct,
        minutesToFullCharge: minutesToFull,
        locked,
        sentryMode,
        shiftState,
        climateOn,
      }
    }

    // Parallel per-vehicle fetch — bounded by `vehicles.slice(0, 10)` above.
    // Replaces the previous sequential for-loop. Tesla Fleet API tolerates
    // 10 parallel requests per refresh token comfortably.
    const rows = await Promise.all(vehicles.map(v => fetchOneVehicle(v)))

    const onlineN = rows.filter(r => r.online === true).length
    const chargingN = rows.filter(r => r.charging === true).length
    const batts = rows.map(r => Number(r.battery_level ?? 0)).filter(n => !Number.isNaN(n))
    const avgBat = batts.length ? Math.round(batts.reduce((a, b) => a + b, 0) / batts.length) : 0
    const totalOdo = rows.reduce((s, r) => s + Number(r.odometer ?? 0), 0)

    jsonRes(res, 200, {
      status: 'live',
      vehicles: rows,
      kpis: {
        vehiclesOnline: onlineN,
        totalMilesToday: Math.round(totalOdo),
        avgBatteryPercent: avgBat,
        activeChargingSessions: chargingN,
        vehiclesOnlineTrend: Array.from({ length: 7 }, () => onlineN),
      },
      chargingSessions: [],
      telemetry: [],
      socSeriesByVehicle: [],
    })
  } catch (e) {
    jsonRes(res, 200, errPayload('Tesla Fleet request failed.', e))
  }
}

async function handlePostExchangeCode(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const clientId = pickHeader(req, 'TESLA_CLIENT_ID')
    const clientSecret = pickHeader(req, 'TESLA_CLIENT_SECRET')
    if (!clientId || !clientSecret) {
      jsonRes(res, 200, {
        status: 'error',
        message: 'TESLA_CLIENT_ID and TESLA_CLIENT_SECRET headers are required for code exchange.',
        detail: 'missing_client_credentials',
      })
      return
    }

    const body = (await readJsonBody(req)) as Record<string, unknown> | null
    const code = typeof body?.code === 'string' ? body.code : ''
    const redirectUri = typeof body?.redirect_uri === 'string' ? body.redirect_uri : ''
    if (!code || !redirectUri) {
      jsonRes(res, 200, {
        status: 'error',
        message: 'JSON body must include `code` and `redirect_uri`.',
        detail: 'bad_request',
      })
      return
    }

    const tr = await postForm(TESLA_AUTH_TOKEN, {
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    })
    if (!tr.ok) {
      jsonRes(res, 200, {
        status: 'error',
        message: `Tesla code exchange failed (HTTP ${tr.status}).`,
        detail: tr.text,
      })
      return
    }
    const refresh = parseRefreshFromTokenResponse(tr.json)
    if (!refresh) {
      jsonRes(res, 200, {
        status: 'error',
        message: 'Tesla token response did not include refresh_token.',
        detail: JSON.stringify(tr.json).slice(0, 400),
      })
      return
    }
    jsonRes(res, 200, { status: 'ok', refresh_token: refresh })
  } catch (e) {
    jsonRes(res, 200, errPayload('Tesla code exchange error.', e))
  }
}

/**
 * Resolve a VIN (or numeric Tesla vehicle id) to the canonical Tesla `id`
 * required by `/api/1/vehicles/{id}/...` command and data paths.
 */
async function resolveVehicleId(
  fleetBase: string,
  accessToken: string,
  vehicleIdOrVin: string,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  // Numeric ids pass through unchanged.
  if (/^\d+$/.test(vehicleIdOrVin)) return { ok: true, id: vehicleIdOrVin }
  const target = vehicleIdOrVin.toUpperCase()
  const list = await fleetGetJson(fleetBase, '/api/1/vehicles', accessToken)
  if (!list.ok) return { ok: false, message: `Could not list vehicles (HTTP ${list.status})` }
  const vehicles = parseVehicleList(list.json)
  const found = vehicles.find(v => (v.vin ?? '').toUpperCase() === target)
  if (!found) return { ok: false, message: `No vehicle with VIN ${target} on this account` }
  return { ok: true, id: String(found.id) }
}

/** Whitelist of REST commands the BFF will dispatch. Anything else → 400 / 501. */
const REST_COMMAND_WHITELIST = new Set<string>([
  'door_lock',
  'door_unlock',
  'honk_horn',
  'flash_lights',
  'auto_conditioning_start',
  'auto_conditioning_stop',
  'set_charge_limit',
  'wake_up',
])

type CommandRequestBody = {
  vehicleId: string | number
  command: string
  payload?: Record<string, unknown>
}

async function handlePostCommand(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = (await readJsonBody(req)) as CommandRequestBody | null
    const command = body?.command
    const vehicleIdRaw = body?.vehicleId

    if (!command || typeof command !== 'string') {
      jsonRes(res, 400, { status: 'error', message: 'Missing `command`.', detail: '' })
      return
    }
    if (vehicleIdRaw == null || (typeof vehicleIdRaw !== 'string' && typeof vehicleIdRaw !== 'number')) {
      jsonRes(res, 400, { status: 'error', message: 'Missing `vehicleId` (string VIN or numeric id).', detail: '' })
      return
    }

    if (!REST_COMMAND_WHITELIST.has(command)) {
      jsonRes(res, 200, {
        status: 'error',
        code: 'signed-command-required',
        message:
          'Command not on the REST whitelist. Signed commands require the Tesla Vehicle Command SDK; the dashboard supports REST commands only (works for older fleet vehicles).',
        detail: `command=${command}`,
        whitelist: Array.from(REST_COMMAND_WHITELIST),
      })
      return
    }

    const env = process.env
    const clientId = pickHeader(req, 'TESLA_CLIENT_ID') || env.TESLA_CLIENT_ID || ''
    const clientSecret = pickHeader(req, 'TESLA_CLIENT_SECRET') || env.TESLA_CLIENT_SECRET || ''
    const refreshToken = pickHeader(req, 'TESLA_REFRESH_TOKEN') || env.TESLA_REFRESH_TOKEN || ''
    const region = pickHeader(req, 'TESLA_REGION') || env.TESLA_REGION || 'na'

    if (!clientId || !clientSecret || !refreshToken) {
      jsonRes(res, 200, {
        status: 'error',
        message:
          'Tesla credentials missing. Set TESLA_CLIENT_ID, TESLA_CLIENT_SECRET, and TESLA_REFRESH_TOKEN in Settings → API keys, then complete the OAuth flow.',
        detail: '',
      })
      return
    }

    const fleetBase = fleetHostForRegion(region)
    const access = await getAccessTokenCached(clientId, clientSecret, refreshToken)
    if (!access.ok) {
      jsonRes(res, 200, { status: 'error', message: access.message, detail: access.detail ?? '' })
      return
    }

    const resolved = await resolveVehicleId(fleetBase, access.accessToken, String(vehicleIdRaw))
    if (!resolved.ok) {
      jsonRes(res, 200, { status: 'error', message: resolved.message, detail: '' })
      return
    }
    const vid = resolved.id

    // `wake_up` is NOT under /command/, all the other whitelisted commands are.
    const path =
      command === 'wake_up'
        ? `/api/1/vehicles/${encodeURIComponent(vid)}/wake_up`
        : `/api/1/vehicles/${encodeURIComponent(vid)}/command/${encodeURIComponent(command)}`
    const tesla = await fleetPostJson(fleetBase, path, access.accessToken, body?.payload ?? {})

    if (!tesla.ok) {
      jsonRes(res, 200, {
        status: 'error',
        message: `Tesla command ${command} failed (HTTP ${tesla.status}).`,
        detail: tesla.text,
      })
      return
    }
    jsonRes(res, 200, { status: 'ok', command, vehicleId: vid, tesla: tesla.json })
  } catch (e) {
    jsonRes(res, 200, errPayload('Tesla command dispatch error.', e))
  }
}

/** GET /api/tesla/virtual-key/info — returns presence + public PEM fingerprint. */
function handleGetVirtualKeyInfo(_req: IncomingMessage, res: ServerResponse): void {
  try {
    const info = getVirtualKeyInfo()
    jsonRes(res, 200, { status: 'ok', ...info })
  } catch (e) {
    jsonRes(res, 200, errPayload('Failed to read Tesla virtual key.', e))
  }
}

/** POST /api/tesla/virtual-key/generate — idempotent generate (P-256 / secp256r1). */
function handlePostVirtualKeyGenerate(_req: IncomingMessage, res: ServerResponse): void {
  try {
    const info = generateVirtualKey()
    jsonRes(res, 200, { status: 'ok', ...info })
  } catch (e) {
    jsonRes(res, 200, errPayload('Failed to generate Tesla virtual key.', e))
  }
}

/**
 * Tesla Fleet + OAuth helper routes. Returns true when the request was fully handled (caller must not `next()`).
 */
export function tryHandleTeslaFleetRoutes(req: IncomingMessage, res: ServerResponse): boolean {
  const pathName = pathnameOnly(req.url ?? '')
  const method = (req.method ?? 'GET').toUpperCase()

  if (!pathName.startsWith('/api/tesla/')) {
    return false
  }

  if (pathName === '/api/tesla/fleet' || pathName.startsWith('/api/tesla/fleet?')) {
    if (method !== 'GET') {
      jsonRes(res, 405, { status: 'error', message: 'Method not allowed', detail: 'use GET' })
      return true
    }
    void handleGetFleet(req, res)
    return true
  }

  if (pathName === '/api/tesla/exchange-code') {
    if (method !== 'POST') {
      jsonRes(res, 405, { status: 'error', message: 'Method not allowed', detail: 'use POST' })
      return true
    }
    void handlePostExchangeCode(req, res)
    return true
  }

  if (pathName === '/api/tesla/oauth/callback' || pathName.startsWith('/api/tesla/oauth/callback?')) {
    if (method !== 'GET') {
      jsonRes(res, 405, { status: 'error', message: 'Method not allowed', detail: 'use GET' })
      return true
    }
    htmlRes(res, 200, oauthCallbackHtml())
    return true
  }

  if (pathName === '/api/tesla/virtual-key/info') {
    if (method !== 'GET') {
      jsonRes(res, 405, { status: 'error', message: 'Method not allowed', detail: 'use GET' })
      return true
    }
    handleGetVirtualKeyInfo(req, res)
    return true
  }

  if (pathName === '/api/tesla/virtual-key/generate') {
    if (method !== 'POST') {
      jsonRes(res, 405, { status: 'error', message: 'Method not allowed', detail: 'use POST' })
      return true
    }
    handlePostVirtualKeyGenerate(req, res)
    return true
  }

  if (pathName === '/api/tesla/command') {
    if (method !== 'POST') {
      jsonRes(res, 405, { status: 'error', message: 'Method not allowed', detail: 'use POST' })
      return true
    }
    void handlePostCommand(req, res)
    return true
  }

  jsonRes(res, 404, { status: 'error', message: 'Unknown Tesla API route.', detail: pathName })
  return true
}
