import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const ORIGIN = process.env.DEV_ORIGIN || 'http://localhost:5175'
const OUT = process.env.SHOT_DIR || '/tmp/qr-frames'

const FRAMES = [
  'No frame', 'Pill', 'Bar', 'Caption', 'Tag', 'Pointer', 'Balloon',
  'Gift', 'Polaroid', 'Chevron', 'Ribbon', 'Brush', 'Script', 'Bag',
  'Box', 'Phone', 'Arrow',
]
const RESTAURANTS = [
  'No frame', 'Laptop', 'Beer mug', 'Coffee', 'Chef', 'Scooter',
  'Cloche', 'Cocktail', 'Takeout', 'Menu', 'Badge',
]

function slug(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function shotSet(page, legend, labels, prefix) {
  const fieldset = page.locator('fieldset').filter({ has: page.locator('legend', { hasText: legend }) })
  await fieldset.first().scrollIntoViewIfNeeded()
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]
    const btn = fieldset.getByRole('button', { name: label, exact: true }).first()
    await btn.click()
    const preview = page.getByTestId('qr-customize-preview')
    await preview.locator('canvas').waitFor({ timeout: 15_000 })
    await page.waitForTimeout(250)
    const n = String(i + 1).padStart(2, '0')
    const file = `${OUT}/${prefix}-${n}-${slug(label)}.png`
    await preview.screenshot({ path: file })
    const stage = preview.locator('[data-frame]')
    if (await stage.count()) {
      await stage.first().screenshot({ path: `${OUT}/${prefix}-${n}-${slug(label)}-stage.png` })
    }
    console.log('wrote', file)
  }
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
mkdirSync(OUT, { recursive: true })
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' })
const nav = page.getByRole('navigation', { name: 'Primary navigation' })
await nav.getByRole('button', { name: /CDL QR code/ }).click()
await page.getByTestId('qr-customize-preview').waitFor({ timeout: 20_000 })
await shotSet(page, 'Frames', FRAMES, 'frame')
await shotSet(page, 'Restaurants & Bars', RESTAURANTS, 'rest')
await browser.close()
console.log('done', OUT)
