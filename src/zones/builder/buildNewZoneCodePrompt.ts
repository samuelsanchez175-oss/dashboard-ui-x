/** Builds a single copy-paste prompt for Cursor/Claude to implement a new dashboard zone (tool and/or section). */
export function buildNewZoneCodePrompt(input: {
  title: string
  iconName: string
  description: string
  content: string
}) {
  const titleTrim = input.title.trim()
  const slug = titleTrim.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'new-zone'
  const pascal = titleTrim.replace(/(?:^|\s)\S/g, c => c.toUpperCase()).replace(/\s+/g, '') || 'NewZone'

  const descriptionBlock = input.description.trim() || '(none — infer a short subtitle from the title and content.)'
  const contentBlock = input.content.trim() || '(none — infer minimal viable UI from the title and description.)'

  return `## Context
You are working in the **UI Dashboard X** repo: React 19 + TypeScript + Tailwind CSS v4 + Vite 8. The app uses dashboard **zones** (full-page tools/sections) registered in the sidebar and rendered from a switch in the main shell.

## Zone specification (from the in-app "New Zone" form)
- **Title:** ${titleTrim}
- **Sidebar icon (Lucide name):** ${input.iconName}
- **Description (one-liner):** ${descriptionBlock}
- **Content / notes (author intent — treat as primary product spec):**
${contentBlock.split('\n').map(line => `  ${line}`).join('\n')}

## Implementation goal
Implement this zone as a **production-ready React component** (and wire it into navigation) so it matches existing dashboard zones in structure, tokens, and quality. Decide whether it behaves as a **tool**, a **section-style** overview, or both, based on the notes above.

## Technical requirements
- TypeScript with explicit types; avoid \`any\`.
- Tailwind v4 utility classes; fonts in use: **Sora** + **DM Mono** where monospace helps.
- Use global CSS variables for surfaces and text: \`var(--bg-canvas)\`, \`var(--bg-card)\`, \`var(--bg-muted)\`, \`var(--bg-input)\`, \`var(--border)\`, \`var(--text-1)\` … \`var(--text-4)\`, \`var(--accent)\`, \`var(--accent-soft)\`, \`var(--accent-fg)\`, etc.
- Outer layout: wrap the page body in \`<div className="zone-canvas">\` and inner content in \`<div className="zone-inner">\` (max-width ~1100px, consistent padding) unless an existing zone pattern clearly differs.
- Responsive layout and readable hierarchy (headings, spacing, focus states on interactive controls).
- Do not hardcode API keys or secrets; use existing env patterns if the zone needs server-backed data.

## Data model (custom zones)
If this zone is meant to appear as a **user-created custom zone** in the app shell, persisted fields align with \`CustomZone\` in \`src/context/CustomZonesContext.tsx\`:
\`{ id, title, description, iconName, content, createdAt }\` — keep \`iconName\` as one of the Lucide icon keys already used in the sidebar mapping.

## UI / UX expectations
- Cohesive with the rest of the dashboard: calm density, clear section labels, subtle borders—not generic "AI slop" UI.
- Empty, loading, and error states if the zone fetches data.
- Keyboard-focusable controls; semantic headings where appropriate.

## Acceptance criteria
- [ ] New component file exists at a sensible path (e.g. \`src/zones/${slug}/${pascal}Zone.tsx\`).
- [ ] Zone is reachable from the sidebar (update \`src/components/sidebar/navigation.ts\` as appropriate).
- [ ] Zone renders from \`src/components/MainContent.tsx\` (add route id / switch case: \`${slug}\` or the project's established pattern).
- [ ] No new lint/type errors; build passes.

## Reference implementations (patterns to mirror)
- \`src/zones/production/ProductionOverviewSnapshot.tsx\` — production snapshot cards (embedded in Agent Farm Overview)
- \`src/zones/harmony/HarmonyStackZone.tsx\` — tabs + lists
- \`src/zones/cpw/CpwZone.tsx\` — denser interactive board

## Suggested file touch list
1. \`src/zones/${slug}/${pascal}Zone.tsx\` (new)
2. \`src/components/sidebar/navigation.ts\`
3. \`src/components/MainContent.tsx\`
`
}
