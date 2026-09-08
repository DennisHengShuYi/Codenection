import { expect, test } from '@playwright/test'

/**
 * The engine and solver, exercised in a real browser.
 *
 * Every other test in this repository runs under Node or jsdom, but this code ships to a
 * phone browser -- §10 puts the optimizer client-side by design, with no backend call.
 * That leaves a gap nothing else covers: whether the model actually runs where it is
 * meant to run, on the built bundle rather than on source transformed by a test runner.
 *
 * The dial's own rendering, its five bars and its behaviour across the four supported
 * widths moved to dial.spec.ts when those elements moved into components. What stays
 * here is what is specifically about the *model* running in a browser.
 */

// §1.5: a full text equivalent of every dial value, treated as a primary view rather
// than a fallback. Asserted here because an accessibility requirement nothing checks is
// an accessibility requirement that quietly rots.
test('states the numbers in words for a screen reader', async ({ page }) => {
  await page.goto('/')

  const summary = page.getByTestId('reserve-text-equivalent')
  await expect(summary).toHaveText(/capacity/i)
  await expect(summary).toHaveText(/\d/)
})

// The projection's deficit crossing reaches the screen through the text equivalent
// rather than through a figure of its own, so this is where it is checked.
test('says whether the fortnight crosses into deficit', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('reserve-text-equivalent')).toHaveText(/deficit/i)
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
