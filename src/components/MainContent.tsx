import { lazy, Suspense, useEffect, type ReactNode } from 'react'
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
import ToolsAppIconStudioPage from '../zones/tools/ToolsAppIconStudioPage'
import ToolsDeviceMockupPage from '../zones/tools/ToolsDeviceMockupPage'
import HarmonyStackZone from '../zones/harmony/HarmonyStackZone'
import HarmonyHtmlFrame from '../zones/harmony/HarmonyHtmlFrame'
import CdlOneStopZone from '../zones/harmony/CdlOneStopZone'
import CdlQrZone from '../zones/harmony/CdlQrZone'
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
const PolymarketWallet = lazy(() => import('../zones/polymarket/PolymarketWalletZone'))
const PolymarketCopy = lazy(() => import('../zones/polymarket/CopyTraderZone'))
const PolymarketBot = lazy(() => import('../zones/polymarket/PolymarketBotZone'))
const PulseDigest = lazy(() => import('../zones/pulse/PulseDigest'))
const DailyBriefZone = lazy(() => import('../zones/brief/DailyBriefZone'))
const CommandCenterZone = lazy(() => import('../zones/command-center/CommandCenterZone'))
const CostZone = lazy(() => import('../zones/cost/CostZone'))
const DevSettings = lazy(() => import('../zones/dev/DevSettings'))
const DiagnosticsZone = lazy(() => import('../zones/dev/DiagnosticsZone'))
const NewZonePage = lazy(() => import('../zones/builder/NewZonePage'))
const CustomZonePage = lazy(() => import('../zones/builder/CustomZonePage'))
const VaultConsoleZone = lazy(() => import('../zones/vault/VaultConsoleZone'))
const VaultRagZone = lazy(() => import('../zones/vault/VaultRagZone'))
const VaultHandoffsZone = lazy(() => import('../zones/vault/VaultHandoffsZone'))
const VaultStudyZone = lazy(() => import('../zones/vault/VaultStudyZone'))
const VaultClippingsZone = lazy(() => import('../zones/vault/VaultClippingsZone'))
const VaultMediaZone = lazy(() => import('../zones/vault/VaultMediaZone'))
const VaultLyricsZone = lazy(() => import('../zones/vault/VaultLyricsZone'))
const VaultIngestZone = lazy(() => import('../zones/vault/VaultIngestZone'))

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
    case 'tools-app-icon':
      body = <ToolsAppIconStudioPage onNavigate={onNavigate} />
      break
    case 'tools-device-mockup':
      body = <ToolsDeviceMockupPage onNavigate={onNavigate} />
      break
    case 'vault-console':
      body = <VaultConsoleZone />
      break
    case 'vault-rag':
      body = <VaultRagZone />
      break
    case 'vault-handoffs':
      body = <VaultHandoffsZone />
      break
    case 'vault-study':
      body = <VaultStudyZone />
      break
    case 'vault-clippings':
      body = <VaultClippingsZone />
      break
    case 'vault-media':
      body = <VaultMediaZone onNavigate={onNavigate} />
      break
    case 'vault-lyrics':
      body = <VaultLyricsZone onNavigate={onNavigate} />
      break
    case 'vault-ingest':
      body = <VaultIngestZone />
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
      // Mix board removed — redirect to audio grab
      body = <MixingAudioGrabPage />
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
          defaultTab={activeRouteId === 'harmony-todos' ? 'projects' : 'site'}
        />
      )
      break
    case 'harmony-cdl':
      body = <CdlOneStopZone />
      break
    case 'harmony-cdl-qr':
      body = <CdlQrZone />
      break
    case 'harmony-penwork':
      body = (
        <HarmonyHtmlFrame
          file="penwork-marketing.html"
          title="Penwork Studio — songwriting app marketing"
        />
      )
      break
    case 'cpw-projects':
      body = <CpwZone />
      break
    case 'pulse':
      body = <PulseDigest />
      break
    case 'daily-brief':
      body = <DailyBriefZone />
      break
    case 'command-center':
      body = <CommandCenterZone />
      break
    case 'codeburn':
      body = <CostZone />
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
    case 'polymarket':
      body = <PolymarketWallet />
      break
    case 'polymarket-copy':
      body = <PolymarketCopy />
      break
    case 'polymarket-bot':
      body = <PolymarketBot />
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
