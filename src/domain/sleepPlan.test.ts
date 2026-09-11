import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import {
  MAX_SLEEP_HOURS,
  SLEEP_HOURS,
  isRealSleepHours,
  lastNight,
  retargetSleep,
  seedSleepPlan,
  withSleep,
  withSleepHours,
} from './sleepPlan'

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

/**
 * Moving the target, without a stored list of which nights were edited.
 *
 * A night that diverges from the OLD target was set deliberately -- by the student on the
 * sleep page, or by reporting what they actually slept. Either way it is theirs and a new
 * target must not overwrite it. Deriving that from divergence rather than storing an index
 * list also survives the fortnight rolling over, which a list of day indices would not.
 */
describe('retargetSleep', () => {
  it('moves every night that still sat at the old target', () => {
    const next = retargetSleep(week(8), 8, 9)

    expect(next.sleepByDay.every((hours) => hours === 9)).toBe(true)
  })

  it('leaves a night the student set to something else', () => {
    const next = retargetSleep(withSleepHours(week(8), 4, 5), 8, 9)

    expect(next.sleepByDay[4]).toBe(5)
    expect(next.sleepByDay[3]).toBe(9)
  })

  /**
   * A reported night is a fact about a night that happened, and diverges from the target for
   * the same reason an edited one does -- so it is preserved by the same rule, with nothing
   * extra needed. A new target must never rewrite what somebody said they slept.
   */
  it('leaves a night that was reported rather than planned', () => {
    const reported = withSleep(week(8), 2, 'six')

    expect(retargetSleep(reported, 8, 9).sleepByDay[2]).toBe(6)
  })

  it('returns a new week', () => {
    const before = week(8)
    retargetSleep(before, 8, 9)

    expect(before.sleepByDay[0]).toBe(8)
  })
})

/**
 * What counts as a night, once the student can type one.
 *
 * The page used to offer four fixed figures, so nothing could arrive that the model could not
 * hold. A typed field is untrusted input, and this project's rule is that it is validated at
 * the boundary and never becomes trusted by passing through a layer -- so the check lives
 * here, where every writer of `sleepByDay` has to go through it, rather than only in the
 * input that happens to be on screen today.
 *
 * It matters to the model and not just to tidiness: `recovery = max(0, sleep - 5) x k_sleep`,
 * so a night of 500 would hand a student a fortnight of invented recovery.
 */
describe('isRealSleepHours', () => {
  it('accepts a night somebody could actually have', () => {
    expect(isRealSleepHours(0)).toBe(true)
    expect(isRealSleepHours(6.5)).toBe(true)
    expect(isRealSleepHours(MAX_SLEEP_HOURS)).toBe(true)
  })

  /** Zero is a real night -- an all-nighter -- and has to be tellable from a blank field. */
  it('accepts none at all, which is a night a student really has', () => {
    expect(isRealSleepHours(0)).toBe(true)
  })

  it('refuses what is not a number at all', () => {
    expect(isRealSleepHours(Number.NaN)).toBe(false)
    expect(isRealSleepHours(Number.POSITIVE_INFINITY)).toBe(false)
  })

  it('refuses a night outside a day', () => {
    expect(isRealSleepHours(-1)).toBe(false)
    expect(isRealSleepHours(MAX_SLEEP_HOURS + 0.5)).toBe(false)
  })
})

describe('withSleepHours and a figure it cannot hold', () => {
  it('leaves the week alone rather than writing something the model cannot use', () => {
    const before = week(8)

    expect(withSleepHours(before, 3, Number.NaN).sleepByDay[3]).toBe(8)
    expect(withSleepHours(before, 3, -2).sleepByDay[3]).toBe(8)
    expect(withSleepHours(before, 3, 99).sleepByDay[3]).toBe(8)
  })

  /** One decimal, the rule `editWarnings` and `blockLog` already apply: this figure is summed
   *  and averaged repeatedly downstream, and a raw float remainder drifts further with every
   *  operation on it for a measurement nobody made. */
  it('rounds to one decimal rather than storing a float remainder', () => {
    expect(withSleepHours(week(8), 3, 6.25).sleepByDay[3]).toBe(6.3)
    expect(withSleepHours(week(8), 3, 7.049).sleepByDay[3]).toBe(7)
  })
})

/**
 * Which night "last night" is, in one place.
 *
 * `sleepByDay[d]` is the night at the END of day d -- §6.1 puts sleep in `recovery[d]`, which
 * produces `reserve[d+1]` -- so the night a student reports this morning is `today - 1`. The
 * check-in card wrote it to `today` instead, which is tonight, so the report never reached the
 * day it explained. This function exists so that subtraction is done once and named.
 */
describe('lastNight', () => {
  it('is the day before today, because that is the night that ended this morning', () => {
    expect(lastNight(5)).toBe(4)
    expect(lastNight(1)).toBe(0)
  })

  /**
   * Null on the fortnight's first day, and that is the honest answer rather than a clamp to
   * zero. The night before day 0 happened before the week the app knows about, so there is no
   * entry for it -- writing it to day 0 would put last night's figure on tonight, which is
   * the very bug this replaces.
   */
  it('is nothing on the first day, whose night before the app has no slot for', () => {
    expect(lastNight(0)).toBeNull()
  })
})
