import { expect, test, type Page } from '@playwright/test'
import { answerEveryChipDay } from './chipDay'

/**
 * §4.1's ladder in a real browser.
 *
 * `npm run preview` serves the built static app and never serves /api, so every chain here
 * is the rule chain -- which is the point, not a limitation: the offline path is the one a
 * judge, a CI run and a student on a dying connection all get, and it has to be a real
 * answer rather than an apology.
 *
 * The claim worth driving a browser for is the one the §4.1 amendment rests on: the chain
 * exists in full and exactly one rung is ever on the page. A component test can assert the
 * rung it expects; only this can assert nothing else got rendered around it.
 */
const TITLE = 'Laundry and the bins'

const DEFAULT_DAY = 2

async function openApp(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /look around/i }).click()
  await expect(page.getByTestId('room-scene')).toBeVisible()
}

/** Types one block in through the planner and opens it, exactly as a student would. */
async function openTheBlock(page: Page) {
  await openApp(page)

  await page.getByTestId('open-add').click()
  await page.getByTestId('add-type').click()

  await page.getByLabel(/on your mind/i).fill(TITLE)
  await page.getByRole('button', { name: /read this/i }).click()
  await expect(page.getByTestId(/^chip-/).first()).toBeVisible()

  // §43: an item that does not say when it happens cannot be added, so the day is answered
  // on the chip first -- the same press a student makes.
  await answerEveryChipDay(page, DEFAULT_DAY)

  await page.getByRole('button', { name: /add these/i }).click()
  await expect(page.getByTestId('room-scene')).toBeVisible()

  await page.getByTestId('open-week').click()
  await page.getByTestId(`day-${DEFAULT_DAY}`).click()
  await page.getByText(TITLE).click()

  await expect(page.getByRole('dialog')).toBeVisible()
}

test('carries a stuck student one step at a time', async ({ page }) => {
  await openTheBlock(page)

  await page.getByTestId('micro-start').click()

  const action = page.getByTestId('rung-action')
  await expect(action).toBeVisible()
  await expect(page.getByTestId('ladder-progress')).toHaveText(/Step 1 of \d/)

  const first = (await action.textContent()) ?? ''
  expect(first.length).toBeGreaterThan(0)

  await page.getByRole('button', { name: /next step/i }).click()

  await expect(page.getByTestId('ladder-progress')).toHaveText(/Step 2 of \d/)
  await expect(action).not.toHaveText(first)

  // The amendment's whole claim: the rung just finished is not still sitting on the page,
  // and neither is the one after next. A test asserting only what IS shown would pass on a
  // page that also showed the other five.
  await expect(page.getByText(first, { exact: true })).toHaveCount(0)
  await expect(page.getByTestId('rung-action')).toHaveCount(1)
})

test('resumes where it was left after a reload', async ({ page }) => {
  await openTheBlock(page)
  await page.getByTestId('micro-start').click()
  await expect(page.getByTestId('rung-action')).toBeVisible()

  await page.getByRole('button', { name: /next step/i }).click()
  await expect(page.getByTestId('ladder-progress')).toHaveText(/Step 2 of \d/)
  const rung = (await page.getByTestId('rung-action').textContent()) ?? ''

  await page.reload()

  // A reload lands on the sign-in gate, not straight back in the app -- there is no session,
  // so the preview has to be re-entered. The address survives it, which is the point: the
  // student comes back to the page they were on rather than to the room.
  await page.getByRole('button', { name: /look around/i }).click()

  // Same place AND the same words. A chain that re-rolled into different wording for the
  // step somebody had already decided to do would technically resume and still lose them.
  await expect(page.getByTestId('ladder-progress')).toHaveText(/Step 2 of \d/)
  await expect(page.getByTestId('rung-action')).toHaveText(rung)
})

test('goes back to the block it was opened from', async ({ page }) => {
  await openTheBlock(page)
  await page.getByTestId('micro-start').click()
  await expect(page.getByTestId('rung-action')).toBeVisible()

  await page.getByRole('button', { name: /^back$/i }).click()

  await expect(page.getByTestId('block-when')).toBeVisible()
})

/** §0 and §10 make all four widths a standing requirement. */
for (const width of [320, 390, 768, 1280]) {
  test(`the micro-start page fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await openTheBlock(page)
    await page.getByTestId('micro-start').click()
    await expect(page.getByTestId('rung-action')).toBeVisible()

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )

    expect(overflows, `horizontal overflow at ${width}px`).toBe(false)
  })
}
