import { addDownloadedFile } from '../components/files-dock/files-store'
import type { ToolDef } from './toolsRegistry'

/**
 * Drop-to-run: store a dropped/picked file in the gallery (tagged with the
 * target tool), then hand it off to the tool via the agreed
 * `inbound-clip-<routeId>` sessionStorage contract and navigate there. The tool
 * page picks the clip up on mount and processes it — reusing the exact relay
 * that `RecentClipsTray` / `ToolsYoutubePage` already use. No new backend.
 */
export async function startDropRun(tool: ToolDef, file: File | Blob, fileName?: string): Promise<void> {
  const name = fileName ?? (file instanceof File ? file.name : `clip-for-${tool.id}`)
  const stored = await addDownloadedFile({
    blob: file,
    name,
    source: `Sent to ${tool.label}`,
    sourceTool: tool.id,
    lane: tool.dock?.pinTab,
  })

  try {
    sessionStorage.setItem(`inbound-clip-${tool.routeId}`, stored.id)
  } catch {
    /* sessionStorage unavailable — navigation still happens, tool just won't auto-ingest */
  }

  // Same navigation bus MAINsamuelXdashboardFile listens on.
  window.dispatchEvent(new CustomEvent('dashboard:set-route', { detail: { id: tool.routeId } }))
}
