import { useMemo } from 'react'
import { Folder, Plus, Star } from 'lucide-react'

import { useDiagnostics } from '../../context/DiagnosticsContext'
import { useCustomZones } from '../../context/CustomZonesContext'
import type { CustomZone } from '../../context/CustomZonesContext'
import { useWebDesignerBookmarks } from '../../context/WebDesignerBookmarksContext'
import { webDesignerBookmarkNavId } from '../../lib/web-designer-bookmarks'
import { applySidebarNavLayout, type SidebarNavLayoutPersist } from './sidebarNavLayout'
import { NAV_SECTIONS, type NavItem, type NavSection } from './navigation'

export const CUSTOM_ZONES_SECTION_ID = 'custom-zones'
export const SIDEBAR_ACTIONS_SECTION_ID = 'sidebar-actions'

function withAllToolsBadge(sections: NavSection[], count: number): NavSection[] {
  return sections.map(section => ({
    ...section,
    items: section.items.map(item =>
      item.id === 'tools-hub'
        ? { ...item, badge: count }
        : item,
    ),
  }))
}

function buildCustomZonesSection(zones: CustomZone[]): NavSection | null {
  if (zones.length === 0) return null
  return {
    id:    CUSTOM_ZONES_SECTION_ID,
    title: 'MY ZONES',
    items: zones.map(zone => ({
      id:    zone.id,
      label: zone.title,
      icon:  Folder,
    })),
  }
}

function buildSidebarActionsSection(): NavSection {
  return {
    id:    SIDEBAR_ACTIONS_SECTION_ID,
    title: 'ACTIONS',
    items: [
      {
        id:    'zone-builder',
        label: 'New Zone',
        icon:  Plus,
      },
    ],
  }
}

function sectionItemCount(sections: NavSection[]): number {
  return sections.reduce((sum, section) => sum + section.items.length, 0)
}

export interface SidebarNavModel {
  sourceSections:    NavSection[]
  visibleSections:   NavSection[]
  customZonesSection: NavSection | null
  actionsSection:    NavSection
  allToolsSections:  NavSection[]
  allToolsItemCount: number
}

export function useSidebarNavModel(layout: SidebarNavLayoutPersist): SidebarNavModel {
  const { openBadgeCount, badgeTone } = useDiagnostics()
  const { zones }                     = useCustomZones()
  const { bookmarks }                 = useWebDesignerBookmarks()

  return useMemo(() => {
    const diagBadgeClass =
      badgeTone === 'critical' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'

    const baseSections =
      openBadgeCount <= 0
        ? NAV_SECTIONS
        : NAV_SECTIONS.map(sec =>
            sec.id !== 'dev'
              ? sec
              : {
                  ...sec,
                  items: sec.items.map(item =>
                    item.id === 'dev-diagnostics'
                      ? { ...item, badge: openBadgeCount, badgeClass: diagBadgeClass }
                      : item,
                  ),
                },
          )

    const sourceWithoutHubCount = baseSections.map(section => {
      if (section.id !== 'web-designer-nav') return section
      const extras: NavItem[] = [...bookmarks]
        .sort((a, b) => b.starredAt - a.starredAt)
        .map(b => ({
          id:    webDesignerBookmarkNavId(b.id),
          label: b.title.length > 24 ? `${b.title.slice(0, 22)}...` : b.title,
          icon:  Star,
        }))
      return { ...section, items: [...section.items, ...extras] }
    })

    const customZonesSection = buildCustomZonesSection(zones)
    const actionsSection = buildSidebarActionsSection()
    const visibleWithoutHubCount = applySidebarNavLayout(sourceWithoutHubCount, layout)
    const allToolsSectionsWithoutHubCount = [
      ...visibleWithoutHubCount,
      ...(customZonesSection ? [customZonesSection] : []),
      actionsSection,
    ]
    const allToolsItemCount = sectionItemCount(allToolsSectionsWithoutHubCount)
    const sourceSections = withAllToolsBadge(sourceWithoutHubCount, allToolsItemCount)
    const visibleSections = applySidebarNavLayout(sourceSections, layout)
    const allToolsSections = [
      ...visibleSections,
      ...(customZonesSection ? [customZonesSection] : []),
      actionsSection,
    ]

    return {
      sourceSections,
      visibleSections,
      customZonesSection,
      actionsSection,
      allToolsSections,
      allToolsItemCount,
    }
  }, [badgeTone, bookmarks, layout, openBadgeCount, zones])
}
