import { expect, test, type Page } from '@playwright/test'

/**
 * Theme persistence — `src/context/ThemeContext.tsx` (`ui-theme`, `ui-accent`, `ui-density`).
 * Active route is React state in `src/MAINsamuelXdashboardFile.tsx` (not localStorage); navigation uses sidebar labels
 * from `src/components/sidebar/navigation.ts` + `TOOLS_REGISTRY` labels.
 */
const THEME_STORAGE_KEY = 'ui-theme' as const

/** Default nav order — `src/components/sidebar/sidebarNavLayout.ts` */
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
 * Runs in the browser via `addInitScript`. It must be a pure function of its
 * single `seed` argument — Playwright serializes the function body and re-runs
 * it in page context, so any reference to module-scope constants (the KEY
 * consts, `theme`) would be `undefined` there and silently no-op the seeding.
 */
function seedForVisualRun(seed: SeedConfig) {
  localStorage.removeItem(seed.layoutKey)
  localStorage.removeItem(seed.legacyKey)
  localStorage.setItem(seed.themeKey, seed.theme)
  localStorage.setItem('ui-accent', 'purple')
  localStorage.setItem('ui-density', 'comfy')
}

async function gotoHome(page: Page, theme: ThemeMode) {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
}

/**
 * Logical route ids requested for baselines → sidebar primary label.
 * Patterns are anchored at the start and case-sensitive: nav items are
 * title-case ("Mixing") while section headers are upper-case ("MIXING"), so
 * `/^Mixing/` targets the item without matching the header. Unanchored at the
 * end so trailing badge text ("… 2 new updates", counts) does not break the
 * match. Labels verified against the live sidebar a11y tree.
 * `production` and `agent-farm` both land on the PRODUCTION → Agent farm item.
 */
const ZONE_CASES: ReadonlyArray<{ slug: string; navPattern: RegExp }> = [
  { slug: 'production', navPattern: /^Agent farm/ },
  { slug: 'mixing', navPattern: /^Mixing/ },
  { slug: 'pulse', navPattern: /^Pulse digest/ },
  { slug: 'tools-hub', navPattern: /^Tools hub/ },
  { slug: 'tools-key-finder', navPattern: /^Key & STEM/ },
  { slug: 'harmony-stack', navPattern: /^Harmony services/ },
  { slug: 'cpw', navPattern: /^All projects/ },
  { slug: 'agent-farm', navPattern: /^Agent farm/ },
  { slug: 'web-designer', navPattern: /^Web designer/ },
  { slug: 'dev-settings', navPattern: /^Dev settings/ },
]

async function openZoneFromSidebar(page: Page, navPattern: RegExp) {
  const nav = page.getByRole('navigation', { name: 'Primary navigation' })
  const btn = nav.getByRole('button', { name: navPattern })
  await btn.click()
  await expect(btn).toHaveAttribute('aria-current', 'page', { timeout: 15_000 })
}

for (const { slug, navPattern } of ZONE_CASES) {
  test.describe(`${slug}`, () => {
    for (const theme of ['light', 'dark'] as const) {
      test(`${theme}`, async ({ page }) => {
        await page.addInitScript(seedForVisualRun, {
          theme,
          themeKey:  THEME_STORAGE_KEY,
          layoutKey: SIDEBAR_LAYOUT_KEY,
          legacyKey: SIDEBAR_LAYOUT_LEGACY_KEY,
        })
        await gotoHome(page, theme)
        await openZoneFromSidebar(page, navPattern)
        // Web fonts must finish loading, else text is captured mid font-swap
        // and produces non-deterministic sub-pixel diffs across runs.
        await page.evaluate(() => document.fonts.ready)
        await expect(page).toHaveScreenshot(`${slug}-${theme}.png`, {
          fullPage: true,
          animations: 'disabled',
        })
      })
    }
  })
}
