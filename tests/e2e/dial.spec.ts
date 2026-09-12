import { expect, test, type Page } from '@playwright/test'
import { expectWeekStored } from './storedWeek'
import { answerEveryChipDay } from './chipDay'

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
 * The glance layer in a real browser.
 *
 * §0 and §10 make all four widths a standing requirement rather than a polish pass, and
 * an unasserted requirement is one that quietly regresses.
 *
 * The dial used to live behind a tap on the light. §1.1's "no tap required" reading is now
 * the room's own corner gauge, and §1.2's five-bar breakdown -- which Ruling 28 rescued from
 * orphanhood and Ruling 53 moved off the room, because the room was reading capacity twice
 * -- lives one tap behind that gauge since Ruling 59. The compact readout is the door to
 * the full one, rather than the breakdown sitting under a calendar on the week screen.
 */
for (const width of [320, 390, 768, 1280]) {
  test(`the breakdown fits at ${width}px, one tap behind the gauge`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await openApp(page)

    await page.getByTestId('room-gauge').click()

    await expect(page.getByRole('dialog', { name: /reserves/i })).toBeVisible()
    await expect(page.getByTestId('capacity-value')).toBeVisible()
    await expect(page.getByTestId('dial-gauge')).toBeVisible()

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )

    expect(overflows, `horizontal overflow at ${width}px`).toBe(false)
  })
}

/**
 * The breakdown is the point of this sheet, and the gauge was eating it.
 *
 * The arc was `w-full` on a viewBox carrying no width, so it scaled with whatever contained
 * it: in a 512px sheet that is a 294px-tall needle above a 48px number, and the five bars
 * the sheet exists for started below the fold behind a scrollbar.
 *
 * The bound is on the gauge itself rather than on where a bar lands, because that is the
 * thing being constrained -- a test that measured the first bar passed at every width while
 * the sheet was still mostly needle, since the first bar was never the one pushed off.
 */
for (const width of [320, 390, 768, 1280]) {
  test(`the gauge stays a readout rather than the page at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await openApp(page)

    await page.getByTestId('room-gauge').click()
    await expect(page.getByRole('dialog', { name: /reserves/i })).toBeVisible()

    const gauge = await page.getByTestId('dial-gauge').boundingBox()

    expect(gauge, 'the gauge has no box').not.toBeNull()
    expect(gauge?.height ?? 0, `the gauge is ${gauge?.height}px tall at ${width}px`).toBeLessThanOrEqual(140)
  })
}

test('shows five domain bars, each against its own ceiling', async ({ page }) => {
  await openApp(page)

  // The room reads capacity exactly once, as its corner gauge (Ruling 53). The five-bar
  // dashboard §1.5 says a depleted student should not be handed is not on the landing
  // screen -- and this half of the assertion fails on the version that shipped.
  await expect(page.getByTestId('room-gauge')).toBeVisible()
  await expect(page.getByRole('meter')).toHaveCount(0)

  await page.getByTestId('room-gauge').click()

  await expect(page.getByRole('meter')).toHaveCount(5)
})

/**
 * The one case that proves persistence end to end, through real browser storage rather
 * than an in-memory stand-in.
 *
 * It reads a block the student added rather than the dial's own percentage, which is what
 * it used to compare across the reload. That comparison could never have failed: the
 * capacity figure is `overallReserve(week.start)`, and a week that failed to persist falls
 * back to the same seeded fortnight with the same starting reserves -- so the number was
 * identical whether or not anything was stored. A block that exists only because it was
 * typed in cannot come back from the seed.
 */
test('keeps the week after a reload', async ({ page }) => {
  const title = 'persistedreloadmarker'

  await openApp(page)

  await page.getByTestId('open-add').click()
  await page.getByTestId('add-type').click()
  await page.getByLabel(/on your mind/i).fill(title)
  await page.getByRole('button', { name: /read this/i }).click()
  await expect(page.getByTestId(/^chip-/).first()).toBeVisible()

  // §43: an item that does not say when it happens cannot be added, so the day is answered
  // on the chip first -- the same press a student makes. Day 2 rather than today, so what
  // lands is distinguishable from something the seed put there.
  await answerEveryChipDay(page)
  await page.getByRole('button', { name: /add these/i }).click()
  await expect(page.getByTestId('room-scene')).toBeVisible()

  // The add fires the write and does not await it, so reloading in the very next instant
  // races it -- which is what made this test pass locally and fail on CI.
  await expectWeekStored(page, title)

  // Re-entering through the preview, because choosing to look around is not remembered
  // across a reload -- a signed-out visitor meets the sign-in screen again. That is
  // friction worth knowing about, and it does not affect what this test is proving: the
  // week itself survives in browser storage.
  await page.reload()
  await page.getByRole('button', { name: /look around/i }).click()

  await page.getByTestId('open-week').click()
  // Day 2 is `addItems`' DEFAULT_DAY -- where a fragment with no date and no weekday
  // lands. Same reasoning as `week.spec.ts`'s own long-title fixture.
  await page.getByTestId('day-2').click()
  await expect(page.getByTestId('day-grid')).toBeVisible()
  await expect(page.getByText(title)).toBeVisible()
})
