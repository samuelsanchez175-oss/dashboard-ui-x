# Release checklist

## Pre-flight

- [ ] **Env:** Copy `.env.example` → `.env` and/or `.env.local`. Confirm non-empty values where you need live APIs.
  - [ ] `GOOGLE_API_KEY`
  - [ ] `GEMINI_API_KEY`
  - [ ] `YOUTUBE_API_KEY`
  - [ ] `AGENT_FARM_YOUTUBE_CHANNEL_ID`
  - [ ] `RSS_FEED_URLS`
  - [ ] `OPENAI_API_KEY`
  - [ ] `OPENAI_BASE_URL`
- [ ] **Node:** Use an LTS version compatible with `package.json` engines (if present) or team standard.
- [ ] **Clean install:** `rm -rf node_modules && npm ci` (or `npm install` if no lock discipline).
- [ ] **Build:** `npm run build` completes with no errors.

## Smoke path (≈5 min, sidebar order)

Click each primary nav item; main canvas loads with no blank/error shell.

1. [ ] **TOOLS → All tools**
2. [ ] **TOOLS → YouTube downloader** — open tool; **StudioToolsHeader** shows matching tool icon.
3. [ ] **TOOLS → Key & BPM finder** — same header icon check.
4. [ ] **TOOLS → Chord Detector** — same.
5. [ ] **TOOLS → Tempo Tap** — same.
6. [ ] **TOOLS → Metronome export** — same.
7. [ ] **TOOLS → Phonetics inspector** — same.
8. [ ] **TOOLS → Session timer** — same.
9. [ ] **TOOLS → Arrangement pad** — same.
10. [ ] **TOOLS → Sample slicer** — same.
11. [ ] **TOOLS → Stem splitter** — same.
12. [ ] **PRODUCTION → Agent Farm**
13. [ ] **VOCALS → Piano / MIDI**
14. [ ] **VOCALS → Rhyme Studio**
15. [ ] **MIXING → Mix board**
16. [ ] **MIXING → Audio grab**
17. [ ] **HARMONY STACK → Services & Pricing**
18. [ ] **HARMONY STACK → Client Projects**
19. [ ] **HARMONY STACK → Portfolio**
20. [ ] **CPW → Projects**
21. [ ] **PULSE → AI digest**
22. [ ] **CDL PRAC → All quizzes**
23. [ ] **CDL PRAC → Hazmat (H)**
24. [ ] **CDL PRAC → Air Brakes**
25. [ ] **CDL PRAC → Tanker (N)**
26. [ ] **CDL PRAC → Tanker + HazMat (X)**
27. [ ] **CDL PRAC → Passenger (P)**
28. [ ] **CDL PRAC → School Bus (S)**
29. [ ] **CDL PRAC → Doubles / Triples (T)**
30. [ ] **CDL PRAC → Tanker Doubles**
31. [ ] **WEB DESIGN → Designer browser**
32. [ ] **DEV → Diagnostics**
33. [ ] **DEV → Settings & API**
34. [ ] **TESLA → Tesla Fleet**

## Theme + density

- [ ] Open **Tweaks**; toggle **light / dark**; toggle **compact / normal** (density).
- [ ] No full-frame white flash; chrome and canvas stay on design tokens.

## Files dock

- [ ] Open **YouTube downloader** or **Stem splitter** (dock-capable tools); confirm a **Files dock** tab/lane opens or pins as designed.

## Keyboard help

- [ ] Press **`?`** — help overlay opens.
- [ ] Press **`Esc`** — overlay closes.

## BFF / server sanity (`server/`)

Vite dev/preview attaches middleware from `server/dashboard-bff.ts` (first) and `server/agent-farm-bff.ts`. Spot-check responses (200 vs documented error JSON):

**Dashboard BFF**

- [ ] `POST /api/mixing/youtube-audio`
- [ ] `GET /api/digest/reddit` (optional `?feed=`)
- [ ] `GET /api/local/file?path=…`
- [ ] `GET /api/tesla/fleet` — with `TESLA_CLIENT_ID` + `TESLA_CLIENT_SECRET` in scratch: returns `needs_authorization` + `authorizeUrl` until `TESLA_REFRESH_TOKEN` is set; then returns `live` + vehicles (or `error` JSON with HTTP 200 on upstream failures).
- [ ] `POST /api/tesla/exchange-code` — JSON `{ "code", "redirect_uri" }` plus `x-user-key-tesla-client-id` / `x-user-key-tesla-client-secret` headers; returns `{ "status": "ok", "refresh_token" }` for the OAuth callback page to persist.
- [ ] `GET /api/tesla/oauth/callback?code=…` — HTML helper that exchanges the code via the route above, writes `TESLA_REFRESH_TOKEN` to `localStorage`, and dispatches the same `dashboard:api-keys-changed` event as Settings.

**Tesla Fleet OAuth (one-time)**

1. Register a Fleet API partner app at [Tesla Developer](https://developer.tesla.com) and note **client ID**, **client secret**, and a **redirect URI** that exactly matches what you register (e.g. `http://localhost:5175/api/tesla/oauth/callback` if that is what you use in dev).
2. In **DEV → Settings & API keys** (or the Tesla Fleet zone), save `TESLA_CLIENT_ID` and `TESLA_CLIENT_SECRET` to scratch storage. Optionally set `TESLA_REDIRECT_URI` to the same redirect you registered; otherwise the BFF defaults the authorize URL to `http://localhost:5175/api/tesla/oauth/callback` (adjust port if Vite chose another, or set the scratch key).
3. Open **TESLA → Tesla Fleet**, turn **Mock data** off, then click **Connect Tesla** and complete consent in the new tab. After redirect, close the callback tab and **refresh** the Tesla Fleet page so `TESLA_REFRESH_TOKEN` is picked up.
4. Optional: `TESLA_REGION` scratch value `na` or `eu` (default `na`). Optional `TESLA_VIN` to filter one vehicle.

**Agent Farm BFF** (`/api/*` not handled above)

- [ ] `GET /api/health`
- [ ] `GET /api/diagnostics/env-keys`
- [ ] `GET /api/integrations/status`
- [ ] `GET /api/google/health`
- [ ] `GET /api/gemini/health`
- [ ] `POST /api/gemini/generate`
- [ ] `GET /api/youtube/channel`
- [ ] `GET /api/config/status`
- [ ] `GET /api/harmony/client-projects/ai-health`
- [ ] `POST /api/harmony/client-projects/build-prompt`
- [ ] `GET /api/youtube/search?q=…`
- [ ] `GET /api/openai/ping`
- [ ] `POST /api/gemini/ping`
- [ ] `GET /api/rss` (`?limit=`, optional `?url=`)

## Visual regression

- [ ] Commit PNG baselines from `tests/visual` snapshot dirs after a green local run.
- [ ] `npm run test:visual` passes against committed baselines (desktop + tablet projects).

## Versioning + tag

- [ ] Bump `"version"` in `package.json`.
- [ ] Commit release notes / checklist completion as appropriate.
- [ ] `git tag` with agreed scheme (e.g. `vX.Y.Z`).
