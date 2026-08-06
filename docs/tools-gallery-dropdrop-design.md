# Tools Reorg + Drop-to-Run + Gallery — Design (real app)

**Date:** 2026-07-06 · **Repo:** ~/dashboard-ui-x · **Branch:** feat/tools-gallery-dropdrop

Integrates with existing patterns — does NOT add a new backend. Persistence stays
IndexedDB (`files-dock/files-store.ts`); real processing stays in the existing
per-tool engines/BFF. Reuses the established `inbound-clip-<routeId>` handoff.

## What already exists (reuse)

- `src/lib/toolsRegistry.ts` — `ToolDef` (id, routeId, label, icon, category, dock, family).
- `src/components/files-dock/files-store.ts` — IndexedDB `StoredFile` store,
  `subscribeFiles`, `addDownloadedFile`, `dispatchFileDownload`, `getFileById`,
  `receiveDockOrFileDrop`, `openFile`, `deleteFile`. Lanes in `dock-lanes.ts`.
- Hub `ToolsHubZone.tsx` (search + drag-tile-to-sidebar via `SIDEBAR_NAV_DND_MIME`).
- Sidebar drop-to-restore. `MainContent.tsx` `onNavigate(routeId)` router.
- Handoff contract: `sessionStorage['inbound-clip-<routeId>'] = dockFileId` then
  navigate → tool page consumes on mount (KeyFinder/StemSplitter/Chord/Youtube).
- Real per-tool processing (YouTube→mp3 BFF, Chord via Gemini, Note Detector Docker,
  Key/Stem/Sample browser Web Audio).

## Changes

### 1. Metadata tagging (foundation)
Extend `StoredFile` + `FileEventDetail` with optional `sourceTool?: string`
(tool id), `outputType?: string`, `tags?: string[]`. Backward-compatible (no IDB
migration — keyPath unchanged). Raise `MAX_FILES` 24 → 120 so the gallery retains
history. Update existing `dispatchFileDownload(...)` call sites in tool pages to
pass `sourceTool` + `outputType` (e.g. `stems`, `yt-download`, `key-analysis`,
`chords`, `sample`). Derive sensible fallbacks from `source`/`lane`/`mime` when absent.

### 2. Gallery (headline)
- `src/components/gallery/GalleryFab.tsx` — floating `+` bottom-right; badge = file count.
- `src/components/gallery/GalleryDrawer.tsx` — right drawer reading `subscribeFiles()`.
  Cards: preview (audio/video/img), name, size·date, **tool chip** (`getToolLabel`),
  **output-type chip**, tags; download / open / delete. Filter chips by tool +
  output type. Also a file-drop zone (drop anywhere in drawer → routes to a matching
  tool, or just stores).
- `src/hooks/useGalleryFiles.ts` — thin wrapper over `subscribeFiles`.
- Mount FAB + drawer once at app root (`MAINsamuelXdashboardFile.tsx`).
- Complements the existing FilesDock (does not remove it); both read one store.

### 3. `ToolDef` quick actions + accepts
Extend `ToolDef`:
- `accepts?: string[]` — mime prefixes the tool takes (`['audio/']`, `['image/']`, null).
- `quickActions?: { id: string; label: string }[]` — small buttons on the tile.
Populate for file tools (key-finder, chord, stem, note, sample, app-icon,
device-mockup accept files; youtube takes a URL).

### 4. Drop-to-run on tiles + sidebar tabs
- `src/lib/tool-drop-run.ts` — `startDropRun(tool, file)`: `addDownloadedFile`
  (tagged) → `sessionStorage['inbound-clip-'+routeId]=id` → navigate(routeId).
- `src/hooks/useGlobalDrag.ts` — window-level file-drag state for highlighting.
- Hub `ToolTile`: when `accepts` matches the dragged mime, highlight; on drop →
  `startDropRun`. Distinct from the existing tile→sidebar drag (that sets
  `SIDEBAR_NAV_DND_MIME`; file drops carry `Files`).
- Sidebar tool item: same file-drop branch, guarded so it doesn't clash with the
  nav-item restore DnD.
- Quick actions: "Upload" opens a hidden file input → `startDropRun`; browser
  utilities open their page; YouTube focuses its URL field.

### 5. Concise hub polish
Clearer category order/labels, quick-action row + "drop to run" affordance per tile,
keep search + drag-to-sidebar. Presentational only, using existing tone tokens.

## Non-goals
- No Fastify/SQLite server; no replacing FilesDock; no rewriting tool engines.
- Tools without a local engine stay as-is (already labeled Beta / service-down banners).

## Verification
- `npm run dev` (port 5175) — hub renders, quick actions present.
- Drop an audio file on the Key Finder tile → navigates + analyzes → output appears
  in Gallery tagged `Key & STEM` / `key-analysis`.
- `+` FAB opens drawer; filter by tool/type; download/delete work.
- Playwright visual specs still pass.
