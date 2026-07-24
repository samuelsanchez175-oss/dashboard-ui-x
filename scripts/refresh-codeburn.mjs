#!/usr/bin/env node
/**
 * Bake a CodeBurn usage snapshot into `public/data/codeburn.json`.
 *
 * CodeBurn reads local AI-session logs on THIS Mac and can only serve them from
 * localhost — a Vercel-hosted page can't reach it. So, exactly like the Daily
 * Brief pipeline, we bake a static snapshot the deployed Cost zone consumes.
 * The zone only reads this file; it never re-derives.
 *
 * Data source: `codeburn status --period <p> --format menubar-json` — the same
 * payload the live 127.0.0.1:4747 visualizer renders, but headless (no server).
 *
 * Run by hand:      npm run refresh:codeburn
 * Run in the 7am routine: called from ⚙️ automation/daily-brief/run_brief.sh
 *
 * Override the binary with CODEBURN_BIN=/path/to/codeburn if it isn't resolvable.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'data', 'codeburn.json')
// Same five periods the live visualizer offers in its top-right tab bar, so the
// zone is one-to-one with it: Today / 7 days / 30 days / Month / All.
const PERIODS = ['today', 'week', '30days', 'month', 'all']

/** Resolve the codeburn CLI: explicit override → npm global bin → PATH. */
function resolveBin() {
  const override = process.env.CODEBURN_BIN
  if (override && existsSync(override)) return override
  const npmGlobal = join(process.env.HOME || '', '.npm-global', 'bin', 'codeburn')
  if (existsSync(npmGlobal)) return npmGlobal
  return 'codeburn' // fall back to PATH
}

const BIN = resolveBin()

function fetchPeriod(period) {
  const raw = execFileSync(
    BIN,
    ['status', '--period', period, '--format', 'menubar-json', '--no-optimize'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )
  return JSON.parse(raw)
}

/** Keep every section the live CodeBurn visualizer renders, so the Cost zone is
 * one-to-one with it, but drop per-row noise the panels never show (notably
 * `topProjects[].sessionDetails`, ~8KB/period) so the committed file stays small
 * and its daily git diff stays legible. */
function slimCurrent(c) {
  if (!c) return null
  const pickList = (arr, keys) =>
    Array.isArray(arr) ? arr.map(o => Object.fromEntries(keys.filter(k => k in o).map(k => [k, o[k]]))) : []
  // `providers` comes back as a { name: cost } map — flatten to a sorted array,
  // dropping providers with no spend.
  const providerList = (m) =>
    m && typeof m === 'object' && !Array.isArray(m)
      ? Object.entries(m)
          .map(([name, cost]) => ({ name, cost: Number(cost) || 0 }))
          .filter(p => p.cost > 0)
          .sort((a, b) => b.cost - a.cost)
      : pickList(m, ['name', 'cost'])
  // `retryTax` / `routingWaste` / `localModelSavings` back the visualizer's
  // "Savings & waste" panel. Objects, not lists — keep their shape and slim only
  // the per-model rows hanging off them.
  const pickObj = (o, keys, listKey, listKeys) => {
    if (!o || typeof o !== 'object') return null
    const out = Object.fromEntries(keys.filter(k => k in o).map(k => [k, o[k]]))
    if (listKey) out[listKey] = pickList(o[listKey], listKeys)
    return out
  }

  return {
    label: c.label,
    cost: c.cost,
    calls: c.calls,
    sessions: c.sessions,
    oneShotRate: c.oneShotRate,
    inputTokens: c.inputTokens,
    outputTokens: c.outputTokens,
    cacheReadTokens: c.cacheReadTokens,
    cacheWriteTokens: c.cacheWriteTokens,
    cacheHitPercent: c.cacheHitPercent,
    codexCredits: c.codexCredits,
    topActivities: pickList(c.topActivities, ['name', 'cost', 'turns', 'oneShotRate', 'savingsUSD']),
    topModels: pickList(c.topModels, ['name', 'cost', 'calls', 'inputTokens', 'outputTokens', 'savingsUSD']),
    topProjects: pickList(c.topProjects, ['name', 'cost', 'calls', 'sessions', 'avgCostPerSession']),
    providers: providerList(c.providers),
    // Panels the visualizer shows that the zone used to drop entirely.
    tools: pickList(c.tools, ['name', 'calls', 'cost']),
    skills: pickList(c.skills, ['name', 'turns', 'cost']),
    subagents: pickList(c.subagents, ['name', 'calls', 'cost']),
    mcpServers: pickList(c.mcpServers, ['name', 'calls', 'cost']),
    retryTax: pickObj(c.retryTax, ['totalUSD', 'retries', 'editTurns'], 'byModel', [
      'name',
      'taxUSD',
      'retries',
      'retriesPerEdit',
    ]),
    routingWaste: pickObj(
      c.routingWaste,
      ['totalSavingsUSD', 'baselineModel', 'baselineCostPerEdit'],
      'byModel',
      ['name', 'costPerEdit', 'editTurns', 'actualUSD', 'counterfactualUSD', 'savingsUSD'],
    ),
    localModelSavings: pickObj(c.localModelSavings, ['totalUSD', 'calls'], 'byModel', ['name', 'savingsUSD', 'calls']),
    modelEfficiency: pickList(c.modelEfficiency, ['name', 'costPerEdit', 'oneShotRate']),
    topSessions: pickList(c.topSessions, ['project', 'cost', 'calls', 'date', 'savingsUSD']),
    unpricedModels: pickList(c.unpricedModels, ['name', 'calls', 'inputTokens', 'outputTokens']),
  }
}

function slimDaily(history) {
  const daily = history && Array.isArray(history.daily) ? history.daily : []
  return daily.map(d => ({
    date: d.date,
    cost: d.cost,
    calls: d.calls,
    inputTokens: d.inputTokens,
    outputTokens: d.outputTokens,
  }))
}

console.log(`[refresh-codeburn] using ${BIN}`)
const periods = {}
let history = []
for (const p of PERIODS) {
  try {
    const payload = fetchPeriod(p)
    periods[p] = slimCurrent(payload.current)
    // history is identical across periods (trailing ~6 months) — capture once.
    if (history.length === 0) history = slimDaily(payload.history)
    console.log(`[refresh-codeburn] ${p}: ${periods[p]?.label} — $${(periods[p]?.cost ?? 0).toFixed(2)}`)
  } catch (err) {
    console.error(`[refresh-codeburn] ${p} failed:`, err.message)
    periods[p] = null
  }
}

if (!periods.today && !periods.month && !periods.all) {
  console.error('[refresh-codeburn] all periods failed — is codeburn installed? Leaving snapshot untouched.')
  process.exit(1)
}

const snapshot = {
  generated_at: new Date().toISOString(),
  device: hostname(),
  history: { daily: history },
  periods,
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(snapshot, null, 2) + '\n')
console.log(`[refresh-codeburn] wrote ${OUT} (${(JSON.stringify(snapshot).length / 1024).toFixed(0)}KB)`)
