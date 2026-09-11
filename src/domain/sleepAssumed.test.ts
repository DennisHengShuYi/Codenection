import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { assumeSleep } from './sleepAssumed'

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  startedOn: '2026-09-10',
  ...over,
})

const assumed = (over: Partial<Parameters<typeof assumeSleep>[0]> = {}) =>
  assumeSleep({
    schedule: week(),
    today: 2,
    measuredHours: null,
    chosenByDate: {},
    targetHours: 8,
    ...over,
  }).sleepByDay

/**
 * What the app believes each night will be, as against what the student typed.
 *
 * The two were the same field, so the app could either show the student their own figure or
 * reason from an honest one, and not both. This derives the honest one: every night from today
 * onward is the figure the student chose, lowered to what their last week of sleep actually
 * shows. The chosen figures live in settings and are never overwritten by this.
 */
describe('assumeSleep', () => {
  it('assumes the target for the nights ahead when nothing has been measured', () => {
    const nights = assumed({ targetHours: 9 })

    expect(nights[2]).toBe(9)
    expect(nights[20]).toBe(9)
  })

  /**
   * The whole point. A student who plans 8 and sleeps 6 gets a fortnight projected off 6, so
   * the dial stops telling them a week is survivable on sleep they do not get.
   */
  it('lowers the nights ahead to what the student actually sleeps', () => {
    expect(assumed({ targetHours: 8, measuredHours: 6 })[2]).toBe(6)
  })

  /**
   * Only ever downward -- `realityCheck`'s asymmetry, for its stated reason: correcting in
   * the generous direction "would quietly make a heavy week look survivable, which is the
   * opposite of what this app is for". A good week of sleep is not a reason to assume a
   * student will beat their own target.
   */
  it('never raises a night above what the student planned', () => {
    expect(assumed({ targetHours: 6, measuredHours: 9 })[2]).toBe(6)
  })

  it('leaves the nights already past alone, because they are history', () => {
    const nights = assumed({ today: 5, measuredHours: 4 })

    expect(nights[0]).toBe(7)
    expect(nights[4]).toBe(7)
    expect(nights[5]).toBe(4)
  })

  /** A night the student spoke about themselves, keyed by the date it began. */
  it('prefers a night the student chose over the target', () => {
    const nights = assumed({ chosenByDate: { '2026-09-12': 5 }, targetHours: 8 })

    expect(nights[2]).toBe(5)
    expect(nights[3]).toBe(8)
  })

  /** Somebody who says "I am up late on Saturday, four hours" knows something their history
   *  does not. The measurement must not talk them back up. */
  it('does not raise a chosen night toward the measured average', () => {
    expect(assumed({ chosenByDate: { '2026-09-12': 4 }, measuredHours: 6 })[2]).toBe(4)
  })

  it('still lowers a chosen night that the measurement undercuts', () => {
    expect(assumed({ chosenByDate: { '2026-09-12': 9 }, measuredHours: 6 })[2]).toBe(6)
  })

  /**
   * The chosen figures are stored state, and stored state is not trusted state.
   *
   * The page validates what it types, but this is the layer that has to hold: a figure could
   * reach the store from an older build, a hand-edited blob, or a future writer. `recovery =
   * max(0, sleep - 5) x k_sleep`, so a night of 500 would hand a student a fortnight of
   * invented recovery and a NaN would poison every projection that touched it.
   */
  it('ignores a chosen figure the model could not use', () => {
    expect(assumed({ chosenByDate: { '2026-09-12': 99 }, targetHours: 8 })[2]).toBe(8)
    expect(assumed({ chosenByDate: { '2026-09-12': -4 }, targetHours: 8 })[2]).toBe(8)
    expect(assumed({ chosenByDate: { '2026-09-12': Number.NaN }, targetHours: 8 })[2]).toBe(8)
  })

  it('returns a new week rather than writing into the one it was given', () => {
    const before = week()
    assumeSleep({
      schedule: before,
      today: 0,
      measuredHours: 3,
      chosenByDate: {},
      targetHours: 8,
    })

    expect(before.sleepByDay.every((hours) => hours === 7)).toBe(true)
  })

  it('keeps the array the length the fortnight is', () => {
    expect(assumed({ measuredHours: 5 })).toHaveLength(HORIZON_DAYS)
  })

  /** An unanchored week has no dates, so no night can be matched to a chosen figure -- the
   *  target still applies, which is what a week with no calendar should assume. */
  it('falls back to the target on a week with no dates', () => {
    const nights = assumeSleep({
      schedule: week({ startedOn: undefined }),
      today: 2,
      measuredHours: null,
      chosenByDate: { '2026-09-12': 5 },
      targetHours: 8,
    }).sleepByDay

    expect(nights[2]).toBe(8)
  })
})
