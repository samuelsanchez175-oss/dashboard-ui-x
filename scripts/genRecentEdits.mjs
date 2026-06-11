#!/usr/bin/env node
/**
 * Maps recent git commits (14 days) to zone ids from `navigation.ts` + `toolsRegistry.ts`.
 * Writes `src/lib/recentEdits.generated.ts` for optional hydration (e.g. sidebar “recent” badges).
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const outPath = path.join(repoRoot, 'src', 'lib', 'recentEdits.generated.ts')

/**
 * Longest-match wins: first matching rule assigns its zone ids to a path.
 * Derived from `src/components/sidebar/navigation.ts` + `src/lib/toolsRegistry.ts`
 * and `src/zones/**` layout.
 */
const FILE_TO_ZONE = [
  // —— Components (zone-adjacent) ——
  [/^src\/components\/agent-farm\//, ['agent-farm']],
  [/^src\/components\/piano\//, ['vocals']],
  [/^src\/components\/rhyme-studio\//, ['rhyme-studio']],
  // —— Tools hub + registry tools ——
  [/^src\/zones\/tools\/ToolsHubZone/, ['tools-hub']],
  [/^src\/zones\/tools\/toolsHubData/, ['tools-hub']],
  [/^src\/zones\/tools\/StudioToolsHeader/, ['tools-hub']],
  [/^src\/zones\/tools\/ToolsYoutubePage/, ['tools-youtube-downloader']],
  [/^src\/zones\/tools\/ToolsKeyFinderPage/, ['tools-key-finder']],
  [/^src\/zones\/tools\/key-finder-history/, ['tools-key-finder']],
  [/^src\/zones\/tools\/ToolsChordDetectorPage/, ['tools-chord-detector']],
  [/^src\/zones\/tools\/chord-detector-engine/, ['tools-chord-detector']],
  [/^src\/zones\/tools\/ToolsTempoTapPage/, ['tools-tempo-tap']],
  [/^src\/zones\/tools\/ToolsMetronomeExportPage/, ['tools-metronome-export']],
  [/^src\/zones\/tools\/ToolsPhoneticsInspectorPage/, ['tools-phonetics-inspector']],
  [/^src\/zones\/tools\/ToolsSessionTimerPage/, ['tools-session-timer']],
  [/^src\/zones\/tools\/ToolsArrangementPadPage/, ['tools-arrangement-pad']],
  [/^src\/zones\/tools\/ToolsSampleSlicerPage/, ['tools-sample-slicer']],
  [/^src\/zones\/tools\/ToolsStemSplitterPage/, ['tools-stem-splitter']],
  // —— Production / mixing / pulse ——
  [/^src\/zones\/production\//, ['agent-farm']],
  [/^src\/zones\/mixing\/MixingAudioGrabPage/, ['mixing-audio-grab']],
  [/^src\/zones\/mixing\/MixingAudioGrabber/, ['mixing-audio-grab']],
  [/^src\/zones\/mixing\/mixing-audio-/, ['mixing-audio-grab']],
  [/^src\/zones\/mixing\//, ['mixing']],
  [/^src\/zones\/pulse\//, ['pulse']],
  // —— Harmony (single stack → all tab routes) ——
  [/^src\/zones\/harmony\//, ['harmony-services', 'harmony-todos', 'harmony-portfolio']],
  // —— CPW / vocals / dev / web / Tesla ——
  [/^src\/zones\/cpw\//, ['cpw-projects']],
  [/^src\/zones\/vocals\//, ['vocals']],
  [/^src\/zones\/dev\/DiagnosticsZone/, ['dev-diagnostics']],
  [/^src\/zones\/dev\/DevSettings/, ['dev']],
  [/^src\/zones\/dev\//, ['dev', 'dev-diagnostics']],
  [/^src\/zones\/web-designer\//, ['web-designer']],
  [/^src\/zones\/tesla\//, ['tesla']],
]

function zonesForPath(filePath) {
  const norm = filePath.replaceAll('\\', '/').trim()
  for (const [re, zones] of FILE_TO_ZONE) {
    if (re.test(norm)) return zones
  }
  return null
}

function parseGitLog(text) {
  /** @type {{ hash: string, date: string, files: string[] }[]} */
  const commits = []
  let cur = null
  for (const line of text.split('\n')) {
    const trimmed = line.trimEnd()
    if (!trimmed) continue
    const m = /^([0-9a-f]{40})\s+(.+)$/.exec(trimmed)
    if (m) {
      cur = { hash: m[1], date: m[2], files: [] }
      commits.push(cur)
      continue
    }
    if (cur && !trimmed.startsWith('commit ')) cur.files.push(trimmed)
  }
  return commits
}

function main() {
  let logText = ''
  try {
    logText = execFileSync(
      'git',
      ['log', '--since=14 days', '--name-only', '--pretty=format:%H %cI'],
      { cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    )
  } catch {
    console.warn('genRecentEdits: git log failed (not a repo or no history); writing empty map.')
  }

  const commits = parseGitLog(logText)
  /** @type {Map<string, string>} zoneId -> ISO date (first seen = most recent because git order) */
  const latest = new Map()

  for (const c of commits) {
    for (const f of c.files) {
      const zones = zonesForPath(f)
      if (!zones) continue
      for (const z of zones) {
        if (!latest.has(z)) latest.set(z, c.date)
      }
    }
  }

  const keys = [...latest.keys()].sort((a, b) => a.localeCompare(b))
  const body = keys.map(k => `  ${JSON.stringify(k)}: ${JSON.stringify(latest.get(k))},`).join('\n')

  const ts = `// AUTO-GENERATED — do not edit by hand.
export const RECENT_EDITS: Record<string, string> = {
${body}
}
`

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, ts, 'utf8')

  const preview = ts.split('\n').slice(0, 5).join('\n')
  console.log('genRecentEdits: wrote', path.relative(repoRoot, outPath), `(${keys.length} zone keys)`)
  console.log('— preview —')
  console.log(preview)
}

main()
