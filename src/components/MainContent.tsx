import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import MixingZone from '../zones/mixing/MixingZone'
import MixingAudioGrabPage from '../zones/mixing/MixingAudioGrabPage'
import ToolsHubZone from '../zones/tools/ToolsHubZone'
import ToolsYoutubePage from '../zones/tools/ToolsYoutubePage'
import ToolsKeyFinderPage from '../zones/tools/ToolsKeyFinderPage'
import ToolsTempoTapPage from '../zones/tools/ToolsTempoTapPage'
import ToolsMetronomeExportPage from '../zones/tools/ToolsMetronomeExportPage'
import ToolsPhoneticsInspectorPage from '../zones/tools/ToolsPhoneticsInspectorPage'
import ToolsSessionTimerPage from '../zones/tools/ToolsSessionTimerPage'
import ToolsArrangementPadPage from '../zones/tools/ToolsArrangementPadPage'
import ToolsSampleSlicerPage from '../zones/tools/ToolsSampleSlicerPage'
import ToolsStemSplitterPage from '../zones/tools/ToolsStemSplitterPage'
import HarmonyStackZone from '../zones/harmony/HarmonyStackZone'
import CpwZone from '../zones/cpw/CpwZone'
import { parseWebDesignerBookmarkNavId } from '../lib/web-designer-bookmarks'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { getToolById } from '../lib/toolsRegistry'
import { resolveRouteTitle } from '../lib/routeTitles'
import { filesDockShell } from './files-dock/files-store'

import ConnectionPill from './ConnectionPill'
import { LoadingState } from './ui/states'

const VocalsZone = lazy(() => import('../zones/vocals/VocalsZone'))
const AgentFarm = lazy(() => import('./agent-farm'))
const RhymeStudio = lazy(() => import('./rhyme-studio/RhymeStudio'))
const ToolsChordDetectorPage = lazy(() => import('../zones/tools/ToolsChordDetectorPage'))
const ToolsNoteDetector2Page = lazy(() => import('../zones/tools/ToolsNoteDetector2Page'))
const WebDesignerZone = lazy(() => import('../zones/web-designer/WebDesignerZone'))
const TeslaFleet = lazy(() => import('../zones/tesla/TeslaMock'))
const PulseDigest = lazy(() => import('../zones/pulse/PulseDigest'))
const CdlHubZone = lazy(() => import('../zones/cdl/CdlHubZone'))
const CdlHazmatPage = lazy(() => import('../zones/cdl/CdlHazmatPage'))
const CdlAirBrakesPage = lazy(() => import('../zones/cdl/CdlAirBrakesPage'))
const CdlTankerPage = lazy(() => import('../zones/cdl/CdlTankerPage'))
const CdlDoublesTriplesPage = lazy(() => import('../zones/cdl/CdlDoublesTriplesPage'))
const CdlTankerDoublesPage = lazy(() => import('../zones/cdl/CdlTankerDoublesPage'))
const CdlTankerHazmatPage = lazy(() => import('../zones/cdl/CdlTankerHazmatPage'))
const CdlPassengerPage = lazy(() => import('../zones/cdl/CdlPassengerPage'))
const CdlSchoolBusPage = lazy(() => import('../zones/cdl/CdlSchoolBusPage'))
const CdlPreTripCabinPage = lazy(() => import('../zones/cdl/CdlPreTripCabinPage'))
const CdlPreTripEngineBayPage = lazy(() => import('../zones/cdl/CdlPreTripEngineBayPage'))
const CdlPreTripSteeringAxlePage = lazy(() => import('../zones/cdl/CdlPreTripSteeringAxlePage'))
const CdlPreTripCouplingPage = lazy(() => import('../zones/cdl/CdlPreTripCouplingPage'))
const CdlPreTripTrailerPage = lazy(() => import('../zones/cdl/CdlPreTripTrailerPage'))
const CdlPreTripPartsMap = lazy(() => import('../zones/cdl/CdlPreTripPartsMap'))
const CdlPreTripDeepDive = lazy(() => import('../zones/cdl/CdlPreTripDeepDive'))
const CdlStandaloneApp = lazy(() => import('../zones/cdl/CdlStandaloneApp'))
const DevSettings = lazy(() => import('../zones/dev/DevSettings'))
const DiagnosticsZone = lazy(() => import('../zones/dev/DiagnosticsZone'))
const NewZonePage = lazy(() => import('../zones/builder/NewZonePage'))
const CustomZonePage = lazy(() => import('../zones/builder/CustomZonePage'))

interface MainContentProps {
  activeRouteId: string
  onNavigate:    (routeId: string) => void
}

export default function MainContent({ activeRouteId, onNavigate }: MainContentProps) {
  const routeId = activeRouteId === 'production-overview' ? 'agent-farm' : activeRouteId

  useEffect(() => {
    const id = activeRouteId === 'production-overview' ? 'agent-farm' : activeRouteId
    const dock = getToolById(id)?.dock
    if (dock?.openOnLaunch) filesDockShell.open()
    else filesDockShell.close()
    filesDockShell.setPinTab(dock?.pinTab)
  }, [activeRouteId])

  useDocumentTitle(resolveRouteTitle(routeId))

  let body: ReactNode
  switch (routeId) {
    case 'tools-hub':
      body = <ToolsHubZone onNavigate={onNavigate} />
      break
    case 'tools-youtube-downloader':
      body = <ToolsYoutubePage onNavigate={onNavigate} />
      break
    case 'tools-key-finder':
      body = <ToolsKeyFinderPage onNavigate={onNavigate} />
      break
    case 'tools-chord-detector':
      body = <ToolsChordDetectorPage onNavigate={onNavigate} />
      break
    case 'tools-note-detector-2':
      body = <ToolsNoteDetector2Page onNavigate={onNavigate} />
      break
    case 'tools-tempo-tap':
      body = <ToolsTempoTapPage onNavigate={onNavigate} />
      break
    case 'tools-metronome-export':
      body = <ToolsMetronomeExportPage onNavigate={onNavigate} />
      break
    case 'tools-phonetics-inspector':
      body = <ToolsPhoneticsInspectorPage onNavigate={onNavigate} />
      break
    case 'tools-session-timer':
      body = <ToolsSessionTimerPage onNavigate={onNavigate} />
      break
    case 'tools-arrangement-pad':
      body = <ToolsArrangementPadPage onNavigate={onNavigate} />
      break
    case 'tools-sample-slicer':
      body = <ToolsSampleSlicerPage onNavigate={onNavigate} />
      break
    case 'tools-stem-splitter':
      body = <ToolsStemSplitterPage onNavigate={onNavigate} />
      break
    case 'agent-farm':
      body = <AgentFarm />
      break
    case 'rhyme-studio':
      body = <RhymeStudio />
      break
    case 'vocals':
      body = <VocalsZone />
      break
    case 'mixing':
      body = <MixingZone />
      break
    case 'mixing-audio-grab':
      body = <MixingAudioGrabPage />
      break
    case 'harmony-services':
    case 'harmony-todos':
    case 'harmony-portfolio':
      body = (
        <HarmonyStackZone
          key={activeRouteId}
          defaultTab={
            activeRouteId === 'harmony-todos' ? 'projects'
              : activeRouteId === 'harmony-portfolio' ? 'portfolio'
              : 'services'
          }
        />
      )
      break
    case 'cpw-projects':
      body = <CpwZone />
      break
    case 'pulse':
      body = <PulseDigest />
      break
    case 'cdl-hub':
      body = <CdlHubZone onNavigate={onNavigate} />
      break
    case 'cdl-practice-app':
      body = <CdlStandaloneApp />
      break
    case 'cdl-hazmat':
      body = <CdlHazmatPage />
      break
    case 'cdl-air-brakes':
      body = <CdlAirBrakesPage />
      break
    case 'cdl-tanker':
      body = <CdlTankerPage />
      break
    case 'cdl-doubles-triples':
      body = <CdlDoublesTriplesPage />
      break
    case 'cdl-tanker-doubles':
      body = <CdlTankerDoublesPage />
      break
    case 'cdl-tanker-hazmat':
      body = <CdlTankerHazmatPage />
      break
    case 'cdl-passenger':
      body = <CdlPassengerPage />
      break
    case 'cdl-school-bus':
      body = <CdlSchoolBusPage />
      break
    case 'cdl-pretrip-cabin':
      body = <CdlPreTripCabinPage />
      break
    case 'cdl-pretrip-engine-bay':
      body = <CdlPreTripEngineBayPage />
      break
    case 'cdl-pretrip-steering-axle':
      body = <CdlPreTripSteeringAxlePage />
      break
    case 'cdl-pretrip-coupling':
      body = <CdlPreTripCouplingPage />
      break
    case 'cdl-pretrip-trailer':
      body = <CdlPreTripTrailerPage />
      break
    case 'cdl-pretrip-parts-map':
      body = <CdlPreTripPartsMap onNavigate={onNavigate} />
      break
    case 'cdl-pretrip-deep-dive':
      body = <CdlPreTripDeepDive onNavigate={onNavigate} />
      break
    case 'web-designer':
      body = <WebDesignerZone key="web-designer-main" onNavigate={onNavigate} />
      break
    case 'dev-diagnostics':
      body = <DiagnosticsZone onNavigate={onNavigate} />
      break
    case 'dev':
      body = <DevSettings onNavigate={onNavigate} />
      break
    case 'tesla':
      body = <TeslaFleet />
      break
    case 'zone-builder':
      body = (
        <NewZonePage
          onBack={() => onNavigate('agent-farm')}
          onNavigate={onNavigate}
        />
      )
      break
    default: {
      const webBm = parseWebDesignerBookmarkNavId(activeRouteId)
      if (webBm) {
        body = <WebDesignerZone key={webBm} onNavigate={onNavigate} initialBookmarkId={webBm} />
        break
      }
      if (activeRouteId.startsWith('custom-')) {
        body = (
          <CustomZonePage
            zoneId={activeRouteId}
            onBack={() => onNavigate('agent-farm')}
            onNavigate={onNavigate}
          />
        )
      } else {
        body = (
          <div className="flex-1 p-8 text-sm" style={{ background: 'var(--bg-canvas)', color: 'var(--text-3)' }}>
            Unknown route &quot;{activeRouteId}&quot; — select an item in the sidebar.
          </div>
        )
      }
      break
    }
  }

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <ConnectionPill activeRouteId={routeId} onNavigate={onNavigate} />
      <Suspense fallback={<LoadingState label="Loading…" />}>
        {body}
      </Suspense>
    </div>
  )
}
