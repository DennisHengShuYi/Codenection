import { expect, test, type Page } from '@playwright/test'

/**
 * The request box in a real browser.
 *
 * Unlike photo import, there is no gap here: the parser and the drafts both have real
 * fallbacks, so the whole feature works with no key and these tests prove the whole thing
 * rather than a refusal path. That is also the state the demo laptop is in.
 */
async function openRequest(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /look around/i }).click()
  await page.getByTestId('open-request').click()
}

async function priceIt(page: Page) {
  await page
    .getByLabel(/what.*asked/i)
    .fill('can you help with our group project, 6 hours, by friday')
  await page.getByRole('button', { name: /what would this cost/i }).click()
  await expect(page.getByTestId('request-cost')).toBeVisible()
}

test('prices a pasted request and shows both rooms', async ({ page }) => {
  await openRequest(page)
  await priceIt(page)

  // §2.3, via §1.3: the warning is shown as two rooms.
  await expect(page.getByTestId('room-comparison')).toBeVisible()
})

test('offers all three drafted tones', async ({ page }) => {
  await openRequest(page)
  await priceIt(page)

  await expect(page.getByTestId('draft-decline')).toBeVisible()
  await expect(page.getByTestId('draft-defer')).toBeVisible()
  await expect(page.getByTestId('draft-accept')).toBeVisible()
})

// §0 and §10 make all four widths a standing requirement, and two rooms plus three drafts
// is the busiest screen in the app.
for (const width of [320, 390, 768, 1280]) {
  test(`the request box fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await openRequest(page)
    await priceIt(page)

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )

    expect(overflows, `horizontal overflow at ${width}px`).toBe(false)
  })
}

/**
 * §10 is firm that two rooms never sit side by side on a phone. Asserted geometrically
 * rather than by reading a class name, so a later restyle that breaks it cannot pass.
 */
test('the two rooms stack rather than sitting side by side on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await openRequest(page)
  await priceIt(page)

  const rooms = page.getByTestId('room-comparison').locator('svg')
  const first = await rooms.nth(0).boundingBox()
  const second = await rooms.nth(1).boundingBox()

  expect(first).not.toBeNull()
  expect(second).not.toBeNull()
  // Stacked means the second starts below the first, not beside it.
  expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height - 1)
})
