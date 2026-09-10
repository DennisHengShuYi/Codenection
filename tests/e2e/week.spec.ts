import { expect, test, type Page } from '@playwright/test'

/**
 * The week screen in a real browser.
 *
 * §4's single-column day grid exists because seven columns could not survive 320px -- one
 * open day, stacked, rather than a week-wide table. Every other surface has its own width
 * spec; this one did not, which is exactly backwards, since the day grid is the one place
 * the app renders a block's own title verbatim and lets it decide the box's width.
 *
 * No credentials are configured for this suite, so every test enters the way a judge would,
 * and the rule-based parser (never the model) is what turns the typed dump into a block --
 * the same path `planner.spec.ts` drives.
 */
async function openApp(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /look around/i }).click()
  await expect(page.getByTestId('room-scene')).toBeVisible()
}

/**
 * A pasted URL or a spaceless course code -- the one shape of title `WeekScreen`'s comment
 * calls out by name as the reason the day grid's blocks carry `break-words`. No comma, no
 * weekday name: a fragment `parseWithRules` will not split further and will not date, so it
 * lands on `addItems`'s `DEFAULT_DAY` (2) rather than wherever a deadline happened to point.
 */
const UNBROKEN_TITLE =
  'httpsportaluniversityeducoursesCS3213assignment2submissioninstructionsandmarkingrubricdetails2026extralongtoken'

const DEFAULT_DAY = 2

/**
 * Types the long-title dump in through the planner and opens the week with day 2 -- the
 * block's day -- already expanded, exactly as a student checking on it would leave it.
 */
async function openWeekWithLongTitleBlock(page: Page) {
  await openApp(page)

  await page.getByTestId('open-add').click()
  await page.getByTestId('add-type').click()

  await page.getByLabel(/on your mind/i).fill(UNBROKEN_TITLE)
  await page.getByRole('button', { name: /read this/i }).click()
  await expect(page.getByTestId(/^chip-/).first()).toBeVisible()

  // §43: an item that does not say when it happens cannot be added, so the day is answered
  // on the chip first -- the same press a student makes. Day 2 rather than today, so what
  // lands is distinguishable from something the seed put there.
  for (const select of await page.getByTestId(/^when-day-/).all()) {
    await select.selectOption('2')
  }

  await page.getByRole('button', { name: /add these/i }).click()
  await expect(page.getByTestId('room-scene')).toBeVisible()

  await page.getByTestId('open-week').click()
  await page.getByTestId(`day-${DEFAULT_DAY}`).click()

  await expect(page.getByTestId('day-grid')).toBeVisible()
  await expect(page.getByText(UNBROKEN_TITLE)).toBeVisible()
}

/**
 * §0 and §10 make all four widths a standing requirement. A previous measurement passed
 * using only short block titles and missed a real overflow -- `break-words` on a fragment
 * short enough to fit never gets exercised, so the guard proved nothing about the one title
 * shape that can actually force the box wider than the column.
 */
for (const width of [320, 390, 768, 1280]) {
  test(`the week screen fits at ${width}px, with a day open and a long unbroken title`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    await openWeekWithLongTitleBlock(page)

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )

    expect(overflows, `horizontal overflow at ${width}px`).toBe(false)
  })
}

test('opens a block from the day grid', async ({ page }) => {
  await openWeekWithLongTitleBlock(page)

  await page.getByText(UNBROKEN_TITLE).click()

  await expect(page.getByRole('dialog')).toBeVisible()
})
