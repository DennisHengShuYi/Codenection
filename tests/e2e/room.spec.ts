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

/**
 * The inverse of the test this replaces.
 *
 * `opens an object when it is tapped` drove `object-plant` into a `zoom-plant` layer. §3
 * deleted both: the room is a picture of the week, and every feature it used to hide behind
 * a tap now has a button of its own (`The week`, `Add something`, `Settings`) or a card on
 * the screen. So the old assertion is not merely stale, it asserts the opposite of the
 * design -- and it is worth one test that the tap targets stay gone, because "make the
 * furniture clickable again" is exactly the kind of change that reads as an improvement.
 */
test('draws the room without turning any of it back into a control', async ({ page }) => {
  await openApp(page)

  const scene = page.getByTestId('room-scene')
  await expect(scene).toBeVisible()

  // A CSS locator rather than getByRole: the scene declares role="img", which hides its
  // whole subtree from the accessibility tree, so an aria query inside it would report
  // zero controls whether or not any existed -- a guard that cannot fail.
  await expect(scene.locator('button, a, [role="button"], [role="link"]')).toHaveCount(0)

  // And the behavioural half, the exact inverse of the deleted assertion: the plant was
  // what `opens an object when it is tapped` drove, and tapping it now opens nothing.
  await scene.getByTestId('room-plant').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('sheet')).toHaveCount(0)
})
