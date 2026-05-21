/**
 * Phase-test benchmark harness for the chord detector.
 *
 * For each pipeline configuration (raw, full, individual layer toggles) and
 * each input audio file (the MP3 to transcribe + the WAV of the "perfect"
 * MIDI rendered through a piano synth), run the engine via the DEV-only
 * `window.__chordDetectorBench` hook and save the result + exported MIDI to
 * `tmp/chord-detector-bench/`.
 *
 * The harness uses the dev server's real browser context — same WebGL +
 * BasicPitch path the user gets — so the numbers match production behavior.
 * No source-of-truth manipulation between configs.
 *
 *   node scripts/chord-detector-phase-bench.mjs
 *
 * Requires the dev server on http://localhost:5179 (see `.claude/launch.json`).
 *
 * Companion scoring step lives in `scripts/chord-detector-phase-score.mjs`,
 * which reads the JSON dumps written here and computes note-F1 / onset-F1
 * against the WAV-as-ground-truth baseline.
 */

import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const DEV_ORIGIN = process.env.DEV_ORIGIN || 'http://localhost:5179'
const ROUTE_ID = 'tools-chord-detector'
const OUT_DIR = path.resolve('tmp/chord-detector-bench')

const INPUTS = [
  {
    label: 'frank-ocean-acura-mp3',
    path: '/Users/samuel/Desktop/Frank Ocean Acura Integurl Instrumental.mp3',
  },
  {
    label: 'notes2-wav',
    path: '/Users/samuel/Desktop/Notes 2.wav',
  },
  {
    /* User-curated ground-truth MIDI as a direct input. The engine has a
     * separate MIDI path that bypasses BP entirely (most pipeline stages
     * skip for MIDI input). Useful as a sanity check — the score against
     * GT should be near 100 % for any config since the input IS the GT. */
    label: 'frank-mid',
    path: '/Users/samuel/Downloads/frank  Perfect acura girll .mid',
  },
]

/**
 * Pipeline configurations to A/B. Each `options` object is passed verbatim
 * to `analyzeChordProgressionFromBlob`. `raw` is the new bypass-all mode;
 * `full` is the original pipeline (no options); the rest disable one stage
 * at a time so we can attribute accuracy deltas to individual layers.
 */
const CONFIGS = [
  { label: 'raw',          options: { analysisMode: 'raw' } },
  /* `full` is the LEAN pipeline as of 2026-05-21 (single-pass BP — the
   * one proven win from Phase 1). The other "lean" layers we tried to
   * cut all regressed; only this one stuck. */
  { label: 'full',         options: {} },
  /* `full-legacy` keeps the register multi-pass on. Pre-flip behavior. */
  { label: 'full-legacy',  options: { analysisMode: 'full-legacy' } },
  { label: 'no-hpss',      options: { analysisMode: 'full-legacy', skipHpss: true } },
  { label: 'no-register',  options: { analysisMode: 'full-legacy', skipRegisterPasses: true } },
  { label: 'no-cleanup',   options: { skipExportCleanup: true } },
  { label: 'no-cqt',       options: { analysisMode: 'full-legacy', skipCqt: true } },
  { label: 'no-structure', options: { skipStructure: true } },
  /* Phase 3 — YIN monophonic tracker replaces BP's bass slice. Runs on
   * top of the new lean default; expected to lift bass F1 from 0 % to
   * something > 0. */
  { label: 'yin-bass',     options: { bassSource: 'yin' } },
  /* Phase 2 — multi-band HPSS swap (via localStorage). The bench evals
   * this by setting the localStorage key BEFORE invoking the analyze. */
  { label: 'hpss-mb',      options: {}, separator: 'hpss-multiband' },
  /* Phase 2 + Phase 3 combined. The recommended "everything on" setup
   * if both phases pan out. */
  { label: 'mb+yin',       options: { bassSource: 'yin' }, separator: 'hpss-multiband' },
  /* Phase 4 — measures what the chord-implied-notes default flip removed.
   * `full` defaults `inferChordTones: false`; passing `true` re-enables
   * the pre-Phase-4 behavior (synthesise chord tones into the output).
   * The delta `full` → `chord-imply-on` quantifies Phase 4. */
  { label: 'chord-imply-on', options: { inferChordTones: true } },
  /* Phase 6 — measures what the skipStructure default flip removed. `full`
   * now defaults `skipStructure: true` (this session); passing `false`
   * re-enables the 1/16 grid snap + duration quantization. The delta
   * `full` → `structure-on` quantifies Phase 6. */
  { label: 'structure-on', options: { skipStructure: false } },
]

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  // Sanity-read each input so we fail fast if a path is bad.
  for (const inp of INPUTS) {
    try {
      const bytes = readFileSync(inp.path)
      console.log(`[bench] input ${inp.label} → ${bytes.length.toLocaleString()} bytes`)
    } catch (e) {
      throw new Error(`[bench] cannot read ${inp.path}: ${e.message}`)
    }
  }

  console.log(`[bench] launching chromium`)
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    permissions: [],
    // Larger viewport so the chord-detector UI fully mounts.
    viewport: { width: 1400, height: 900 },
  })
  const page = await ctx.newPage()
  const consoleErrors = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))

  console.log(`[bench] open ${DEV_ORIGIN} + navigate to ${ROUTE_ID}`)
  await page.goto(DEV_ORIGIN, { waitUntil: 'networkidle', timeout: 120_000 })

  // Trigger the route via the sidebar. Avoids depending on internal route
  // state — clicking the visible button is the most reliable way in.
  await page.waitForFunction(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    return btns.some((b) => /Chord Detector/i.test(b.textContent || ''))
  }, { timeout: 30_000 })
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) =>
      /Chord Detector/i.test(b.textContent || ''),
    )
    if (btn) btn.click()
  })

  // Wait for the bench hook to be installed by ToolsChordDetectorPage.
  console.log(`[bench] waiting for window.__chordDetectorBench`)
  await page.waitForFunction(
    () => typeof window.__chordDetectorBench === 'function',
    { timeout: 30_000 },
  )

  // Pre-load each input as base64 in the page context so we don't reload
  // the file across configs.
  console.log(`[bench] loading inputs into page memory`)
  for (const inp of INPUTS) {
    const bytes = readFileSync(inp.path)
    const b64 = bytes.toString('base64')
    await page.evaluate(
      ({ label, b64, name }) => {
        const bin = atob(b64)
        const u8 = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
        window.__benchBlobs = window.__benchBlobs || {}
        window.__benchBlobs[label] = new File([u8], name, {
          type: name.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg',
        })
      },
      { label: inp.label, b64, name: path.basename(inp.path) },
    )
    console.log(`[bench]   loaded ${inp.label} (${bytes.length} bytes)`)
  }

  // Run every (input × config) pair sequentially. Each analyze call can take
  // ~30-90 s depending on whether WebGL or WASM is in use, so total wall time
  // is ~10-25 minutes for the full sweep.
  // CONFIG_FILTER env var: comma-separated config labels to include. Empty = all.
  const configFilter = (process.env.CONFIG_FILTER || '').split(',').map(s => s.trim()).filter(Boolean)
  const runConfigs = configFilter.length === 0 ? CONFIGS : CONFIGS.filter(c => configFilter.includes(c.label))
  if (configFilter.length > 0) {
    console.log(`[bench] CONFIG_FILTER = ${configFilter.join(',')} → ${runConfigs.length}/${CONFIGS.length} configs`)
  }
  const summary = []
  for (const inp of INPUTS) {
    for (const cfg of runConfigs) {
      const tag = `${inp.label}__${cfg.label}`
      console.log(`[bench] → ${tag} (config: ${JSON.stringify(cfg.options)})`)
      const t0 = Date.now()
      /* Per-config retry. HMR-triggered reloads in dev mode occasionally
       * destroy the page's execution context mid-eval; retrying after a
       * short settle lets the bench continue rather than aborting the
       * whole sweep. Up to 3 attempts; if all fail, log and move on. */
      let response = null
      let lastErr = null
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          /* If we crashed previously, re-establish the page state. */
          if (attempt > 0) {
            console.log(`[bench]     retry ${attempt} for ${tag} after: ${lastErr}`)
            await page.waitForTimeout(2000)
            await page.waitForFunction(
              () => typeof window.__chordDetectorBench === 'function',
              { timeout: 20_000 },
            )
            /* Re-inject the input blob if the page lost it on reload. */
            const stillHas = await page.evaluate(
              (label) => !!(window.__benchBlobs && window.__benchBlobs[label]),
              inp.label,
            )
            if (!stillHas) {
              const bytes = readFileSync(inp.path)
              const b64 = bytes.toString('base64')
              await page.evaluate(
                ({ label, b64, name }) => {
                  const bin = atob(b64)
                  const u8 = new Uint8Array(bin.length)
                  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
                  window.__benchBlobs = window.__benchBlobs || {}
                  window.__benchBlobs[label] = new File([u8], name, {
                    type: name.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg',
                  })
                },
                { label: inp.label, b64, name: path.basename(inp.path) },
              )
            }
          }
          response = await page.evaluate(
            async ({ inputLabel, options, separator }) => {
              window.localStorage.setItem('chord-detector-separator', separator || 'hpss')
              const blob = window.__benchBlobs[inputLabel]
              if (!blob) return { ok: false, message: `no blob for ${inputLabel}` }
              return window.__chordDetectorBench(blob, options)
            },
            { inputLabel: inp.label, options: cfg.options, separator: cfg.separator },
          )
          break // success
        } catch (e) {
          lastErr = (e && e.message) || String(e)
          response = null
        }
      }
      if (!response) {
        console.error(`[bench]   FAIL ${tag} after 3 attempts: ${lastErr}`)
        summary.push({ tag, ok: false, message: lastErr, wallMs: Date.now() - t0 })
        continue
      }
      const wallMs = Date.now() - t0
      if (!response.ok) {
        console.error(`[bench]   FAIL ${tag}: ${response.message}`)
        summary.push({ tag, ok: false, message: response.message, wallMs })
        continue
      }
      const r = response.result
      const noteCount = r.leadNotes?.length ?? 0
      const segCount = r.segments?.length ?? 0
      console.log(
        `[bench]   OK ${tag}: ${noteCount} notes, ${segCount} segments, ` +
          `${response.elapsedMs.toFixed(0)} ms engine / ${wallMs} ms wall`,
      )
      // Save JSON dump (notes + segments + key) + MIDI export.
      const jsonOut = {
        tag,
        input: inp.label,
        config: cfg.label,
        options: cfg.options,
        engineElapsedMs: response.elapsedMs,
        wallMs,
        bpm: r.bpm,
        bpmSource: r.bpmSource,
        durationSec: r.durationSec,
        estimatedKey: r.estimatedKey,
        segments: r.segments,
        leadNotes: r.leadNotes,
      }
      writeFileSync(path.join(OUT_DIR, `${tag}.json`), JSON.stringify(jsonOut, null, 2))
      writeFileSync(
        path.join(OUT_DIR, `${tag}.mid`),
        Buffer.from(response.midiBase64, 'base64'),
      )
      summary.push({
        tag,
        ok: true,
        noteCount,
        segCount,
        engineMs: response.elapsedMs,
        wallMs,
        bpm: r.bpm,
        key: r.estimatedKey?.label,
      })
    }
  }

  writeFileSync(path.join(OUT_DIR, '_summary.json'), JSON.stringify({
    runs: summary,
    consoleErrors: consoleErrors.slice(-50),
  }, null, 2))
  console.log(`[bench] wrote ${summary.length} runs to ${OUT_DIR}`)
  if (consoleErrors.length) {
    console.warn(`[bench] ${consoleErrors.length} console errors captured (see _summary.json)`)
  }

  await browser.close()
  console.log(`[bench] done.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
