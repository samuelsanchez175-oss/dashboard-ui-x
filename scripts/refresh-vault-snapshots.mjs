#!/usr/bin/env node
/**
 * Refresh dashboard snapshots from the OB CLAUDE vault.
 * Uses terminal tools (+ optional Grok synthesis) hand-in-hand.
 *
 * Steps:
 *  1. Resolve vault path
 *  2. Run chat-ingest (auto_ingest.py) if present
 *  3. Run daily-brief script if present
 *  4. Copy command-center handoff into public/
 *  5. Rebuild vault RAG index
 *  6. Optionally ask Grok for a one-paragraph "snapshot pulse"
 *
 * Usage: node scripts/refresh-vault-snapshots.mjs [--no-grok] [--skip-ingest]
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const candidates = [
  process.env.VAULT_DIR,
  '/Users/samuel/Pictures/OB CLAUDE vault',
  '/Users/samuel/Documents/OB CLAUDE V1',
  '/Users/samuel/dev/OB CLAUDE vault',
].filter(Boolean)

const vaultDir = candidates.find(p => fs.existsSync(p))
if (!vaultDir) {
  console.error('[refresh-vault-snapshots] No vault found. Set VAULT_DIR.')
  process.exit(1)
}

const args = new Set(process.argv.slice(2))
const noGrok = args.has('--no-grok')
const skipIngest = args.has('--skip-ingest')

function run(cmd, cwd = repoRoot) {
  console.log(`\n$ ${cmd}`)
  const r = spawnSync(cmd, { shell: true, cwd, encoding: 'utf8', env: process.env, maxBuffer: 8 * 1024 * 1024 })
  if (r.stdout) process.stdout.write(r.stdout)
  if (r.stderr) process.stderr.write(r.stderr)
  return r.status === 0
}

console.log(`[refresh-vault-snapshots] vault=${vaultDir}`)

const results = { vaultDir, steps: {} }

if (!skipIngest) {
  const ingest = path.join(vaultDir, '⚙️ automation/chat-ingest/auto_ingest.py')
  if (fs.existsSync(ingest)) {
    results.steps.ingest = run(`python3 "${ingest}"`)
  } else {
    console.log('[skip] chat-ingest script missing')
    results.steps.ingest = null
  }
}

const brief = path.join(vaultDir, '⚙️ automation/daily-brief/run_brief.sh')
if (fs.existsSync(brief)) {
  results.steps.brief = run(`bash "${brief}"`)
} else {
  console.log('[skip] daily-brief script missing')
  results.steps.brief = null
}

// Prefer Python build.py to refresh public/data/daily-brief.json if present
const buildPy = path.join(vaultDir, '📊 dashboard-ui/build.py')
if (fs.existsSync(buildPy)) {
  results.steps.buildBriefJson = run(`python3 "${buildPy}"`)
  // copy snapshot into dashboard public if build writes near vault
  const snapCandidates = [
    path.join(vaultDir, '📊 dashboard-ui/daily-brief.json'),
    path.join(vaultDir, '📊 dashboard-ui/out/daily-brief.json'),
    path.join(repoRoot, 'public/data/daily-brief.json'),
  ]
  for (const s of snapCandidates) {
    if (fs.existsSync(s) && path.resolve(s) !== path.resolve(repoRoot, 'public/data/daily-brief.json')) {
      fs.mkdirSync(path.join(repoRoot, 'public/data'), { recursive: true })
      fs.copyFileSync(s, path.join(repoRoot, 'public/data/daily-brief.json'))
      console.log(`[copy] ${s} → public/data/daily-brief.json`)
      break
    }
  }
}

const handoffSrc =
  process.env.COMMAND_CENTER_SRC ||
  path.join(vaultDir, '📄 Handoff Sheets')
if (fs.existsSync(handoffSrc)) {
  results.steps.commandCenter = run(
    `COMMAND_CENTER_SRC="${handoffSrc}" npm run refresh:command-center`,
    repoRoot,
  )
} else {
  console.log('[skip] Handoff Sheets folder missing')
  results.steps.commandCenter = null
}

// RAG rebuild via node import of TS is hard; call a small pure-node reindex
// by shelling to a one-off — use curl against local BFF if up, else skip.
const bff = spawnSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', 'http://localhost:5175/api/vault/status'], {
  encoding: 'utf8',
})
if (bff.stdout?.trim() === '200') {
  console.log('\n[rag] rebuilding index via BFF…')
  const rebuild = spawnSync(
    'curl',
    ['-s', '-X', 'POST', 'http://localhost:5175/api/vault/rag/rebuild'],
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
  )
  process.stdout.write(rebuild.stdout || '')
  results.steps.rag = rebuild.status === 0
} else {
  console.log('[skip] dev server not up — start npm run dev then POST /api/vault/rag/rebuild')
  results.steps.rag = null
}

if (!noGrok) {
  const grok = fs.existsSync('/Users/samuel/.grok/bin/grok')
    ? '/Users/samuel/.grok/bin/grok'
    : 'grok'
  // Pull last few handoff filenames for grounding without tools
  let handoffNames = ''
  try {
    const hdir = path.join(vaultDir, '🤝 Handoffs')
    handoffNames = fs
      .readdirSync(hdir)
      .filter(f => f.endsWith('.md'))
      .sort()
      .slice(-8)
      .join('\n')
  } catch { /* */ }
  const pulsePrompt = `Recent handoff filenames:\n${handoffNames || '(none)'}\n\nWrite exactly 4 short bullets: what Samuel should focus on today across vault, CDL, music tools, CarPlay, dashboard. Practical. No preamble.`
  console.log('\n[grok] snapshot pulse…')
  const g = spawnSync(
    grok,
    [
      '-p', pulsePrompt,
      '--disable-web-search',
      '--max-turns', '1',
      '--disallowed-tools', 'bash,run_terminal_command,web_search,web_fetch,open_page',
      '--system-prompt-override',
      'Answer with only the 4 bullets. No planning text.',
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: `/Users/samuel/.grok/bin:${process.env.PATH || ''}` },
      maxBuffer: 2 * 1024 * 1024,
    },
  )
  if (g.stdout) {
    const pulsePath = path.join(repoRoot, 'public/data/snapshot-pulse.md')
    fs.mkdirSync(path.dirname(pulsePath), { recursive: true })
    const body = `---\ngenerated: ${new Date().toISOString()}\nsource: grok-cli\n---\n\n# Snapshot pulse\n\n${g.stdout.trim()}\n`
    fs.writeFileSync(pulsePath, body)
    console.log(g.stdout.trim())
    console.log(`[write] ${pulsePath}`)
    results.steps.pulse = true
  } else {
    console.error(g.stderr || 'grok pulse failed')
    results.steps.pulse = false
  }
}

// Write meta
const meta = {
  refreshedAt: new Date().toISOString(),
  vaultDir,
  results: results.steps,
}
fs.mkdirSync(path.join(repoRoot, 'public/data'), { recursive: true })
fs.writeFileSync(path.join(repoRoot, 'public/data/snapshot-refresh.json'), JSON.stringify(meta, null, 2))
console.log('\n[done]', JSON.stringify(meta, null, 2))
process.exit(0)
