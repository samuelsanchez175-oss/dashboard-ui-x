# Projects reorder + sidebar edit-mode discoverability — Design

**Date:** 2026-07-12
**Status:** Approved (design), pending implementation plan
**App repo:** `/Users/samuel/dashboard-ui-x` (React 19 + Vite + TS SPA)

## Problem

On the **Projects Overview** page (`src/zones/cpw/CpwZone.tsx`, route `cpw-projects`,
sidebar PROJECTS → "All projects") the user wants to grab a project card and drag it
into a new position, and have that arrangement persist across reloads.

Separately, the user wants sidebar items to be reorderable/removable with the change
saved. Investigation showed the **sidebar already does this** — a global edit mode
(`layoutEditMode` in `Sidebar.tsx`) that reorders (`moveNavItemInLayout`), removes
(`hideNavItem`), resets (`resetSidebarNavLayout`), and persists to
`localStorage['sx-dashboard-sidebar-nav-layout-v1']` (`sidebarNavLayout.ts`). The user
simply never found the entry point (a hover-only "Customize sidebar" icon on each section
header). So the sidebar half is a **discoverability** task, not a rebuild.

## Goals

1. Drag-to-reorder project cards on the Projects Overview page.
2. Persist that order per-browser (localStorage), surviving reloads.
3. Newly-added projects (from a vault re-audit that rewrites `projects.json`) still appear.
4. A visible, obvious way to enter the existing sidebar edit mode.

## Non-goals (YAGNI)

- No cross-device sync — localStorage only (user chose "this browser only").
- No backend / Supabase table for order.
- No new drag-and-drop library — reuse the native HTML5 DnD the sidebar already uses.
- No changes to how `projects.json` is generated (`scripts/build-projects*.mjs`).
- No rebuild of the sidebar reorder/remove/persist engine — it works today.
- No reordering *across* the All/Active/Blocked/Idle filter — order is a single base list;
  filters only hide non-matching cards.

## Part A — Projects reorder + persist

### Current state (`src/zones/cpw/CpwZone.tsx`)

- `payload` fetched from static `/data/projects.json` (~L326); `payload.projects[]` each
  carry a **stable `id`**.
- `projects` memo (~L424) maps payload → view models.
- `filtered` (~L465) applies the optional status filter.
- Grid (~L551–553): `filtered.map(p => <ProjectCard key={p.id} project={p} … />)`.
- No reorder exists. Existing persistence here is only per-task check-off state
  (`projects:done-overrides-v1` + remote `checkoffStore`).

### Design

**1. Order store (new small module, e.g. `src/lib/cpwProjectOrder.ts`).**
Mirror the `CustomZonesContext` idiom (plain localStorage + `JSON` + `try/catch`):

- Key: `ui-cpw-project-order-v1` (versioned, `ui-*` namespace — matches convention).
- `loadProjectOrder(): string[]` — parse array of ids; `[]` on any failure.
- `saveProjectOrder(ids: string[]): void` — `localStorage.setItem(KEY, JSON.stringify(ids))`.

**2. Apply order — "saved order first, unknown ids appended"** (the `orderedItemIds`
merge from `sidebarNavLayout.ts`). Given `projects` and a saved `orderIds`:

- Emit projects whose id is in `orderIds`, in `orderIds` order.
- Then append any project whose id is not in `orderIds` (new projects), in file order.
- Ignore saved ids that no longer exist (deleted projects).

Apply this to `projects` **before** deriving `filtered`, so the filter tabs operate on the
already-ordered list.

**3. Drag interaction — native HTML5 DnD** (same mechanism as `NavSectionGroup.tsx`):

- `ProjectCard` container gets `draggable`, `onDragStart` (stash dragged id in a ref +
  `dataTransfer`), `onDragOver` (preventDefault to allow drop), `onDrop` (reorder: move
  dragged id to before the drop-target id), `onDragEnd` (clear ref).
- On a successful drop: compute the new full-order id list, `saveProjectOrder(...)`, and
  update local state so the grid re-renders immediately.
- Native DnD is chosen over framer-motion `Reorder` because the grid is a **wrapping**
  `repeat(auto-fill, minmax(280px,1fr))` layout, where `Reorder.Group` (1-D) misbehaves;
  native DnD handles a wrapping grid via drop-before-target.
- Add subtle drag affordance styling (cursor + drag-over highlight) consistent with the
  sidebar rows. A grab cursor on the card signals draggability.

**4. Reset control.** A small "Reset order" button on the Projects Overview header
(near the filter tabs / Refresh) that clears `ui-cpw-project-order-v1` and reverts to
`projects.json` file order. Matches the user's "recoverable" preference and the sidebar's
Reset.

### Interaction with existing features

- **Filters:** unchanged; they slice the ordered list.
- **Check-offs / Refresh:** independent; reordering never touches task state, and Refresh
  re-fetches `projects.json` but the saved order is re-applied via the merge (new projects
  append, missing ones drop).

## Part B — Sidebar edit-mode discoverability

### Current state

`Sidebar.tsx` holds `layoutEditMode` (~L53). Each `NavSectionGroup` renders a hover-only
"Customize sidebar" button that toggles this **global** mode; in edit mode every item shows
a red ✕ (`hideNavItem`) and rows are `draggable` (`moveNavItemInLayout`), with top-level
**Done / Reset** (`resetSidebarNavLayout`) controls. Persists on every `layout` change to
`sx-dashboard-sidebar-nav-layout-v1`; re-syncs across tabs via a storage/event listener.

### Design

Add **one always-visible, clearly-labeled entry point** that toggles the same
`layoutEditMode` — a small "Edit layout" (pencil) button in the sidebar footer near the
existing "New Zone" action. No new state, no engine changes: it flips the same boolean the
section-header icons already flip. The hover icons can remain.

Verification (not a code change, but part of done-ness): enter edit mode via the new button,
remove one item and reorder another, reload, confirm both persisted, then Reset confirms
restore.

## Persistence summary

| Surface | Key | Shape | Status |
|---|---|---|---|
| Projects order | `ui-cpw-project-order-v1` | `string[]` of project ids | **new** |
| Sidebar layout | `sx-dashboard-sidebar-nav-layout-v1` | `SidebarNavLayoutPersist` | exists |

All per-browser localStorage, `try/catch` + `JSON`, matching the app's dominant idiom.

## Testing / verification

- **Projects:** drag a card to a new slot → order updates and `ui-cpw-project-order-v1`
  written; reload → order preserved; switch filters → arrangement kept; "Reset order" →
  reverts to file order and key cleared; simulate a new project id in `projects.json`
  (or reason via unit of the merge fn) → it appears appended, not dropped.
- **Sidebar:** new footer button opens edit mode; remove + reorder survive reload; Reset
  restores defaults.
- Prefer a small unit test for the pure order-merge function (saved-first / append-new /
  drop-missing), plus live browser verification via the Vite dev server (`dashboard-dev`,
  port 5175).

## Open questions

None — persistence scope (localStorage), remove-recoverability (Reset), and sidebar scope
(discoverability only) are all resolved.
