/**
 * Durable QR scan log.
 *
 * Locally: JSON files under data/.
 * On Vercel (and as the shared source of truth): rows in the existing
 * Supabase `checkoffs` table, keyed `qrscan:{brand}:{id}:{payload}`.
 * Same project as task check-offs — no extra database to provision.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export type QrScanBrand = 'cdl' | 'penwork'

export type StoredScan = {
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
  ipHash?: string
}

const SUPABASE_URL = 'https://suyjphvmurihtpriovnv.supabase.co'
const SUPABASE_KEY = 'sb_publishable_aIiylimy7JjPz1Wkq5xXAg_AZoBnQSd'
const REST = `${SUPABASE_URL}/rest/v1/checkoffs`
const HEADERS: Record<string, string> = {
  apikey: SUPABASE_KEY,
  authorization: `Bearer ${SUPABASE_KEY}`,
  'content-type': 'application/json',
}

function filePath(brand: QrScanBrand): string {
  const name = brand === 'cdl' ? 'cdl-qr-scans.json' : 'penwork-qr-scans.json'
  if (process.env.VERCEL) return `/tmp/${name}`
  return path.join(process.cwd(), 'data', name)
}

function prefix(brand: QrScanBrand): string {
  return `qrscan:${brand}:`
}

function rowKey(brand: QrScanBrand, id: number): string {
  return `${prefix(brand)}${id}:`
}

function publicScan(row: StoredScan): StoredScan {
  const { ipHash: _h, ...rest } = row
  void _h
  return rest
}

function encodeTaskId(brand: QrScanBrand, row: StoredScan): string {
  const payload = Buffer.from(JSON.stringify(publicScan(row)), 'utf8').toString('base64url')
  return `${rowKey(brand, row.id)}${payload}`
}

function decodeTaskId(taskId: string, brand: QrScanBrand): StoredScan | null {
  const pre = prefix(brand)
  if (!taskId.startsWith(pre)) return null
  const rest = taskId.slice(pre.length)
  const colon = rest.indexOf(':')
  if (colon < 0) return null
  const b64 = rest.slice(colon + 1)
  try {
    const json = Buffer.from(b64, 'base64url').toString('utf8')
    const parsed = JSON.parse(json) as StoredScan
    if (!parsed || typeof parsed.id !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function readLocal(brand: QrScanBrand): StoredScan[] {
  const file = filePath(brand)
  try {
    if (!existsSync(file)) return []
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown
    return Array.isArray(parsed) ? (parsed as StoredScan[]) : []
  } catch {
    return []
  }
}

function writeLocal(brand: QrScanBrand, rows: StoredScan[]): void {
  const file = filePath(brand)
  try {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(rows, null, 2), 'utf8')
  } catch {
    /* read-only /tmp race — cloud copy still holds the data */
  }
}

async function cloudList(brand: QrScanBrand): Promise<StoredScan[]> {
  const q = new URLSearchParams({
    select: 'task_id',
    task_id: `like.${prefix(brand)}%`,
    limit: '2000',
  })
  const res = await fetch(`${REST}?${q.toString()}`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`cloud list ${res.status}`)
  const rows = (await res.json()) as { task_id: string }[]
  const out: StoredScan[] = []
  for (const r of rows) {
    const scan = decodeTaskId(r.task_id, brand)
    if (scan) out.push(scan)
  }
  out.sort((a, b) => a.id - b.id)
  return out
}

async function cloudInsert(brand: QrScanBrand, row: StoredScan): Promise<void> {
  const res = await fetch(REST, {
    method: 'POST',
    headers: { ...HEADERS, prefer: 'return=minimal' },
    body: JSON.stringify([{
      task_id: encodeTaskId(brand, row),
      done: true,
      updated_at: row.ts,
    }]),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok && res.status !== 409) {
    throw new Error(`cloud insert ${res.status}`)
  }
}

async function cloudDeleteId(brand: QrScanBrand, id: number): Promise<void> {
  const q = new URLSearchParams({
    task_id: `like.${rowKey(brand, id)}%`,
  })
  await fetch(`${REST}?${q.toString()}`, {
    method: 'DELETE',
    headers: HEADERS,
    signal: AbortSignal.timeout(8000),
  })
}

async function cloudReplaceAll(brand: QrScanBrand, rows: StoredScan[]): Promise<void> {
  const q = new URLSearchParams({ task_id: `like.${prefix(brand)}%` })
  await fetch(`${REST}?${q.toString()}`, {
    method: 'DELETE',
    headers: HEADERS,
    signal: AbortSignal.timeout(8000),
  })
  if (rows.length === 0) return
  const body = rows.map(row => ({
    task_id: encodeTaskId(brand, row),
    done: true,
    updated_at: row.ts,
  }))
  const res = await fetch(REST, {
    method: 'POST',
    headers: { ...HEADERS, prefer: 'return=minimal' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) throw new Error(`cloud seed ${res.status}`)
}

export async function loadScans(brand: QrScanBrand): Promise<StoredScan[]> {
  const local = readLocal(brand)
  try {
    const cloud = await cloudList(brand)
    if (cloud.length === 0 && local.length > 0) {
      await cloudReplaceAll(brand, local)
      return local
    }
    if (cloud.length > 0) {
      writeLocal(brand, cloud)
      return cloud
    }
    return local
  } catch {
    return local
  }
}

export async function appendScan(brand: QrScanBrand, row: StoredScan): Promise<StoredScan[]> {
  const rows = await loadScans(brand)
  rows.push(row)
  writeLocal(brand, rows)
  try {
    await cloudInsert(brand, row)
  } catch {
    /* local copy still has it */
  }
  return rows
}

export async function updateScan(
  brand: QrScanBrand,
  id: number,
  patch: Partial<StoredScan>,
): Promise<StoredScan | null> {
  const rows = await loadScans(brand)
  const row = rows.find(s => s.id === id)
  if (!row) return null
  Object.assign(row, patch)
  writeLocal(brand, rows)
  try {
    await cloudDeleteId(brand, id)
    await cloudInsert(brand, row)
  } catch {
    /* local copy still has it */
  }
  return row
}
