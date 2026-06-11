# Design fidelity (zones)

Short PR checklist by **zone family** taxonomy. Pair with visual baselines (`tests/visual/`) when the route is covered.

## Global checklist (every zone PR)

- Labels and titles come from the registry / nav model — no stray hard-coded nav strings that drift from `navigation.ts` / `TOOLS_REGISTRY`.
- Active sidebar control exposes `aria-current="page"` on the selected route.
- `document.title` matches the active sidebar label (or an intentional, documented exception).
- Route remains lazy-loadable (no accidental eager heavy imports in the shell).
- If the route has a Playwright baseline, update or re-approve screenshots when layout or theme tokens change.

---

## Family A — Token canvas + simple content width

**Zones:** Production overview, Mixing board, Pulse, Diagnostics (and similar “single canvas + max-width column” shells).

**Before merge, verify:**

- Page shell background uses `var(--bg-canvas)` (or documented token alias), not raw grays.
- Content width and padding use design tokens (`--pad-card`, max-width utilities consistent with siblings).
- Icons use **lucide-react** at the family stroke/size; no one-off raster icons for chrome.
- No `text-gray-*` / `bg-gray-*` Tailwind literals — semantic `var(--text-*)` / `var(--bg-*)` instead.
- Light and dark themes: contrast on body copy and borders is acceptable without squinting.

---

## Family B — `zone-canvas` / `zone-topbar` / `zone-inner` shell

**Zones:** Harmony Stack, CPW, Builder / designer-adjacent flows.

**Before merge, verify:**

- Three-part shell: `zone-canvas`, `zone-topbar`, `zone-inner` present and scroll regions correct (`min-h-0` where flex children scroll).
- Topbar title and status chips use tokens (`--text-1`, `--accent`, `--good`, …), not hard-coded hex except documented one-offs.
- Inner padding aligns with Harmony/CPW siblings (`px-8`, token gaps — pick one system per sub-nav and stay consistent).
- Lucide icons, stroke 2 default for chrome; tablist / roving tabindex matches prior Harmony behavior.
- Dark theme: topbar border and tab affordances remain visible.

---

## Family C — Studio tools chrome

**Zones:** Tools hub, `Tools*` pages (YouTube, key finder, chord detector, …).

**Before merge, verify:**

- Shared header (`StudioToolsHeader` pattern): back/hub link, title, optional badge row — same spacing as sibling tools.
- Tool surface uses `--bg-canvas` or tool-local token documented in the tool card; cards use `--bg-card` / `--border-soft`.
- No `text-gray-*` literals; monospace labels use `var(--text-2)` / `var(--text-3)`.
- Lucide for all tool icons; category tint matches `TOOLS_REGISTRY` expectations.
- Mobile width: controls remain tappable (min 44px targets) at 820px tablet baseline if the tool is in visual tests.

---

## Family D — Creative cards (Piano, Rhyme — tokenized)

**Before merge, verify:**

- Card chrome reads as “creative studio” but still uses shared tokens (`--bg-card`, `--accent`, `--text-*`).
- Transport / metadata rows align with Vocals sibling spacing.
- Lucide for non-keyboard UI; keyboard hints use `font-mono` + token colors, not gray utilities.
- Dark theme: piano keys and rhyme panels do not clip or blow out highlights.

---

## Family E — Agent Farm cockpit

**Before merge, verify:**

- Cockpit shell honors `--bg-cockpit` (and related cockpit tokens) without mixing in unrelated canvas tokens.
- Density matches “dense dashboard” — no accidental comfy-only spacing in tables.
- Status pills and run rows use semantic colors (`--good`, `--warn`, `--danger` soft variants).
- Icons lucide; no emoji-as-icon regressions in headers.
