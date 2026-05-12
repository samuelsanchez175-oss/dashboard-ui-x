# UX Copy Suggestions — Samuel X Dashboard

Read-only review of user-facing copy across the dashboard's main zones. Each recommendation follows the brief's principles:

1. **Concise** — under-word, don't over-explain.
2. **Specific** — "Save changes" beats "Submit".
3. **Active voice**.
4. **Consistent voice** across zones.
5. **Empty states** offer a next action.
6. **Sentence case** unless the design system explicitly requires otherwise.

Line numbers refer to the current `main` worktree.

---

## ToolsHubZone (`src/zones/tools/ToolsHubZone.tsx`)

| Location | Current | Suggested | Rationale |
|----------|---------|-----------|-----------|
| Crumbs `:175` | `Workspace · Tools` | (keep) | Already short and specific. |
| Eyebrow `:184` | `Sidebar mirror` | `Same as the sidebar` | "Mirror" is jargon; spell out what it means. |
| Hero title `:185` | `All tools, one alternate entry point.` | `Every tool, one place.` | Cuts 4 words; drops "alternate entry point" (vague). The current copy reads like a slogan, not a heading. |
| Hero body `:188` | `Everything visible in the left rail is grouped here with the same route IDs, including starred Web Designer pages, custom zones, and pinned actions.` | `Everything in the left sidebar — grouped, searchable, with the same routes.` | Halves the length; drops "route IDs" (internal term); names "the sidebar" instead of "the left rail". |
| KPI label `:200` | `Current index` | `Reachable now` | "Current index" is database-speak. |
| KPI hint `:207` | `reachable destinations` | `destinations` | The big number + the "Reachable now" eyebrow already imply reachability. |
| Search placeholder `:226` | `Search tools, zones, sections...` | `Search tools` | One-word categories ("zones, sections") rarely help users; the field returns all three anyway. Trailing `...` should be `…` Unicode if kept. |
| Filter pill `:243` | `{n} shown` | `{n} match` (singular) / `{n} matches` (plural) | "Shown" is meta-language about the UI; "match" describes the result. |
| Empty state title `:254` | `No destinations match "{query}"` | `No tools match "{query}"` | "Destinations" is internal vocabulary that only appears in this zone — readers may not know it means tools. |
| Empty state body `:257` | `Try a section name, tool name, custom zone, or route ID.` | `Try a tool name, category, or saved zone.` | "Route ID" is engineering jargon — drop it. |
| Section meta `:123` | `{n} destinations` / `1 destination` | `{n} tools` / `1 tool` | Same — call them tools, since the zone is "Tools". |
| Section meta lower `:87` | `{sectionTitle} · {item.id}` | `{sectionTitle}` (drop the ID) | The route ID is a development concern, not user-facing. |

---

## CdlHubZone (`src/zones/cdl/CdlHubZone.tsx`)

| Location | Current | Suggested | Rationale |
|----------|---------|-----------|-----------|
| Eyebrow `:120` | `CDL practice tests` | (keep) | Clear, specific. |
| Title `:122` | `CDL PRAC` | `CDL practice` | "PRAC" reads as an abbreviation; spell it out. Sentence case is more consistent with other zones. |
| Hero body `:125` | `Commercial Driver's License endorsement prep — pick a quiz to drill against the same 80% pass threshold the state exam uses. Each set tracks your answers, highlights misses, and lets you review just the questions you got wrong before retaking.` | `Practice each CDL endorsement against the 80% pass mark used on the state exam. Your answers, misses, and review pile are saved per quiz.` | The original is 47 words; the rewrite is 27. Drops "drill against" (mixed metaphor) and "lets you review just the questions you got wrong" (overlong). |
| Tile descriptions `:22,32,42,52,62,72,82,102` | All end with `. 66 questions.` repeated. | Drop the `. 66 questions.` suffix; the count already shows in the footer at `:170`. | Duplicates info shown elsewhere. Saves 3 words per tile. |
| Tile description tone — `Hazmat (H)` `:22` | `Hazardous Materials endorsement — placards, shipping papers, leaks, segregation.` | (keep, drop suffix) | Good — concrete topic list. |
| Tile description `Tanker + HazMat (X)` `:62` | `Combination N + H — cargo-tank specs, bonding/grounding, fuel hauling, vapor recovery, retest dates, placarding.` | `Cargo tank specs, bonding, fuel hauling, vapor recovery, retest dates, placarding.` | "Combination N + H" is decoded by the badge "X". Drop. |
| Tile description `Tanker Doubles / Triples` `:102` | `Bonus combo — liquid surge × multiple trailers, LCV rules, compounded rollover, vapor recovery across tanks.` | `Liquid surge across multiple trailers — LCV rules, rollover, vapor recovery.` | Drop "Bonus combo" (marketing tone); drop "compounded" (vague). |
| Footer count `:171` | `{count} questions · 80% to pass` | (keep) | Clear and specific. |
| CTA `:177` | `Open` | (keep) | Strong active verb. |
| Duplicate tile bug | `Doubles / Triples (T)` appears twice (`:50` and `:90`). | This is a likely **copy/data bug** — flag for engineering, not just copy. | Out of scope for copy, but worth noting. |

---

## ProductionZone (`src/zones/production/ProductionZone.tsx`)

| Location | Current | Suggested | Rationale |
|----------|---------|-----------|-----------|
| Page title `:53` | `Production overview` | (keep) | Specific, sentence case. |
| Subtitle `:55` | `High-level snapshot — swap with live metrics when APIs are wired.` | `Snapshot. Replace with live metrics when APIs are connected.` | "Swap with" is colloquial; "wired" is jargon. Plain English. |
| KPI label `:65` | `Ship cadence` | (keep) | Specific. |
| KPI hint `:68` | `Target: steady releases` | `Aiming for steady releases` | Active voice instead of "Target:". |
| KPI hint `:70` | `Sample values hidden — turn Mock data on for placeholders.` | `Turn Mock data on to see sample values.` | Active and concise. |
| KPI label `:74` | `Open incidents` | (keep) | Clear. |
| KPI hint `:78` | `Placeholder health strip` | `Placeholder` | Two extra words add nothing. |
| KPI hint `:80` | `Connect monitoring for real incident counts.` | `Connect monitoring to see real counts.` | Tighter, active. |
| KPI label `:83` | `Focus` | (keep) | OK. |
| KPI hint `:87` | `Navigation matches zone order` | `Sidebar follows zone order` | More user-facing language. |
| KPI hint `:89` | `Define focus when wiring production APIs.` | `Set this when production APIs come online.` | "Wiring" is engineering-speak. |
| Section title `:106` | `Agent Farm` | (keep) | Brand name. |
| Body `:108` | `Open Agent Farm in the sidebar for the full multi-tab operations view with richer mock data (respects the same Mock data toggle).` | `Open Agent Farm in the sidebar for the full operations view. Same Mock data toggle.` | Drops "multi-tab" (UI detail) and parenthetical. |
| Body `:116` | `Revenue and strategy tiles will eventually mirror your real data sources.` | `Revenue and strategy tiles will reflect live data once connected.` | "Eventually" hedges; "mirror your real data sources" is technical. |

---

## HarmonyStackZone (`src/zones/harmony/HarmonyStackZone.tsx`)

| Location | Current | Suggested | Rationale |
|----------|---------|-----------|-----------|
| Eyebrow `:127` | `HARMONY STACK · WEB DESIGN SERVICES` | (keep, but verify ALL CAPS is intentional) | Eyebrows elsewhere use mono with lowercase or `tracking-wide`. ALL CAPS conflicts. |
| Hero title `:131` | `Service Packages` | `Service packages` | Sentence case; rest of dashboard is sentence case. |
| Hero subtitle `:134` | `Fixed-scope deliverables. No hidden fees. Delivered on time.` | (keep) | Strong, parallel structure. |
| Package name `:38` | `Starter` | (keep) | Standard pricing tier. |
| Package tagline `:41` | `Perfect for landing pages & simple sites` | `For landing pages and one-pagers` | "Perfect for" is filler; rest of taglines avoid it. |
| Package tagline `:56` | `Full brand presence + e-commerce ready` | `Full brand site, e-commerce ready` | Drop "+"; the rest of the dashboard avoids it. |
| Package tagline `:74` | `For established brands ready to level up` | `For established brands scaling up` | "Ready to level up" is colloquial. |
| Feature `:48` | `Mobile-responsive design` | `Responsive design` | "Mobile-responsive" is redundant in 2026. |
| Feature `:55` | `Up to 10 pages` | (keep) | Specific. |
| Feature `:59` | `Shopify / WooCommerce setup` | `Shopify or WooCommerce setup` | "/" reads as "or" in code; spell it out for screen readers. |
| Feature `:62` | `Dropbox asset handoff` | `Final assets via Dropbox` | Active and clearer ("handoff" is jargon). |
| Badge `:154` | `MOST POPULAR` | (keep) | Standard convention. |
| CTA `:191` highlight | `Book this package` | `Choose Professional` | Specific (names the package); "Book this" is vague. |
| CTA `:191` non-highlight | `Select` | `Choose this package` | Or use the package name. "Select" is generic. |
| Stats label `:203` | `Sites delivered` | `Sites shipped` | More active. |
| Stats label `:204` | `Avg satisfaction` | `Client rating` | Drop the abbreviation. |
| Stats label `:205` | `Avg turnaround` | `Average turnaround` | Spell out for non-skimmers. |
| Add-ons header `:225` | `Add-ons` | (keep) | Clear. |
| Add-on label `:91` | `Rush delivery (7 days)` | (keep) | Specific. |
| Add-on label `:94` | `Bilingual (EN + ES)` | `Bilingual (English + Spanish)` | Code-style abbreviations don't belong in user copy. |
| Projects hero `:309` | `Client Projects` | `Client projects` | Sentence case. |
| Projects subtitle `:312` | `Track deliverables across all active Harmony Stack clients.` | `Track deliverables for every active Harmony Stack client.` | "Across all" → "for every" is tighter. |
| Status `:107` | `To Do` | `To do` | Sentence case for label consistency. |
| Status `:109` | `In Review` | `In review` | Sentence case. |
| Add-task placeholder `:355` | `New task…` | `What's the task?` | Question prompts are more inviting than imperative-noun placeholders. |
| Add-task placeholder `:369` | `Client name` | `Which client?` | Same. |
| Add-task button `:394` | `Add` | `Add task` | Spell out the object. |
| Empty state `:403` | `No tasks here yet.` | `No tasks yet — add one above.` | Empty state should suggest a next action. |
| Clear button `:481` | `Clear completed tasks` | `Clear done` | Tighter; matches the column name "Done". |

---

## WebDesignerZone (`src/zones/web-designer/WebDesignerZone.tsx`)

| Location | Current | Suggested | Rationale |
|----------|---------|-----------|-----------|
| Page title `:130` | `Web designer` | (keep) | Sentence case, clear. |
| Subtitle `:132` | `Embedded preview for inspiration and references. Many production sites block iframes — keep Open in new tab handy.` | `Embed any URL for reference. Sites that block iframes will need "New tab".` | Tighter; uses the actual button name. |
| Breadcrumb segment `:123` | `Web design` | (keep) | Matches `.../web-designer` zone — fine. |
| Inspector button `:149` | `Inspect demo` | `Inspect` | "Demo" is duplicated by the drawer header "Page signals (demo)". |
| URL input placeholder `:205` | `https://example.com or domain.com` | `https://example.com` | One example is enough; the input accepts both. |
| Primary CTA `:222` | `Go` | (keep) | Standard, concise. |
| Secondary CTA `:236` | `New tab` | `Open in new tab` | "New tab" reads ambiguously without verb context. |
| Star button `:251` | `Starred` / `Star` | `Saved` / `Save` | "Star" overloads the verb-and-icon; "Save to sidebar" is the actual outcome. Or align with the title attribute "Save to sidebar". |
| Iframe hint `:51` | `Some sites refuse embedding (X-Frame-Options / CSP). If the frame stays blank, use Open in new tab.` | `Some sites block embedding. If the frame stays blank, use "Open in new tab".` | Drop the spec terms (X-Frame-Options / CSP) — most users don't need them; engineers can find them in MDN. |
| Bookmark missing `:96` | `This saved link is no longer in your stars.` | `That saved link is gone from your starred list.` | Active; "no longer in your stars" reads oddly. |
| Bookmark missing CTA `:104` | `Open designer browser` | `Back to Web designer` | Matches the zone name. |
| Empty preview `:287` | `No page loaded` | `No page yet` | Slightly warmer; "loaded" is technical. |
| Empty preview hint `:289` | `Paste a URL and press Go. Try MDN, public docs, or internal tools that allow framing. For sites that block embedding, use New tab — your starred URL still opens from the left sidebar.` | `Paste a URL and press Go. For sites that block embedding, use "Open in new tab".` | The 4-line original buries the actionable instruction. |
| Inspector header `:323` | `Page signals (demo)` | `Page signals — demo data` | Em-dash flows better; "(demo)" parens can read as a separate aside. |
| Inspector intro `:339` | `Placeholder analytics for the loaded host. Wire to real metrics or Lighthouse data when a backend exists.` | `Placeholder analytics. Connect real metrics or Lighthouse once a backend is live.` | "Loaded host" is jargon; "Wire to" is engineering. |
| Inspector chart label `:344` | `Engagement (mock)` | `Engagement — mock` | Consistency with "Page signals — demo data". |
| Inspector strong `:368` | `Current target` | `Current URL` | "Target" overloads HTML terminology. |
| Drawer close `:380` | `Done` | (keep) | Standard pattern. |
| Activity `:166` | `Activity` | (keep) | Clear. |
| Activity badge `:184` | `Saved` / `Notice` / `Info` | `Saved` / `Warning` / `Note` | "Notice" is unusual; "Warning" matches the underlying `kind: 'warning'`. |
| Activity counter `:169` | `{n} saved` | `{n} starred` | Aligns with "Star" button verb. |

---

## PulseDigest (`src/zones/pulse/PulseDigest.tsx`)

| Location | Current | Suggested | Rationale |
|----------|---------|-----------|-----------|
| Title `:84` | `AI digest` | (keep) | Concise. |
| Subtitle `:87` | `r/claudeskills via Reddit RSS (proxied in dev to avoid CORS).` | `r/claudeskills via Reddit RSS.` | "(proxied in dev to avoid CORS)" is a developer note — move to a tooltip or remove. |
| Refresh button `:107` | `Refresh` | (keep) | Standard. |
| Loading `:112` | `Loading feed…` | (keep) | OK. |
| Error block `:118` | `Could not load digest` | (keep) | Active, specific. |
| Error sub `:119` | `{data.message}` | (keep — comes from server) | OK. |
| Error explainer `:120` | `Reddit may rate-limit or block some requests; the dev server uses a minimal RSS proxy at /api/digest/reddit.` | `Reddit sometimes rate-limits requests. The dev server proxies at /api/digest/reddit.` | Tighter; drops "may", "minimal", "some". |
| Saved hint `:64` | `Using saved feed:` | `Saved feed:` | "Using" is filler. |
| Reset link `:71` | `Reset default` | `Reset to default` | "Reset default" reads as "reset the default" (ambiguous). |
| Field label `:127` | `Topic or RSS URL` | (keep) | Clear. |
| Field hint `:129` | `Save a subreddit name (e.g. programming), r/name, or a full https://… RSS feed.` | `Subreddit name, r/name, or full RSS URL.` | The example is implied by "subreddit name"; drop "Save" since the Save button below does that. |
| Input placeholder `:143` | `claudeskills or https://example.com/feed.xml` | `claudeskills` | Placeholder should hint at the simplest valid input; the field hint covers the URL case. |
| Save button `:153` | `Save` | (keep) | Standard. |

---

## TweaksPanel (`src/components/TweaksPanel.tsx`)

| Location | Current | Suggested | Rationale |
|----------|---------|-----------|-----------|
| Trigger label `:202` | `Tweaks` | `Appearance` or (keep) | "Tweaks" is fun but ambiguous — users may not know the panel changes theme/accent/density. "Appearance" is industry standard. Decide based on brand voice. |
| Section header `:81` | `Tweaks` (uppercase mono) | (keep, but match trigger) | If trigger renames, this should too. |
| Section label `:101` | `Theme` | (keep) | Clear. |
| Theme options | `Light` / `Dark` | (keep) | Standard. |
| Section label `:116` | `Accent` | (keep) | Clear. |
| Accent names `:7–10` | `Purple` / `Red` / `Blue` / `Green` | (keep) | Clear. |
| Section label `:165` | `Density` | (keep) | Clear. |
| Density options | `Comfy` / `Compact` | (keep) | Friendly, paired. |

---

## Voice & tone observation

The dashboard mixes three voices:

1. **Engineering-internal** — `route ID`, `wire`, `mock data toggle`, `iframe`, `X-Frame-Options / CSP`, `CMU index ready`, `phoneme index`. Appears in ProductionZone, WebDesignerZone, PulseDigest, GrapEngineStudio.
2. **Marketing/copy-heavy** — `MOST POPULAR`, `Bonus combo`, `Perfect for ...`, `ready to level up`, all-caps eyebrows like `HARMONY STACK · WEB DESIGN SERVICES`. Concentrated in HarmonyStackZone.
3. **Plain product** — `Production overview`, `Open`, `New Zone`, `Save`, `Done`. The strongest, most-consistent voice; should be the standard.

Casing is also inconsistent: HarmonyStack uses **Title Case** for tab labels ("Services & Pricing", "Client Projects") and headings, while CDL Hub, ProductionZone, Tools Hub, PulseDigest, WebDesignerZone, and GrapEngineStudio use **sentence case** ("Production overview", "Web designer", "AI digest", "CDL practice"). Recommend committing to sentence case across the board for body and headings; reserve `mono uppercase tracking-wide` for eyebrows only (which is already the established pattern).

Status colors and labels are inconsistent: HarmonyStack uses `To Do / Active / In Review / Done`. WebDesigner Activity badges use `Saved / Notice / Info` while the underlying kind values are `saved / warning / info`. Recommend a single status taxonomy across the app: `To do · Active · In review · Done` and `Note · Warning · Info` (with the badge label matching the underlying value).

Most user-facing strings are reasonable; the highest-leverage fix is removing engineering jargon (route IDs, "wire", "mirror", "swap", "X-Frame-Options") and switching HarmonyStack from Title Case to sentence case to match the rest of the dashboard.
