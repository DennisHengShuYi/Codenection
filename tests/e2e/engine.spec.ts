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
 *
 * Neither the breakdown nor the rebalancer is behind a tap on the furniture any more. §1.1's
 * "no tap required" reading is the room's own corner gauge; §1.2's five-bar breakdown and
 * its spoken summary sit one tap BEHIND that gauge (Ruling 59), and the rebalancer is in
 * the week sheet, which `The week` opens. The room itself is display only, so nothing here
 * clicks an object.
 */

/** The one tap between the room and the calendar. */
async function openWeek(page: Page) {
  await openApp(page)
  await page.getByTestId('open-week').click()
}

/** The one tap between the room and the numbers behind its gauge. */
async function openReserves(page: Page) {
  await openApp(page)
  await page.getByTestId('room-gauge').click()
}

// §1.5: a full text equivalent of every dial value, treated as a primary view rather
// than a fallback. Asserted here because an accessibility requirement nothing checks is
// an accessibility requirement that quietly rots.
test('states the numbers in words for a screen reader', async ({ page }) => {
  await openReserves(page)

  const summary = page.getByTestId('reserve-text-equivalent')
  await expect(summary).toHaveText(/capacity/i)
  await expect(summary).toHaveText(/\d/)
})

// The projection's deficit crossing reaches the screen through the text equivalent
// rather than through a figure of its own, so this is where it is checked.
test('says whether the fortnight crosses into deficit', async ({ page }) => {
  await openReserves(page)

  await expect(page.getByTestId('reserve-text-equivalent')).toHaveText(/deficit/i)
})

// §2.1 puts the solver on the phone. This proves it runs there, on the shipped bundle --
// and, since the solve stopped applying itself, that the whole propose-and-approve round
// trip works in a real browser rather than only under jsdom.
test('runs the rebalancer in the browser and reports what it changed', async ({ page }) => {
  await openWeek(page)

  await page.getByTestId('rebalance').click()

  // The offer, before anything has been written.
  const summary = page.getByTestId('proposal-summary')
  await expect(summary).toBeVisible()
  await expect(summary).toHaveText(/^I'd /)
  await expect(page.getByTestId('proposal-moves').locator('li').first()).toBeVisible()
  await expect(page.getByTestId('rebalance-report')).toHaveCount(0)

  await page.getByTestId('approve-rebalance').click()

  const report = page.getByTestId('rebalance-report')
  await expect(report).toBeVisible()
  await expect(report).not.toHaveText('')

  // §2.1: never "optimised", always specific about what actually moved.
  await expect(report).not.toHaveText(/optimis|optimiz/i)
})

// The other half of the gate: a proposal the student walks away from changes nothing.
test('leaves the week alone when the proposal is discarded', async ({ page }) => {
  await openWeek(page)

  await page.getByTestId('rebalance').click()
  await expect(page.getByTestId('discard-rebalance')).toBeVisible()
  await page.getByTestId('discard-rebalance').click()

  await expect(page.getByTestId('rebalance')).toBeVisible()
  await expect(page.getByTestId('rebalance-report')).toHaveCount(0)
})
