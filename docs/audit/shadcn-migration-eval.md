# shadcn/ui Migration Evaluation — Samuel X Dashboard

Read-only evaluation of whether to migrate the dashboard's UI primitives to shadcn/ui.

## 1. What shadcn/ui is

shadcn/ui is a CLI-driven library that scaffolds accessible React components directly into your repo (you own the source) by composing **Radix UI** primitives with **Tailwind CSS** and a small `cn()` class-merge utility. It's not a runtime dependency — it's a curated set of recipes for components like Dialog, Tabs, Dropdown, Toast, Combobox, etc.

## 2. Compatibility check

| Assumption | Status in this repo | Source |
|---|---|---|
| Tailwind v3+ | **Tailwind v4** (`^4.2.4`) installed via `@tailwindcss/vite` | `package.json:24,28` |
| CSS variables for theming | **Already done** — `--bg-card`, `--text-1..4`, `--accent`, `--good`, `--warn`, `--bad`, etc., switched via `[data-theme="dark"]` attribute | `src/index.css:10–148`, `src/context/ThemeContext.tsx:31–49` |
| Radix UI primitives | **Not installed**; no `@radix-ui/*` packages in `package.json` | `package.json` |
| `cn()` utility (`clsx` + `tailwind-merge`) | **Not installed**; no `lib/utils.ts` exists | `src/lib/` (no `utils.ts`) |
| React 19 | **React 19.2.5** — compatible with current shadcn templates | `package.json:12` |
| Bundler | **Vite 8** — compatible | `package.json:32` |

Caveat: shadcn's official templates assume **Tailwind v3**. Migrating this repo, which runs Tailwind v4, would require using shadcn's still-maturing Tailwind v4 install path (`npx shadcn@canary init` at the time of writing) or pinning Tailwind to v3. The v4 path works but is less battle-tested.

## 3. What would need to change in this codebase

1. **Install deps**: `@radix-ui/react-{dialog,tabs,dropdown-menu,popover,tooltip,toast,select,switch,checkbox}` (~10 packages, one per primitive used), plus `clsx`, `tailwind-merge`, `class-variance-authority`, `tailwindcss-animate`.
2. **Add `src/lib/utils.ts`** exporting `cn()`. shadcn templates require this exact import path: `import { cn } from '@/lib/utils'`.
3. **Adopt the `@/` path alias** in `tsconfig.app.json` and `vite.config.ts`. The repo currently uses relative imports (`../../context/...`).
4. **Map CSS variables**. shadcn templates expect `--background`, `--foreground`, `--card`, `--card-foreground`, `--primary`, `--primary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive`, `--border`, `--input`, `--ring`. Current repo uses `--bg-card`, `--text-1`, `--accent` — a different naming convention. Two options: either rename existing tokens (large diff across every zone) or modify the shadcn-generated component sources to read from existing tokens.
5. **Replace inline `style={{}}` with Tailwind classes**. Roughly half the codebase uses inline styles for theming (`style={{ background: 'var(--bg-card)' }}` is the pattern; see `src/zones/tools/ToolsHubZone.tsx:63–73,128,215–219`, `src/zones/cdl/CdlHubZone.tsx:115,140–146,158`, `src/zones/production/ProductionZone.tsx:9–13,42,96–99`, `src/components/sidebar/Sidebar.tsx:149–152,164–168,193–196,288–315`, `src/components/TweaksPanel.tsx:66–70,75–79,127–131,182–187`, `src/zones/harmony/HarmonyStackZone.tsx` is mostly inline). shadcn philosophy is class-based; mixing would defeat the point.
6. **Decide the fate of `GlowCard`, `Card`, `PageShell`, `SectionHeader`**. The newly-built primitives (`src/components/ui/Card.tsx`, `PageShell.tsx`, `SectionHeader.tsx`, plus existing `GlowCard.tsx`) cover what `Card` does in shadcn and overlap with shadcn's layout primitives. Keeping both creates two competing conventions.

## 4. What we gain

- **Pre-built accessible primitives** with battle-tested keyboard handling, focus traps, ARIA states, and roving tab index — Dialog, Tabs, DropdownMenu, Combobox, Tooltip, Toast, Sheet, Popover, ContextMenu. Several gaps in this dashboard's a11y (see `docs/audit/accessibility-report.md` §2 — TweaksPanel lacks `role="dialog"`, no Esc handler, no focus trap; HarmonyStack tab bar uses bare buttons with no `role="tab"`/`aria-selected`) would be fixed for free by adopting `Dialog` and `Tabs`.
- **Documented patterns** — the team gets a shared vocabulary (Card, Dialog, Sheet) instead of every zone re-inventing a styled `<div>`.
- **Lower long-term maintenance** for the most-touched primitives. Radix has 2.5+ years of production hardening for focus management and screen-reader edge cases that an in-house re-implementation will probably miss.
- **Easier hiring/onboarding** — shadcn is a common pattern in 2026 React shops.

## 5. What we lose / risks

- **1–2 day refactor**, minimum. Inline-style → class-based migration touches every zone; the team's "muscle memory" pattern is currently `style={{}}`.
- **New conventions for the team to learn** — `cn()`, `class-variance-authority`, `data-state` attributes, Radix's slot pattern (`asChild`), the `@/` import alias.
- **Token rename or template fork**. Either way is intrusive: rename `--bg-card` → `--card`, `--text-1` → `--foreground`, etc., everywhere; *or* maintain a local fork of every shadcn component, losing the "drop in next version" benefit.
- **Conflict with the newly-built `Card`/`PageShell`/`SectionHeader`** in `src/components/ui/`. If shadcn arrives, those become redundant — about 160 LOC to delete or rewrite.
- **Tailwind v4 + shadcn is still maturing**. The official v4 install path exists, but the wider shadcn ecosystem assumes v3. Some community recipes won't apply cleanly.
- **`GlowCard.tsx`** is highly custom (CSS keyframes for a glow effect; see `src/components/ui/GlowCard.css`). shadcn doesn't have an equivalent — would have to keep alongside, which weakens the "one source of truth" argument.

## 6. Recommendation

**Defer the full shadcn/ui migration for now.** Specifically:

- Wait at least six months of usage of the newly-built `Card`/`PageShell`/`SectionHeader` primitives before deciding the in-house set isn't sufficient. The current primitives are small (~160 LOC total), match the dashboard's inline-style convention, and read directly from existing CSS variables — there's no immediate pain to resolve.
- In the meantime, **do not pull in shadcn for one-off components**. Adding even one Radix-backed shadcn component (e.g., a Dialog) commits the codebase to the `@/` alias, `cn()`, Radix peer deps, and the Tailwind-class style. Once those land, every new component has to pick a side, and the codebase splits.
- **If/when migrating later**, start with the three primitives that benefit most from shadcn's accessibility work and least overlap with the in-house set: **`Dialog`, `Tabs`, `DropdownMenu`**. Keep `Card`, `PageShell`, `SectionHeader` in-house — they're styling shells, not interaction primitives, and re-implementing them with Radix adds no a11y value.
- **Re-evaluate triggers**: re-open this decision when (a) the team adds a second person actively building new zones, (b) accessibility audit finds keyboard/ARIA bugs in TweaksPanel or HarmonyStack tab bar that are unfixable without a primitive library, or (c) any component needs a Combobox / Command Palette / complex Popover — those are genuinely hard to build by hand and shadcn ships them complete.

## 7. Concrete migration path (if pursued later)

When this becomes a yes, here is the cleanest order:

### Step 1 — Add dependencies

```bash
npm install clsx tailwind-merge class-variance-authority tailwindcss-animate
npm install @radix-ui/react-dialog @radix-ui/react-tabs @radix-ui/react-dropdown-menu
# Add more Radix packages as you adopt each primitive.
```

### Step 2 — Add `src/lib/utils.ts`

```ts
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

### Step 3 — Set up the `@/` alias

- `tsconfig.app.json`: add `"baseUrl": "."`, `"paths": { "@/*": ["src/*"] }`
- `vite.config.ts`: add `resolve.alias = { '@': path.resolve(__dirname, 'src') }`

### Step 4 — Map CSS variables

In `src/index.css`, add an alias layer so shadcn-generated templates read the dashboard's existing tokens **without renaming them across the codebase**:

```css
:root {
  --background: var(--bg-canvas);
  --foreground: var(--text-1);
  --card: var(--bg-card);
  --card-foreground: var(--text-1);
  --primary: var(--accent);
  --primary-foreground: #ffffff;
  --muted: var(--bg-muted);
  --muted-foreground: var(--text-3);
  --border: var(--border);
  --input: var(--bg-input);
  --ring: var(--accent);
  --destructive: var(--bad);
  --destructive-foreground: #ffffff;
}
[data-theme="dark"] {
  --primary-foreground: #ffffff;
  /* most aliases re-resolve automatically because var(--bg-card) etc. are already overridden */
}
```

This is the **non-destructive** path. The alternative — renaming `--bg-card` → `--card` across every zone — is a much larger diff (every `style={{ background: 'var(--bg-card)' }}` would need to change).

### Step 5 — Migrate one primitive at a time, behind a feature branch

Order of operations:

1. **Dialog** — replace ad-hoc modal patterns. Specifically, `TweaksPanel.tsx` (currently a floating panel with manual outside-click handler, no Esc key, no focus trap) and the `WebDesignerZone.tsx:300–384` inspector drawer.
2. **Tabs** — replace `HarmonyStackZone.tsx:508–523` tab bar (currently bare buttons, no `role="tab"`/`aria-selected`).
3. **DropdownMenu** — for the sidebar layout-edit dropdown / overflow menus when added.

### Step 6 — Visual diff testing

Before promoting any migrated component to `main`, run a side-by-side screenshot diff (Chromatic, Percy, or manual Storybook) across:
- light + dark themes
- all four accents (purple, red, blue, green)
- both densities (comfy, compact)

These are the four axes the dashboard already supports, and an unforced rendering bug at one of them is the most likely regression.

### Step 7 — Sunset overlaps

Once `Card`/`PageShell`/`SectionHeader` have been observed unused for 60+ days (after, say, a Dialog and Tabs migration), revisit whether to delete or merge them. They may still earn their keep as in-house layout primitives even after shadcn arrives — that's the right time to decide.

---

## Bottom line

**Hold.** The current in-house primitives are sufficient for what the dashboard does today. The places where shadcn would actually improve things (TweaksPanel a11y, HarmonyStack tabs, future Combobox) are real but not yet urgent. Revisit in ~6 months or when a primitive with non-trivial keyboard semantics (Combobox, Command Palette) is needed.
