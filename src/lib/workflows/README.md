# Workflows

Static workflow definitions for the future Agent Farm orchestrator.

This folder is the **foundation** for Agent Farm orchestration via the
`vercel:workflow` skill (Vercel Workflow DevKit, WDK). Each
`WorkflowDefinition` is a declarative recipe — an ordered list of steps,
each pointing at either a tool from `src/lib/toolsRegistry.ts`, a BFF
route, or a human-readable marker.

## Files

- `types.ts` — `WorkflowDefinition` / `WorkflowStep` shapes
- `audio-to-melody.ts` — YouTube → Stem → Key → Chord → Piano pipeline

## Included definitions

1. **`audioToMelodyWorkflow`** (`audio-to-melody`) — end-to-end pipeline
   that pulls audio from YouTube, splits stems, detects key + chord
   progression, then hands the result off to Piano Studio for play-along.

## No executor yet

These are **data only**. There is no runtime that walks the `steps`
array; the planned Agent Farm rebuild will consume these definitions and
schedule durable WDK steps from them. Adding new definitions today is
safe — nothing imports them at runtime.
