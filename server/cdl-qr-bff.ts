/**
 * CDL TEST PREP 2027 QR scan board.
 * GET /api/cdl-qr/go   — log hit, 302 to App Store
 * GET /api/cdl-qr/scans — dashboard JSON
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { CDL_APP_STORE_URL } from '../src/zones/harmony/cdl-qr-shared'

export { CDL_APP_STORE_URL }

export type CdlQrScan = {
  id: number
  ts: string
  city: string
  region: string
  country: string
  lat: number | null
  lon: number | null
  device: string
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

function publicPayload(all: StoredScan[]) {
  const recent: CdlQrScan[] = all
    .slice()
    .reverse()
    .slice(0, 200)
    .map(({ ipHash: _h, ...rest }) => rest)
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

  if (pathName === '/api/cdl-qr/go' && (method === 'GET' || method === 'HEAD')) {
    const ip = clientIp(req)
    const ua = String(req.headers['user-agent'] ?? '')
    const geo = await lookupGeo(ip)
    const list = scans()
    const row: StoredScan = {
      id: (list.at(-1)?.id ?? 0) + 1,
      ts: new Date().toISOString(),
      ...geo,
      device: deviceFromUa(ua),
      ipHash: ip ? createHash('sha256').update(ip).digest('hex').slice(0, 16) : undefined,
    }
    list.push(row)
    saveScans(list)
    res.statusCode = 302
    res.setHeader('Location', CDL_APP_STORE_URL)
    res.setHeader('Cache-Control', 'no-store')
    res.end()
    return true
  }

  if (pathName === '/api/cdl-qr/scans' && method === 'GET') {
    jsonRes(res, 200, publicPayload(scans()))
    return true
  }

  jsonRes(res, 404, { ok: false, error: 'UNKNOWN_CDL_QR_ROUTE' })
  return true
}
