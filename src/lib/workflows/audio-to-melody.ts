import type { WorkflowDefinition } from './types'

/**
 * YouTube → Stem → Key → Chord → Piano pipeline.
 *
 * Static description only — no executor yet. Tool ids match
 * `TOOLS_REGISTRY` in `src/lib/toolsRegistry.ts`. The final piano step is
 * declared as a `mark` because the registry currently has no piano-tool
 * entry; the future executor can swap in a real `tools-piano` id once it
 * lands.
 */
export const audioToMelodyWorkflow: WorkflowDefinition = {
  id: 'audio-to-melody',
  title: 'Audio → Melody',
  description:
    'Grab a YouTube source, isolate stems, detect key and chords, then surface the result in Piano Studio for play-along.',
  steps: [
    {
      id: 'grab',
      label: 'Grab audio from YouTube',
      action: { kind: 'tool', toolId: 'tools-youtube-downloader' },
      produces: 'audio.mp3',
    },
    {
      id: 'split',
      label: 'Split stems (brightness vs body)',
      action: { kind: 'tool', toolId: 'tools-stem-splitter' },
      consumes: 'audio.mp3',
      produces: 'stems',
    },
    {
      id: 'key',
      label: 'Detect key & BPM',
      action: { kind: 'tool', toolId: 'tools-key-finder' },
      consumes: 'stems',
      produces: 'keyInfo',
    },
    {
      id: 'chords',
      label: 'Detect chord progression',
      action: { kind: 'tool', toolId: 'tools-chord-detector' },
      consumes: 'stems',
      produces: 'chordProgression',
    },
    {
      id: 'piano',
      label: 'Open in Piano Studio',
      action: {
        kind: 'mark',
        message:
          'Hand off keyInfo + chordProgression to Piano Studio for play-along (no dedicated piano tool id in registry yet).',
      },
      consumes: 'chordProgression',
    },
  ],
}
