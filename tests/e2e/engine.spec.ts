import { expect, test } from '@playwright/test'

/**
 * The engine and solver, exercised in a real browser.
 *
 * Every other test in this repository runs under Node or jsdom, but this code ships to a
 * phone browser -- §10 puts the optimizer client-side by design, with no backend call.
 * That leaves a gap nothing else covers: whether the model actually runs where it is
 * meant to run, on the built bundle rather than on source transformed by a test runner.
 *
 * These drive the real page, so they also cover §0's no-cold-start rule: every screen has
 * to render something useful with zero user data, and a projection that throws on an
 * empty week would be the first way to break that.
 */

test('renders a capacity figure computed by the engine', async ({ page }) => {
  await page.goto('/')

  const capacity = page.getByTestId('capacity-value')
  await expect(capacity).toBeVisible()

  // A number, not a placeholder or a spinner left behind by a failed calculation.
  await expect(capacity).toHaveText(/^\d{1,3}%$/)
})

test('shows the worst day the projection reaches', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('worst-day-value')).toHaveText(/^\d{1,3}$/)
})

// §1.5: a full text equivalent of every dial value, treated as a primary view rather
// than a fallback. Asserted here because an accessibility requirement nothing checks is
// an accessibility requirement that quietly rots.
test('states the same numbers in words for a screen reader', async ({ page }) => {
  await page.goto('/')

  const summary = page.getByTestId('reserve-text-equivalent')
  await expect(summary).toHaveText(/capacity/i)
  await expect(summary).toHaveText(/\d/)
})

// §2.1 puts the solver on the phone. This proves it runs there, on the shipped bundle.
test('runs the rebalancer in the browser and reports what it changed', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('rebalance').click()

  const report = page.getByTestId('rebalance-report')
  await expect(report).toBeVisible()
  await expect(report).not.toHaveText('')

  // §2.1: never "optimised", always specific about what actually moved.
  await expect(report).not.toHaveText(/optimis|optimiz/i)
})

test('has no horizontal overflow at any supported width', async ({ page }) => {
  // §0 and §10 make all four widths a standing requirement rather than a polish pass.
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )

    expect(overflows, `horizontal overflow at ${width}px`).toBe(false)
  }
})
