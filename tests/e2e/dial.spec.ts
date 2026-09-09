import { expect, test, type Page } from '@playwright/test'

/**
 * Every browser test enters the way a judge would: no credentials are configured for
 * this suite, so there is no account to sign into, and the signed-out preview is the
 * only door.
 */
async function openApp(page: Page, path = '/') {
  await page.goto(path)
  await page.getByRole('button', { name: /look around/i }).click()
}

/**
 * The glance layer in a real browser.
 *
 * §0 and §10 make all four widths a standing requirement rather than a polish pass, and
 * an unasserted requirement is one that quietly regresses.
 */
for (const width of [320, 390, 768, 1280]) {
  test(`the dial fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await openApp(page)

    // §1.2's dial lives behind the light now, which already means the reserve.
    await page.getByTestId('object-light').click()
    await expect(page.getByTestId('capacity-value')).toBeVisible()
    await expect(page.getByTestId('dial-gauge')).toBeVisible()

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )

    expect(overflows, `horizontal overflow at ${width}px`).toBe(false)
  })
}

test('shows five domain bars, each against its own ceiling', async ({ page }) => {
  await openApp(page)

  await page.getByTestId('object-light').click()
  await expect(page.getByRole('meter')).toHaveCount(5)
})

// The one case that proves persistence end to end, through real browser storage rather
// than an in-memory stand-in.
test('keeps the week after a reload', async ({ page }) => {
  await openApp(page)

  await page.getByTestId('object-ceiling').click()
  await page.getByTestId('rebalance').click()
  await expect(page.getByTestId('rebalance-report')).toBeVisible()

  await page.getByTestId('zoom-back').click()
  await page.getByTestId('object-light').click()
  const after = await page.getByTestId('capacity-value').textContent()

  // Re-entering through the preview, because choosing to look around is not remembered
  // across a reload -- a signed-out visitor meets the sign-in screen again. That is
  // friction worth knowing about, and it does not affect what this test is proving: the
  // week itself survives in browser storage.
  await page.reload()
  await page.getByRole('button', { name: /look around/i }).click()
  await page.getByTestId('object-light').click()

  await expect(page.getByTestId('capacity-value')).toHaveText(after ?? '')
})
