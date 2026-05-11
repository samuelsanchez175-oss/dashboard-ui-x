/** IndexedDB persistence for Mixing → Audio grabber dock (small MP3 blobs, capped count). */

const DB_NAME = 'mixing-yt-audio-dock-v1'
const STORE = 'clips'
const MAX_CLIPS = 12

export type MixClipAnalysisSource = 'tags' | 'estimated' | 'hybrid' | 'tunebat' | 'chromagram'

export type MixClipMeta = {
  bpm: number | null
  key: string | null
  scale: string | null
  rapKeyTip: string
  source: MixClipAnalysisSource
  analyzedAt: number
}

export type StoredMixClip = {
  videoId: string
  title: string
  addedAt: number
  blob: Blob
  meta?: MixClipMeta
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'videoId' })
      }
    }
  })
}

/** Fast sanity check for Dev diagnostics — opens DB then closes. */
export async function probeMixingDockIndexedDb(): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = await openDb()
    db.close()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function loadAllMixClips(): Promise<StoredMixClip[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const st = tx.objectStore(STORE)
    const q = st.getAll()
    q.onerror = () => reject(q.error)
    q.onsuccess = () => {
      const rows = (q.result as StoredMixClip[]) ?? []
      resolve(rows.sort((a, b) => b.addedAt - a.addedAt))
    }
  })
}

export async function saveMixClip(clip: Omit<StoredMixClip, 'addedAt'> & { addedAt?: number }): Promise<void> {
  const db = await openDb()
  const row: StoredMixClip = {
    videoId: clip.videoId,
    title: clip.title,
    blob: clip.blob,
    addedAt: clip.addedAt ?? Date.now(),
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const st = tx.objectStore(STORE)
    st.put(row)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

  const all = await loadAllMixClips()
  if (all.length <= MAX_CLIPS) return
  const drop = all.slice(MAX_CLIPS)
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const st = tx.objectStore(STORE)
    for (const d of drop) {
      st.delete(d.videoId)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function deleteMixClip(videoId: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(videoId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function getMixClip(db: IDBDatabase, videoId: string): Promise<StoredMixClip | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(videoId)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result as StoredMixClip | undefined)
  })
}

/** Merge fields onto an existing clip (keeps blob unless replaced). */
export async function patchMixClip(videoId: string, partial: Partial<Pick<StoredMixClip, 'title' | 'meta'>>): Promise<void> {
  const db = await openDb()
  const cur = await getMixClip(db, videoId)
  if (!cur) return
  const row: StoredMixClip = {
    ...cur,
    ...partial,
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(row)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
