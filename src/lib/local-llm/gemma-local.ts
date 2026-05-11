/**
 * Local-only LLM hookup (Ollama-style). **No cloud / Gemini keys here** — point the
 * dashboard at a runtime on your machine (Ollama, LM Studio OpenAI shim, etc.).
 *
 * Install (example): https://ollama.com — then `ollama pull gemma2` (or your tag).
 */

export interface LocalLlmConfig {
  /** e.g. `http://127.0.0.1:11434` (Ollama default) */
  baseUrl: string | null
  /** e.g. `gemma2:2b`, `gemma3:latest` — must exist in your local runtime */
  model: string
  /** Optional JSON URL bundled or served locally for RAG snippets (see `loadRagSnippets`). */
  ragManifestUrl: string | null
}

function trimEnv(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length ? t : null
}

export function getLocalLlmConfig(): LocalLlmConfig {
  return {
    baseUrl: trimEnv(import.meta.env.VITE_LOCAL_LLM_BASE_URL),
    model: trimEnv(import.meta.env.VITE_LOCAL_LLM_MODEL) ?? 'gemma2:2b',
    ragManifestUrl: trimEnv(import.meta.env.VITE_RAG_MANIFEST_URL),
  }
}

export function isLocalLlmConfigured(): boolean {
  return getLocalLlmConfig().baseUrl !== null
}

export interface RagSnippet {
  id: string
  text: string
}

/** Fetch `{ "snippets": [{ "id", "text" }] }` from `VITE_RAG_MANIFEST_URL` (optional). */
export async function loadRagSnippets(): Promise<RagSnippet[]> {
  const url = getLocalLlmConfig().ragManifestUrl
  if (!url) return []
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const data = (await res.json()) as { snippets?: RagSnippet[] }
    return Array.isArray(data.snippets) ? data.snippets : []
  } catch {
    return []
  }
}

function buildRagBlock(snippets: RagSnippet[], query: string): string {
  if (!snippets.length) return ''
  const q = query.toLowerCase()
  const pick = snippets.filter(s => s.text.toLowerCase().includes(q) || q.length < 2)
  const use = pick.length ? pick.slice(0, 8) : snippets.slice(0, 6)
  return use.map(s => `[${s.id}] ${s.text}`).join('\n')
}

/** Ollama native `/api/chat` (non-streaming). */
export async function ollamaChat(opts: {
  system?: string
  user: string
}): Promise<string> {
  const { baseUrl, model } = getLocalLlmConfig()
  if (!baseUrl) {
    throw new Error(
      'Local LLM not configured — set VITE_LOCAL_LLM_BASE_URL (e.g. http://127.0.0.1:11434 for Ollama).',
    )
  }
  const url = `${baseUrl.replace(/\/$/, '')}/api/chat`
  const messages: { role: string; content: string }[] = []
  if (opts.system) messages.push({ role: 'system', content: opts.system })
  messages.push({ role: 'user', content: opts.user })
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
    }),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    throw new Error(`Local LLM error ${res.status}: ${errText}`)
  }
  const data = (await res.json()) as { message?: { content?: string } }
  return data.message?.content?.trim() ?? ''
}

/**
 * One-shot lyric assistant: optional RAG from `VITE_RAG_MANIFEST_URL`, then local model.
 */
export async function suggestLineWithLocalGemma(userPrompt: string): Promise<string> {
  const snippets = await loadRagSnippets()
  const rag = buildRagBlock(snippets, userPrompt)
  const system = [
    'You are a concise rap / lyric assistant. Reply with 2–6 lines max.',
    rag ? `Context (indexed):\n${rag}` : '(No RAG manifest loaded — set VITE_RAG_MANIFEST_URL to a JSON file.)',
  ].join('\n\n')
  return ollamaChat({ system, user: userPrompt })
}
