import { expect, test, type Page } from '@playwright/test'

/**
 * The room in a real browser.
 *
 * No credentials are configured for this suite, so there is no account to sign into and
 * every test enters the way a judge would.
 */
async function openApp(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /look around/i }).click()
}

/**
 * §0 and §10 make all four widths a standing requirement. The room is the likeliest
 * thing in the app to break it, being a fixed-proportion drawing on a screen that is not.
 */
for (const width of [320, 390, 768, 1280]) {
  test(`the room fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await openApp(page)

    await expect(page.getByTestId('room-scene')).toBeVisible()

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )

    expect(overflows, `horizontal overflow at ${width}px`).toBe(false)
  })
}

// §1.5: the picture carries nothing to a screen reader, so the words have to be there.
test('states the room in words as well as drawing it', async ({ page }) => {
  await openApp(page)

  await expect(page.getByTestId('room-text-equivalent')).not.toHaveText('')
})

test('opens an object when it is tapped', async ({ page }) => {
  await openApp(page)

  await page.getByTestId('object-plant').click()

  await expect(page.getByTestId('zoom-plant')).toBeVisible()
})
