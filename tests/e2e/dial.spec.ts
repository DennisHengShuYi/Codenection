import { expect, test } from '@playwright/test'

/**
 * The glance layer in a real browser.
 *
 * §0 and §10 make all four widths a standing requirement rather than a polish pass, and
 * an unasserted requirement is one that quietly regresses.
 */
for (const width of [320, 390, 768, 1280]) {
  test(`the dial fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')

    await expect(page.getByTestId('capacity-value')).toBeVisible()
    await expect(page.getByTestId('dial-gauge')).toBeVisible()

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )

    expect(overflows, `horizontal overflow at ${width}px`).toBe(false)
  })
}

test('shows five domain bars, each against its own ceiling', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('meter')).toHaveCount(5)
})

// The one case that proves persistence end to end, through real browser storage rather
// than an in-memory stand-in.
test('keeps the week after a reload', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('rebalance').click()
  await expect(page.getByTestId('rebalance-report')).toBeVisible()

  const after = await page.getByTestId('capacity-value').textContent()
  await page.reload()

  await expect(page.getByTestId('capacity-value')).toHaveText(after ?? '')
})
