import { createContext, useCallback, useContext, useState } from 'react'

export interface CustomZone {
  id:          string
  title:       string
  description: string
  iconName:    string
  content:     string
  createdAt:   number
}

interface CustomZonesState {
  zones:      CustomZone[]
  addZone:    (zone: Omit<CustomZone, 'id' | 'createdAt'>) => string
  updateZone: (id: string, updates: Partial<Omit<CustomZone, 'id' | 'createdAt'>>) => void
  removeZone: (id: string) => void
}

const CustomZonesContext = createContext<CustomZonesState | null>(null)

const KEY = 'ui-custom-zones'

function load(): CustomZone[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

export function CustomZonesProvider({ children }: { children: React.ReactNode }) {
  const [zones, setZones] = useState<CustomZone[]>(load)

  const persist = (next: CustomZone[]) => {
    setZones(next)
    localStorage.setItem(KEY, JSON.stringify(next))
  }

  const addZone = useCallback((zone: Omit<CustomZone, 'id' | 'createdAt'>) => {
    const id = `custom-${Date.now()}`
    persist([...zones, { ...zone, id, createdAt: Date.now() }])
    return id
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones])

  const updateZone = useCallback((id: string, updates: Partial<Omit<CustomZone, 'id' | 'createdAt'>>) => {
    persist(zones.map(z => z.id === id ? { ...z, ...updates } : z))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones])

  const removeZone = useCallback((id: string) => {
    persist(zones.filter(z => z.id !== id))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones])

  return (
    <CustomZonesContext.Provider value={{ zones, addZone, updateZone, removeZone }}>
      {children}
    </CustomZonesContext.Provider>
  )
}

export function useCustomZones() {
  const ctx = useContext(CustomZonesContext)
  if (!ctx) throw new Error('useCustomZones must be used within CustomZonesProvider')
  return ctx
}
