# UI Design Audit — Dashboard X

Audit date: 2026-05-12 · Scope: every page under `src/zones/**` and `src/components/{agent-farm,rhyme-studio,piano}`.

No code changes have been made. This document is for review before any refactor.

---

## 1 · Shared design system foundation (what already lines up)

These pieces ARE consistent across the app and should be kept as the design system bedrock.

| Token / Pattern | Source | Used by |
|---|---|---|
| Sora (body) + DM Mono (mono) | `src/index.css` `@theme` | All zones (inherits via `<body>`) |
| `--bg-canvas`, `--bg-card`, `--text-1..4`, `--border`, `--accent`, `--good/warn/bad` | `src/index.css` `:root` + `[data-theme=dark]` overrides | ProductionZone, ToolsHub, Harmony, CPW, builder zones, Tesla |
| Auto-remap of `bg-white / bg-gray-* / text-gray-*` for dark mode | `src/index.css` `[data-theme="dark"]` rules | All zones that still use raw Tailwind grays |
| `lucide-react` for all icons | All zones | Universal — good. |
| 3-pill top-right status (API · Mock · Real) | `RouteStatusBar.tsx` + `route-data-status.ts` | All routes via `MainContent` |
| Save-key panel anchored under the status bar | `AddKeyPanel.tsx` | Same |
| `MockDataContext` global toggle | `MockDataContext.tsx` | All zones that reference mock data |
| Shared IDB clip library | `mixing-audio-idb.ts` | YouTube downloader, Audio grab, Chord Detector, Social Capture |

---

## 2 · Where pages diverge (the audit findings)

### 2.1 Page container width — six different choices

| Width | Pages |
|---|---|
| `max-w-[1280px] px-8 pt-8` | ToolsHubZone |
| `max-w-5xl mx-auto p-8 space-y-8` | ProductionZone, TeslaMock |
| `max-w-4xl` | DevSettings |
| `max-w-3xl` | ToolsChordDetectorPage, ToolsSocialCapturePage, ToolsKeyFinderPage, MixingAudioGrabber, MixingBoardPanel |
| `zone-canvas` + `zone-inner` (~1100 px via CSS class) | HarmonyStackZone, CpwZone, NewZonePage, CustomZonePage |
| Custom (`max-w-xl` hero only) | ToolsHubZone hero block |

**Impact:** Visual rhythm breaks between sections. Switching from "All tools" (1280 px) to "Chord Detector" (768 px / `max-w-3xl`) jolts the eye.

### 2.2 H1 size + weight — six different scales

| H1 class | Pages |
|---|---|
| `text-[32px] font-semibold` (hero) | ToolsHubZone |
| `text-2xl font-semibold tracking-tight` | ToolsChordDetectorPage, ToolsSocialCapturePage, ToolsKeyFinderPage |
| `text-[22px] font-semibold tracking-tight` | HarmonyStackZone "Service Packages" h2 |
| `text-xl font-semibold tracking-tight` | ProductionZone, TeslaMock, MixingAudioGrabPage, ToolsYoutubePage |
| `text-lg` | AgentFarm "Farm status" |
| `clamp(38px, 9vw, 64px)` w/ animated gradient | `public/harmony-stack-portfolio` (external HTML) |

**Impact:** No clear typographic hierarchy across the app. The reader can't intuit "this is a hub vs this is a leaf tool" from the title alone.

### 2.3 Page header pattern — two paradigms

| Pattern | Used by |
|---|---|
| `StudioToolsHeader` (breadcrumb crumb bar + leftExtra back button) | ToolsHubZone, ToolsYoutubePage, ToolsKeyFinderPage, ToolsChordDetectorPage, ToolsTempoTapPage, ToolsSocialCapturePage |
| Plain `<header>` block inline with h1 | ProductionZone, TeslaMock, DevSettings, DiagnosticsZone, PulseDigest, MixingZone, MixingAudioGrabPage, AgentFarm, RhymeStudio |
| `zone-topbar` (custom) | HarmonyStackZone, CpwZone, builder zones |

**Impact:** Three different ways to answer "where am I?". The Tools section feels productized; everything else feels ad-hoc.

### 2.4 Mock-data toggle — duplicated in body

After the RouteStatusBar shipped, the in-body MockDataToggle should have been removed everywhere. Currently still present in:

- `TeslaMock.tsx` (line ~50)
- `RhymeStudio.tsx` references `mockDataEnabled` for disabling buttons (OK) but visually duplicates the toggle's affordance

ProductionZone + AgentFarm were already cleaned up in earlier turns.

### 2.5 Icon mismatch — sidebar ≠ Tools Hub tile

| Tool | Sidebar icon (`navigation.ts`) | ToolsHub tile (`toolsHubData.ts`) | Match? |
|---|---|---|---|
| YouTube Downloader | `MonitorPlay` | `MonitorPlay` | ✅ |
| Social Media Capture | `Share2` | `Share2` | ✅ |
| Key & BPM finder | `Radio` | `Radio` | ✅ |
| **Chord Detector** | **`AudioWaveform`** | **`Music`** | ❌ |
| Tempo Tap | `Activity` | `Activity` | ✅ |

Also: `AudioWaveform` is reused for **two unrelated tools** — Chord Detector (sidebar) and Silence Trim (hub tile). That's an identity collision.

### 2.6 Background canvas — token vs hardcoded slate

| Background | Pages |
|---|---|
| `style={{ background: 'var(--bg-canvas)' }}` (theme-aware) | ProductionZone, TeslaMock, ToolsHubZone, MixingZone, VocalsZone, PulseDigest, builder zones |
| `bg-slate-50` (hardcoded — only works in light) | **ToolsChordDetectorPage, ToolsSocialCapturePage, ToolsKeyFinderPage** |
| `bg-white` (hardcoded) | MixingAudioGrabPage |
| `zone-canvas` CSS class | Harmony, CPW |

**Impact:** In dark mode the Tools leaf pages show a slate background because `bg-slate-50` IS remapped (see index.css line ~169), but they fall back to soft variants instead of true canvas. Minor visual mismatch with the rest of the app.

### 2.7 Card style — three "card" idioms in play

| Card flavor | Pages |
|---|---|
| `rounded-2xl border-slate-200 bg-white p-6 shadow-sm` (light-only) | Chord Detector, Social Capture, Key Finder |
| `rounded-xl` w/ `style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}` (theme-aware) | ProductionZone, AgentFarm, ToolsHubZone, builder zones |
| `.zone-card` CSS class | HarmonyStackZone, CpwZone |
| `rounded-xl border border-gray-200 bg-gray-50/80 p-5` | TeslaMock stat cards |

### 2.8 CTA / button style — five variants

| Variant | Where |
|---|---|
| `bg-slate-900 text-white` | Chord Detector, Social Capture, MixingAudioGrabber primary |
| `bg-violet-50 text-violet-900` | DevSettings "Add variable" |
| `bg-amber-900 text-white` | AddKeyPanel save button |
| `bg-purple-600 hover:bg-purple-700` | Piano Transport |
| Inline `var(--accent)` background | HarmonyStackZone "Book this package", ProductionZone callouts |

---

## 3 · Skills / past projects that can pull this together

The user mentioned **CPW** (and Harmony Stack portfolio is already in the repo at `public/harmony-stack-portfolio/`). Both are reference points for what "shipped product" feels like.

| Skill / Project | What to borrow |
|---|---|
| **`design:design-system`** (skill) | Run an audit pass and codify chosen tokens — single H1 scale, single container width, canonical card. Would output a `design-tokens.md` and let me unify the page primitives. |
| **`design:design-handoff`** (skill) | After the tokens are agreed, generate a per-page spec (layout, typography, states) so we don't drift again. |
| **`design:design-critique`** (skill) | One-time pass on Tools pages vs Harmony/CPW for visual hierarchy + density feedback. |
| **`design:accessibility-review`** (skill) | We have inconsistent `aria-label`s on the new AddKeyPanel + RouteStatusBar; this would catch them and the color-contrast issues in dark mode. |
| **`frontend-design`** (skill) | Use when actually re-building any zone — it knows how to avoid generic AI aesthetics, which the slate cards currently lean toward. |
| **CPW (your project)** — `src/zones/cpw/CpwZone.tsx` + `zone-canvas`/`zone-topbar`/`zone-card` CSS | Adopt these three classes as the **canonical layout primitive** for non-Tools zones. They already encode max-width, padding, and theme-aware backgrounds. |
| **Harmony Stack portfolio HTML** at `public/harmony-stack-portfolio/harmony-stack-services.html` | Color-mood reference (burnt-orange hero band, iridescent brand text) — too loud for the dashboard chrome but a great hero treatment for `ProductionZone` or the All-tools landing. |
| **`vercel:shadcn`** (skill) | If you ever want to formalize the card / button into shadcn primitives — would give you variant-based buttons (replaces the five CTA variants today). |
| **Sora + DM Mono** (already configured) | Lock these as the only two faces — currently respected, just under-leveraged (e.g. DM Mono only shows up in `mono` class spots, not in code-style inline pills). |

---

## 4 · Impact-ranked table (most → least)

| # | Issue | Why it hurts | Fix scope | Skill to lean on | Impact |
|---|---|---|---|---|---|
| 1 | Six different page container widths | Reader loses spatial expectation between sections | Pick one (recommend `max-w-5xl` for content, `max-w-[1280px]` for grid hubs) and migrate | `design:design-system` | 🔴 High |
| 2 | Six different H1 sizes | No clear type hierarchy hub→leaf | Define 3 scales (Hero `text-[28px]`, Page `text-xl`, Section `text-[15px] uppercase mono`) | `design:design-system` | 🔴 High |
| 3 | Tools pages hardcode `bg-slate-50` + white cards | Breaks dark-mode parity & matches Tools "stronger than the rest" | Swap to `var(--bg-canvas)` + `var(--bg-card)` like ProductionZone | `frontend-design` | 🔴 High |
| 4 | Two page-header paradigms (`StudioToolsHeader` vs ad-hoc) | "Where am I?" answered three different ways | Promote `StudioToolsHeader` to all routes (or replace with a single `ZoneHeader` primitive) | `design:design-system` | 🟠 Med-High |
| 5 | Chord Detector sidebar/tile icon mismatch (`AudioWaveform` vs `Music`) + `AudioWaveform` reused for Silence Trim | Sidebar ≠ Tools Hub creates "did I click the right thing?" friction | Pick one icon per tool — sidebar wins; update `toolsHubData.ts` | quick fix | 🟠 Med |
| 6 | `MockDataToggle` still rendered inside `TeslaMock.tsx` body | Duplicate of the new top-right pill | Remove the body toggle | quick fix | 🟠 Med |
| 7 | Three card idioms (raw Tailwind / inline style / `.zone-card`) | Visual rhythm differs page-to-page | Adopt `.zone-card` everywhere (already theme-aware) | `design:design-system` | 🟠 Med |
| 8 | Five CTA button styles | Brand feels inconsistent; primary action ambiguity | Define one Primary + Secondary + Destructive + Subtle | `vercel:shadcn` | 🟡 Low-Med |
| 9 | DM Mono under-used | Spec callouts (e.g. env keys, route ids, BPM) feel like body text | Apply `mono` class to all hash-like values | quick fix | 🟢 Low |
| 10 | No animated/hero treatment outside ToolsHub | "All tools" looks like a product page; everything else looks like settings | Borrow a tasteful hero (subtle gradient + eyebrow) from the Harmony portfolio HTML | `design:design-critique` | 🟢 Low |

---

## 5 · Opportunity / synergy section

Cross-cutting wins that ride on the audit:

1. **One `ZoneHeader` primitive** (extends `StudioToolsHeader`) takes `{ eyebrow, title, description, actions }`. Drops into every zone — kills items #2, #4, #8 at once. The right side is reserved for `RouteStatusBar` + `AddKeyPanel`, which means *every* page automatically inherits the API/Mock/Real status group + missing-key workflow.

2. **Unify the Tools Hub icon set with the sidebar** — drives off **one** `tools-registry.ts` instead of two parallel arrays. The sidebar nav and the Hub tile would both `.map()` the same list. Eliminates the Chord Detector mismatch and prevents future drift.

3. **Make CPW's `.zone-canvas / .zone-inner / .zone-card / .zone-topbar` classes the canonical layout primitive**. They already encode the design choices we want. Re-applying them across non-Tools zones (Production, Tesla, DevSettings, Diagnostics, Pulse, Mixing, Vocals) brings everyone onto one container width + theme-aware background.

4. **Move every page's body-level "Mock data on / Not connected / Save key" affordance up into the top-right group**, and reserve the page header for the page's own controls (search, filters, export). The top-right becomes the single mental model for "is the data real?".

5. **Cross-tool synergy unlocked by a unified header**:
   - Audio tools (YouTube Downloader, Social Capture, Audio Grab) all push into `mixing-audio-idb`. If the header surfaces a tiny "Recent clips" tray when the route is in the audio family, the user gets one-click hand-off between tools.
   - Detection tools (Key Finder, Chord Detector, Tempo Tap) can share a "Active clip" indicator in the header (analyzing the same blob across all three).
   - Generation / writing tools (Piano, Rhyme Studio) can show "Linked progression: Cm → G# → Fm → A#" pulled from the last Chord Detector result.

6. **One design-tokens source of truth** under `src/lib/design-tokens.ts` (typed constants for the 3 H1 scales, 1 container width, 1 card recipe, 1 CTA recipe). Then ESLint a custom rule that flags raw `text-2xl` on `<h1>` etc. — prevents drift after we land the refactor.

---

## Recommended sequencing (when you greenlight changes)

1. **Phase 1 (quick fixes, ~30 min):** items #5, #6, #9 from the table. No design discussion needed.
2. **Phase 2 (the unification, ~2 hrs):** ship `ZoneHeader` primitive + adopt `.zone-canvas / .zone-card` on Tools leaf pages. Removes items #1, #3, #4, #7.
3. **Phase 3 (polish, ~1 hr):** define tokens + button variants — items #2, #8.
4. **Phase 4 (hero treatment, optional):** item #10 — pull a subtle gradient hero from the Harmony portfolio for the two hub-style pages (ToolsHub, ProductionOverview).

Awaiting your call on which phases (or which specific table rows) to start with.
