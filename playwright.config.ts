import { defineConfig, devices } from '@playwright/test'

/** Matches `server.port` in `vite.config.ts` (default 5175; `strictPort: false` may shift if busy). */
const DEV_ORIGIN = 'http://localhost:5175'

export default defineConfig({
  testDir: './tests',
  testMatch: ['visual/**/*.spec.ts', 'a11y/**/*.spec.ts'],
  retries: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  /**
   * Full-page visual diffs of live dashboard zones carry irreducible jitter
   * (sub-pixel AA, gradient/canvas rendering) that measures a steady 1–2% of
   * pixels run-to-run even with `document.fonts.ready` awaited and animations
   * disabled. `threshold` (per-pixel colour) filters trivial AA; the 3%
   * `maxDiffPixelRatio` clears that noise floor with margin while still
   * catching a real regression (>~39k meaningfully-changed pixels at 1440×900).
   */
  expect: {
    toHaveScreenshot: {
      threshold: 0.2,
      maxDiffPixelRatio: 0.03,
    },
  },
  use: {
    baseURL: DEV_ORIGIN,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: DEV_ORIGIN,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 820, height: 1180 },
      },
    },
  ],
})
