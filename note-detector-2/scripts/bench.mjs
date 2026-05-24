/**
 * note-detector-2 benchmark harness — SUBMIT stage.
 *
 * Pushes each audio test file through a running note-detector-2 FastAPI service
 * (POST /transcribe -> poll GET /status -> GET /download) and saves the merged
 * multi-track MIDI to `tmp/note-detector-2-bench/`.
 *
 * Deliberately mirrors `scripts/chord-detector-phase-bench.mjs` so the two
 * tools can be compared. Scoring is a separate step — see `./score.mjs`.
 *
 * Usage (run from the REPO ROOT, not from note-detector-2/):
 *
 *   # terminal 1 — start the service
 *   cd note-detector-2 && docker compose up --build
 *
 *   # terminal 2 — run the bench once the API answers
 *   node note-detector-2/scripts/bench.mjs
 *
 * Env:
 *   ND2_API   base URL of the service (default http://localhost:8000)
 *
 * Pure Node builtins + global fetch/FormData/Blob — no npm deps needed here.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const API = (process.env.ND2_API || 'http://localhost:8000').replace(/\/+$/, '')
const OUT_DIR = path.resolve('tmp/note-detector-2-bench')

/* Same audio inputs as the chord-detector bench. `frank-mid` is intentionally
 * omitted: note-detector-2 accepts audio only — it has no MIDI-passthrough
 * path. Sonify that .mid to a .wav first if you want a third row. */
const INPUTS = [
  {
    label: 'frank-ocean-acura-mp3',
    path: '/Users/samuel/Desktop/Frank Ocean Acura Integurl Instrumental.mp3',
    contentType: 'audio/mpeg',
  },
  {
    label: 'notes2-wav',
    path: '/Users/samuel/Desktop/Notes 2.wav',
    contentType: 'audio/wav',
  },
  {
    label: 'notes-wav',
    path: '/Users/samuel/Desktop/Notes.wav',
    contentType: 'audio/wav',
  },
]

const POLL_INTERVAL_MS = 3_000
const JOB_TIMEOUT_MS = 30 * 60 * 1_000 // 30 min — Demucs + Omnizart on CPU is slow

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Fail fast (with a useful message) if the service isn't up. */
async function checkHealth() {
  try {
    const res = await fetch(`${API}/`)
    if (!res.ok) throw new Error(`health returned ${res.status}`)
    console.log(`[bench] service up at ${API} -> ${JSON.stringify(await res.json())}`)
  } catch (e) {
    throw new Error(
      `[bench] cannot reach note-detector-2 at ${API} — ` +
        `is \`docker compose up\` running? (${e.message})`,
    )
  }
}

/** POST the audio file, return the Celery task_id. */
async function submit(input) {
  const buf = readFileSync(input.path)
  const form = new FormData()
  // The 3rd arg (filename) matters — the API derives the file extension from it.
  form.append(
    'file',
    new Blob([buf], { type: input.contentType }),
    path.basename(input.path),
  )
  const res = await fetch(`${API}/transcribe`, { method: 'POST', body: form })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`/transcribe ${res.status}: ${JSON.stringify(body)}`)
  return body.task_id
}

/** Poll /status until the job leaves Queued/Processing. */
async function pollUntilDone(taskId, label) {
  const t0 = Date.now()
  let lastStage = ''
  while (Date.now() - t0 < JOB_TIMEOUT_MS) {
    const res = await fetch(`${API}/status/${taskId}`)
    const body = await res.json().catch(() => ({}))
    if (body.stage && body.stage !== lastStage) {
      lastStage = body.stage
      console.log(`[bench]   ${label}: ${body.status} — ${body.stage}`)
    }
    if (body.status === 'Completed') return body
    if (body.status === 'Failed') throw new Error(`job failed: ${body.error}`)
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error(`job ${taskId} timed out after ${JOB_TIMEOUT_MS / 1000}s`)
}

/** GET the merged .mid and write it to disk; return byte count. */
async function download(taskId, outPath) {
  const res = await fetch(`${API}/download/${taskId}`)
  if (!res.ok) throw new Error(`/download ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(outPath, buf)
  return buf.length
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  // Sanity-read every input up front so a bad path fails before the slow work.
  for (const inp of INPUTS) {
    try {
      const bytes = readFileSync(inp.path)
      console.log(`[bench] input ${inp.label} -> ${bytes.length.toLocaleString()} bytes`)
    } catch (e) {
      throw new Error(`[bench] cannot read ${inp.path}: ${e.message}`)
    }
  }

  await checkHealth()

  const summary = []
  for (const inp of INPUTS) {
    const t0 = Date.now()
    console.log(`[bench] -> ${inp.label}: submitting`)
    try {
      const taskId = await submit(inp)
      console.log(`[bench]   ${inp.label}: task_id=${taskId}`)
      const done = await pollUntilDone(taskId, inp.label)
      const outPath = path.join(OUT_DIR, `${inp.label}.mid`)
      const bytes = await download(taskId, outPath)
      const wallMs = Date.now() - t0
      console.log(
        `[bench]   OK ${inp.label}: ${bytes.toLocaleString()} bytes MIDI, ` +
          `stems=[${(done.stems || []).join(',')}], ${(wallMs / 1000).toFixed(1)}s wall`,
      )
      summary.push({
        label: inp.label,
        ok: true,
        taskId,
        midiPath: outPath,
        midiBytes: bytes,
        stems: done.stems || [],
        wallMs,
      })
    } catch (e) {
      console.error(`[bench]   FAIL ${inp.label}: ${e.message}`)
      summary.push({ label: inp.label, ok: false, error: e.message, wallMs: Date.now() - t0 })
    }
  }

  writeFileSync(
    path.join(OUT_DIR, '_summary.json'),
    JSON.stringify({ api: API, generatedAt: new Date().toISOString(), runs: summary }, null, 2),
  )
  const okCount = summary.filter((s) => s.ok).length
  console.log(`[bench] wrote ${okCount}/${summary.length} runs to ${OUT_DIR}`)
  console.log(`[bench] next: node note-detector-2/scripts/score.mjs`)
  if (okCount < summary.length) process.exit(1)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
