import type { NavItem, NavSection } from './navigation'

const STORAGE_KEY = 'sx-dashboard-sidebar-nav-layout-v1'
/** Prior branding; read once to migrate saved layout into {@link STORAGE_KEY}. */
const LEGACY_STORAGE_KEY = 'game-studio-sidebar-nav-layout-v1'
export const SIDEBAR_NAV_LAYOUT_EVENT = 'sx-dashboard-sidebar-nav-layout-change'

export interface SidebarNavLayoutPersist {
  version:           1
  hiddenSectionIds:  string[]
  hiddenItemIds:     string[]
  /** When null, use source section order */
  sectionOrder:      string[] | null
  /** Ordered item ids per section; missing key → use source order */
  itemsBySection:    Record<string, string[]>
  /** Section ids whose groups are collapsed in the sidebar */
  collapsedSectionIds: string[]
}

export const defaultSidebarNavLayout = (): SidebarNavLayoutPersist => ({
  version:               1,
  hiddenSectionIds:      [],
  hiddenItemIds:         [],
  sectionOrder:          null,
  itemsBySection:        {},
  collapsedSectionIds:   [],
})

/** Removed nav ids → canonical id (sidebar layout persistence). */
const LEGACY_NAV_ITEM_ALIASES: Record<string, string> = {
  'production-overview': 'agent-farm',
}

function migrateLegacyNavItemIds(layout: SidebarNavLayoutPersist): SidebarNavLayoutPersist {
  const hiddenItemIds = layout.hiddenItemIds.filter(id => id !== 'production-overview')
  const itemsBySection: Record<string, string[]> = {}
  for (const [sectionId, ids] of Object.entries(layout.itemsBySection)) {
    const seen = new Set<string>()
    const next: string[] = []
    for (const id of ids) {
      const mapped = LEGACY_NAV_ITEM_ALIASES[id] ?? id
      if (!seen.has(mapped)) {
        seen.add(mapped)
        next.push(mapped)
      }
    }
    itemsBySection[sectionId] = next
  }
  return { ...layout, hiddenItemIds, itemsBySection }
}

function normalizeParsedLayout(parsed: Partial<SidebarNavLayoutPersist>): SidebarNavLayoutPersist | null {
  if (parsed.version !== 1) return null
  const base: SidebarNavLayoutPersist = {
    version:               1,
    hiddenSectionIds:      Array.isArray(parsed.hiddenSectionIds) ? parsed.hiddenSectionIds : [],
    hiddenItemIds:         Array.isArray(parsed.hiddenItemIds) ? parsed.hiddenItemIds : [],
    sectionOrder:          Array.isArray(parsed.sectionOrder) ? parsed.sectionOrder : null,
    itemsBySection:        parsed.itemsBySection && typeof parsed.itemsBySection === 'object'
      ? parsed.itemsBySection
      : {},
    collapsedSectionIds:   Array.isArray(parsed.collapsedSectionIds) ? parsed.collapsedSectionIds : [],
  }
  return migrateLegacyNavItemIds(base)
}

export function loadSidebarNavLayout(): SidebarNavLayoutPersist {
  try {
    const fromNew = localStorage.getItem(STORAGE_KEY)
    const fromLegacy = fromNew ? null : localStorage.getItem(LEGACY_STORAGE_KEY)
    const raw = fromNew ?? fromLegacy
    if (!raw) return defaultSidebarNavLayout()
    const parsed = JSON.parse(raw) as Partial<SidebarNavLayoutPersist>
    const layout = normalizeParsedLayout(parsed)
    if (!layout) return defaultSidebarNavLayout()
    if (fromLegacy && !fromNew) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
        localStorage.removeItem(LEGACY_STORAGE_KEY)
      } catch {
        /* ignore quota */
      }
    }
    return layout
  } catch {
    return defaultSidebarNavLayout()
  }
}

export function saveSidebarNavLayout(layout: SidebarNavLayoutPersist): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
    window.dispatchEvent(new Event(SIDEBAR_NAV_LAYOUT_EVENT))
  } catch {
    /* ignore quota */
  }
}

function defaultSectionOrder(source: NavSection[]): string[] {
  return source.map(s => s.id)
}

export function orderedSectionIds(sourceSections: NavSection[], layout: SidebarNavLayoutPersist): string[] {
  const byId = new Map(sourceSections.map(s => [s.id, true]))
  const order = layout.sectionOrder?.length
    ? [...layout.sectionOrder].filter(id => byId.has(id))
    : defaultSectionOrder(sourceSections)
  for (const id of defaultSectionOrder(sourceSections)) {
    if (!order.includes(id)) order.push(id)
  }
  return order
}

export function orderedItemIds(section: NavSection, layout: SidebarNavLayoutPersist): string[] {
  const custom = layout.itemsBySection[section.id]
  const sourceIds = section.items.map(i => i.id)
  if (!custom || custom.length === 0) return sourceIds
  const inCustom = new Set(custom)
  const merged: string[] = []
  for (const id of custom) {
    if (sourceIds.includes(id)) merged.push(id)
  }
  for (const id of sourceIds) {
    if (!inCustom.has(id)) merged.push(id)
  }
  return merged
}

function buildSectionWithItems(sec: NavSection, layout: SidebarNavLayoutPersist): NavSection {
  const idOrder = orderedItemIds(sec, layout)
  const hiddenItems = new Set(layout.hiddenItemIds)
  const items: NavItem[] = []
  for (const itemId of idOrder) {
    if (hiddenItems.has(itemId)) continue
    const item = sec.items.find(i => i.id === itemId)
    if (item) items.push(item)
  }
  return { ...sec, items }
}

/** Sections + items after layout; excludes hidden sections. */
export function applySidebarNavLayout(sourceSections: NavSection[], layout: SidebarNavLayoutPersist): NavSection[] {
  const byId = new Map(sourceSections.map(s => [s.id, s] as const))
  const order = orderedSectionIds(sourceSections, layout)
  const hiddenSet = new Set(layout.hiddenSectionIds)
  const out: NavSection[] = []
  for (const id of order) {
    const sec = byId.get(id)
    if (!sec || hiddenSet.has(id)) continue
    out.push(buildSectionWithItems(sec, layout))
  }
  return out
}

/** Section with items for edit mode (includes items even when section is “hidden” from normal nav). */
export function sectionForEdit(sec: NavSection, layout: SidebarNavLayoutPersist): NavSection {
  const idOrder = orderedItemIds(sec, layout)
  const hiddenItems = new Set(layout.hiddenItemIds)
  const items: NavItem[] = []
  for (const itemId of idOrder) {
    if (hiddenItems.has(itemId)) continue
    const item = sec.items.find(i => i.id === itemId)
    if (item) items.push(item)
  }
  return { ...sec, items }
}

export function moveNavItemInLayout(
  layout: SidebarNavLayoutPersist,
  sourceSections: NavSection[],
  fromSectionId: string,
  toSectionId: string,
  itemId: string,
  beforeItemId: string | null,
): SidebarNavLayoutPersist {
  const getIds = (sectionId: string): string[] => {
    const sec = sourceSections.find(s => s.id === sectionId)
    if (!sec) return []
    return orderedItemIds(sec, layout)
  }

  const fromIds = [...getIds(fromSectionId)]
  const fi = fromIds.indexOf(itemId)
  if (fi === -1) return layout
  fromIds.splice(fi, 1)

  if (fromSectionId === toSectionId) {
    let insertAt =
      beforeItemId == null || !fromIds.includes(beforeItemId)
        ? fromIds.length
        : fromIds.indexOf(beforeItemId)
    if (beforeItemId === itemId) insertAt = fromIds.length
    if (fi < insertAt) insertAt -= 1
    fromIds.splice(insertAt, 0, itemId)
    return { ...layout, itemsBySection: { ...layout.itemsBySection, [fromSectionId]: fromIds } }
  }

  const toIds = [...getIds(toSectionId)]
  const ti =
    beforeItemId == null || !toIds.includes(beforeItemId) ? toIds.length : toIds.indexOf(beforeItemId)
  toIds.splice(ti, 0, itemId)

  return {
    ...layout,
    itemsBySection: {
      ...layout.itemsBySection,
      [fromSectionId]: fromIds,
      [toSectionId]:   toIds,
    },
  }
}

export function toggleSectionHidden(layout: SidebarNavLayoutPersist, sectionId: string): SidebarNavLayoutPersist {
  const next = new Set(layout.hiddenSectionIds)
  if (next.has(sectionId)) next.delete(sectionId)
  else next.add(sectionId)
  return { ...layout, hiddenSectionIds: [...next] }
}

export function toggleSectionCollapsed(layout: SidebarNavLayoutPersist, sectionId: string): SidebarNavLayoutPersist {
  const next = new Set(layout.collapsedSectionIds)
  if (next.has(sectionId)) next.delete(sectionId)
  else next.add(sectionId)
  return { ...layout, collapsedSectionIds: [...next] }
}

export function hideNavItem(layout: SidebarNavLayoutPersist, itemId: string): SidebarNavLayoutPersist {
  if (layout.hiddenItemIds.includes(itemId)) return layout
  return { ...layout, hiddenItemIds: [...layout.hiddenItemIds, itemId] }
}

export function resetSidebarNavLayout(): SidebarNavLayoutPersist {
  const fresh = defaultSidebarNavLayout()
  saveSidebarNavLayout(fresh)
  return fresh
}
