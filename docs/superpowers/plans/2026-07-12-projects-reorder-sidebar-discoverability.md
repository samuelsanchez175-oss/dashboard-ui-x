# Projects Reorder + Sidebar Edit-Mode Discoverability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user drag-reorder project cards on the Projects Overview page with the order saved per-browser, and surface the sidebar's existing (but hidden) reorder/remove edit mode via a clearly-labeled entry point.

**Architecture:** A new pure module (`src/lib/cpwProjectOrder.ts`) owns the order logic (merge saved-order-with-new-projects, and a reorder helper) plus thin localStorage load/save/clear. `CpwZone.tsx` holds an `orderIds` state, applies `mergeProjectOrder` to its `projects` memo, and wires native HTML5 drag handlers onto each `ProjectCard`. The sidebar's reorder/remove/persist engine already exists and is untouched; we only add a footer "Edit layout" button that flips the existing `layoutEditMode` boolean.

**Tech Stack:** React 19, Vite 8, TypeScript, native HTML5 drag-and-drop (no DnD library), lucide-react icons, localStorage. No unit-test runner in this repo — pure logic is tested with a `tsx` assertion script; UI wiring is verified live in the Vite dev server.

## Global Constraints

- Persistence is **localStorage only**, per-browser. No backend, no Supabase table, no cross-device sync.
- **No new npm dependencies.** Reuse native HTML5 DnD (the mechanism the sidebar already uses) and lucide-react (already a dep).
- Storage key for project order: exactly `ui-cpw-project-order-v1` (matches the app's `ui-*` + versioned convention).
- Persistence idiom must match the codebase: plain `localStorage` + `JSON.stringify/parse` wrapped in `try/catch`, returning a safe empty default on any failure (see `src/context/CustomZonesContext.tsx`).
- The merge rule is **saved order first, then any project not in the saved order appended in file order, and saved ids that no longer exist are dropped** (mirrors `orderedItemIds` in `src/components/sidebar/sidebarNavLayout.ts`).
- Do **not** modify how `public/data/projects.json` is generated (`scripts/build-projects*.mjs`).
- Do **not** rebuild the sidebar reorder/remove/persist engine — it works today (`src/components/sidebar/sidebarNavLayout.ts`, key `sx-dashboard-sidebar-nav-layout-v1`).
- Reordering must not disturb the status filter: the custom order is the single base list; the All/Active/Blocked/Idle tabs only hide non-matching cards.
- App code lives in the repo at `/Users/samuel/dashboard-ui-x`. Run all commands from there.

---

### Task 1: Pure project-order module + tsx test

Owns the order logic and localStorage persistence. Pure functions (`mergeProjectOrder`, `moveIdBefore`) contain no `localStorage` so they are testable in Node via `tsx`; `load/save/clear` touch `localStorage` only inside function bodies (safe to import in Node — never executed at import time).

**Files:**
- Create: `/Users/samuel/dashboard-ui-x/src/lib/cpwProjectOrder.ts`
- Test:   `/Users/samuel/dashboard-ui-x/scripts/test-project-order.ts`

**Interfaces:**
- Produces (consumed by Task 2):
  - `PROJECT_ORDER_KEY: string`
  - `moveIdBefore(ids: string[], dragId: string, beforeId: string | null): string[]`
  - `mergeProjectOrder<T extends { id: string }>(items: T[], orderIds: string[]): T[]`
  - `loadProjectOrder(): string[]`
  - `saveProjectOrder(ids: string[]): void`
  - `clearProjectOrder(): void`

- [ ] **Step 1: Write the failing test**

Create `/Users/samuel/dashboard-ui-x/scripts/test-project-order.ts`:

```ts
import {
  mergeProjectOrder,
  moveIdBefore,
} from '../src/lib/cpwProjectOrder'

let failures = 0
function check(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    console.log(`ok   ${label}`)
  } else {
    failures++
    console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`)
  }
}
const items = (ids: string[]): { id: string }[] => ids.map(id => ({ id }))

// mergeProjectOrder: saved order first, new items appended (file order), missing dropped, dups ignored
check(mergeProjectOrder(items(['a', 'b', 'c']), ['c', 'a', 'b']).map(i => i.id), ['c', 'a', 'b'], 'saved order applied')
check(mergeProjectOrder(items(['a', 'b', 'c', 'd']), ['c', 'a']).map(i => i.id), ['c', 'a', 'b', 'd'], 'new items appended in file order')
check(mergeProjectOrder(items(['a', 'b']), ['x', 'b', 'a']).map(i => i.id), ['b', 'a'], 'missing saved ids dropped')
check(mergeProjectOrder(items(['a', 'b', 'c']), []).map(i => i.id), ['a', 'b', 'c'], 'empty order = file order')
check(mergeProjectOrder(items(['a', 'b']), ['a', 'a', 'b']).map(i => i.id), ['a', 'b'], 'duplicate saved ids ignored')

// moveIdBefore: reorder helper
check(moveIdBefore(['a', 'b', 'c'], 'c', 'a'), ['c', 'a', 'b'], 'move c before a')
check(moveIdBefore(['a', 'b', 'c'], 'a', null), ['b', 'c', 'a'], 'move a to end')
check(moveIdBefore(['a', 'b', 'c'], 'a', 'a'), ['a', 'b', 'c'], 'move before self = no-op')
check(moveIdBefore(['a', 'b', 'c'], 'a', 'z'), ['a', 'b', 'c'], 'unknown target = no-op')
check(moveIdBefore(['a', 'b', 'c'], 'b', 'a'), ['b', 'a', 'c'], 'move b before a')

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`)
  process.exit(1)
}
console.log('\nAll project-order tests passed')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/samuel/dashboard-ui-x && npx tsx scripts/test-project-order.ts`
Expected: FAIL — module does not exist yet, e.g. `Cannot find module '../src/lib/cpwProjectOrder'` (non-zero exit).

- [ ] **Step 3: Write minimal implementation**

Create `/Users/samuel/dashboard-ui-x/src/lib/cpwProjectOrder.ts`:

```ts
/**
 * Per-browser custom order for the Projects Overview cards (CpwZone).
 *
 * Order is stored as an array of project ids in localStorage. Pure helpers
 * (`mergeProjectOrder`, `moveIdBefore`) hold the logic and are unit-tested via
 * scripts/test-project-order.ts; load/save/clear are thin localStorage wrappers
 * following the app's try/catch + JSON idiom (see CustomZonesContext).
 */
export const PROJECT_ORDER_KEY = 'ui-cpw-project-order-v1'

/**
 * Reorder `ids`: move `dragId` to just before `beforeId`. When `beforeId` is
 * null, move `dragId` to the end. No-op when dragId === beforeId or when
 * beforeId is not present. Pure.
 */
export function moveIdBefore(ids: string[], dragId: string, beforeId: string | null): string[] {
  if (dragId === beforeId) return ids
  const without = ids.filter(id => id !== dragId)
  if (beforeId === null) return [...without, dragId]
  const idx = without.indexOf(beforeId)
  if (idx === -1) return ids
  return [...without.slice(0, idx), dragId, ...without.slice(idx)]
}

/**
 * Order `items` by `orderIds` (saved order first), then append any item whose
 * id is not in `orderIds` in original (file) order. Saved ids with no matching
 * item are dropped; duplicate saved ids are ignored. Pure.
 */
export function mergeProjectOrder<T extends { id: string }>(items: T[], orderIds: string[]): T[] {
  const byId = new Map(items.map(it => [it.id, it]))
  const seen = new Set<string>()
  const out: T[] = []
  for (const id of orderIds) {
    const it = byId.get(id)
    if (it && !seen.has(id)) {
      out.push(it)
      seen.add(id)
    }
  }
  for (const it of items) {
    if (!seen.has(it.id)) {
      out.push(it)
      seen.add(it.id)
    }
  }
  return out
}

/** Load the saved id order; `[]` (no custom order) on any failure. */
export function loadProjectOrder(): string[] {
  try {
    const raw = localStorage.getItem(PROJECT_ORDER_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** Persist the id order. Failures are swallowed so the UI never blocks. */
export function saveProjectOrder(ids: string[]): void {
  try {
    localStorage.setItem(PROJECT_ORDER_KEY, JSON.stringify(ids))
  } catch {
    /* ignore */
  }
}

/** Forget the custom order (revert to file order). */
export function clearProjectOrder(): void {
  try {
    localStorage.removeItem(PROJECT_ORDER_KEY)
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/samuel/dashboard-ui-x && npx tsx scripts/test-project-order.ts`
Expected: PASS — every line prints `ok …` and final line is `All project-order tests passed` (exit 0).

- [ ] **Step 5: Lint the new module**

Run: `cd /Users/samuel/dashboard-ui-x && npx eslint src/lib/cpwProjectOrder.ts scripts/test-project-order.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/samuel/dashboard-ui-x
git add src/lib/cpwProjectOrder.ts scripts/test-project-order.ts
git commit -m "feat: pure project-order module (merge + reorder + localStorage) with tsx test"
```

---

### Task 2: Drag-reorder + persist project cards in CpwZone

Wire the Task 1 module into `CpwZone.tsx`: apply saved order to the rendered list, make each card draggable, save on drop, and add a "Reset order" control. Verified live in the browser (no unit runner for React DnD).

**Files:**
- Modify: `/Users/samuel/dashboard-ui-x/src/zones/cpw/CpwZone.tsx`

**Interfaces:**
- Consumes (from Task 1): `loadProjectOrder`, `saveProjectOrder`, `clearProjectOrder`, `mergeProjectOrder`, `moveIdBefore`, `PROJECT_ORDER_KEY`.

- [ ] **Step 1: Add `useRef` to the React import and import the order module**

The first line is currently:
```ts
import { useCallback, useEffect, useMemo, useState } from 'react'
```
Change it to:
```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
```
Then add this import directly below the existing `import UpdateDot ...` line near the top of the file:
```ts
import {
  loadProjectOrder, saveProjectOrder, clearProjectOrder, mergeProjectOrder, moveIdBefore,
} from '../../lib/cpwProjectOrder'
```

- [ ] **Step 2: Add order + drag state**

Inside `export default function CpwZone() {`, immediately after the line:
```ts
  const [filter, setFilter]         = useState<ProjStatus | 'all'>('all')
```
add:
```ts
  const [orderIds, setOrderIds]     = useState<string[]>(() => loadProjectOrder())
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const cardDragRef                 = useRef<string | null>(null)
```

- [ ] **Step 3: Apply the saved order in the `projects` memo**

Replace the existing `projects` memo (currently):
```ts
  const projects = useMemo(() => (payload?.projects ?? []).map(p => ({
    ...p,
    tasks: p.tasks.map((t, i): Task => {
      const id = taskKey(p.id, t, i)
      // Union: the generator's stamp (durable) OR a task that appeared during this
      // session's Refresh (covers snapshots produced before isNew existed).
      return { ...t, id, done: overrides[id] ?? t.done, isNew: t.isNew || newTaskIds.has(id) }
    }),
  })), [payload, overrides, newTaskIds])
```
with:
```ts
  const projects = useMemo(() => {
    const mapped = (payload?.projects ?? []).map(p => ({
      ...p,
      tasks: p.tasks.map((t, i): Task => {
        const id = taskKey(p.id, t, i)
        // Union: the generator's stamp (durable) OR a task that appeared during this
        // session's Refresh (covers snapshots produced before isNew existed).
        return { ...t, id, done: overrides[id] ?? t.done, isNew: t.isNew || newTaskIds.has(id) }
      }),
    }))
    // Apply the user's saved card order; new projects append, deleted ones drop.
    return mergeProjectOrder(mapped, orderIds)
  }, [payload, overrides, newTaskIds, orderIds])
```

- [ ] **Step 4: Add drag + reset handlers**

Immediately after the `toggleTask` `useCallback` block ends (the block that contains `void upsertCheckoff(taskId, newVal)` and ends with `}, [baseDone])`), add:
```ts
  const handleCardDragStart = useCallback((id: string) => {
    cardDragRef.current = id
    setDraggingId(id)
  }, [])

  const handleCardDragEnd = useCallback(() => {
    cardDragRef.current = null
    setDraggingId(null)
  }, [])

  const handleCardDropBefore = useCallback((beforeId: string | null) => {
    const dragId = cardDragRef.current
    cardDragRef.current = null
    setDraggingId(null)
    if (!dragId || dragId === beforeId) return
    const next = moveIdBefore(projects.map(p => p.id), dragId, beforeId)
    setOrderIds(next)
    saveProjectOrder(next)
  }, [projects])

  const handleResetOrder = useCallback(() => {
    clearProjectOrder()
    setOrderIds([])
  }, [])
```

- [ ] **Step 5: Add drag props to `ProjectCard`**

Change the `ProjectCard` signature (currently):
```ts
function ProjectCard({ project, active, onClick }: { project: EnrichedProject; active: boolean; onClick: () => void }) {
```
to:
```ts
function ProjectCard({ project, active, onClick, draggable, dragging, onDragStart, onDragEnd, onDropBefore }: {
  project: EnrichedProject
  active: boolean
  onClick: () => void
  draggable?: boolean
  dragging?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
  onDropBefore?: () => void
}) {
```
Then change the opening `<button …>` of that card (currently):
```tsx
    <button
      onClick={onClick}
      className="zone-card text-left w-full transition-all hover:shadow-md flex flex-col gap-4"
      style={{ borderColor: active ? project.accent : 'var(--border)' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = project.accent)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = active ? project.accent : 'var(--border)')}
    >
```
to:
```tsx
    <button
      onClick={onClick}
      draggable={draggable}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.() }}
      onDragEnd={onDragEnd}
      onDragOver={e => { if (draggable) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
      onDrop={e => { if (draggable) { e.preventDefault(); e.stopPropagation(); onDropBefore?.() } }}
      className="zone-card text-left w-full transition-all hover:shadow-md flex flex-col gap-4"
      style={{ borderColor: active ? project.accent : 'var(--border)', opacity: dragging ? 0.5 : 1, cursor: draggable ? 'grab' : undefined }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = project.accent)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = active ? project.accent : 'var(--border)')}
    >
```

- [ ] **Step 6: Wire the grid + cards, and add a "Reset order" button**

Replace the grid block (currently):
```tsx
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                {filtered.map(p => (
                  <ProjectCard key={p.id} project={p} active={p.id === activeId} onClick={() => setActiveId(p.id === activeId ? null : p.id)} />
                ))}
              </div>
```
with:
```tsx
              <div
                className="grid gap-4"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
                onDragOver={e => { if (draggingId) e.preventDefault() }}
                onDrop={e => { if (draggingId) { e.preventDefault(); handleCardDropBefore(null) } }}
              >
                {filtered.map(p => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    active={p.id === activeId}
                    onClick={() => setActiveId(p.id === activeId ? null : p.id)}
                    draggable
                    dragging={draggingId === p.id}
                    onDragStart={() => handleCardDragStart(p.id)}
                    onDragEnd={handleCardDragEnd}
                    onDropBefore={() => handleCardDropBefore(p.id)}
                  />
                ))}
              </div>
```
Then, in the filter-tabs container, replace (currently):
```tsx
              <div className="flex flex-wrap gap-1.5">
                {presentStatuses.map(s => {
```
with:
```tsx
              <div className="flex flex-wrap items-center gap-1.5">
                {orderIds.length > 0 && (
                  <button
                    onClick={handleResetOrder}
                    className="mono text-[10px] px-2.5 py-1 rounded-full transition-all"
                    style={{ background: 'var(--bg-muted)', color: 'var(--text-3)', border: '1px solid var(--border)' }}
                    title="Restore the default project order"
                  >
                    Reset order
                  </button>
                )}
                {presentStatuses.map(s => {
```

- [ ] **Step 7: Lint + type-check the file**

Run: `cd /Users/samuel/dashboard-ui-x && npx eslint src/zones/cpw/CpwZone.tsx && npx tsc -b`
Expected: eslint clean; `tsc -b` completes with no type errors.

- [ ] **Step 8: Verify live in the browser**

1. Start the dev server (preview_start `dashboard-dev`, port 5175) or confirm it's already running.
2. Navigate to the app, click PROJECTS → "All projects" in the sidebar.
3. Drag a project card (e.g. the last one) to the front; confirm it visibly moves and a "Reset order" pill appears by the filter tabs.
4. In the browser console (javascript_tool) confirm the save: `localStorage.getItem('ui-cpw-project-order-v1')` returns a JSON array of ids beginning with the id you moved.
5. Reload the page; confirm the moved card is still in its new position.
6. Click a filter tab (e.g. Active) then back to All; confirm the custom order is preserved.
7. Click "Reset order"; confirm cards revert to default order, the pill disappears, and `localStorage.getItem('ui-cpw-project-order-v1')` is now `null`.
8. Take a screenshot as proof.

- [ ] **Step 9: Commit**

```bash
cd /Users/samuel/dashboard-ui-x
git add src/zones/cpw/CpwZone.tsx
git commit -m "feat: drag-reorder project cards on Projects Overview with saved order + reset"
```

---

### Task 3: Sidebar "Edit layout" entry point (discoverability)

The reorder/remove/persist engine already exists; the only entry today is an ambiguous Pin icon per section (titled "Customize sidebar"). Add one always-visible, labeled button in the sidebar footer that flips the same `layoutEditMode`.

**Files:**
- Modify: `/Users/samuel/dashboard-ui-x/src/components/sidebar/Sidebar.tsx`

**Interfaces:**
- Consumes (existing in this file): `enterLayoutEdit` callback, `layoutEditMode` state.

- [ ] **Step 1: Add the `Pencil` icon to the lucide import**

The line is currently:
```ts
import { Moon, Plus, Sun, X } from 'lucide-react'
```
Change it to:
```ts
import { Moon, Pencil, Plus, Sun, X } from 'lucide-react'
```

- [ ] **Step 2: Add the footer "Edit layout" button**

In the bottom actions row (the `<div className="px-3 py-2 flex items-center gap-2" …>` block), insert this button between the "New Zone" `</button>` and the theme-toggle `<button …>`:
```tsx
        {!layoutEditMode && (
          <button
            type="button"
            onClick={enterLayoutEdit}
            className="flex items-center justify-center rounded-lg p-2 transition-all"
            style={{
              background: 'var(--bg-hover)',
              color:      'var(--text-3)',
              border:     '1px solid var(--border)',
            }}
            title="Edit sidebar layout — reorder or remove items"
            aria-label="Edit sidebar layout"
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-1)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
          >
            <Pencil size={13} />
          </button>
        )}
```

- [ ] **Step 3: Lint + type-check the file**

Run: `cd /Users/samuel/dashboard-ui-x && npx eslint src/components/sidebar/Sidebar.tsx && npx tsc -b`
Expected: eslint clean; no type errors.

- [ ] **Step 4: Verify live in the browser**

1. With the dev server running, reload the app.
2. Confirm a pencil button now sits in the sidebar footer next to "New Zone" (hover shows "Edit sidebar layout — reorder or remove items").
3. Click it; confirm the sidebar enters edit mode (top Done/Reset bar appears, red ✕ on every item, rows become draggable, and the pencil button hides).
4. Remove one item (✕) and drag another to a new position.
5. In the console confirm persistence: `localStorage.getItem('sx-dashboard-sidebar-nav-layout-v1')` reflects the change (a `hiddenItemIds` entry and/or reordered `itemsBySection`).
6. Reload; confirm the removed item stays gone and the reorder held.
7. Enter edit mode again, click **Reset**; confirm all items return to defaults. Take a screenshot as proof.

- [ ] **Step 5: Commit**

```bash
cd /Users/samuel/dashboard-ui-x
git add src/components/sidebar/Sidebar.tsx
git commit -m "feat: add labeled 'Edit layout' entry point to sidebar footer"
```

---

## Known limitations (out of scope, documented intentionally)

- **Keyboard reorder:** card and nav reordering is pointer-drag only; there is no keyboard-accessible reorder. Matches the existing sidebar. Not in scope for this change.
- **Absolute-end placement in the grid:** dropping onto a card inserts before it; dropping onto empty grid space appends to the end. In a densely-packed wrapping grid there may be little empty space to target the very end directly — drop below the last row.

## Self-Review

**1. Spec coverage:**
- Drag-reorder project cards → Task 2 (Steps 5–6). ✓
- Persist order per-browser, localStorage `ui-cpw-project-order-v1` → Task 1 (`saveProjectOrder`) + Task 2 (save on drop). ✓
- New projects still appear (saved-first, append-new, drop-missing) → Task 1 (`mergeProjectOrder`) + Task 2 (Step 3). ✓
- Filters keep arrangement → Task 2 Step 3 orders `projects` before `filtered` derives from it. ✓
- "Reset order" control → Task 2 (Steps 4, 6). ✓
- Sidebar edit-mode discoverability, no engine rebuild → Task 3. ✓
- Recoverable sidebar removal → existing Reset, verified in Task 3 Step 4. ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"add tests for the above" — all steps carry concrete code and exact commands. ✓

**3. Type consistency:** `moveIdBefore`, `mergeProjectOrder`, `loadProjectOrder`, `saveProjectOrder`, `clearProjectOrder`, `PROJECT_ORDER_KEY` are defined in Task 1 and consumed verbatim in Task 2. `ProjectCard`'s new optional props (`draggable`, `dragging`, `onDragStart`, `onDragEnd`, `onDropBefore`) are defined and passed with matching names/types in Task 2 Steps 5–6. `enterLayoutEdit`/`layoutEditMode` used in Task 3 already exist in `Sidebar.tsx`. ✓
