import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { SLEEP_HOURS, seedSleepPlan, withSleep, withSleepHours } from './sleepPlan'

const week = (hours: number): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => hours),
})

describe('withSleepHours', () => {
  it('writes one night and leaves its neighbour', () => {
    const next = withSleepHours(week(8), 3, 5.5)

    expect(next.sleepByDay[3]).toBe(5.5)
    expect(next.sleepByDay[2]).toBe(8)
  })

  it('returns a new week rather than writing into the one it was given', () => {
    const before = week(8)
    withSleepHours(before, 3, 5.5)

    expect(before.sleepByDay[3]).toBe(8)
  })

  /**
   * A day index outside the fortnight is a caller bug, not a reason to grow the array.
   * `sleepByDay` must stay `horizonDays` long or every reader that zips the two -- the
   * solver's day inputs, the projection, the bed -- desynchronises. Ignoring is the honest
   * answer: it cannot corrupt the week.
   */
  it('ignores a night outside the fortnight rather than growing the array', () => {
    const next = withSleepHours(week(8), HORIZON_DAYS + 5, 5)

    expect(next.sleepByDay).toHaveLength(HORIZON_DAYS)
    expect(next.sleepByDay.every((hours) => hours === 8)).toBe(true)
  })
})

/**
 * Moved here from `ui/today/checkIn.test.ts` along with the function itself. A moved test is
 * not a removed test, and deleting these while claiming the change is a pure relocation would
 * remove the only evidence for that claim.
 */
describe('withSleep', () => {
  it('writes the reported night into the day it was about', () => {
    const next = withSleep(week(7), 3, 'under5')

    expect(next.sleepByDay[3]).toBe(SLEEP_HOURS.under5)
  })

  it('leaves every other night alone, and does not mutate the week it was given', () => {
    const before = week(7)
    const next = withSleep(before, 3, 'under5')

    expect(next.sleepByDay[4]).toBe(7)
    expect(before.sleepByDay[3]).toBe(7)
  })

  it('still maps each of the four buckets to the figure it always did', () => {
    expect(withSleep(week(7), 0, 'under5').sleepByDay[0]).toBe(4.5)
    expect(withSleep(week(7), 0, 'six').sleepByDay[0]).toBe(6)
    expect(withSleep(week(7), 0, 'seven').sleepByDay[0]).toBe(7)
    expect(withSleep(week(7), 0, 'eightPlus').sleepByDay[0]).toBe(8.5)
  })
})

describe('seedSleepPlan', () => {
  it('fills every night with the target when the student has edited none', () => {
    expect(seedSleepPlan(week(7), 9, []).sleepByDay.every((hours) => hours === 9)).toBe(true)
  })

  /**
   * The whole point of tracking which nights were edited. Raising the target has to move the
   * fortnight without overwriting a night the student deliberately set -- otherwise the app
   * overrules a student about their own life.
   */
  it('leaves a night the student set alone', () => {
    const next = seedSleepPlan(week(7), 9, [4])

    expect(next.sleepByDay[4]).toBe(7)
    expect(next.sleepByDay[3]).toBe(9)
  })

  it('keeps the array the length the fortnight is', () => {
    expect(seedSleepPlan(week(7), 9, []).sleepByDay).toHaveLength(HORIZON_DAYS)
  })

  it('returns a new week', () => {
    const before = week(7)
    seedSleepPlan(before, 9, [])

    expect(before.sleepByDay[0]).toBe(7)
  })
})
