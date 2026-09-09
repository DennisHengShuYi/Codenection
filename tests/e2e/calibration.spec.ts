import { expect, test, type Page } from '@playwright/test'

/**
 * §7 in a real browser. No model, no key, no network — calibration is entirely local.
 *
 * The painter is a 3×24 grid of buttons and is the densest control in the app, so the width
 * checks matter more here than anywhere except the room.
 */
async function openCalibration(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /look around/i }).click()
  await page.getByTestId('object-mirror').click()
}

// §7.7: nothing is gated behind calibration.
test('the room works before anything has been calibrated', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /look around/i }).click()

  await expect(page.getByTestId('room-scene')).toBeVisible()
  await expect(page.getByTestId('object-mirror')).toBeVisible()
})

test('offers the mode picker, the painter and the payoff together', async ({ page }) => {
  await openCalibration(page)

  await expect(page.getByTestId('calibration-modes')).toBeVisible()
  await expect(page.getByTestId('painter')).toBeVisible()
  await expect(page.getByTestId('how-you-work')).toBeVisible()
})

test('a painted cell changes when it is tapped', async ({ page }) => {
  await openCalibration(page)

  const cell = page.getByTestId('cell-0-9')
  await expect(cell).toHaveAccessibleName(/free/i)

  await cell.click()

  await expect(cell).toHaveAccessibleName(/study/i)
})

// §7.6 is only the sharpest answer to "how is this different from a to-do list" if every
// line on it is true, so an uncalibrated student sees an honest empty state.
test('claims nothing it has not measured', async ({ page }) => {
  await openCalibration(page)

  await expect(page.getByTestId('how-you-work')).toContainText(/nothing measured yet/i)
})

for (const width of [320, 390, 768, 1280]) {
  test(`calibration fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await openCalibration(page)

    await expect(page.getByTestId('painter')).toBeVisible()

    // §10: wide content scrolls inside its own container, never the page.
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )

    expect(overflows, `horizontal overflow at ${width}px`).toBe(false)
  })
}
