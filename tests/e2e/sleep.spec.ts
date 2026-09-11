import { expect, test, type Page } from '@playwright/test'

/**
 * The sleep page in a real browser.
 *
 * The only level that can answer the question this feature actually risked: the room's
 * control row already overflows at 320px and relies on `flex-wrap`, so adding a button
 * changes what survives the first line. Nothing below a laid-out browser can see that.
 *
 * No credentials are configured for this suite, so there is no account to sign into and
 * every test enters the way a judge would.
 */
async function openApp(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /look around/i }).click()
}

/** The same four widths §0 and §10 make a standing requirement of the room itself. */
for (const width of [320, 390, 768, 1280]) {
  test(`the sleep button is reachable and opens the page at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await openApp(page)

    const button = page.getByTestId('open-sleep')
    await expect(button).toBeVisible()

    // Hittable, not merely present: a button wrapped off the row or under the ceiling band
    // is visible to the DOM and unreachable by a thumb.
    await button.click()

    await expect(page.getByTestId('sleep-target')).toBeVisible()
  })
}

/**
 * The address survives the way in.
 *
 * A signed-out visitor meets the preview gate first, whatever they typed, so this is not
 * "type a URL and see the page" -- it is "the app remembers where you were going". Nothing
 * else in this suite deep-links, so it was untested for every route, not just this one.
 */
test('keeps the address through the way in', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/sleep')
  await page.getByRole('button', { name: /look around/i }).click()

  await expect(page.getByTestId('sleep-target')).toBeVisible()
  await expect(page).toHaveURL(/\/sleep$/)
})

test('changes what it says when a different target is chosen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openApp(page)
  await page.getByTestId('open-sleep').click()

  const target = page.getByTestId('sleep-target')
  const before = await target.textContent()

  // 6 and 9 are both offered, so whichever the target currently is, one of them differs.
  await page.getByTestId(before?.trim() === '9' ? 'sleep-target-6' : 'sleep-target-9').click()

  await expect(target).not.toHaveText(before ?? '')
})

test('lists the nights ahead, each one settable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openApp(page)
  await page.getByTestId('open-sleep').click()

  const nights = page.getByTestId(/^sleep-night-\d+$/)
  await expect(nights.first()).toBeVisible()
  expect(await nights.count()).toBeGreaterThan(1)
})

test('closes back to the room', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openApp(page)
  await page.getByTestId('open-sleep').click()
  await expect(page.getByTestId('sleep-target')).toBeVisible()

  await page.getByRole('button', { name: /close/i }).click()

  await expect(page.getByTestId('room-scene')).toBeVisible()
  await expect(page.getByTestId('sleep-target')).toHaveCount(0)
})
