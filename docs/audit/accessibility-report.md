# Accessibility Report — Samuel X Dashboard

Read-only review against WCAG 2.1 AA. Sampled ~10 representative files. File paths use `path:line` so they are clickable.

Contrast ratios below are computed against the design-system CSS variables defined in `src/index.css:10` (light) and `src/index.css:119` (dark). For `color-mix(... 12–14% ..., var(--bg-card))` tile backgrounds, the blended color is approximated against the linear RGB midpoint — close enough for a Fail/Pass classification.

## Summary

| Severity   | Count |
|------------|-------|
| Fail       | 9     |
| Warn       | 11    |
| Pass       | 7     |

Top three issues:

1. `--text-4` is below 3:1 in light mode against `--bg-card` (~2.85:1) and `--bg-sidebar` (~2.77:1). It's used widely as supporting text — captions, route IDs, monospace meta — across Tools Hub, CDL Hub, Tweaks panel.
2. No `<main>` landmark and no `<h1>` at the App shell level; each zone redeclares its own `<h1>`, but most "page hero" elements are `<div>` or unlabeled.
3. Icon-only buttons (theme toggle in `Sidebar.tsx:308`, mobile close in `Sidebar.tsx:162`, drawer close in `WebDesignerZone.tsx:327`) rely on `title` only — `title` is not exposed as an accessible name to all assistive tech. They need `aria-label`.

---

## 1. Color contrast

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| Fail | `src/index.css:30` (light `--text-4: #9ca3af`) | Ratio against `--bg-card #ffffff` is ~2.85:1; against `--bg-sidebar #f9fafb` ~2.77:1. Used as body-small in `ToolsHubZone.tsx:86,98,122,128,182,200,221,234,242,252`, `CdlHubZone.tsx:170`, `ToolsHubToolCard.tsx:119`, `TweaksPanel.tsx:79,99,113,151,163`, `HarmonyStackZone.tsx:127,166,209,211,348,363,377,402,434,444,477`, `Sidebar.tsx:225,246`. | Either raise `--text-4` to at least `#767e8d` (≈3.5:1) for non-essential UI text, or restrict `--text-4` to ≥18 px / 14 px-bold text only (where 3:1 suffices) and route any body-small to `--text-3 #6b7280` (~4.83:1, AA-compliant). |
| Fail | `src/zones/web-designer/WebDesignerZone.tsx:289` | "Paste a URL and press Go" empty-state paragraph uses `--text-4` for 12 px body, ~2.85:1 light. | Switch to `--text-3` or larger font size. |
| Fail | `src/zones/tools/ToolsHubZone.tsx:233` | Clear-search "X" button uses `color: var(--text-4)` — interactive control, only 2.85:1 light. | Use `--text-3` for the icon color or bump on hover. |
| Fail | `src/components/grap-engine/GrapEngineStudio.tsx:99` | `text-gray-400` (#9ca3af) on `bg-white`: ~2.85:1. CMU index status label is small text. | Switch to `text-gray-500` (#6b7280, ~4.83:1) or to `var(--text-3)`. |
| Fail | `src/components/grap-engine/GrapEngineStudio.tsx:117,129` | Input `placeholder:text-gray-400` (#9ca3af) on white: ~2.85:1. Placeholder must meet AA when it conveys formatting info ("flow, cosmos, violet…"). | Switch to `text-gray-500` or aria-describedby with a hint outside the input. |
| Fail | `src/components/grap-engine/GrapEngineStudio.tsx:149,163` | `text-gray-400` body text (~12 px). | Use `text-gray-500`. |
| Fail | `src/zones/pulse/PulseDigest.tsx:144,171,177` | `placeholder:text-gray-400` and `text-gray-400` on white: ~2.85:1. | Use `text-gray-500`. |
| Warn | `src/zones/cdl/CdlHubZone.tsx:151` | Tile icon is black (`color:'#000'`) on solid `tile.accent`. `#3b82f6` blue → ~3.7:1 (passes 3:1 large-icon but fails 4.5:1 for any text inside); `#a855f7` purple → ~3.5:1; `#ef4444` red → ~3.95:1; `#ff7b29` orange → ~5.6:1; `#00b8d4` → ~5.5:1; `#facc15` ≥ 12; `#f0c040` ≥ 9.5; `#39ff14` ≥ 16. | OK for decorative 24 px icons (passes 3:1). If any text is ever placed there, use white on the darker hexes and black on the brighter ones. Document the rule. |
| Warn | `src/zones/cdl/CdlHubZone.tsx:170` | Tile meta line "66 questions · 80% to pass" uses `--text-4` over `tile.accentSoft` (12–14% color over `--bg-card`). Light approx ~2.7–2.9:1, dark ~3.7–4.0:1. | Switch to `--text-3`. |
| Warn | `src/zones/cdl/CdlHubZone.tsx:167` | Tile description uses `--text-3` over `tile.accentSoft`. Light: ~4.6:1, dark: ~4.7:1 — borderline AA. | Acceptable but tight; verify per-hex blend with a real `color-mix` browser test. |
| Warn | `src/zones/cdl/CdlHubZone.tsx:175` | "Open" pill: `background: var(--text-1)` with `color: var(--bg-canvas)`. Light: 16:1, dark: 14.5:1. | Pass — inverted-pill pattern is intentional and well-contrasted. |
| Pass | `src/index.css:387` | Global `:focus-visible` outline `2px solid var(--accent)` with `outline-offset: 2px`. Visible focus ring across all `<button>`/`<input>` elements that don't override outline. | Keep. |
| Pass | `src/index.css:202–219` | Dark-mode remapping for hardcoded Tailwind `text-gray-*` and `bg-*` classes — most legacy hard-coded utilities still produce passing contrast in dark. | Keep — solid pattern. |
| Pass | Light `--text-1 #111827` on `--bg-card #ffffff`: ~16.1:1. Dark `--text-1 #f3f4f6` on `#14151b`: ~14.5:1. | Strong AAA-level for primary text. | Keep. |
| Pass | Light `--text-3 #6b7280` on `--bg-card #ffffff`: ~4.83:1. Dark `--text-3 #9ca3af` on `#14151b`: ~6.36:1. | Passes AA body. | Keep — promote `--text-3` over `--text-4` for any body-small. |

---

## 2. Keyboard navigation

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| Pass | `src/components/sidebar/NavItemButton.tsx:27` | Real `<button type="button">`, `aria-current="page"` on active item (line 41), focus inherits global `:focus-visible` outline. | Keep. |
| Warn | `src/components/sidebar/NavItemButton.tsx:46` | The button uses `style={{ background: 'transparent' }}` and toggles via mouse events. Focus ring still applies via global rule, but on a transparent button over `--bg-sidebar` the ring may sit just outside a visible boundary. | Verify via tab-through that focus is detectable at line `:60` — consider adding `:focus-visible` background variant. |
| Warn | `src/components/sidebar/Sidebar.tsx:308–322` | Theme-toggle is `<button>` with only `title=`; relies on inner icon for meaning. Screen readers may announce only "button". | Add `aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}`. |
| Warn | `src/components/sidebar/Sidebar.tsx:162` | Mobile close button has no `aria-label` and no visible text (only `<X>`). | Add `aria-label="Close navigation"`. |
| Pass | `src/components/TweaksPanel.tsx:178` | FAB trigger is a `<button>` with visible "Tweaks" text label, full keyboard reachable. | Keep. |
| Warn | `src/components/TweaksPanel.tsx:62` | The panel opens but is not announced — no `role="dialog"`, no `aria-expanded` on the FAB, no focus trap. Pressing Esc does nothing. | Add `aria-expanded={open}` to the trigger, optional `aria-controls`, and either an Esc handler or `role="dialog"` + focus management. Document-mousedown handler closes on outside click which is good. |
| Warn | `src/components/TweaksPanel.tsx:83` | Close button (X) inside panel has no `aria-label`. | Add `aria-label="Close tweaks panel"`. |
| Warn | `src/components/TweaksPanel.tsx:120` | Accent color swatches: each is a `<button>` with `title=` only and no `aria-label`/`aria-pressed`. Visual selection is `outline + scale`. | Add `aria-label={label}` and `aria-pressed={accent === id}`. |
| Warn | `src/zones/tools/ToolsHubZone.tsx:222` | Search input is unlabeled (no `<label htmlFor>`, no `aria-label`). | Add `aria-label="Search tools"`. |
| Pass | `src/zones/tools/ToolsHubZone.tsx:236` | Clear button has `aria-label="Clear search"`. | Keep. |
| Warn | `src/zones/harmony/HarmonyStackZone.tsx:351,366,380` | Inputs use `<label className="block …">` but **no `htmlFor`** and inputs have no `id`. Visually labeled, programmatically orphaned. | Either wrap inputs inside their `<label>` or pair `<label htmlFor>`/`<input id>`. |
| Pass | `src/zones/pulse/PulseDigest.tsx:126` | `<label htmlFor="pulse-digest-feed">` correctly paired with `<input id="pulse-digest-feed">` at line 136. | Keep — model this pattern elsewhere. |
| Warn | `src/components/grap-engine/GrapEngineStudio.tsx:108` | `<label htmlFor={inputId}>` paired with `<input id={inputId}>` — good. But the "Include slant" toggle at line 124 wraps the checkbox in a `<label>` (implicit) — fine, although `aria-describedby` for the helper text would help. | Optional: add helper text via aria-describedby. |

---

## 3. Semantic HTML

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| Fail | `src/components/MainContent.tsx:182` | The route shell `<div className="relative flex …">` is not a `<main>` element and has no landmark role. Every zone renders inside this, but assistive tech has no "Skip to main content" target. | Change to `<main id="main-content">`. Add a "Skip to main" link in `App.tsx`. |
| Fail | `src/components/sidebar/Sidebar.tsx:146` | Sidebar uses `<aside>` (good) but the nav region is at line 173 — `<nav aria-label="Primary navigation">` is present (pass). Top-level `<aside>` should also have `aria-label="Sidebar"`. | Add `aria-label="Sidebar"` to the `<aside>`. |
| Pass | `src/components/sidebar/Sidebar.tsx:173` | `<nav aria-label="Primary navigation">`. | Keep — model navigation pattern. |
| Warn | `src/zones/production/ProductionZone.tsx:48` | `<h1>` element is used (good). The Card title at line 16 uses `<p>` not `<h3>` — but cards are repeated, so `<p>` is acceptable if there's no heading hierarchy need. | Optional: card titles can be `<h3>` to expose them in headings outline. |
| Warn | `src/zones/cdl/CdlHubZone.tsx:122` | `<h1>` correctly used for "CDL PRAC". Tile labels at line 164 are `<div>` — these act as section headings inside an interactive `<button>` tile. | Replace tile-label `<div>` with `<span className="block ...">` or leave as-is (tile is a button so the accessible name comes from inner text already). |
| Warn | `src/zones/tools/ToolsHubZone.tsx:185` | `<h1>` correct. Section card uses `<h2 className="mono ...">` (line 119) — passes. | Keep. |
| Warn | `src/zones/harmony/HarmonyStackZone.tsx:130,308` | Tab content uses `<h2>` correctly. But page-level `<h1>` is missing — the topbar at line 500 uses `<span>` "Harmony Stack". Visitors using screen readers won't see a page-level heading. | Add an `<h1>` (visually hidden if necessary) like `<h1 className="sr-only">Harmony Stack</h1>`. |
| Warn | `src/zones/web-designer/WebDesignerZone.tsx:129` | `<h1>Web designer</h1>` good. Inspector drawer at line 302 has `role="dialog"`/`aria-modal` — pass. | Keep. |
| Warn | `src/zones/pulse/PulseDigest.tsx:82` | `<h1>AI digest</h1>` good. | Keep. |
| Warn | `src/components/grap-engine/GrapEngineStudio.tsx:89` | `<h1>G Rap Engine</h1>` good; `<h2>Suggestions</h2>` at 158; `<h3>Theme cues (static RAG)</h3>` at 197. | Keep — heading hierarchy is sound. |

---

## 4. Icon accessibility

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| Pass | Many sites — most decorative Lucide icons use `aria-hidden` (e.g., `ToolsHubZone.tsx:182,221,252,98`, `CdlHubZone.tsx:119,154,178`, `WebDesignerZone.tsx:148,198,260`). | Pattern is consistent. | Keep. |
| Warn | `src/components/sidebar/NavItemButton.tsx:68` | Icon is decorative inside a labelled button. No `aria-hidden` attribute. Most assistive tech will ignore SVG without `<title>`, but explicit `aria-hidden` is safer. | Add `aria-hidden` to the `<Icon>` element. Same fix at `Sidebar.tsx:274` for custom-zone icons. |
| Warn | `src/components/TweaksPanel.tsx:89,201` | `<X>` and `<SlidersHorizontal>` icons inside buttons have no `aria-hidden`. The wrapping button has either `title` or visible "Tweaks" text — the icon is decorative. | Add `aria-hidden` to the icon. |
| Fail | `src/components/sidebar/Sidebar.tsx:168` | `<X size={13} />` is the only child of an icon-only button. No `aria-label` on the button, no text, icon has no accessible name. | Add `aria-label="Close navigation"` on the `<button>`. |
| Fail | `src/components/sidebar/Sidebar.tsx:321` | Theme-toggle's `<Sun>`/`<Moon>` icon is the only child. Button has `title=` only. | Add `aria-label` (see Section 2). |
| Fail | `src/zones/web-designer/WebDesignerZone.tsx:327,266` | `<PanelRightClose>` and `<X>` are icon-only buttons. Some have `aria-label="Close drawer"` (pass at 333) / `aria-label="Dismiss hint"` (pass at 267). Verify all icon-only buttons in this file have `aria-label`. | Spot-fix any remaining icon-only buttons; add `aria-hidden` to inner icons. |
| Pass | `src/components/grap-engine/GrapEngineStudio.tsx:88,99,139` | Sparkles/Loader2/Wand2 are decorative — `aria-hidden` on the standalone Sparkles (line 88) is present; the inline icons inside `<button>` "Find rhymes" are decorative because the button has the text "Find rhymes". | Keep. |

---

## 5. Forms

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| Fail | `src/zones/harmony/HarmonyStackZone.tsx:348–387` | Three `<label>` elements with no `htmlFor`; three `<input>` elements with no `id`. The label–input association is purely visual. | Either nest the `<input>` inside the `<label>`, or generate IDs with `useId()` and use `htmlFor` + `id`. |
| Pass | `src/zones/pulse/PulseDigest.tsx:126` | `<label htmlFor="pulse-digest-feed">` paired with `<input id="pulse-digest-feed">`. Error block has hint text directly above input. | Keep. |
| Warn | `src/zones/pulse/PulseDigest.tsx:144` | Input has no `aria-describedby` connecting it to the surrounding error message (`text-amber-900` block above it). Sighted users see the error, screen readers won't tie it to the field. | Add `aria-describedby="pulse-digest-feed-hint"` on the input, give the help paragraph that ID. |
| Pass | `src/components/grap-engine/GrapEngineStudio.tsx:108` | `useId()` generates ID, `htmlFor`/`id` paired. | Keep — model pattern. |
| Warn | `src/zones/tools/ToolsHubZone.tsx:222` | Search input has placeholder only; no label, no `aria-label`. | Add `aria-label="Search tools"`. |
| Warn | `src/zones/web-designer/WebDesignerZone.tsx:200` | URL input has `aria-label="Page URL"` (pass) but no `aria-describedby` for the iframe-hint warning at line 256 which is contextually relevant. | Optional: tie iframeHint to input via `aria-describedby`. |
| Warn | Tweaks panel (`TweaksPanel.tsx:120`) | Accent color buttons act as a single-select group. No `role="radiogroup"`, no `aria-pressed`. | Add `role="radiogroup"` to the wrapper at line 118 and `aria-pressed={accent === id}` on each button. |

---

## Recommended fixes — priority order

1. **Raise `--text-4` light to ≥ `#767e8d`** (or relegate it to use only over ≥18 px / bold text). Single change fixes ~8 Fails listed in §1.
2. **Add `aria-label` to icon-only buttons** in `Sidebar.tsx:162,308` and confirm all icon buttons elsewhere have a non-visual accessible name. ~5-line patch.
3. **Wrap `MainContent.tsx:182` in `<main>`** and add a skip link in `App.tsx`.
4. **Fix Harmony task-add form labels** (`HarmonyStackZone.tsx:346–396`) with `htmlFor`/`id` pairs.
5. **Replace `text-gray-400` (#9ca3af) with `text-gray-500` (#6b7280)** in `GrapEngineStudio.tsx` and `PulseDigest.tsx`. Pure find/replace.
6. **TweaksPanel**: add `aria-pressed` to accent swatches, `aria-expanded` to FAB, Esc-to-close handler.

After these, the dashboard would be substantially close to WCAG 2.1 AA across the audited surfaces.
