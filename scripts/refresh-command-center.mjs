#!/usr/bin/env node
/**
 * Publish the Obsidian "Project Command Center" handoff into the dashboard.
 *
 * The vault's `/vault-routine task1` run renders the adviser handoff to
 * `📄 Handoff Sheets/Project Command Center — <date>.{html,pdf}` in the OB CLAUDE
 * vault. This script copies the newest of those into `public/command-center/`
 * under stable names (`latest.html`, `latest.pdf`) plus a `meta.json` stamp, so
 * the deployed Command Center zone always shows the latest read from anywhere.
 * The zone only renders the committed file; it never re-derives.
 *
 * Run by hand:            npm run refresh:command-center
 * Run by the routine:     called at the end of `/vault-routine task1`
 *
 * Override the source dir with COMMAND_CENTER_SRC=/path/to/handoff/sheets.
 */
import { existsSync, mkdirSync, readdirSync, copyFileSync, writeFileSync, statSync, readFileSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public', 'command-center')

const SRC_DIR =
  process.env.COMMAND_CENTER_SRC ||
  join(process.env.HOME || '', 'dev', 'OB CLAUDE vault', '\u{1F4C4} Handoff Sheets')

function newestHandoff(ext) {
  if (!existsSync(SRC_DIR)) return null
  const matches = readdirSync(SRC_DIR)
    .filter(f => f.startsWith('Project Command Center') && f.endsWith('.' + ext))
    .map(f => ({ f, m: statSync(join(SRC_DIR, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)
  return matches.length ? join(SRC_DIR, matches[0].f) : null
}

/** Pull the "Last updated: <date>" out of the handoff HTML, if present. */
function extractDate(htmlPath) {
  try {
    const html = readFileSync(htmlPath, 'utf8')
    const m = html.match(/Last updated:\s*([^<|&]+)/i)
    return m ? m[1].trim() : null
  } catch {
    return null
  }
}

function main() {
  const html = newestHandoff('html')
  const pdf = newestHandoff('pdf')
  if (!html && !pdf) {
    console.error(`[command-center] no handoff found in: ${SRC_DIR}`)
    process.exit(1)
  }
  mkdirSync(OUT_DIR, { recursive: true })

  if (html) copyFileSync(html, join(OUT_DIR, 'latest.html'))
  if (pdf) copyFileSync(pdf, join(OUT_DIR, 'latest.pdf'))

  const updated = (html && extractDate(html)) || new Date().toISOString().slice(0, 10)
  writeFileSync(
    join(OUT_DIR, 'meta.json'),
    JSON.stringify({ updated, source: basename(html || pdf) }, null, 2) + '\n',
  )

  console.log(`[command-center] published → public/command-center/ (updated ${updated})`)
}

main()
