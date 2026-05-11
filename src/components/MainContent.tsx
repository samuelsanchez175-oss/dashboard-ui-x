import AgentFarm from './agent-farm'
import { RhymeStudio } from './rhyme-studio'
import VocalsZone from '../zones/vocals/VocalsZone'
import ProductionZone from '../zones/production/ProductionZone'
import MixingZone from '../zones/mixing/MixingZone'
import MixingAudioGrabPage from '../zones/mixing/MixingAudioGrabPage'
import PulseDigest from '../zones/pulse/PulseDigest'
import DevSettings from '../zones/dev/DevSettings'
import DiagnosticsZone from '../zones/dev/DiagnosticsZone'
import TeslaMock from '../zones/tesla/TeslaMock'
import ToolsHubZone from '../zones/tools/ToolsHubZone'
import ToolsYoutubePage from '../zones/tools/ToolsYoutubePage'
import ToolsKeyFinderPage from '../zones/tools/ToolsKeyFinderPage'
import ToolsChordDetectorPage from '../zones/tools/ToolsChordDetectorPage'
import ToolsTempoTapPage from '../zones/tools/ToolsTempoTapPage'
import HarmonyStackZone from '../zones/harmony/HarmonyStackZone'
import CpwZone from '../zones/cpw/CpwZone'
import NewZonePage from '../zones/builder/NewZonePage'
import CustomZonePage from '../zones/builder/CustomZonePage'

import ConnectionPill from './ConnectionPill'
import type { ReactNode } from 'react'

interface MainContentProps {
  activeRouteId: string
  onNavigate:    (routeId: string) => void
}

export default function MainContent({ activeRouteId, onNavigate }: MainContentProps) {
  let body: ReactNode
  switch (activeRouteId) {
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
    case 'tools-tempo-tap':
      body = <ToolsTempoTapPage onNavigate={onNavigate} />
      break
    case 'production-overview':
      body = <ProductionZone />
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
      body = <HarmonyStackZone defaultTab={activeRouteId === 'harmony-todos' ? 'projects' : 'services'} />
      break
    case 'cpw-projects':
      body = <CpwZone />
      break
    case 'pulse':
      body = <PulseDigest />
      break
    case 'dev-diagnostics':
      body = <DiagnosticsZone />
      break
    case 'dev':
      body = <DevSettings />
      break
    case 'tesla':
      body = <TeslaMock />
      break
    case 'zone-builder':
      body = (
        <NewZonePage
          onBack={() => onNavigate('production-overview')}
          onNavigate={onNavigate}
        />
      )
      break
    default:
      if (activeRouteId.startsWith('custom-')) {
        body = (
          <CustomZonePage
            zoneId={activeRouteId}
            onBack={() => onNavigate('production-overview')}
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
  }

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <ConnectionPill activeRouteId={activeRouteId} />
      {body}
    </div>
  )
}
