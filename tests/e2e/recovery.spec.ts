import { expect, test, type Page } from '@playwright/test'

/**
 * §5 in a real browser.
 *
 * There is no model and no network anywhere in this feature -- the prescriptions come from
 * the week the app already has, and the advice is part of the app. So the browser suite
 * proves the whole thing rather than a refusal path, and none of it can fail on stage.
 *
 * The door is no longer the way in. §7 deleted the door's own outings menu (`outings.ts`,
 * `DoorPanel.tsx`) because handing a depleted student three places to choose between is a
 * menu wearing a different hat, and §3 made the room display only -- so the door is a pure
 * readout that opens nothing. §5's advice arrives as a single recovery card that needs no
 * tap at all, which is what these drive.
 *
 * The seeded fortnight starts at social 32, below `prescribe`'s threshold of 40 and above
 * §1.5's low-energy threshold of 20, so the card is genuinely on the screen a judge opens.
 */
async function openApp(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /look around/i }).click()
  await expect(page.getByTestId('room-scene')).toBeVisible()

  // Ruling 61: the live cards wait behind the `Waiting` button rather than stacking under
  // the drawing, so reaching the advice starts with the press a student would make.
  await page.getByTestId('open-notices').click()
  await expect(page.getByRole('dialog', { name: /waiting/i })).toBeVisible()
}

// Advice with nothing to discover first: no object to find, no tap to guess at.
test('offers the advice without anything to open first', async ({ page }) => {
  await openApp(page)

  const card = page.getByTestId('recovery-card')
  await expect(card).toBeVisible()
  await expect(card).not.toHaveText('')
})

/**
 * What survives from "a lit door offers somewhere to go rather than a sentence": the
 * advice has to be a thing that can be *done*, not a paragraph to read and close. The
 * outings list is gone; the two buttons that make the card actionable are not.
 */
test('offers something to do rather than a sentence to read', async ({ page }) => {
  await openApp(page)

  const card = page.getByTestId('recovery-card')
  await expect(card.getByRole('button', { name: /put it in my week/i })).toBeVisible()
  await expect(card.getByRole('button', { name: /not today/i })).toBeVisible()
})

// §0 and §10 make all four widths a standing requirement. Since Ruling 61 the card is in
// the sheet rather than below the room, so this measures the sheet with advice in it.
for (const width of [320, 390, 768, 1280]) {
  test(`the room and any advice fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await openApp(page)

    await expect(page.getByTestId('recovery-card')).toBeVisible()

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )

    expect(overflows, `horizontal overflow at ${width}px`).toBe(false)
  })
}
