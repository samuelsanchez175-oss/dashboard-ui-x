import { useCallback, useEffect, useState } from 'react'
import { Menu } from 'lucide-react'
import Sidebar, { DEFAULT_ACTIVE_ID } from './components/sidebar'
import MainContent from './components/MainContent'
import TweaksPanel from './components/TweaksPanel'
import FilesDock from './components/files-dock/FilesDock'
import ShortcutOverlay from './components/ui/ShortcutOverlay'
import { BffConfigProvider } from './context/BffConfigContext'
import { DiagnosticsProvider } from './context/DiagnosticsContext'
import { MockDataProvider } from './context/MockDataContext'
import { UiChromeProvider } from './context/UiChromeContext'
import { TeslaFleetMockSyncBridge } from './zones/tesla/TeslaFleetMockSyncBridge'
import { ThemeProvider } from './context/ThemeContext'
import { CustomZonesProvider } from './context/CustomZonesContext'
import { WebDesignerBookmarksProvider } from './context/WebDesignerBookmarksContext'
import { useGlobalShortcutOverlay } from './lib/useGlobalShortcuts'
import { useSwipeGesture } from './hooks/useSwipeGesture'

import { RECENT_EDITS } from './lib/recentEdits'
import { seedUpdates, useUpdatesStore } from './lib/updatesStore'

/**
 * Feature flag — keeps the floating files dock hidden until we've defined a
 * real use case for it. The component + downloads-lane store under
 * `src/components/files-dock/` is intentionally kept around (and still
 * imported above so unused-import lints stay quiet) so this can flip back
 * to `true` and re-enable the whole thing in one line. See render site in
 * `App()` below.
 */
const SHOW_FILES_DOCK = false

const SESSION_TOUCHED_ZONE_SEED = [
  'tools-hub',
  'tools-chord-detector',
  'mixing-audio-grab',
  'agent-farm',
  'rhyme-studio',
  'tesla',
  'pulse',
  'dev-diagnostics',
  'dev',
  'harmony-services',
  'harmony-projects',
  'harmony-portfolio',
] as const

function App() {
  const [activeRouteId, setActiveRouteId] = useState<string>(DEFAULT_ACTIVE_ID)
  const [sidebarOpen, setSidebarOpen]     = useState(false)
  const { overlayOpen, closeOverlay }     = useGlobalShortcutOverlay()

  useEffect(() => {
    const DAY_MS = 24 * 60 * 60 * 1000
    const now = Date.now()
    for (const [zoneId, iso] of Object.entries(RECENT_EDITS)) {
      const touched = new Date(iso).getTime()
      if (!Number.isFinite(touched)) continue
      if (now - touched < DAY_MS) {
        useUpdatesStore.getState().markUpdated(zoneId)
      }
    }
    seedUpdates([...SESSION_TOUCHED_ZONE_SEED])
  }, [])

  const handleRouteChange = useCallback((id: string) => {
    setActiveRouteId(id === 'production-overview' ? 'agent-farm' : id)
    setSidebarOpen(false)
  }, [])

  // Cross-zone synergy bus: any module can dispatch
  // `CustomEvent('dashboard:set-route', { detail: { id } })` to navigate
  // (used by MixingAudioGrabber "Send to" rows and RecentClipsTray).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id?: string }>).detail
      if (detail?.id) handleRouteChange(detail.id)
    }
    window.addEventListener('dashboard:set-route', handler)
    return () => window.removeEventListener('dashboard:set-route', handler)
  }, [handleRouteChange])

  const openSidebar  = useCallback(() => setSidebarOpen(true),  [])
  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  // Mobile gestures: swipe right from the left edge to open the menu,
  // swipe left anywhere while open to close it.
  useSwipeGesture({
    onSwipeRight: sidebarOpen ? undefined : openSidebar,
    onSwipeLeft:  sidebarOpen ? closeSidebar : undefined,
    rightEdgeSize: 28,
  })

  return (
    <ThemeProvider>
      <CustomZonesProvider>
        <WebDesignerBookmarksProvider>
          <BffConfigProvider>
          <DiagnosticsProvider>
            <MockDataProvider>
              <TeslaFleetMockSyncBridge />
              <UiChromeProvider>
                <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-app)' }}>

                  {/* Mobile backdrop */}
                  {sidebarOpen && (
                    <div
                      className="fixed inset-0 z-40 sm:hidden"
                      style={{ background: 'rgba(0,0,0,0.45)' }}
                      onClick={() => setSidebarOpen(false)}
                    />
                  )}

                  <Sidebar
                    onRouteChange={handleRouteChange}
                    activeRouteId={activeRouteId}
                    mobileOpen={sidebarOpen}
                    onMobileClose={() => setSidebarOpen(false)}
                  />

                  {/* Main column */}
                  <div className="flex flex-col flex-1 min-w-0 min-h-0">
                    {/* Mobile top bar */}
                    <div
                      className="flex sm:hidden items-center gap-3 px-4 py-3 shrink-0"
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: 'var(--bg-sidebar)',
                      }}
                    >
                      <button
                        onClick={() => setSidebarOpen(true)}
                        className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
                        style={{ color: 'var(--text-2)', background: 'var(--bg-hover)' }}
                      >
                        <Menu size={16} />
                      </button>
                      <span
                        className="text-[14px] font-semibold tracking-tight"
                        style={{ color: 'var(--text-1)' }}
                      >
                        Samuel x Dashboard
                      </span>
                    </div>

                    <MainContent activeRouteId={activeRouteId} onNavigate={handleRouteChange} />
                  </div>

                  <TweaksPanel />
                  {/* FilesDock disabled per user request (2026-05-18). The
                   * dock + downloads / analysis lanes felt like noise without
                   * a real use case driving them yet. Flip
                   * `SHOW_FILES_DOCK` back to `true` to re-enable; the whole
                   * component + its store under `src/components/files-dock/`
                   * is intentionally NOT deleted so a future feature can
                   * pick it back up without rebuilding from scratch. */}
                  {SHOW_FILES_DOCK && <FilesDock />}
                  <ShortcutOverlay open={overlayOpen} onClose={closeOverlay} />
                </div>
              </UiChromeProvider>
            </MockDataProvider>
          </DiagnosticsProvider>
        </BffConfigProvider>
        </WebDesignerBookmarksProvider>
      </CustomZonesProvider>
    </ThemeProvider>
  )
}

export default App
