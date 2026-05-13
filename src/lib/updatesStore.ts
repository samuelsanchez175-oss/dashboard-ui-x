import { create } from 'zustand'

export type ZoneId = string

export interface UpdateEntry {
  count:         number
  lastTouchedAt: number
}

export interface UpdatesState {
  entries:    Record<ZoneId, UpdateEntry>
  markUpdated: (id: ZoneId) => void
  markMany:    (ids: ZoneId[]) => void
  clear:       (id: ZoneId) => void
  getCount:    (id: ZoneId) => number
  isRecent:    (id: ZoneId, windowMs?: number) => boolean
}

export const useUpdatesStore = create<UpdatesState>((set, get) => ({
  entries: {},

  markUpdated: (id: ZoneId) => {
    set(state => {
      const prev = state.entries[id]
      return {
        entries: {
          ...state.entries,
          [id]: {
            count:         (prev?.count ?? 0) + 1,
            lastTouchedAt: Date.now(),
          },
        },
      }
    })
  },

  markMany: (ids: ZoneId[]) => {
    if (ids.length === 0) return
    const now = Date.now()
    set(state => {
      let next = { ...state.entries }
      for (const id of ids) {
        const prev = next[id]
        next[id] = {
          count:         (prev?.count ?? 0) + 1,
          lastTouchedAt: now,
        }
      }
      return { entries: next }
    })
  },

  clear: (id: ZoneId) => {
    set(state => {
      if (!(id in state.entries)) return state
      const { [id]: _removed, ...rest } = state.entries
      return { entries: rest }
    })
  },

  getCount: (id: ZoneId) => get().entries[id]?.count ?? 0,

  isRecent: (id: ZoneId, windowMs = 20_000) => {
    const t = get().entries[id]?.lastTouchedAt
    if (t == null) return false
    return Date.now() - t < windowMs
  },
}))

export function seedUpdates(ids: ZoneId[]): void {
  useUpdatesStore.getState().markMany(ids)
}
