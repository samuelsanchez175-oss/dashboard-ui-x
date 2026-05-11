/**
 * Remote brand logos for integration / API UI (Agent Farm).
 * Matches marketing integration strip asset URLs.
 */
export const INTEGRATION_MARKETPLACE_URLS = [
  'https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg',
  'https://cdn-icons-png.flaticon.com/512/174/174857.png', // LinkedIn
  'https://cdn-icons-png.flaticon.com/512/2111/2111615.png', // Slack
  'https://cdn-icons-png.flaticon.com/512/174/174872.png', // Spotify
  'https://cdn-icons-png.flaticon.com/512/733/733547.png', // Facebook
  'https://cdn-icons-png.flaticon.com/512/5968/5968381.png', // Stripe
  'https://cdn-icons-png.flaticon.com/512/174/174855.png', // Instagram
  'https://cdn-icons-png.flaticon.com/512/888/888853.png', // Dropbox
  'https://cdn-icons-png.flaticon.com/512/906/906324.png', // Jira
  'https://ruixen.com/ruixen_dark.png',
  'https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg',
  'https://cdn-icons-png.flaticon.com/512/5968/5968705.png', // Square
  'https://cdn-icons-png.flaticon.com/512/732/732218.png', // Shopify
  'https://cdn-icons-png.flaticon.com/512/5968/5968755.png', // Zapier
  'https://cdn-icons-png.flaticon.com/512/5968/5968520.png', // Google Drive
  'https://cdn-icons-png.flaticon.com/512/1384/1384060.png', // YouTube
  'https://cdn-icons-png.flaticon.com/512/5968/5968885.png', // Airtable
  'https://cdn-icons-png.flaticon.com/512/2111/2111370.png', // Discord
] as const

/** Logos aligned to server `.env` integration keys shown in the UI. */
export const ENV_KEY_LOGO_URL: Record<
  'YOUTUBE_API_KEY' | 'GOOGLE_API_KEY' | 'GEMINI_API_KEY' | 'RSS_FEED_URLS',
  string
> = {
  YOUTUBE_API_KEY: 'https://cdn-icons-png.flaticon.com/512/1384/1384060.png',
  GOOGLE_API_KEY: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg',
  GEMINI_API_KEY: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg',
  RSS_FEED_URLS: 'https://cdn-icons-png.flaticon.com/512/5968/5968755.png',
}

/**
 * Brand marks for Settings → Documented keys (DevSettings table).
 * Uses shared integration URLs where applicable; OpenAI / Vite use widely used public logos.
 */
export const DOCUMENTED_ENV_LOGOS: Record<string, string> = {
  YOUTUBE_API_KEY: ENV_KEY_LOGO_URL.YOUTUBE_API_KEY,
  GOOGLE_API_KEY: ENV_KEY_LOGO_URL.GOOGLE_API_KEY,
  GEMINI_API_KEY: ENV_KEY_LOGO_URL.GEMINI_API_KEY,
  RSS_FEED_URLS: ENV_KEY_LOGO_URL.RSS_FEED_URLS,
  AGENT_FARM_YOUTUBE_CHANNEL_ID: ENV_KEY_LOGO_URL.YOUTUBE_API_KEY,
  OPENAI_API_KEY: 'https://upload.wikimedia.org/wikipedia/commons/4/4d/OpenAI_Logo.svg',
  OPENAI_BASE_URL: 'https://upload.wikimedia.org/wikipedia/commons/4/4d/OpenAI_Logo.svg',
  'VITE_*': 'https://vitejs.dev/logo.svg',
}
