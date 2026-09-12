import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, HORIZON_DAYS } from '../engine'
import { score } from './objective'
import type { Schedule, ScheduledItem } from './types'

const block = (startHour: number, over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: `i${startHour}`,
  title: 'Ethics essay',
  kind: 'studyBlock',
  type: 'mental',
  dayIndex: 3,
  startHour,
  hours: 2,
  intensity: 1,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const week = (items: readonly ScheduledItem[], bedHour?: number): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 8),
  ...(bedHour === undefined ? {} : { bedHour }),
})

/**
 * Ruling 68: the solver now prefers not to work in somebody's night.
 *
 * `gapsOn` treats everything from `WAKE_HOUR` to midnight as placeable, so the search has
 * always been free to put work at 23:00 -- and nothing scored it. Measured: asked for two
 * hours near 09:00 on a full day, `hourNear` returns 22:00. The lower bound of that window
 * was always a statement about when a student is awake; this is the upper bound saying it too.
 *
 * Soft rather than a wall. Clamping the window to the bedtime would forbid the solver from
 * touching a night at all, which makes a crunch fortnight unsolvable exactly when the
 * rebalancer is most needed.
 */
describe('work placed in the night', () => {
  it('scores an evening slot above a late one', () => {
    const early = score(week([block(14)], 23), DEFAULT_PARAMS)
    const late = score(week([block(22)], 23), DEFAULT_PARAMS)

    expect(early).toBeGreaterThan(late)
  })

  it('charges nothing when the work ends before bedtime', () => {
    expect(score(week([block(14)], 23), DEFAULT_PARAMS)).toBe(
      score(week([block(9)], 23), DEFAULT_PARAMS),
    )
  })

  /**
   * Measured as the difference each block makes against the same block in the afternoon,
   * rather than by comparing the two schedules outright.
   *
   * Those two schedules do not hold the same amount of work -- two hours against one -- and
   * comparing them directly only ever worked because nothing else in the score could see the
   * difference. §1.2's isolation charge now scales with how demanding a day was, so it can,
   * and the raw comparison was off by exactly the hour between them.
   *
   * Subtracting a same-sized daytime baseline cancels everything that is about the amount of
   * work and leaves only what bedtime cost, which is what this test was always about.
   */
  it('charges only the part that is after bedtime', () => {
    const nightCostOf = (item: ScheduledItem, daytime: ScheduledItem): number =>
      score(week([daytime], 23), DEFAULT_PARAMS) - score(week([item], 23), DEFAULT_PARAMS)

    const straddling = nightCostOf(block(22), block(14))
    const wholly = nightCostOf(block(23, { hours: 1 }), block(14, { hours: 1 }))

    expect(straddling).toBeCloseTo(wholly, 6)
  })

  /** A week saved before this existed carries no bedtime, and nothing is charged -- exactly
   *  as it behaved before. */
  it('charges nothing on a week that does not say when bedtime is', () => {
    expect(score(week([block(22)]), DEFAULT_PARAMS)).toBe(score(week([block(14)]), DEFAULT_PARAMS))
  })

  /** Rest late in the evening is recovery, not something eating a night. The daily cap uses
   *  the same test. */
  it('does not charge protected rest sitting late', () => {
    const resting = week([block(22, { kind: 'rest', protectedRest: true })], 23)

    expect(score(resting, DEFAULT_PARAMS)).toBe(
      score(week([block(14, { kind: 'rest', protectedRest: true })], 23), DEFAULT_PARAMS),
    )
  })

  /**
   * §2.1's ordering is not up for negotiation: the solver may never trade a genuinely higher
   * worst day for a better bedtime. Pinned as an inequality rather than trusted to a weight
   * somebody might raise later.
   */
  it('never outweighs a real gain in the floor', () => {
    // Nine hours on one day wrecks the floor; two hours at 22:00 does not.
    const wrecked = week([block(9, { hours: 9, id: 'heavy' })], 23)
    const late = week([block(22)], 23)

    expect(score(late, DEFAULT_PARAMS)).toBeGreaterThan(score(wrecked, DEFAULT_PARAMS))
  })
})
