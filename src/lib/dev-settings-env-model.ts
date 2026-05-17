/**
 * Canonical metadata for Settings → API keys (built-ins).
 * Aligns with `SERVER_DIAGNOSTIC_ENV_ENTRIES` / `CLIENT_VITE_DIAG_ENTRIES` in
 * `diagnostics-env-contract.ts` — extend both when adding a new first-party key.
 */

export type DevSettingsInputKind = 'secret' | 'text' | 'none'

/** Official console / docs — generic URLs only (no secrets). */
export type DevSettingsRetrievalLink = {
  label: string
  href: string
}

export type DevSettingsSectionId =
  | 'google-cloud'
  | 'google-ai-studio'
  | 'openai'
  | 'tesla-fleet'
  | 'feeds'
  | 'audio-mixing'
  | 'client-vite'

export type DevSettingsEnvModelEntry = {
  /** Stable id for React keys / anchors */
  id: string
  /** Primary env var — localStorage scratch + `x-user-key-*` when supported */
  storageKey: string
  /** Shown in Key(s) column: primary first, then fallbacks / related names */
  envKeys: readonly string[]
  label: string
  /** Short column text for “Role” */
  role: string
  oneLinePurpose: string
  /**
   * Detailed technical list of routes / files / hooks that consume this key
   * — rendered behind the "Where used" expander so curious users can audit
   * exactly which `/api/*` route or module reads the value.
   */
  usedIn: readonly string[]
  /**
   * Short, chip-friendly labels for the dashboard ZONES this key powers.
   * Rendered as inline badges at the top of the Used-in cell so a glance
   * answers "what features stop working if this key is missing?" Examples:
   * "Chord Detector AI POLISH", "Harmony Stack", "Phonetics Inspector".
   * Distinct from `usedIn` — those are route / file paths for engineers;
   * `powers` is product-language for the user.
   */
  powers?: readonly string[]
  optional: boolean
  scope: 'server' | 'client'
  inputKind: DevSettingsInputKind
  sectionId: DevSettingsSectionId
  /**
   * When false, the dev BFF does not read this via `pickKey` / `x-user-key-*`
   * (e.g. mixing binaries use `process.env` only, or Vite inlines client keys).
   */
  supportsLocalScratch: boolean
  /** Shown in Source column — shared keys / fallback chains */
  sourceResolutionNote?: string
  /** Official “get / create key” (or equivalent) links; opens in new tab from UI */
  retrievalLinks?: readonly DevSettingsRetrievalLink[]
}

/**
 * Section order = display order on the Settings page. Names are PROVIDER-
 * centric (the console / vendor that issues the key), NOT app-zone centric,
 * so a user with one Google AI Studio account adds one key and sees every
 * zone it powers via the `powers` chips on each row. Adding a tab per app
 * zone (Chord Detector, Phonetics, Harmony, etc) would duplicate the same
 * GEMINI_API_KEY input across multiple sections — the opposite of what
 * "one key, many zones" needs.
 */
export const DEV_SETTINGS_SECTION_META: readonly { id: DevSettingsSectionId; title: string }[] = [
  { id: 'google-ai-studio', title: 'Google AI Studio (Gemini)' },
  { id: 'google-cloud', title: 'Google Cloud (YouTube + Maps)' },
  { id: 'openai', title: 'OpenAI (or compatible)' },
  { id: 'tesla-fleet', title: 'Tesla Fleet' },
  { id: 'feeds', title: 'Feeds & syndication' },
  { id: 'audio-mixing', title: 'Audio / mixing (server paths)' },
  { id: 'client-vite', title: 'Client (Vite-inlined)' },
] as const

/**
 * Single source for built-in rows (order = default display order).
 * `GEMINI_API_KEY` is one row with aggregated consumers; Harmony override is separate.
 */
export const DEV_SETTINGS_ENV_MODEL: readonly DevSettingsEnvModelEntry[] = [
  {
    id: 'youtube-dedicated',
    storageKey: 'YOUTUBE_API_KEY',
    envKeys: ['YOUTUBE_API_KEY'],
    label: 'YouTube Data API key',
    role: 'YouTube Data v3 (primary)',
    oneLinePurpose: 'Preferred key for YouTube search and channel calls.',
    usedIn: [
      '`GET /api/youtube/search` — Agent Farm search + Diagnostics smoke',
      '`GET /api/youtube/channel` — default channel lookup (with API key)',
      '`AgentFarm.tsx` / `agent-farm-live.ts` — integration status & probes',
    ],
    powers: ['Agent Farm — YouTube', 'Diagnostics smoke'],
    optional: true,
    scope: 'server',
    inputKind: 'secret',
    sectionId: 'google-cloud',
    supportsLocalScratch: true,
    sourceResolutionNote: 'BFF uses this first; if empty, falls back to GOOGLE_API_KEY for the same routes.',
    retrievalLinks: [
      { label: 'Cloud credentials', href: 'https://console.cloud.google.com/apis/credentials' },
      { label: 'Enable YouTube Data API v3', href: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com' },
      { label: 'YouTube Data API docs', href: 'https://developers.google.com/youtube/v3/getting-started' },
    ],
  },
  {
    id: 'google-generic',
    storageKey: 'GOOGLE_API_KEY',
    envKeys: ['GOOGLE_API_KEY'],
    label: 'Google Cloud / generic API key',
    role: 'Google APIs + YouTube fallback',
    oneLinePurpose: 'Generic Google key; also backs YouTube when the dedicated key is unset.',
    usedIn: [
      '`GET /api/google/health`',
      '`GET /api/youtube/search` and `GET /api/youtube/channel` — when `YOUTUBE_API_KEY` is empty (`youtubeDataKeyForReq` in BFF)',
      '`GET /api/integrations/status` — `googleApi` / combined YouTube availability',
    ],
    powers: ['Google APIs probe', 'YouTube (fallback)', 'Integration status'],
    optional: true,
    scope: 'server',
    inputKind: 'secret',
    sectionId: 'google-cloud',
    supportsLocalScratch: true,
    sourceResolutionNote: 'Same effective slot as YouTube fallback — use a key with YouTube Data API v3 enabled if you rely on this path.',
    retrievalLinks: [
      { label: 'Cloud credentials', href: 'https://console.cloud.google.com/apis/credentials' },
      { label: 'API Library', href: 'https://console.cloud.google.com/apis/library' },
    ],
  },
  {
    id: 'agent-farm-channel',
    storageKey: 'AGENT_FARM_YOUTUBE_CHANNEL_ID',
    envKeys: ['AGENT_FARM_YOUTUBE_CHANNEL_ID'],
    label: 'Default YouTube channel id',
    role: 'Channel id (UC…)',
    oneLinePurpose: 'Default channel when `/api/youtube/channel` is called without `?handle=`.',
    usedIn: [
      '`GET /api/youtube/channel` — resolve by id instead of handle',
      'Agent Farm — channel card / probes when no handle query',
    ],
    powers: ['Agent Farm channel card'],
    optional: true,
    scope: 'server',
    inputKind: 'text',
    sectionId: 'google-cloud',
    supportsLocalScratch: true,
    retrievalLinks: [{ label: 'Find YouTube channel ID', href: 'https://support.google.com/youtube/answer/3250431' }],
  },
  /* GEMINI_API_KEY is the single biggest "shared key" example — one Google AI
   * Studio key powers every Gemini-driven feature in the dashboard. There
   * deliberately is NOT a per-zone duplicate row (e.g. "Chord Detector AI
   * POLISH") here; that would split one input across multiple sections and
   * confuse the "one key, many zones" relationship. The full consumer list
   * lives in `powers` (rendered as chips at the top of the row) and `usedIn`
   * (expandable technical detail). */
  {
    id: 'gemini-primary',
    storageKey: 'GEMINI_API_KEY',
    envKeys: ['GEMINI_API_KEY'],
    label: 'Gemini API key',
    role: 'Google AI Studio',
    oneLinePurpose:
      'Single Google AI Studio key powering every Gemini-driven feature in the dashboard. Add it once here and every feature listed below lights up.',
    powers: [
      'Chord Detector AI POLISH',
      'Harmony Stack',
      'Phonetics Inspector',
      'Mixing Board AI',
      'Agent Farm Usage',
      'Diagnostics ping',
    ],
    usedIn: [
      '`GET /api/gemini/health` — list models',
      '`POST /api/gemini/generate` — BFF text generation (Phonetics inspector, Mixing board AI, Chord Detector AI POLISH)',
      '`POST /api/gemini/ping` — Agent Farm + Diagnostics upstream smoke',
      '`POST /api/harmony/client-projects/build-prompt` — when `HARMONY_CLIENT_PROJECTS_AI_KEY` is unset',
      '`GET /api/harmony/client-projects/ai-health` — fallback `source: gemini` when Harmony override empty',
      '`AgentFarm.tsx` / `agent-farm-live.ts` — Usage tab + integration gates',
      '`src/lib/route-connection.ts` — warns when Agent Farm Usage needs Gemini',
      '`src/zones/dev/DiagnosticsZone.tsx` (via `dashboard-diagnostics.ts`) — optional Gemini ping in full checks',
      '`src/zones/tools/chord-detector-llm-polish.ts` — AI POLISH button in Tools → Chord Detector',
    ],
    optional: false,
    scope: 'server',
    inputKind: 'secret',
    sectionId: 'google-ai-studio',
    supportsLocalScratch: true,
    sourceResolutionNote: 'One key powers every feature in the chips above; Harmony Client Projects can optionally use a separate key below.',
    retrievalLinks: [{ label: 'Google AI Studio', href: 'https://aistudio.google.com/apikey' }],
  },
  {
    id: 'harmony-gemini-override',
    storageKey: 'HARMONY_CLIENT_PROJECTS_AI_KEY',
    envKeys: ['HARMONY_CLIENT_PROJECTS_AI_KEY', 'GEMINI_API_KEY'],
    label: 'Harmony Client Projects override',
    role: 'Optional separate Gemini quota',
    oneLinePurpose: 'Optional dedicated Gemini key for Harmony Stack → Client Projects only — leave blank to share the primary Gemini key above.',
    powers: ['Harmony Stack (only when set)'],
    usedIn: [
      '`POST /api/harmony/client-projects/build-prompt` — preferred over `GEMINI_API_KEY` when set',
      '`GET /api/harmony/client-projects/ai-health` — reports `source: harmony` when set',
      '`HarmonyStackZone.tsx` — optional override field (same scratch key)',
    ],
    optional: true,
    scope: 'server',
    inputKind: 'secret',
    sectionId: 'google-ai-studio',
    supportsLocalScratch: true,
    sourceResolutionNote: 'Same API family as Gemini; only Client Projects routes prefer this key. Leave blank to share quota with the primary key.',
    retrievalLinks: [{ label: 'Google AI Studio', href: 'https://aistudio.google.com/apikey' }],
  },
  {
    id: 'rss-feeds',
    storageKey: 'RSS_FEED_URLS',
    envKeys: ['RSS_FEED_URLS'],
    label: 'RSS feed URLs',
    role: 'Comma-separated feed list',
    oneLinePurpose: 'Allow-listed feed URLs for the RSS aggregation endpoint.',
    powers: ['Agent Farm Pulse', 'RSS aggregation', 'Diagnostics RSS probe'],
    usedIn: [
      '`GET /api/rss` — merged headlines (`aggregateRss` in BFF)',
      '`AgentFarm.tsx` — Pulse / RSS integration strip',
      '`dashboard-diagnostics.ts` — RSS quick probe in full checks',
    ],
    optional: true,
    scope: 'server',
    inputKind: 'text',
    sectionId: 'feeds',
    supportsLocalScratch: true,
    retrievalLinks: [{ label: 'RSS 2.0 specification', href: 'https://www.rssboard.org/rss-specification' }],
  },
  {
    id: 'openai-key',
    storageKey: 'OPENAI_API_KEY',
    envKeys: ['OPENAI_API_KEY'],
    label: 'OpenAI (or compatible) API key',
    role: 'Chat Completions / models list',
    oneLinePurpose: 'Key for OpenAI-compatible providers.',
    powers: ['OpenAI ping (Diagnostics)'],
    usedIn: ['`GET /api/openai/ping` — lists models at the configured base URL'],
    optional: true,
    scope: 'server',
    inputKind: 'secret',
    sectionId: 'openai',
    supportsLocalScratch: true,
    retrievalLinks: [{ label: 'OpenAI API keys', href: 'https://platform.openai.com/api-keys' }],
  },
  {
    id: 'openai-base',
    storageKey: 'OPENAI_BASE_URL',
    envKeys: ['OPENAI_BASE_URL'],
    label: 'OpenAI-compatible base URL',
    role: 'API root (optional)',
    oneLinePurpose: 'Non-default API host (Azure, OpenRouter, local gateway, etc.).',
    powers: ['OpenAI ping (host override)'],
    usedIn: ['`GET /api/openai/ping` — paired with `OPENAI_API_KEY`'],
    optional: true,
    scope: 'server',
    inputKind: 'text',
    sectionId: 'openai',
    supportsLocalScratch: true,
    sourceResolutionNote: 'Optional; defaults to OpenAI public API when unset.',
    retrievalLinks: [
      { label: 'OpenAI API reference', href: 'https://platform.openai.com/docs/api-reference' },
      { label: 'Azure OpenAI', href: 'https://learn.microsoft.com/azure/ai-services/openai/' },
    ],
  },
  {
    id: 'tesla-fleet-client-id',
    storageKey: 'TESLA_CLIENT_ID',
    envKeys: ['TESLA_CLIENT_ID'],
    label: 'Tesla Fleet OAuth client ID',
    role: 'Third-party / Fleet app client id',
    oneLinePurpose: 'Registered application client identifier for Tesla Fleet API (OAuth).',
    powers: ['Tesla Fleet (OAuth handshake)'],
    usedIn: [
      '`TeslaMock.tsx` — Fleet credentials card (Save to scratch)',
      '`fetchWithKeys` / `x-user-key-tesla-client-id` — dev BFF `pickKey` when Fleet routes are wired',
    ],
    optional: true,
    scope: 'server',
    inputKind: 'secret',
    sectionId: 'tesla-fleet',
    supportsLocalScratch: true,
    sourceResolutionNote: 'Same scratch slot as the Tesla Fleet page — sent as `x-user-key-tesla-client-id` on `/api/*` when set.',
    retrievalLinks: [
      { label: 'Tesla Fleet API', href: 'https://developer.tesla.com/docs/fleet-api' },
      { label: 'Fleet API getting started', href: 'https://developer.tesla.com/docs/fleet-api/getting-started/overview' },
    ],
  },
  {
    id: 'tesla-fleet-client-secret',
    storageKey: 'TESLA_CLIENT_SECRET',
    envKeys: ['TESLA_CLIENT_SECRET'],
    label: 'Tesla Fleet OAuth client secret',
    role: 'Third-party / Fleet app secret',
    oneLinePurpose: 'Client secret paired with `TESLA_CLIENT_ID` for Fleet API token exchange.',
    powers: ['Tesla Fleet (OAuth handshake)'],
    usedIn: [
      '`TeslaMock.tsx` — Fleet credentials card (Save to scratch)',
      '`fetchWithKeys` / `x-user-key-tesla-client-secret` — paired with `TESLA_CLIENT_ID`',
    ],
    optional: true,
    scope: 'server',
    inputKind: 'secret',
    sectionId: 'tesla-fleet',
    supportsLocalScratch: true,
    sourceResolutionNote: 'Paired with Client ID above; same localStorage prefix as Settings & API keys.',
    retrievalLinks: [{ label: 'Tesla Fleet API', href: 'https://developer.tesla.com/docs/fleet-api' }],
  },
  {
    id: 'vite-maps-embed',
    storageKey: 'VITE_GOOGLE_MAPS_EMBED_API_KEY',
    envKeys: ['VITE_GOOGLE_MAPS_EMBED_API_KEY'],
    label: 'Google Maps Embed API key',
    role: 'Browser-only map embeds',
    oneLinePurpose: 'Referrer-restricted key for embedded maps in the Tesla trip UI.',
    powers: ['Tesla Fleet trip map'],
    usedIn: ['`src/lib/google-maps-trips.ts`', '`TeslaMockVisuals.tsx` (Tesla Fleet zone trip map)'],
    optional: true,
    scope: 'client',
    inputKind: 'secret',
    sectionId: 'client-vite',
    supportsLocalScratch: true,
    sourceResolutionNote: 'Must be present at `npm run dev` build time in `.env.local`; scratch here helps generate `.env` lines (restart required for Vite to inline).',
    retrievalLinks: [
      { label: 'Maps credentials (Cloud)', href: 'https://console.cloud.google.com/google/maps-apis/credentials' },
      { label: 'Embed API key guide', href: 'https://developers.google.com/maps/documentation/embed/get-api-key' },
    ],
  },
  {
    id: 'vite-stem',
    storageKey: 'VITE_STEM_SERVICE_URL',
    envKeys: ['VITE_STEM_SERVICE_URL'],
    label: 'Stem splitter service URL',
    role: 'Multipart stem HTTP stub',
    oneLinePurpose: 'Optional remote stem splitter endpoint for Tools → Stem splitter.',
    powers: ['Stem Splitter tool'],
    usedIn: ['`ToolsStemSplitterPage.tsx` — optional upload stub'],
    optional: true,
    scope: 'client',
    inputKind: 'text',
    sectionId: 'client-vite',
    supportsLocalScratch: true,
    sourceResolutionNote: 'Vite-inlined; restart dev after `.env.local` edits.',
  },
  {
    id: 'vite-local-llm-base',
    storageKey: 'VITE_LOCAL_LLM_BASE_URL',
    envKeys: ['VITE_LOCAL_LLM_BASE_URL'],
    label: 'Local LLM base URL',
    role: 'Ollama / local gateway',
    oneLinePurpose: 'Base URL for browser-side local LLM calls (e.g. Ollama).',
    powers: ['Rhyme Studio (local Gemma)'],
    usedIn: ['`src/lib/local-llm/gemma-local.ts`', '`RhymeStudio.tsx` — local Gemma flows'],
    optional: true,
    scope: 'client',
    inputKind: 'text',
    sectionId: 'client-vite',
    supportsLocalScratch: true,
    sourceResolutionNote: 'Vite-inlined; restart dev after `.env.local` edits.',
    retrievalLinks: [{ label: 'Ollama', href: 'https://ollama.com/' }],
  },
  {
    id: 'vite-local-llm-model',
    storageKey: 'VITE_LOCAL_LLM_MODEL',
    envKeys: ['VITE_LOCAL_LLM_MODEL'],
    label: 'Local LLM model id',
    role: 'Model name',
    oneLinePurpose: 'Model id passed to the local LLM endpoint.',
    powers: ['Rhyme Studio (local Gemma)'],
    usedIn: ['`src/lib/local-llm/gemma-local.ts`', '`RhymeStudio.tsx`'],
    optional: true,
    scope: 'client',
    inputKind: 'text',
    sectionId: 'client-vite',
    supportsLocalScratch: true,
    sourceResolutionNote: 'Vite-inlined; restart dev after `.env.local` edits.',
    retrievalLinks: [{ label: 'Ollama model library', href: 'https://ollama.com/library' }],
  },
  {
    id: 'vite-rag-manifest',
    storageKey: 'VITE_RAG_MANIFEST_URL',
    envKeys: ['VITE_RAG_MANIFEST_URL'],
    label: 'RAG manifest URL',
    role: 'Optional JSON snippets index',
    oneLinePurpose: 'Optional URL returning `{ "snippets": [...] }` for local LLM context.',
    powers: ['Rhyme Studio (RAG context)'],
    usedIn: ['`src/lib/local-llm/gemma-local.ts`', '`RhymeStudio.tsx`'],
    optional: true,
    scope: 'client',
    inputKind: 'text',
    sectionId: 'client-vite',
    supportsLocalScratch: true,
    sourceResolutionNote: 'Vite-inlined; restart dev after `.env.local` edits.',
  },
  {
    id: 'ffmpeg-path',
    storageKey: 'FFMPEG_PATH',
    envKeys: ['FFMPEG_PATH'],
    label: 'FFmpeg binary path',
    role: 'Server-side ffmpeg',
    oneLinePurpose: 'Path to ffmpeg for mixing / YouTube-audio pipeline.',
    powers: ['Mixing Board', 'YouTube audio download'],
    usedIn: ['`server/mixing-youtube-audio.ts` — consumed via `process.env` (not `x-user-key-*`)'],
    optional: true,
    scope: 'server',
    inputKind: 'text',
    sectionId: 'audio-mixing',
    supportsLocalScratch: false,
    sourceResolutionNote: 'Server `.env.local` only — mixing handler does not read `x-user-key-ffmpeg-path`.',
    retrievalLinks: [{ label: 'FFmpeg downloads', href: 'https://ffmpeg.org/download.html' }],
  },
  {
    id: 'ytdlp-path',
    storageKey: 'YT_DLP_PATH',
    envKeys: ['YT_DLP_PATH'],
    label: 'yt-dlp binary path',
    role: 'Server-side yt-dlp',
    oneLinePurpose: 'Path to yt-dlp for `/api/mixing/youtube-audio`.',
    powers: ['YouTube audio download'],
    usedIn: ['`server/mixing-youtube-audio.ts` — `process.env` resolution'],
    optional: true,
    scope: 'server',
    inputKind: 'text',
    sectionId: 'audio-mixing',
    supportsLocalScratch: false,
    sourceResolutionNote: 'Server `.env.local` only — not overridden from browser headers.',
    retrievalLinks: [{ label: 'yt-dlp installation', href: 'https://github.com/yt-dlp/yt-dlp/wiki/Installation' }],
  },
] as const

const byStorageKey = new Map<string, DevSettingsEnvModelEntry>()
for (const e of DEV_SETTINGS_ENV_MODEL) {
  byStorageKey.set(e.storageKey, e)
}

export function devSettingsModelEntryForStorageKey(envKey: string): DevSettingsEnvModelEntry | undefined {
  return byStorageKey.get(envKey)
}

export const DEV_SETTINGS_MODEL_STORAGE_KEYS: readonly string[] = DEV_SETTINGS_ENV_MODEL.map(e => e.storageKey)

/** Which built-in env keys have a one-click Test route in Settings */
export function probeRouteForStorageKey(envKey: string): { label: string; url: string; init?: RequestInit } | null {
  switch (envKey) {
    case 'GEMINI_API_KEY':
      return { label: 'Gemini', url: '/api/gemini/ping', init: { method: 'POST', headers: { 'Content-Type': 'application/json' } } }
    case 'YOUTUBE_API_KEY':
    case 'GOOGLE_API_KEY':
      return { label: 'YouTube', url: '/api/youtube/search?q=ping' }
    case 'OPENAI_API_KEY':
      return { label: 'OpenAI', url: '/api/openai/ping' }
    case 'RSS_FEED_URLS':
      return { label: 'RSS', url: '/api/rss?limit=1' }
    case 'AGENT_FARM_YOUTUBE_CHANNEL_ID':
      return { label: 'YT Channel', url: '/api/youtube/channel' }
    case 'HARMONY_CLIENT_PROJECTS_AI_KEY':
      return { label: 'Harmony CP AI', url: '/api/harmony/client-projects/ai-health' }
    default:
      return null
  }
}
