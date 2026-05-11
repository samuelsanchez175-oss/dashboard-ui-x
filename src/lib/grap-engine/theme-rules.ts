/**
 * Lightweight “theme / RAG” cues for songwriting — aligns with lyric journal concepts
 * (end rhyme vs slant vs multisyllabic framing) without a live embeddings pipeline.
 */

export interface GrapThemeRule {
  id: string
  title: string
  detail: string
}

export const GRAP_THEME_RULES: GrapThemeRule[] = [
  {
    id: 'end-rhyme',
    title: 'End rhyme (CMU-aligned)',
    detail:
      'Use primary-stress nucleus through coda (ARPAbet) so line endings snap; this tool buckets words by that rhyme key.',
  },
  {
    id: 'slant',
    title: 'Slant / near family',
    detail:
      'Optional stress-stripped clustering surfaces phonetic cousins when you want elasticity without breaking the pocket.',
  },
  {
    id: 'multi',
    title: 'Multisyllabic echoes',
    detail:
      'Longer rhyme keys carry more phonemes after stress — match longer endings when trading complexity for density.',
  },
  {
    id: 'flow',
    title: 'Stress pocket',
    detail:
      'CMU stresses (1 strongest, 2 secondary) anchor tonic syllables — keep syllable counts honest when punching doubles.',
  },
]
