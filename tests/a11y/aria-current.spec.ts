import { expect, test, type Page } from '@playwright/test'
import { resolveRouteTitle } from '../../src/lib/routeTitles'

/**
 * Theme persistence — same as `tests/visual/zones.spec.ts`
 * (`src/context/ThemeContext.tsx`: `ui-theme`, `ui-accent`, `ui-density`).
 */
const THEME_STORAGE_KEY = 'ui-theme' as const

const SIDEBAR_LAYOUT_KEY = 'sx-dashboard-sidebar-nav-layout-v1'
const SIDEBAR_LAYOUT_LEGACY_KEY = 'game-studio-sidebar-nav-layout-v1'

type ThemeMode = 'light' | 'dark'

interface SeedConfig {
  theme:     ThemeMode
  themeKey:  string
  layoutKey: string
  legacyKey: string
}

/**
 * Runs in the browser via `addInitScript` — must be a pure function of its
 * single `seed` argument. A function that closed over the module-scope KEY
 * constants would find them `undefined` in page context and silently skip
 * seeding, leaving the app on its default (dark) theme.
 */
function seedForRun(seed: SeedConfig) {
  localStorage.removeItem(seed.layoutKey)
  localStorage.removeItem(seed.legacyKey)
  localStorage.setItem(seed.themeKey, seed.theme)
  localStorage.setItem('ui-accent', 'purple')
  localStorage.setItem('ui-density', 'comfy')
}

const DOC_TITLE_SUFFIX = ' · UI Dashboard x'

async function gotoHome(page: Page, theme: ThemeMode) {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
}

/** Primary label span inside each nav button (matches `NavItemButton` structure). */
const navPrimaryLabel = (page: Page) =>
  page.locator('[aria-current="page"] span.flex-1.min-w-0.leading-none.truncate')

/**
 * Routes to verify: sidebar click → single `aria-current="page"` → label matches
 * `resolveRouteTitle` and document title (`useDocumentTitle` suffix).
 */
const ROUTE_CASES: ReadonlyArray<{ routeId: string; navPattern: RegExp }> = [
  { routeId: 'tools-hub', navPattern: /^Tools hub/ },
  { routeId: 'tools-key-finder', navPattern: /^Key & STEM/ },
  { routeId: 'harmony-services', navPattern: /^Harmony services/ },
  { routeId: 'cpw-projects', navPattern: /^All projects/ },
  { routeId: 'agent-farm', navPattern: /^Agent farm/ },
  { routeId: 'dev', navPattern: /^Dev settings/ },
]

for (const { routeId, navPattern } of ROUTE_CASES) {
  test.describe(`${routeId}`, () => {
    for (const theme of ['light', 'dark'] as const) {
      test(`aria-current matches title (${theme})`, async ({ page }) => {
        await page.addInitScript(seedForRun, {
          theme,
          themeKey:  THEME_STORAGE_KEY,
          layoutKey: SIDEBAR_LAYOUT_KEY,
          legacyKey: SIDEBAR_LAYOUT_LEGACY_KEY,
        })
        await gotoHome(page, theme)

        const nav = page.getByRole('navigation', { name: 'Primary navigation' })
        const btn = nav.getByRole('button', { name: navPattern })
        await btn.click()

        const current = page.locator('[aria-current="page"]')
        await expect(current).toHaveCount(1, { timeout: 15_000 })

        const expected = resolveRouteTitle(routeId)
        expect(expected.length).toBeGreaterThan(0)

        await expect(navPrimaryLabel(page)).toHaveText(expected)

        await expect(page).toHaveTitle(`${expected}${DOC_TITLE_SUFFIX}`)
      })
    }
  })
}
