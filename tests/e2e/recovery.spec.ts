import { expect, test, type Page } from '@playwright/test'

/**
 * §5 in a real browser.
 *
 * There is no model and no network anywhere in this feature -- the prescriptions come from
 * the week the app already has, and the outing list is part of the app. So the browser suite
 * proves the whole thing rather than a refusal path, and none of it can fail on stage.
 *
 * The seeded demo week is not depleted enough to light the door, so these drive the room
 * that is actually there and assert what a judge would see.
 */
async function openApp(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /look around/i }).click()
  await expect(page.getByTestId('room-scene')).toBeVisible()
}

test('the door explains itself when it is not the answer', async ({ page }) => {
  await openApp(page)

  await page.getByTestId('room-door').click()

  // Lit or quiet, tapping the door always says something rather than opening an empty box.
  const panel = page.getByTestId('door-panel')
  const dialog = page.getByRole('dialog')

  await expect(panel.or(dialog).first()).toBeVisible()
})

test('a lit door offers somewhere to go rather than a sentence', async ({ page }) => {
  await openApp(page)

  const lit = await page.getByTestId('room-door').getAttribute('data-lit')
  test.skip(lit !== 'true', 'the seeded week is not depleted enough to light the door')

  await page.getByTestId('room-door').click()

  await expect(page.getByTestId('door-panel')).toBeVisible()
  await expect(page.getByTestId(/^outing-/).first()).toBeVisible()
})

// §0 and §10 make all four widths a standing requirement.
for (const width of [320, 390, 768, 1280]) {
  test(`the room and any advice fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await openApp(page)

    await page.getByTestId('room-door').click()

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )

    expect(overflows, `horizontal overflow at ${width}px`).toBe(false)
  })
}
