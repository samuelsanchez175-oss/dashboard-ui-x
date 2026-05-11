/**
 * Prefilled “+” templates: picking a type suggests an env var name and input hint.
 * No secrets here — patterns only.
 */
export interface VaultKeyType {
  id: string
  label: string
  /** Suggested `process.env` / Vite name (user can edit per row). */
  suggestedEnvVar: string
  placeholder: string
}

export const VAULT_KEY_TYPES: VaultKeyType[] = [
  { id: 'custom', label: 'Custom', suggestedEnvVar: '', placeholder: 'MY_API_KEY' },
  {
    id: 'anthropic',
    label: 'Anthropic',
    suggestedEnvVar: 'ANTHROPIC_API_KEY',
    placeholder: 'sk-ant-api03-…',
  },
  {
    id: 'google_ai',
    label: 'Google AI (Gemini)',
    suggestedEnvVar: 'GOOGLE_AI_API_KEY',
    placeholder: 'AIza…',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    suggestedEnvVar: 'OPENAI_API_KEY',
    placeholder: 'sk-…',
  },
  {
    id: 'supabase_anon',
    label: 'Supabase (anon)',
    suggestedEnvVar: 'VITE_SUPABASE_ANON_KEY',
    placeholder: 'eyJhbGciOiJI…',
  },
  {
    id: 'supabase_url',
    label: 'Supabase URL',
    suggestedEnvVar: 'VITE_SUPABASE_URL',
    placeholder: 'https://xxxxx.supabase.co',
  },
  {
    id: 'vercel_token',
    label: 'Vercel token',
    suggestedEnvVar: 'VERCEL_TOKEN',
    placeholder: '…',
  },
  {
    id: 'stripe_secret',
    label: 'Stripe secret',
    suggestedEnvVar: 'STRIPE_SECRET_KEY',
    placeholder: 'sk_test_… or sk_live_…',
  },
  {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    suggestedEnvVar: 'ELEVENLABS_API_KEY',
    placeholder: '…',
  },
  {
    id: 'resend',
    label: 'Resend',
    suggestedEnvVar: 'RESEND_API_KEY',
    placeholder: 're_…',
  },
]

export function getKeyType(id: string): VaultKeyType | undefined {
  return VAULT_KEY_TYPES.find(t => t.id === id)
}
