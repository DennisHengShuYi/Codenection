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

/** Tonight is settable on its own, independently of the target. */
test('takes a typed figure for tonight on its own', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openApp(page)
  await page.getByTestId('open-sleep').click()

  const tonight = page.getByTestId('sleep-tonight')
  await tonight.fill('3')
  await tonight.blur()

  await expect(tonight).toHaveValue('3')
})

/**
 * Two fields, not four.
 *
 * The next three nights were typed once, and asking for them was the mistake: nobody knows on
 * Saturday what they will sleep on Monday. Those nights still drive the projection, so the
 * page states what it assumes rather than asking somebody to guess.
 */
test('asks for a target and tonight, and nothing else', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openApp(page)
  await page.getByTestId('open-sleep').click()

  await expect(page.getByTestId('sleep-target')).toBeVisible()
  await expect(page.getByTestId('sleep-tonight')).toBeVisible()
  await expect(page.locator('input[type="number"]')).toHaveCount(2)
})

/** Refused in the field, and refused again by `domain/sleepAssumed` when it reads the stored
 *  figure back -- so nothing a student can type reaches a model that computes recovery from
 *  it, whichever way it got into the store. */
test('says why a figure it cannot use was not taken', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openApp(page)
  await page.getByTestId('open-sleep').click()

  const target = page.getByTestId('sleep-target')
  await target.fill('99')
  await target.blur()

  await expect(page.getByTestId('sleep-target-error')).toHaveCount(1)
  await expect(page.getByTestId('sleep-tonight')).not.toHaveValue('99')
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

  // The INFERRED wording, because nothing in this day is actually booked over the night --
  // the blocks all end by 16:00. Twenty hours in a sixteen-hour day will cost sleep, but
  // nothing is scheduled at one in the morning, and the two claims are worded differently on
  // purpose.
  await expect(page.getByTestId('sleep-forecast').first()).toContainText(
    'asks for about 4 hours more than the day has',
  )
})

/**
 * The seven-night average drives the FORECAST, which is the point of the whole feature.
 *
 * A student who plans eight hours and sleeps four had their fortnight projected off eight, so
 * the window said the horizon was clear on sleep they do not get. Asserted through the room's
 * weather rather than its gauge: the gauge reads the reserve entering today, which is built
 * from days already past and which `assumeSleep` deliberately leaves alone. What moves is
 * what is coming.
 */
test('reads the fortnight off the sleep the student actually gets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })

  /*
   * Waited for rather than read once.
   *
   * `seed` writes the store, reloads and clicks through the gate; the room then renders from
   * whatever the repository has resolved so far and re-renders when the settings arrive. A
   * bare `getAttribute` is a single read against that first paint, so this test passed on a
   * fast machine and failed in CI on the sentence the seeded nights had not reached yet. The
   * assertion is unchanged -- `toHaveAttribute` retries until the label says it, or gives up.
   */
  const scene = page.getByTestId('room-scene')

  // The same empty week twice, once with nothing reported and once with a short week behind
  // it. Four hours is below the credit floor, so those nights give nothing back at all.
  await seed(page, { week: anchoredWeek(), settings: { lowEnergyOverride: 'off' } })
  // Nothing reported, so the fortnight is assumed at the eight-hour default and the room has
  // no sleep debt to report at all.
  await expect(scene).toHaveAttribute('aria-label', /Through the window/)
  await expect(scene).not.toHaveAttribute('aria-label', /sleep owed/)

  await seed(page, {
    week: anchoredWeek(),
    settings: {
      lowEnergyOverride: 'off',
      sleepTargetHours: 8,
      sleepNights: [
        { isoDate: isoDaysAgo(2), hours: 4, answeredAt: 1 },
        { isoDate: isoDaysAgo(1), hours: 4, answeredAt: 2 },
        { isoDate: isoDaysAgo(0), hours: 4, answeredAt: 3 },
      ],
    },
  })

  /*
   * The room now reads the fortnight off four-hour nights rather than the eight-hour target,
   * so it reports a debt it could not see before. Asserted here rather than on the window's
   * weather because an empty week drains too slowly for the deficit day to move -- the
   * difference this proves is that the assumption reached the model at all.
   */
  await expect(scene).toHaveAttribute('aria-label', /sleep owed/)
})

/**
 * The night, drawn under the day it ends.
 *
 * This is the answer to a night crossing midnight: it is not laid on the day's hour axis at
 * all, so there is nothing to split across two columns. `sleepByDay[d]` already means the
 * night at the end of day d, so the band belongs to that day and is drawn once.
 */
test('draws the night under the day, not across two of them', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seed(page, {
    week: { ...anchoredWeek(), sleepByDay: Array.from({ length: 21 }, () => 8) },
    settings: { lowEnergyOverride: 'off', sleepWakeHour: 7 },
  })

  await page.getByTestId('open-week').click()
  await page.getByTestId('day-3').click()

  const band = page.getByTestId('night-band')

  // One band for one night, on the day that night ends -- not a half in each column.
  await expect(band).toHaveCount(1)
  await expect(band).toContainText('23:00 → 07:00')
  await expect(band).toContainText('8 hours')
})

/** The forecast's sentence, with a picture behind it at last. */
/**
 * The band marks hours something is actually BOOKED over, found by the clock.
 *
 * An essay running 21:00 to 01:00 against a 23:00 bedtime takes two hours off the night. The
 * volume detector this replaced could never see it: four hours on an otherwise light day is
 * nowhere near sixteen.
 */
test('marks the hours a late block takes from the night', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const late = {
    id: 'essay',
    title: 'Ethics essay',
    type: 'mental',
    kind: 'studyBlock',
    hours: 4,
    intensity: 1,
    dayIndex: 3,
    startHour: 21,
    fixed: false,
    deadlineDay: 3,
    protectedRest: false,
  }

  await seed(page, {
    week: { ...anchoredWeek([late]), sleepByDay: Array.from({ length: 21 }, () => 8) },
    settings: { lowEnergyOverride: 'off', sleepWakeHour: 7 },
  })

  await page.getByTestId('open-week').click()
  await page.getByTestId('day-3').click()

  await expect(page.getByTestId('night-lost')).toContainText('2 hours')
})

/** And the forecast names it, which the volume wording never could. */
test('names the block that is eating the night', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const late = {
    id: 'essay',
    title: 'Ethics essay',
    type: 'mental',
    kind: 'studyBlock',
    hours: 4,
    intensity: 1,
    dayIndex: 3,
    startHour: 21,
    fixed: false,
    deadlineDay: 3,
    protectedRest: false,
  }

  await seed(page, {
    week: { ...anchoredWeek([late]), sleepByDay: Array.from({ length: 21 }, () => 8) },
    settings: { lowEnergyOverride: 'off', sleepWakeHour: 7 },
  })
  await page.getByTestId('open-sleep').click()

  await expect(page.getByTestId('sleep-forecast').first()).toContainText('Ethics essay')
  await expect(page.getByTestId('sleep-forecast').first()).toContainText('runs past bedtime')
})
