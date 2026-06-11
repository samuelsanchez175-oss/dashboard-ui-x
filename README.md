# UI Dashboard X

Local-first Vite + React + TypeScript dashboard shell with zone-based navigation and dev-only API helpers.

## Stack

- **Vite 8**, **React 19**, **Tailwind CSS 4**
- **No cloud required** for UI, static content, or dev middleware

## Zones (sidebar order)

1. **Daily Brief** — daily synthesis snapshot from the Obsidian vault (see [Daily Brief data](#daily-brief-data))
2. **Tools** — tool hub: Chord Detector, Key & BPM Finder, Stem Splitter, Note Detector 2, Phonetics Inspector, YouTube audio, …
3. **Production** — Agent Farm cockpit (YouTube + integrations)
4. **Vocals** — Piano / MIDI (MIDI-first capture; export for DAWs) + Rhyme Studio
5. **Mixing** — Mix board + Audio grab
6. **Harmony Stack** — Services & Pricing, Client Projects, Portfolio
7. **CPW** — Projects
8. **Pulse** — AI digest via Reddit RSS for [r/claudeskills](https://www.reddit.com/r/claudeskills/) (proxied at `/api/digest/reddit` in dev)
9. **Web Design** — Designer browser
10. **Dev** — Diagnostics + Settings & API (env snapshot, key scratch, optional browser vault)
11. **Tesla** — Tesla Fleet (mock vehicle cards, OAuth scratch, virtual-key flow)

Custom zones can be added at runtime via the zone builder (`src/zones/builder/`); they are stored in browser localStorage.

### Studio / DAW note (MIDI-first)

Musical workflow is **MIDI-first**: use **Vocals → Piano / MIDI** for ideas and `.mid` export, then continue in **Logic Pro** or **FL Studio** for full mixing. The **Mixing** zone is reserved for future recall sheets, stems, and DAW-adjacent tooling.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5175` (the port is pinned in `vite.config.ts` with `strictPort: true` — if 5175 is busy, Vite fails fast instead of hopping ports).

## Daily Brief data

- `public/data/daily-brief.json` is generated **outside this repo** from the Obsidian vault at `~/Documents/OB CLAUDE vault`:
  1. A launchd job (`com.user.daily-brief`, Mondays 07:00) runs Claude headless to write `🌅 Daily Brief/Briefs/<date>.md` in the vault.
  2. `dashboard-ui/build.py` in the vault parses the latest brief and syncs the JSON snapshot into this repo's `public/data/`.
- If the Daily Brief zone shows "No brief snapshot found" (or stale content), run `python3 build.py` inside the vault's `dashboard-ui/` folder.

## Local content

- `content/prompts/` — starter markdown for prompts
- `content/presets/` — starter JSON for presets

In dev, files are exposed read-only via:

- `GET /api/local/file?path=prompts/starter.md`
- `GET /api/local/file?path=presets/starter.json`

Only `.md`, `.json`, and `.txt` under `content/` are allowed (path traversal blocked).

## Secrets & environment

- Copy `.env.example` to **`.env`** and/or **`.env.local`** (`.env.local` is gitignored), **or** paste keys in **Dev → Settings & API** — values stored there live in browser-local scratch and are sent per-request as `x-user-key-*` headers (header wins over env).
- **Server-only** variables (`YOUTUBE_API_KEY`, `OPENAI_API_KEY`, etc.) are read by Vite’s Node middleware — they are **not** bundled into the client.
- **Client-visible** variables must use the `VITE_` prefix (inlined at build time; restart `npm run dev` after edits) and still should not contain production secrets.
- `.env.example` documents **every** key the dashboard reads; `GET /api/config/status` and `GET /api/diagnostics/env-keys` report presence (names only, never values).

## Dev API routes

| Route | Purpose |
| --- | --- |
| `GET /api/health` | BFF liveness probe |
| `GET /api/config/status` | Which server env keys are non-empty (names only) |
| `GET /api/diagnostics/env-keys` | Allow-listed env presence classification for Diagnostics |
| `GET /api/integrations/status` | Combined integration summary (YouTube / Gemini / RSS) |
| `GET /api/google/health` | Google API key probe |
| `GET /api/gemini/health` | Gemini models list |
| `POST /api/gemini/ping` | Gemini models probe (empty body) |
| `POST /api/gemini/generate` | Gemini text generation (Phonetics, Mixing AI, Chord Detector AI POLISH) |
| `GET /api/openai/ping` | OpenAI-compatible models probe |
| `GET /api/youtube/search?q=` | YouTube Data API search (server key) |
| `GET /api/youtube/channel[?handle=]` | Channel lookup (defaults to `AGENT_FARM_YOUTUBE_CHANNEL_ID`) |
| `POST /api/media/youtube` | YouTube media helper (Agent Farm) |
| `POST /api/harmony/client-projects/build-prompt` | Harmony prompt builder (Gemini) |
| `GET /api/harmony/client-projects/ai-health` | Harmony AI key health |
| `GET /api/rss?limit=` | Aggregate feeds from `RSS_FEED_URLS` |
| `GET /api/digest/reddit` | Reddit RSS JSON proxy for `r/claudeskills` |
| `GET /api/local/file?path=…` | Safe file read from `content/` |
| `POST /api/mixing/youtube-audio` | YouTube → MP3 (yt2mp3-style / yt-dlp + ffmpeg) |
| `/api/tesla/*` | Fleet OAuth (`exchange-code`, `oauth/callback`, `partner-register`, `partner-status`, `fleet`, `command`) + virtual key (`virtual-key/generate`, `virtual-key/info`) |

**Follow-up:** If Reddit rate-limits or blocks the dev proxy, cache responses, add delays, or fetch RSS via a scheduled job outside the browser; the UI already surfaces upstream errors.

## Build

```bash
npm run build
npm run preview
```

**Note:** `vite preview` runs the same middleware as dev for `/api/*`. Production deploys on Vercel bundle the same BFFs into `api/[...path].ts` (see `scripts/bundle-bff.mjs`), so `/api/*` routes work there too — except local-filesystem features (Tesla virtual-key generation, `content/` reads) which need a writable/shipped filesystem.

Release QA: see [RELEASE.md](./RELEASE.md).

See [design fidelity](docs/design-fidelity.md) for zone family rules.
