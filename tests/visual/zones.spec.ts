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

function seedForVisualRun(theme: ThemeMode) {
  return () => {
    localStorage.removeItem(SIDEBAR_LAYOUT_KEY)
    localStorage.removeItem(SIDEBAR_LAYOUT_LEGACY_KEY)
    localStorage.setItem(THEME_STORAGE_KEY, theme)
    localStorage.setItem('ui-accent', 'purple')
    localStorage.setItem('ui-density', 'comfy')
  }
}

async function gotoHome(page: Page, theme: ThemeMode) {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
}

/**
 * Logical route ids requested for baselines → sidebar primary label (regex where badges alter a11y name).
 * `production` and `agent-farm` both land on the PRODUCTION → Agent Farm item (same `agent-farm` route id).
 */
const ZONE_CASES: ReadonlyArray<{ slug: string; navPattern: RegExp }> = [
  { slug: 'production', navPattern: /Agent Farm/ },
  { slug: 'mixing', navPattern: /Mix board/ },
  { slug: 'pulse', navPattern: /AI digest/ },
  { slug: 'tools-hub', navPattern: /All tools/ },
  { slug: 'tools-key-finder', navPattern: /Key & BPM finder/ },
  { slug: 'harmony-stack', navPattern: /Services & Pricing/ },
  { slug: 'cpw', navPattern: /^Projects$/ },
  { slug: 'agent-farm', navPattern: /Agent Farm/ },
  { slug: 'web-designer', navPattern: /Designer browser/ },
  { slug: 'dev-settings', navPattern: /Settings & API/ },
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
        await page.addInitScript(seedForVisualRun(theme))
        await gotoHome(page, theme)
        await openZoneFromSidebar(page, navPattern)
        await expect(page).toHaveScreenshot(`${slug}-${theme}.png`, {
          fullPage: true,
          animations: 'disabled',
        })
      })
    }
  })
}
