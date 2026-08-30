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

const BOARDS = [
  { nav: /CDL QR code/, prefix: 'cdl' },
  { nav: /Penwork QR code/, prefix: 'penwork' },
]

function slug(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function shotSet(page, legend, labels, prefix) {
  const fieldset = page.locator('fieldset').filter({ has: page.locator('legend', { hasText: legend }) })
  await fieldset.first().scrollIntoViewIfNeeded()
  const print = page.getByTestId('qr-print-card')
  const live = page.getByTestId('qr-customize-preview')
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]
    const btn = fieldset.getByRole('button', { name: label, exact: true }).first()
    await btn.click()
    await live.locator('canvas').waitFor({ timeout: 15_000 })
    await print.locator('canvas').waitFor({ timeout: 15_000 })
    await page.waitForTimeout(200)
    const n = String(i + 1).padStart(2, '0')
    const base = `${prefix}-${n}-${slug(label)}`
    const printStage = print.locator('[data-frame]')
    const liveStage = live.locator('[data-frame]')
    if (await printStage.count()) {
      await printStage.first().screenshot({ path: `${OUT}/${base}-print.png` })
    } else {
      await print.screenshot({ path: `${OUT}/${base}-print.png` })
    }
    if (await liveStage.count()) {
      await liveStage.first().screenshot({ path: `${OUT}/${base}-live.png` })
    } else {
      await live.screenshot({ path: `${OUT}/${base}-live.png` })
    }
    console.log('wrote', base)
  }
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } })
mkdirSync(OUT, { recursive: true })
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' })
const nav = page.getByRole('navigation', { name: 'Primary navigation' })

for (const board of BOARDS) {
  await nav.getByRole('button', { name: board.nav }).click()
  await page.getByTestId('qr-customize-preview').waitFor({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Reset' }).first().click()
  await page.waitForTimeout(300)
  await shotSet(page, 'Frames', FRAMES, `${board.prefix}-frame`)
  await shotSet(page, 'Restaurants & Bars', RESTAURANTS, `${board.prefix}-rest`)
}

await browser.close()
console.log('done', OUT)
