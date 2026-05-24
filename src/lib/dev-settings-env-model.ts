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
  /**
   * Optional grouping key. Entries with the same `group` render as ONE card
   * with multiple stacked input rows (instead of N separate cards). Each
   * entry keeps its own `storageKey`, `probe`, `powers`, etc. — grouping is
   * purely a presentation layer. The first grouped entry's `groupTitle` is
   * used for the card header; each entry's `groupFieldLabel` labels its
   * row inside the card. Use for keys that are always set together (OAuth
   * client_id / client_secret pairs), config-and-key duos (OPENAI_API_KEY +
   * OPENAI_BASE_URL), or families of related Vite vars (local LLM trio).
   */
  group?: string
  /**
   * Card header title — only honoured on the FIRST entry of a group. When
   * set, replaces the per-entry `label` as the card header so the card can
   * communicate the shared concept (e.g. "Tesla Fleet (OAuth)") instead of
   * a single field's name. Entries without `group` ignore this field.
   */
  groupTitle?: string
  /**
   * Per-field label inside a grouped card (e.g. "Client ID", "Base URL").
   * When set, rendered above the input as a small bold label so each row
   * is clearly identified. Fall back to `entry.label` when unset.
   */
  groupFieldLabel?: string
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
  /* Google Cloud bundle — YouTube + generic + channel-id fields share one
   * card. In practice one Google Cloud project with both APIs enabled
   * covers every route in this bundle; the BFF's `youtubeDataKeyForReq`
   * already resolves `YOUTUBE_API_KEY || GOOGLE_API_KEY` so setting either
   * is enough. The card stacks both fields so users who DO want separate
   * keys (e.g. a YouTube-only quota key + a separate Maps key) still can. */
  {
    id: 'youtube-dedicated',
    storageKey: 'YOUTUBE_API_KEY',
    envKeys: ['YOUTUBE_API_KEY'],
    label: 'YouTube Data API key',
    role: 'YouTube Data v3 (primary)',
    oneLinePurpose: 'One Google Cloud key covers every route here — paste it in EITHER field below. YouTube prefers the dedicated key when both are set.',
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
    sourceResolutionNote: 'BFF uses this first; if empty, falls back to GOOGLE_API_KEY below.',
    retrievalLinks: [
      { label: 'Cloud credentials', href: 'https://console.cloud.google.com/apis/credentials' },
      { label: 'Enable YouTube Data API v3', href: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com' },
      { label: 'YouTube Data API docs', href: 'https://developers.google.com/youtube/v3/getting-started' },
    ],
    group: 'google-cloud-server',
    groupTitle: 'Google Cloud API keys',
    groupFieldLabel: 'YouTube Data API key',
  },
  {
    id: 'google-generic',
    storageKey: 'GOOGLE_API_KEY',
    envKeys: ['GOOGLE_API_KEY'],
    label: 'Generic Google key',
    role: 'YouTube fallback / Google APIs',
    oneLinePurpose: 'Use if you have a single Google Cloud key with multiple APIs enabled; backs YouTube when the dedicated key is empty.',
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
    group: 'google-cloud-server',
    groupFieldLabel: 'Generic Google key (fallback for YouTube)',
  },
  {
    id: 'agent-farm-channel',
    storageKey: 'AGENT_FARM_YOUTUBE_CHANNEL_ID',
    envKeys: ['AGENT_FARM_YOUTUBE_CHANNEL_ID'],
    label: 'Default YouTube channel id',
    role: 'Channel id (UC…)',
    oneLinePurpose: 'Default channel when `/api/youtube/channel` is called without `?handle=`. Not a key — just the channel ID to look up.',
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
    group: 'google-cloud-server',
    groupFieldLabel: 'Default YouTube channel ID (optional)',
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
      'Single Google AI Studio key powering every Gemini-driven feature in the dashboard. Add it once below and every feature in the chips lights up.',
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
    sourceResolutionNote: 'One key powers every feature in the chips above; Harmony Client Projects can optionally use a separate key below for an isolated quota.',
    retrievalLinks: [{ label: 'Google AI Studio', href: 'https://aistudio.google.com/apikey' }],
    group: 'gemini',
    groupTitle: 'Google AI Studio (Gemini)',
    groupFieldLabel: 'Primary Gemini API key',
  },
  {
    id: 'harmony-gemini-override',
    storageKey: 'HARMONY_CLIENT_PROJECTS_AI_KEY',
    envKeys: ['HARMONY_CLIENT_PROJECTS_AI_KEY', 'GEMINI_API_KEY'],
    label: 'Harmony Client Projects override',
    role: 'Optional separate Gemini quota',
    oneLinePurpose: 'Optional — leave blank to share the primary Gemini key above. Set a different key only if you want an isolated quota for Harmony.',
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
    sourceResolutionNote: 'Same API family as Gemini; only Client Projects routes prefer this key.',
    retrievalLinks: [{ label: 'Google AI Studio', href: 'https://aistudio.google.com/apikey' }],
    group: 'gemini',
    groupFieldLabel: 'Harmony override key (optional, leave blank to share)',
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
    oneLinePurpose: 'API key for OpenAI or any compatible provider. Pair with the base URL below to point at Azure, OpenRouter, a local gateway, etc.',
    powers: ['OpenAI ping (Diagnostics)'],
    usedIn: ['`GET /api/openai/ping` — lists models at the configured base URL'],
    optional: true,
    scope: 'server',
    inputKind: 'secret',
    sectionId: 'openai',
    supportsLocalScratch: true,
    retrievalLinks: [{ label: 'OpenAI API keys', href: 'https://platform.openai.com/api-keys' }],
    group: 'openai',
    groupTitle: 'OpenAI (or compatible)',
    groupFieldLabel: 'API key',
  },
  {
    id: 'openai-base',
    storageKey: 'OPENAI_BASE_URL',
    envKeys: ['OPENAI_BASE_URL'],
    label: 'OpenAI-compatible base URL',
    role: 'API root (optional)',
    oneLinePurpose: 'Non-default API host (Azure, OpenRouter, local gateway, etc.). Leave blank for the public OpenAI API.',
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
    group: 'openai',
    groupFieldLabel: 'Base URL (optional, defaults to api.openai.com)',
  },
  {
    id: 'tesla-fleet-client-id',
    storageKey: 'TESLA_CLIENT_ID',
    envKeys: ['TESLA_CLIENT_ID'],
    label: 'Tesla Fleet OAuth credentials',
    role: 'Fleet app OAuth pair',
    oneLinePurpose: 'OAuth client_id + client_secret from your registered Tesla Fleet app. Always set both — the pair is needed to exchange tokens.',
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
    sourceResolutionNote: 'Both fields sent as `x-user-key-tesla-*` headers on `/api/*` when set.',
    retrievalLinks: [
      { label: 'Tesla Fleet API', href: 'https://developer.tesla.com/docs/fleet-api' },
      { label: 'Fleet API getting started', href: 'https://developer.tesla.com/docs/fleet-api/getting-started/overview' },
    ],
    group: 'tesla',
    groupTitle: 'Tesla Fleet (OAuth)',
    groupFieldLabel: 'Client ID',
  },
  {
    id: 'tesla-fleet-client-secret',
    storageKey: 'TESLA_CLIENT_SECRET',
    envKeys: ['TESLA_CLIENT_SECRET'],
    label: 'Tesla Fleet OAuth client secret',
    role: 'Paired with Client ID',
    oneLinePurpose: 'Secret half of the Tesla OAuth pair. Never commit to git.',
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
    retrievalLinks: [{ label: 'Tesla Fleet API', href: 'https://developer.tesla.com/docs/fleet-api' }],
    group: 'tesla',
    groupFieldLabel: 'Client Secret',
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
    /* Local Docker service URL for Note Detector 2 (Demucs + basic-pitch).
     * Empty falls back to `http://localhost:8000`. Browser-side only —
     * the BFF doesn't read this, the tool page fetches it directly. */
    id: 'vite-nd2-api',
    storageKey: 'VITE_ND2_API',
    envKeys: ['VITE_ND2_API'],
    label: 'Note Detector 2 backend URL',
    role: 'Local Docker / FastAPI service',
    oneLinePurpose:
      'Base URL of the note-detector-2 FastAPI service (Demucs + basic-pitch). Default `http://localhost:8000`; set this if you serve it on a different host or port.',
    powers: ['Note Detector 2 tool'],
    usedIn: [
      '`ToolsNoteDetector2Page.tsx` — POST /transcribe, GET /status, GET /download',
      '`note-detector-2/scripts/bench.mjs` (uses ND2_API env var, same default)',
    ],
    optional: true,
    scope: 'client',
    inputKind: 'text',
    sectionId: 'client-vite',
    supportsLocalScratch: true,
    sourceResolutionNote:
      'Vite-inlined; restart dev after `.env.local` edits. Default `http://localhost:8000` is correct when you run `cd note-detector-2 && docker compose up`.',
    retrievalLinks: [
      { label: 'Tool source', href: 'https://github.com/' },
    ],
  },
  {
    id: 'vite-local-llm-base',
    storageKey: 'VITE_LOCAL_LLM_BASE_URL',
    envKeys: ['VITE_LOCAL_LLM_BASE_URL'],
    label: 'Local LLM (Ollama / Gemma)',
    role: 'Browser-side local model config',
    oneLinePurpose: 'Set the base URL + model id once to enable browser-side calls to Ollama (or any compatible local gateway). RAG manifest is optional context.',
    powers: ['Rhyme Studio (local Gemma)'],
    usedIn: ['`src/lib/local-llm/gemma-local.ts`', '`RhymeStudio.tsx` — local Gemma flows'],
    optional: true,
    scope: 'client',
    inputKind: 'text',
    sectionId: 'client-vite',
    supportsLocalScratch: true,
    sourceResolutionNote: 'All three fields are Vite-inlined; restart `npm run dev` after `.env.local` edits.',
    retrievalLinks: [{ label: 'Ollama', href: 'https://ollama.com/' }],
    group: 'local-llm',
    groupTitle: 'Local LLM (Ollama / Gemma)',
    groupFieldLabel: 'Base URL (e.g. http://localhost:11434)',
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
    retrievalLinks: [{ label: 'Ollama model library', href: 'https://ollama.com/library' }],
    group: 'local-llm',
    groupFieldLabel: 'Model id (e.g. gemma2:2b)',
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
    group: 'local-llm',
    groupFieldLabel: 'RAG manifest URL (optional)',
  },
  {
    id: 'ffmpeg-path',
    storageKey: 'FFMPEG_PATH',
    envKeys: ['FFMPEG_PATH'],
    label: 'Audio tooling (server paths)',
    role: 'FFmpeg + yt-dlp binary paths',
    oneLinePurpose: 'Server-only paths to the FFmpeg + yt-dlp binaries used by the mixing / YouTube-audio pipeline. Edit `.env.local` and restart the dev server — these are not sent from the browser.',
    powers: ['Mixing Board', 'YouTube audio download'],
    usedIn: ['`server/mixing-youtube-audio.ts` — consumed via `process.env` (not `x-user-key-*`)'],
    optional: true,
    scope: 'server',
    inputKind: 'text',
    sectionId: 'audio-mixing',
    supportsLocalScratch: false,
    sourceResolutionNote: 'Server `.env.local` only — mixing handler does not read browser headers for these.',
    retrievalLinks: [{ label: 'FFmpeg downloads', href: 'https://ffmpeg.org/download.html' }],
    group: 'audio-tools',
    groupTitle: 'Audio tooling (server paths)',
    groupFieldLabel: 'FFmpeg binary path',
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
    retrievalLinks: [{ label: 'yt-dlp installation', href: 'https://github.com/yt-dlp/yt-dlp/wiki/Installation' }],
    group: 'audio-tools',
    groupFieldLabel: 'yt-dlp binary path',
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
    case 'VITE_ND2_API': {
      /* Probe the actual configured backend URL (browser-direct, not via BFF).
       * Reads the live value from localStorage or env at call time so the probe
       * reflects whatever the user just typed into the field. */
      const live =
        (typeof localStorage !== 'undefined' && localStorage.getItem('VITE_ND2_API')) ||
        (import.meta.env?.VITE_ND2_API as string | undefined) ||
        'http://localhost:8000'
      return { label: 'ND2 backend', url: `${live.replace(/\/+$/, '')}/` }
    }
    default:
      return null
  }
}
