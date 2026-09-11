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

/**
 * The edit form at every width, opened from a block and carrying a long unbroken title in
 * its own text input.
 *
 * The width guard above proved the day GRID survives 320px; the form is a second surface,
 * with three select pickers and a number input on one row, and it can overflow where the
 * grid does not. Same long-title fixture for the same reason: a short title never exercises
 * whether the box can be forced wider than the column.
 */
for (const width of [320, 390, 768, 1280]) {
  test(`the edit form fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await openWeekWithLongTitleBlock(page)

    await page.getByText(UNBROKEN_TITLE).click()
    await page.getByTestId('edit-block').click()
    await expect(page.getByLabel('What')).toBeVisible()

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )

    expect(overflows, `horizontal overflow at ${width}px`).toBe(false)
  })
}

/**
 * The whole manual round trip, in a real browser and across a real reload: put a block in by
 * hand, on a day chosen from the grid, and find it still there after the page is thrown away
 * and rebuilt from storage.
 *
 * The reload is the half no jsdom test covers -- `setSchedule` persisting is tested, but not
 * that a hand-added block comes back out of the browser's own database looking the same.
 */
test('a block added by hand survives a reload', async ({ page }) => {
  await openApp(page)

  await page.getByTestId('open-week').click()
  await page.getByTestId('day-4').click()
  await page.getByTestId('add-block').click()

  await expect(page.getByRole('dialog', { name: /add a block/i })).toBeVisible()
  await page.getByLabel('What').fill('Coffee with Sam')
  await page.getByTestId('save-block').click()

  await expect(page.getByRole('dialog', { name: /the week/i })).toBeVisible()

  /*
   * Wait for the write to actually land before reloading.
   *
   * `useSchedule.setSchedule` fires `saveWeek` and does not await it -- deliberately, so a
   * slow write cannot block the screen the student is looking at. That leaves a real race
   * against a reload in the very next instant, and reloading blind made this test flaky
   * (passing alone, failing about one run in three in the full suite). Polling the store the
   * app actually writes to says exactly what is being waited for, rather than hiding the
   * race behind a sleep. The race itself is pre-existing and applies to every edit path, not
   * just this one.
   */
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<string>((resolve) => {
              const request = indexedDB.open('codenection')
              request.onerror = () => resolve('')
              request.onsuccess = () => {
                const db = request.result
                if (!db.objectStoreNames.contains('state')) return resolve('')
                const read = db.transaction('state', 'readonly').objectStore('state').get('week')
                read.onerror = () => resolve('')
                read.onsuccess = () => resolve(JSON.stringify(read.result ?? ''))
              }
            }),
        ),
      { timeout: 10_000 },
    )
    .toContain('Coffee with Sam')

  await page.reload()

  // Looking around is session state, so a reload returns a visitor with no account to the
  // way in. Pre-existing behaviour and nothing to do with the block -- but it has to be
  // walked through again before the week is reachable, which is the point: the block has to
  // survive coming back out of the browser's own database, not just out of React.
  await page.getByRole('button', { name: /look around/i }).click()

  // No second click on `The week`: the address survived the reload, so the week sheet comes
  // back open on its own. That is Ruling 57 working -- the URL is where the student is, not
  // a decoration on top of React state -- and clicking again would only hit the backdrop.
  await expect(page.getByRole('dialog', { name: /the week/i })).toBeVisible()
  await page.getByTestId('day-4').click()

  await expect(page.getByText('Coffee with Sam')).toBeVisible()
})

/**
 * Removing names the block, and "Keep it" genuinely keeps it.
 *
 * The confirmation IS the safeguard -- there is no undo behind it -- so it is worth proving
 * in a real browser that the cancelling answer does nothing at all.
 */
test('removing a block asks first, and keeping it changes nothing', async ({ page }) => {
  await openWeekWithLongTitleBlock(page)

  await page.getByText(UNBROKEN_TITLE).click()
  await page.getByTestId('remove-block').click()
  await expect(page.getByTestId('confirm-remove')).toContainText(/takes it out of your week/i)

  await page.getByTestId('sheet-actions').getByRole('button', { name: 'Keep it' }).click()
  await expect(page.getByTestId('block-when')).toBeVisible()

  await page.getByTestId('remove-block').click()
  await page.getByTestId('confirm-remove-yes').click()

  await expect(page.getByRole('dialog', { name: /the week/i })).toBeVisible()
  await page.getByTestId(`day-${DEFAULT_DAY}`).click()
  await expect(page.getByText(UNBROKEN_TITLE)).toHaveCount(0)
})
