---
name: agent-cycle-3
description: >-
  Runs a closed-loop quality workflow: implement (solution), measure (verify),
  then write comparator feedback for the next pass. Use when the user asks for
  "agent cycle 3", "solution verify compare cycles", multi-round iteration with
  metrics against a control file, or orchestrated chord/MIDI/audio tuning with
  audit scripts and tmp feedback handoffs.
---

# Agent cycle 3 (solution → verify → compare)

## When to use

- The user wants **multiple improvement rounds** without parallel subagents losing shared state.
- Each round must **change code**, **run an objective check** (script, tests, metrics), and **produce written notes** that drive the next round.
- Typical domains: **MIDI / chord export** vs a control audio file, latency tuning, or any pipeline with a **CLI verifier** and **git-tracked** source edits.

## Core idea

Use **one orchestrator agent** (one Task / one session) that repeats **N cycles**. Do **not** rely on separate Cursor subagents handing off to each other unless you have an explicit IPC mechanism; instead, the same agent plays three roles in sequence each cycle.

### One cycle = three phases

1. **Solution (implement)**  
   - Read feedback from the previous cycle (see **Artifacts** below).  
   - Edit the codebase incrementally.  
   - Run **`npm run build`** (or the project’s equivalent) after substantive edits.

2. **Verify (measure)**  
   - Run the project’s audit script, tests, or metrics command (e.g. `node scripts/audit-chord-midi-timing.mjs "<path>.mid"`).  
   - Capture numbers (pass/fail, p50/p90/p99, counts).  
   - If the metric reads a **stale artifact** on disk (e.g. old MIDI export), state that clearly: code changes do not rewrite user Downloads until the user **re-exports**.

3. **Compare (notes for next solution)**  
   - Act as a **comparator**: interpret metrics vs product intent and vs a **control** reference (audio path, golden file, or spec).  
   - Write structured **feedback for the next Solution phase** — concrete knobs (ms, thresholds, file names), risks (e.g. arpeggios vs chords), and PASS/FAIL vs documented gates.

## Artifacts (handoff between cycles)

Use a stable directory under the repo, e.g. **`tmp/`** (gitignored is fine):

| File | Purpose |
|------|--------|
| `tmp/chord-feedback-cycle-{n}.md` | Comparator output after cycle *n* (example naming from chord work). |
| `tmp/chord-feedback-extra-{n}.md` | Alternative batch naming for “extra” cycles. |
| `tmp/chord-3cycle-summary.md` | End-of-run summary after a 3-cycle batch. |
| `tmp/chord-5extra-cycle-summary.md` | Summary after a 5-cycle extension. |

**Cycle 1** may start with no prior file. **Cycle k > 1** must read the feedback file produced at the end of cycle **k − 1**.

## Orchestrator prompt template

Paste and fill placeholders:

```text
Workspace: <REPO_ROOT>

You are a single orchestrator. Run exactly <N> complete cycles.

Each cycle:
1) Solution: read tmp/<FEEDBACK_PREV>.md (skip if cycle 1), implement changes under <PATHS>, run npm run build.
2) Verify: run <VERIFY_COMMAND> on <ARTIFACT_PATH>. Record metrics.
3) Compare: write tmp/<FEEDBACK_THIS>.md with bullets for the next Solution pass + PASS/FAIL vs <THRESHOLDS>.

After cycle N: write tmp/<SUMMARY>.md with a table of all cycles, final verdict, and user actions (e.g. re-export MIDI).

Constraints: <e.g. preserve leadNotesRaw>; no secrets; do not delete user files under Downloads.
```

## Extending cycle count

- **3 cycles** — good for a first tight loop.  
- **5 more cycles** — use fresh feedback filenames or explicit numbering so files are not overwritten unintentionally.  
- Increase **N** in the prompt only; the three-phase structure stays the same.

## Optional: persistent dev server

After code changes, local preview may need a running Vite server. This repo supports **`npm run dev:persist`** (pm2) — see `ecosystem.config.cjs`. Strict HTTP verification: **`npm run verify:live`** (requires dev already listening on the configured port).

## Naming

The user-facing name is **“agent cycle 3”** for the **three phases per cycle** (solution, verify, compare). The skill id is **`agent-cycle-3`**.
