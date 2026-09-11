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

test('takes a typed target, including one no fixed choice would offer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openApp(page)
  await page.getByTestId('open-sleep').click()

  const target = page.getByTestId('sleep-target')
  await target.fill('6.5')
  // Committed on leaving the field, because a half-typed number is a whole valid one.
  await target.blur()

  await expect(target).toHaveValue('6.5')
})

/** Each night takes one too, independently of the target. */
test('takes a typed figure for one night on its own', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openApp(page)
  await page.getByTestId('open-sleep').click()

  // A figure no night in the demo week already holds -- it puts 5.5 on every weeknight, so
  // choosing one of its own values would make the second assertion prove nothing.
  const tonight = page.getByTestId('sleep-night-0-hours')
  await tonight.fill('3')
  await tonight.blur()

  await expect(tonight).toHaveValue('3')
  // The night beside it is untouched: setting one night is not setting the week.
  await expect(page.getByTestId('sleep-night-1-hours')).not.toHaveValue('3')
})

/** Refused in the field and refused again by `withSleepHours`, so nothing a student can type
 *  reaches a model that computes recovery from it. */
test('says why a figure it cannot use was not taken', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openApp(page)
  await page.getByTestId('open-sleep').click()

  const target = page.getByTestId('sleep-target')
  await target.fill('99')
  await target.blur()

  await expect(page.getByTestId('sleep-target-error')).toHaveCount(1)
  await expect(page.getByTestId('sleep-night-0-hours')).not.toHaveValue('99')
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

/**
 * Seeds the app's own database before it loads, so the two things that need *history* can be
 * seen on screen rather than only proved in a unit test.
 *
 * Writes through `idb-keyval`'s layout -- database `codenection`, store `state`, the keys
 * `localRepository` uses -- because the app reads its own storage and there is no other way
 * to hand it a past. Nothing here touches a credential: this build is made with blanked
 * Supabase values on purpose, so the only store that exists is the one in this browser.
 */
async function seed(page: Page, state: { week: unknown; settings: unknown }) {
  await page.goto('/')
  await page.evaluate(
    ({ week, settings }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('codenection', 1)
        request.onupgradeneeded = () => request.result.createObjectStore('state')
        request.onerror = () => reject(new Error('could not open'))
        request.onsuccess = () => {
          const tx = request.result.transaction('state', 'readwrite')
          const store = tx.objectStore('state')
          store.put(week, 'week')
          store.put(settings, 'settings')
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(new Error('could not write'))
        }
      }),
    state,
  )
  await page.reload()
  await page.getByRole('button', { name: /look around/i }).click()
}

const isoDaysAgo = (days: number): string => {
  const then = new Date()
  then.setDate(then.getDate() - days)
  return `${then.getFullYear()}-${String(then.getMonth() + 1).padStart(2, '0')}-${String(then.getDate()).padStart(2, '0')}`
}

/** A fortnight anchored three days ago, so "today" is day 3 and there are days behind it. */
const anchoredWeek = (items: unknown[] = []) => ({
  items,
  start: { mental: 60, physical: 60, social: 60, errands: 60 },
  horizonDays: 21,
  sleepByDay: Array.from({ length: 21 }, () => 8),
  startedOn: isoDaysAgo(3),
})

test('says the gap between what the student aims for and what they get', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seed(page, {
    week: anchoredWeek(),
    settings: {
      lowEnergyOverride: 'off',
      sleepTargetHours: 8,
      // Three nights, which is the floor below which the app says nothing at all.
      sleepNights: [
        { isoDate: isoDaysAgo(3), hours: 6, answeredAt: 1 },
        { isoDate: isoDaysAgo(2), hours: 6, answeredAt: 2 },
        { isoDate: isoDaysAgo(1), hours: 6, answeredAt: 3 },
      ],
    },
  })

  await page.getByTestId('open-sleep').click()

  await expect(page.getByTestId('sleep-reality')).toHaveText(
    'You plan 8 hours and average about 6.',
  )
})

test('warns that an over-committed day will cost tonight', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const crammed = Array.from({ length: 4 }, (_, index) => ({
    id: `cram-${index}`,
    title: 'Ethics essay',
    type: 'mental',
    kind: 'studyBlock',
    hours: 5,
    intensity: 1,
    dayIndex: 3,
    startHour: 8 + index,
    fixed: false,
    // A real deadline, today. Soft deadlines deliberately never reach this sentence.
    deadlineDay: 3,
    protectedRest: false,
  }))

  await seed(page, {
    week: anchoredWeek(crammed),
    settings: { lowEnergyOverride: 'off' },
  })

  await page.getByTestId('open-sleep').click()

  await expect(page.getByTestId('sleep-forecast-3')).toContainText('will cost you about 4 hours')
})
