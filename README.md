# UI Dashboard X

Local-first Vite + React + TypeScript dashboard shell with zone-based navigation and dev-only API helpers.

## Stack

- **Vite 8**, **React 19**, **Tailwind CSS 4**
- **No cloud required** for UI, static content, or dev middleware

## Zones (sidebar order)

1. **Production** — Overview + Agent Farm  
2. **Vocals** — Piano / MIDI (MIDI-first capture; export for DAWs)  
3. **Mixing** — Placeholder for mix workflows  
4. **Pulse** — AI digest via Reddit RSS for [r/claudeskills](https://www.reddit.com/r/claudeskills/) (proxied at `/api/digest/reddit` in dev)  
5. **Dev** — Settings & API documentation, env snapshot, local content previews, optional browser vault  
6. **Tesla** — Mock vehicle cards (mileage / usage placeholders)

### Studio / DAW note (MIDI-first)

Musical workflow is **MIDI-first**: use **Vocals → Piano / MIDI** for ideas and `.mid` export, then continue in **Logic Pro** or **FL Studio** for full mixing. The **Mixing** zone is reserved for future recall sheets, stems, and DAW-adjacent tooling.

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`).

## Local content

- `content/prompts/` — starter markdown for prompts  
- `content/presets/` — starter JSON for presets  

In dev, files are exposed read-only via:

- `GET /api/local/file?path=prompts/starter.md`  
- `GET /api/local/file?path=presets/starter.json`  

Only `.md`, `.json`, and `.txt` under `content/` are allowed (path traversal blocked).

## Secrets & environment

- Copy `.env.example` to **`.env`** and/or **`.env.local`** (`.env.local` is gitignored).  
- **Server-only** variables (`YOUTUBE_API_KEY`, `OPENAI_API_KEY`, etc.) are read by Vite’s Node middleware — they are **not** bundled into the client.  
- **Client-visible** variables must use the `VITE_` prefix and still should not contain production secrets.

## Dev API routes

| Route | Purpose |
| --- | --- |
| `GET /api/digest/reddit` | Reddit RSS JSON proxy for `r/claudeskills` |
| `GET /api/local/file?path=…` | Safe file read from `content/` |
| `GET /api/youtube/search?q=` | YouTube Data API search (server key) |
| `POST /api/gemini/ping` | Gemini models probe (empty body) |
| `GET /api/rss?limit=` | Aggregate feeds from `RSS_FEED_URLS` |
| `GET /api/config/status` | Which server env keys are non-empty |

**Follow-up:** If Reddit rate-limits or blocks the dev proxy, cache responses, add delays, or fetch RSS via a scheduled job outside the browser; the UI already surfaces upstream errors.

## Build

```bash
npm run build
npm run preview
```

**Note:** `vite preview` runs the same middleware as dev for `/api/*`, but production static hosting would need an equivalent server for RSS and local file routes.

Release QA: see [RELEASE.md](./RELEASE.md).

See [design fidelity](docs/design-fidelity.md) for zone family rules.
