# Tools Hub + Real File Pipeline + Gallery — Design

**Date:** 2026-07-06
**Repo:** UI Dashboard x (Vite + React + Tailwind, TS)
**Status:** Approved (Option C — real processing)

## Goal

Reorganize the Tools hub into a concise, easy-to-use, data-driven page. Every
file-accepting tool becomes a drop target: dropping a file starts a **real**
processing job. Produced/processed files persist in a **Gallery** attached to
the dashboard, each tagged with the tool that made it and its output type.

## Decisions (from brainstorming)

- **Source of truth:** build into THIS repo; screenshot is the design target.
- **Processing:** Option C — real engines, not simulated.
- **Storage:** server-side disk + SQLite metadata (supersedes the earlier
  IndexedDB idea, because real outputs are large media files).
- **Tool set:** curated real set (no padding to an arbitrary 33).
- **Engines:** YT (yt-dlp+ffmpeg, already installed) real now; audio analysis
  (librosa/aubio) and Stem Split (Demucs) installed + wired; JSON/Base64/Color
  real in-browser.

## Architecture

Two processes, one repo:

```
src/            React frontend (existing, extended)
server/         NEW Fastify backend that runs the engines
data/           gitignored: data/files/ (outputs+uploads), data/dashboard.db
```

Frontend ↔ backend over REST + SSE. Vite dev proxies `/api` → backend (:8787).

### Backend (`server/`)

- **Fastify** + `@fastify/multipart` + `@fastify/cors`. Run with `tsx`.
- **SQLite** via `better-sqlite3`. One table `files`:
  `id, name, mime, size, path, sourceTool, outputType, tags(json), status,
   createdAt, jobId, meta(json)`.
- **Job manager** (`server/jobs.ts`): each run creates a job with live
  progress; emits SSE events (`progress`, `log`, `done`, `error`).
- **Engines** (`server/engines/`):
  - `ytdlp.ts` — spawn `yt-dlp` (audio `-x` or video), parse `--newline`
    progress, write to `data/files/`, register outputs.
  - `audio.ts` — spawn `python3 server/scripts/analyze.py <file> <mode>`;
    returns JSON (bpm / key / chords / notes). Uses librosa (+aubio if present).
  - `demucs.ts` — spawn `demucs` (venv), stems → folder, register each stem
    (`outputType: "stems"`).
- **Files** (`server/files.ts`): save upload, stream blob, delete.

### API

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/upload` | multipart → store file → `{fileId}` |
| POST | `/api/tools/:toolId/run` | `{fileId?, input?}` → `{jobId}` |
| GET | `/api/jobs/:jobId/events` | SSE progress stream |
| GET | `/api/files` | gallery list (filter by tool/type) |
| GET | `/api/files/:id/blob` | stream file |
| DELETE | `/api/files/:id` | remove file + row |

### Frontend

- **`src/lib/toolRegistry.ts`** — single source of truth. Each tool:
  `{ id, label, icon, category, description, accepts, quickActions[], runKind }`.
  `accepts` (mime globs) decides drop-target eligibility. Drives sidebar,
  hub tiles, drop targets, quick actions.
- **Taxonomy:** Audio/Music, Media, Utilities, Markets, Workspace.
- **Components (small, isolated):**
  - `ToolsHub` — grouped, searchable tile grid + "N reachable" header.
  - `ToolTile` — icon, label, desc, quick-action buttons, drop-target.
  - `Sidebar` — zones + tools (also drop targets). Refactored from App.tsx.
  - `Gallery` — right drawer: file cards, tool + output-type chips, filter,
    preview, download, delete. Opened by...
  - `GalleryFab` — floating `+` button, bottom-right.
  - `DropOverlay` — highlights eligible targets while dragging.
  - `JobToast` — live progress for running jobs (SSE).
- **Hooks:** `useFileStore()` (gallery data + polling/refetch),
  `useDragFile()` (global drag state + eligibility), `useJob()` (SSE).
- **In-browser real tools:** JSON format/validate, Base64 enc/dec, Color
  convert — no backend round-trip.

## Data flow (drop → gallery)

1. User drags file over hub/sidebar. `useDragFile` highlights tiles whose
   `accepts` matches.
2. Drop on a tool → `POST /api/upload` → `POST /api/tools/:id/run` → `{jobId}`.
3. `JobToast` opens SSE `…/events`, shows real progress.
4. Engine writes output(s) to `data/files/`, inserts `files` rows tagged
   `sourceTool` + `outputType`.
5. On `done`, gallery refetches; new tagged files appear.

## Quick actions (examples)

- Stem Split: *Upload audio* · *Recent*
- YT Downloader: *Paste URL* · *Download*
- Base64: *Encode* · *Decode*
- Chord: *Upload audio* · *Detect*

## Metadata / tagging

Every output row carries `sourceTool` (which tool made it) and `outputType`
(`stems`, `yt-download`, `json`, `audio`, ...) plus auto tags (mime, date).
Gallery filters by these.

## Phasing

1. Backend scaffold + SQLite + files + gallery + drag-drop + reorganized hub;
   **YT Downloader real** + utilities real. (No install cost.)
2. Audio analysis engine (install librosa/aubio) → chord/key/tempo/note.
3. Demucs stem split (heavy install, background) → real stems.

## Non-goals

- Auth, multi-user, cloud sync.
- Real engines for tools with no local engine — those stay clearly-labeled
  stubs until an engine is added (registry marks `runKind: 'stub'`).

## Testing

- Backend: unit-test job manager + registry mapping; smoke-test each engine
  spawn with a tiny fixture.
- Frontend: Playwright visual/interaction — drop simulation, gallery renders
  a tagged card, FAB opens drawer. (Aligns with existing Playwright setup.)
