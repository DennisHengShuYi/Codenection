import { expect, test, type Page } from '@playwright/test'

/**
 * The planner in a real browser.
 *
 * No Groq key is configured for this suite, so every test here drives the rule-based
 * parser -- which is also the path CI and a network-less demo take. That is deliberate
 * rather than a limitation: the one feature a student cannot do without must not depend on
 * a model being reachable.
 */
async function openPlanner(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /look around/i }).click()
  await page.getByTestId('open-planner').click()
}

test('turns a brain dump into a week', async ({ page }) => {
  await openPlanner(page)

  await page.getByLabel(/on your mind/i).fill('essay due friday, gym, laundry')
  await page.getByRole('button', { name: /read this/i }).click()

  await expect(page.getByTestId(/^chip-/).first()).toBeVisible()

  await page.getByRole('button', { name: /add these/i }).click()

  // Back to the room, now drawing a week the student actually entered.
  await expect(page.getByTestId('room-scene')).toBeVisible()
})

// §0 and §10 make all four widths a standing requirement, and a form full of controls is
// the likeliest thing after the room to break it.
for (const width of [320, 390, 768, 1280]) {
  test(`the planner fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await openPlanner(page)

    await page.getByLabel(/on your mind/i).fill('essay due friday 2000 words, gym, laundry')
    await page.getByRole('button', { name: /read this/i }).click()
    await expect(page.getByTestId(/^chip-/).first()).toBeVisible()

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )

    expect(overflows, `horizontal overflow at ${width}px`).toBe(false)
  })
}
