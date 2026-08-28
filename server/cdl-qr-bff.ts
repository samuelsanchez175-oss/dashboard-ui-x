/**
 * CDL TEST PREP 2027 QR scan board.
 * GET /api/cdl-qr/go   — log hit, 302 to App Store
 * GET /api/cdl-qr/scans — dashboard JSON
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { CDL_APP_STORE_URL, safeHttpUrl } from '../src/zones/harmony/cdl-qr-shared'

export { CDL_APP_STORE_URL }

function destFromRequest(req: IncomingMessage): string | null {
  try {
    return safeHttpUrl(new URL(req.url ?? '', 'http://localhost').searchParams.get('to'))
  } catch {
    return null
  }
}

export type CdlQrScan = {
  id: number
  ts: string
  city: string
  region: string
  country: string
  lat: number | null
  lon: number | null
  device: string
  termsAccepted: boolean
  locationGranted: boolean
  locationSource: 'gps' | 'ip' | 'denied' | 'pending'
}

type StoredScan = CdlQrScan & { ipHash?: string }

function jsonRes(res: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', Buffer.byteLength(body))
  res.setHeader('Cache-Control', 'no-store')
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

function storePath(): string {
  if (process.env.VERCEL) return '/tmp/cdl-qr-scans.json'
  return path.join(process.cwd(), 'data', 'cdl-qr-scans.json')
}

function loadScans(): StoredScan[] {
  const file = storePath()
  try {
    if (!existsSync(file)) return []
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown
    return Array.isArray(parsed) ? (parsed as StoredScan[]) : []
  } catch {
    return []
  }
}

function saveScans(scans: StoredScan[]): void {
  const file = storePath()
  try {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(scans, null, 2), 'utf8')
  } catch {
    /* /tmp or read-only — keep going; in-memory is already updated */
  }
}

let memory: StoredScan[] | null = null

function scans(): StoredScan[] {
  if (!memory) memory = loadScans()
  return memory
}

function clientIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0]!.trim()
  if (Array.isArray(fwd) && fwd[0]) return fwd[0].split(',')[0]!.trim()
  return req.socket.remoteAddress?.replace('::ffff:', '') ?? ''
}

function isPrivate(ip: string): boolean {
  return (
    !ip
    || ip === '::1'
    || ip.startsWith('127.')
    || ip.startsWith('10.')
    || ip.startsWith('192.168.')
    || ip.startsWith('172.16.')
    || ip.startsWith('172.17.')
    || ip.startsWith('172.18.')
  )
}

function deviceFromUa(ua: string): string {
  const u = ua.toLowerCase()
  if (u.includes('iphone')) return 'iPhone'
  if (u.includes('ipad')) return 'iPad'
  if (u.includes('android')) return 'Android'
  if (u.includes('mac os') || u.includes('macintosh')) return 'Mac'
  if (u.includes('windows')) return 'Windows'
  if (u.includes('bot') || u.includes('crawler')) return 'Bot'
  return 'Other'
}

async function lookupGeo(ip: string): Promise<Pick<CdlQrScan, 'city' | 'region' | 'country' | 'lat' | 'lon'>> {
  if (isPrivate(ip)) {
    return { city: 'This device / LAN', region: 'Local network', country: 'Local', lat: null, lon: null }
  }
  try {
    const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city,lat,lon`
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) })
    const data = (await res.json()) as {
      status?: string
      country?: string
      regionName?: string
      city?: string
      lat?: number
      lon?: number
    }
    if (data.status !== 'success') throw new Error('geo failed')
    return {
      city: data.city || 'Unknown',
      region: data.regionName || '',
      country: data.country || '',
      lat: typeof data.lat === 'number' ? data.lat : null,
      lon: typeof data.lon === 'number' ? data.lon : null,
    }
  } catch {
    return { city: 'Unknown', region: '', country: '', lat: null, lon: null }
  }
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => {
      body += String(chunk)
    })
    req.on('end', () => {
      try {
        resolve(body ? (JSON.parse(body) as Record<string, unknown>) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

async function reverseGeo(lat: number, lon: number): Promise<{ city: string; region: string; country: string } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}&format=json`
    const res = await fetch(url, {
      signal: AbortSignal.timeout(2500),
      headers: { 'User-Agent': 'CDL-QR-Tracker/1.0 (harmony-stack)' },
    })
    const data = (await res.json()) as { address?: { city?: string; town?: string; village?: string; hamlet?: string; state?: string; country?: string } }
    const a = data.address
    if (!a) return null
    return {
      city: a.city || a.town || a.village || a.hamlet || 'Unknown',
      region: a.state || '',
      country: a.country || '',
    }
  } catch {
    return null
  }
}

function landingLocation(req: IncomingMessage, scanId: number): string {
  const host = (req.headers.host ?? '').trim()
  const fwdProto = req.headers['x-forwarded-proto']
  const proto = typeof fwdProto === 'string'
    ? fwdProto.split(',')[0]!.trim()
    : host.startsWith('localhost') || host.startsWith('127.0.0.1')
      ? 'http'
      : 'https'
  const dest = destFromRequest(req)
  const extra = dest ? `&to=${encodeURIComponent(dest)}` : ''
  return `${proto}://${host}/cdl-qr-landing.html?id=${scanId}${extra}`
}

function publicPayload(all: StoredScan[]) {
  const recent: CdlQrScan[] = all
    .slice()
    .reverse()
    .slice(0, 200)
    .map(({ ipHash: _h, ...rest }) => ({
      ...rest,
      termsAccepted: rest.termsAccepted === true,
      locationGranted: rest.locationGranted === true,
      locationSource: rest.locationSource ?? 'ip',
    }))
  const placeMap = new Map<string, { city: string; region: string; country: string; lat: number | null; lon: number | null; count: number }>()
  for (const s of all) {
    const key = `${s.city}|${s.region}|${s.country}`
    const cur = placeMap.get(key)
    if (cur) cur.count += 1
    else {
      placeMap.set(key, {
        city: s.city,
        region: s.region,
        country: s.country,
        lat: s.lat,
        lon: s.lon,
        count: 1,
      })
    }
  }
  const places = [...placeMap.values()].sort((a, b) => b.count - a.count)
  return {
    total: all.length,
    uniquePlaces: placeMap.size,
    last: all.at(-1)?.ts ?? null,
    destination: CDL_APP_STORE_URL,
    recent,
    places,
  }
}

export async function tryHandleCdlQrRoutes(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const pathName = pathnameOnly(req.url)
  if (!pathName.startsWith('/api/cdl-qr')) return false
  const method = (req.method ?? 'GET').toUpperCase()

  if (pathName === '/api/cdl-qr/go' && method === 'HEAD') {
    const dest = destFromRequest(req)
    const extra = dest ? `?to=${encodeURIComponent(dest)}` : ''
    res.statusCode = 302
    res.setHeader('Location', `/cdl-qr-landing.html${extra}`)
    res.end()
    return true
  }

  if (pathName === '/api/cdl-qr/go' && method === 'GET') {
    const ip = clientIp(req)
    const ua = String(req.headers['user-agent'] ?? '')
    const geo = await lookupGeo(ip)
    const list = scans()
    const row: StoredScan = {
      id: (list.at(-1)?.id ?? 0) + 1,
      ts: new Date().toISOString(),
      ...geo,
      device: deviceFromUa(ua),
      termsAccepted: false,
      locationGranted: false,
      locationSource: 'pending',
      ipHash: ip ? createHash('sha256').update(ip).digest('hex').slice(0, 16) : undefined,
    }
    list.push(row)
    saveScans(list)
    res.statusCode = 302
    res.setHeader('Location', landingLocation(req, row.id))
    res.setHeader('Cache-Control', 'no-store')
    res.end()
    return true
  }

  if (pathName === '/api/cdl-qr/consent' && method === 'POST') {
    let body: Record<string, unknown>
    try {
      body = await readJsonBody(req)
    } catch {
      jsonRes(res, 400, { ok: false, error: 'BAD_JSON' })
      return true
    }
    const id = Number(body.id)
    const list = scans()
    const row = list.find(s => s.id === id)
    if (!row || !Number.isFinite(id)) {
      jsonRes(res, 404, { ok: false, error: 'UNKNOWN_SCAN' })
      return true
    }
    row.termsAccepted = body.termsAccepted === true
    const lat = typeof body.lat === 'number' ? body.lat : null
    const lon = typeof body.lon === 'number' ? body.lon : null
    const granted = body.locationGranted === true && lat != null && lon != null
    row.locationGranted = granted
    if (granted) {
      row.lat = lat
      row.lon = lon
      row.locationSource = 'gps'
      const named = await reverseGeo(lat, lon)
      if (named) {
        row.city = named.city
        row.region = named.region
        row.country = named.country
      }
    } else {
      row.locationSource = 'denied'
    }
    saveScans(list)
    jsonRes(res, 200, { ok: true, store: CDL_APP_STORE_URL })
    return true
  }

  if (pathName === '/api/cdl-qr/scans' && method === 'GET') {
    jsonRes(res, 200, publicPayload(scans()))
    return true
  }

  jsonRes(res, 404, { ok: false, error: 'UNKNOWN_CDL_QR_ROUTE' })
  return true
}
