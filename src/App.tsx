import { useState } from 'react'
import { Menu } from 'lucide-react'
import Sidebar, { DEFAULT_ACTIVE_ID } from './components/sidebar'
import MainContent from './components/MainContent'
import TweaksPanel from './components/TweaksPanel'
import FilesDock from './components/files-dock/FilesDock'
import { BffConfigProvider } from './context/BffConfigContext'
import { DiagnosticsProvider } from './context/DiagnosticsContext'
import { MockDataProvider } from './context/MockDataContext'
import { UiChromeProvider } from './context/UiChromeContext'
import { ThemeProvider } from './context/ThemeContext'
import { CustomZonesProvider } from './context/CustomZonesContext'
import { WebDesignerBookmarksProvider } from './context/WebDesignerBookmarksContext'

function App() {
  const [activeRouteId, setActiveRouteId] = useState<string>(DEFAULT_ACTIVE_ID)
  const [sidebarOpen, setSidebarOpen]     = useState(false)

  const handleRouteChange = (id: string) => {
    setActiveRouteId(id)
    setSidebarOpen(false)
  }

  return (
    <ThemeProvider>
      <CustomZonesProvider>
        <WebDesignerBookmarksProvider>
          <BffConfigProvider>
          <DiagnosticsProvider>
            <MockDataProvider>
              <UiChromeProvider>
                <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-app)' }}>

                  {/* Mobile backdrop */}
                  {sidebarOpen && (
                    <div
                      className="fixed inset-0 z-40 md:hidden"
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
                      className="flex md:hidden items-center gap-3 px-4 py-3 shrink-0"
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
                        Dashboard X
                      </span>
                    </div>

                    <MainContent activeRouteId={activeRouteId} onNavigate={handleRouteChange} />
                  </div>

                  <TweaksPanel />
                  <FilesDock />
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
