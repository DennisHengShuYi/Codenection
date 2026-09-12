import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../../data'
import { HORIZON_DAYS, LOAD_TYPES } from '../../engine'
import type { Schedule } from '../../optimizer'
import { LOAD_TYPE_LABELS } from '../kit/labels'
import { RoomShell } from './RoomShell'

/**
 * One reading of the reserves, shown two ways.
 *
 * The needle and the five bars below it describe the same four numbers, so a student can
 * check one against the other -- and they did not. The headline was repointed at the reserve
 * entering today; the bars were left reading `schedule.start`, day zero of the fortnight,
 * which no code path in the running app ever writes. The sheet showed 67% above bars
 * averaging 43, and nothing a student did -- editing today, rebalancing, or simply waking up
 * the next morning -- moved the bars at all.
 *
 * The guard is the arithmetic itself: the headline is the mean of the four reserve bars by
 * definition, so if the two are fed from different places the mean stops matching. That
 * cannot be satisfied by pointing either one at a plausible-looking constant.
 */
const heavyDay = (dayIndex: number) => ({
  id: `study-${dayIndex}`,
  title: 'Thesis',
  type: 'mental' as const,
  kind: 'studyBlock' as const,
  hours: 7,
  intensity: 1,
  dayIndex,
  startHour: 9,
  fixed: true,
  deadlineDay: null,
  protectedRest: false,
})

/**
 * Days already lived, heavily enough that the reserves have moved and lightly enough that
 * the floor stays above §1.5's threshold -- below 20 the whole sheet is replaced by the
 * low-energy interface and there is nothing here to check.
 *
 * Without days already lived the bug is invisible: on day zero the two sources agree by
 * definition, which is exactly why this needs a student mid-fortnight.
 */
const DAYS_IN = 5

const livedInWeek = (): Schedule => ({
  items: Array.from({ length: DAYS_IN }, (_, day) => heavyDay(day)),
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 6),
  startedOn: new Date(Date.now() - DAYS_IN * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
})

let counter = 0

const openReserves = async () => {
  counter += 1
  const repository = createLocalRepository(`reserves-${counter}`)
  await repository.clear()
  await repository.saveWeek(livedInWeek())

  render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
  await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())

  await userEvent.click(screen.getByTestId('room-gauge'))

  return await screen.findByRole('dialog', { name: /reserves/i })
}

/** Read off the meter's own announced value, by the name a student hears -- no test-only
 *  hook, and it checks the accessible reading at the same time. */
const barValue = (sheet: HTMLElement, type: keyof typeof LOAD_TYPE_LABELS): number => {
  const meter = within(sheet).getByRole('meter', { name: LOAD_TYPE_LABELS[type] })
  return Number(meter.getAttribute('aria-valuenow'))
}

beforeEach(() => window.history.replaceState(null, '', '/'))

describe('the reserves sheet', () => {
  /**
   * The strong guard, and it has to be per type.
   *
   * Comparing the headline against the mean of the bars looks like the obvious check and
   * very nearly misses this: on this fortnight the frozen opening week means 70.0 and the
   * reserve entering today means 69.7, because a physical reserve clamped at 100 hides a
   * mental reserve that has fallen to 37.6. That is the single-number failure the engine's
   * own docstrings keep naming, arriving inside a test written to catch it.
   */
  it('reads each bar off the reserve entering today, not the one the week opened with', async () => {
    const sheet = await openReserves()

    /*
     * Five days of seven-hour study on six hours' sleep, read as a move away from the opening
     * week in two directions at once.
     *
     * The bug is that every bar reports `schedule.start`, so it shows exactly `OPENING` --
     * and the sharpest thing that can be said about this fortnight is that the two bars have
     * gone opposite ways from it. Mental has fallen a long way; physical has been repaid past
     * where it began. One frozen number cannot produce both, which is the whole claim.
     *
     * Asserted against `OPENING` rather than a chosen threshold because the thresholds kept
     * having to move for reasons that had nothing to do with this test. Physical read 90 while
     * studying cost a body nothing, 85 once `SECONDARY_COST` gave desk work a cost, and 74
     * once `kSleep.physical` came down from 7.0 to 3.0 -- three numbers for one unchanged
     * claim. The direction is the claim.
     */
    const OPENING = 70

    expect(barValue(sheet, 'mental')).toBeLessThan(50)
    expect(barValue(sheet, 'physical')).toBeGreaterThan(OPENING)
  })

  it('shows a headline that is the mean of the bars beneath it', async () => {
    const sheet = await openReserves()

    const headline = Number(
      (within(sheet).getByTestId('capacity-value').textContent ?? '').replace('%', ''),
    )
    const values = LOAD_TYPES.map((type) => barValue(sheet, type))
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length

    // Both sides are rounded for display, so allow the rounding and nothing more.
    expect(Math.abs(headline - mean)).toBeLessThanOrEqual(1)
  })

  /**
   * What the numbers mean, which the sheet had no way of saying.
   *
   * §1.5's text equivalent restates every value and must keep doing exactly that -- it is
   * the dial for a screen reader, so interpretation folded into it would be
   * indistinguishable from a reading. So the interpretation is its own block, and this is
   * the guard that it is actually wired to the week rather than merely written: on this
   * fortnight mental has fallen below 50 while physical sits above 90, and a block reading
   * the real projection has to be talking about the first of those.
   *
   * Asserted against the computed wording, which is what runs here: there is no
   * `GROQ_API_KEY` in the tests, so `/api/insight` is never served and `phraseInsight`
   * returns the domain's lines unchanged.
   */
  it('says what the numbers mean, from the same fortnight the bars are read off', async () => {
    const sheet = await openReserves()

    const insight = await within(sheet).findByTestId('reserve-insight')

    expect(insight.textContent ?? '').toMatch(/study & thinking|thinking/i)
    expect(insight.textContent ?? '').not.toMatch(/body & movement/i)
  })

  /**
   * The reserve that is lowest and the thing already booked for it, in the same breath.
   *
   * Without this the block read as broken and was not: it named a reserve as the problem and
   * then suggested something for a different one, because the first one's rhythm was being
   * kept. Saying nothing about what was keeping it is what made two correct lines look like
   * an app ignoring its own headline.
   */
  it('names what is already booked for the lowest reserve rather than going quiet', async () => {
    const sheet = await openReserves()

    const insight = await within(sheet).findByTestId('reserve-insight')

    // The lived-in fortnight carries a standing coffee, and mental is the reserve five days
    // of study has emptied -- so the block has something to point at either way.
    expect(insight.textContent ?? '').toMatch(/answers that|worth doing/i)
  })

  /** §6.2 is the mechanic the whole app exists to make visible, and nothing on this screen
   *  said it: the same hour of rest buys a depleted student less than a rested one. */
  it('prices rest at the level the thinnest reserve is actually on', async () => {
    const sheet = await openReserves()

    const insight = await within(sheet).findByTestId('reserve-insight')

    expect(insight.textContent ?? '').toMatch(/rest/i)
    expect(insight.textContent ?? '').toMatch(/\d+%/)
  })
})
