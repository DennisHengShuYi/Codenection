import { describe, expect, it } from 'vitest'
import type { ParsedItem } from '../ai'
import { DEFAULT_PARAMS, HORIZON_DAYS, project } from '../engine'
import { toDayInputs, type Schedule } from '../optimizer'
import { firstDeficitDay, priceRequest } from './requestCost'

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

const request = (over: Partial<ParsedItem> = {}): ParsedItem => ({
  id: 'r1',
  title: 'FYP presentation help',
  type: 'mental',
  hours: 3,
  deadlineDay: 4,
  hard: false,
  confident: true,
  ...over,
})

const priceOf = (schedule: Schedule, item = request()) =>
  priceRequest(schedule, item, DEFAULT_PARAMS)

describe('firstDeficitDay', () => {
  it('is null for a fortnight that never crosses', () => {
    const projection = project(week().start, toDayInputs(week()), DEFAULT_PARAMS)

    expect(firstDeficitDay(projection)).toBeNull()
  })

  /**
   * §2.3 asks for "moves your deficit crossing from day 21 to day 14". The projection
   * already counts deficit days but has never said when the first one arrives, and the day
   * is the half a student can act on.
   */
  it('names the first day the floor falls into deficit', () => {
    const exhausted = week({ start: { mental: 8, physical: 8, social: 8, errands: 8 } })
    const projection = project(exhausted.start, toDayInputs(exhausted), DEFAULT_PARAMS)

    expect(firstDeficitDay(projection)).toBe(0)
  })
})

describe('priceRequest', () => {
  /**
   * A mutation here would corrupt the state the room and the dial are drawing from while
   * the student is still only *considering* saying yes.
   */
  it('leaves the week it was given untouched', () => {
    const before = week()
    const snapshot = JSON.stringify(before)

    priceOf(before)

    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('lowers the reserve floor', () => {
    const cost = priceOf(week())

    expect(cost.floorAfter).toBeLessThan(cost.floorBefore)
  })

  /**
   * Asserted on the deepest drop rather than the floor, and that is the finding this test
   * exists to lock in. The floor sits at the fortnight's own trough, which for a rested
   * student is day zero — before the request lands — so a one-hour ask and a twelve-hour
   * ask produce an identical floor. The number a student decides on has to move with the
   * size of what they are agreeing to.
   */
  it('costs more for a bigger ask', () => {
    const small = priceOf(week(), request({ hours: 1 }))
    const large = priceOf(week(), request({ hours: 12 }))

    expect(large.deepestDrop).toBeGreaterThan(small.deepestDrop)
  })

  it('states the cost as an equivalence a student can picture', () => {
    expect(priceOf(week(), request({ hours: 12 })).eveningsEquivalent).toBeGreaterThan(0)
  })

  // Both directions, so the number is shown to track the ask rather than being a constant
  // that happens to look plausible.
  it('reports a bigger equivalence for a bigger ask', () => {
    const small = priceOf(week(), request({ hours: 1 })).eveningsEquivalent
    const large = priceOf(week(), request({ hours: 12 })).eveningsEquivalent

    expect(large).toBeGreaterThan(small)
  })

  it('reports the reserve figure the student would be left at', () => {
    expect(priceOf(week()).capacityAfter).toBeGreaterThan(0)
  })

  // §2.3's "warn before accepting", in the units this app actually has.
  it('says plainly when a week cannot absorb the request', () => {
    const stretched = week({ start: { mental: 12, physical: 12, social: 12, errands: 12 } })

    expect(priceOf(stretched, request({ hours: 20 })).absorbable).toBe(false)
  })

  // The other direction, so the warning means something when it does fire.
  it('says a comfortable week can absorb a small ask', () => {
    expect(priceOf(week(), request({ hours: 1 })).absorbable).toBe(true)
  })

  it('reports a deficit crossing that the request creates', () => {
    const thin = week({ start: { mental: 34, physical: 34, social: 34, errands: 34 } })
    const cost = priceOf(thin, request({ hours: 14 }))

    expect(cost.firstDeficitDayAfter).not.toBeNull()
  })

  it('never moves the crossing later by taking work on', () => {
    const thin = week({ start: { mental: 34, physical: 34, social: 34, errands: 34 } })
    const cost = priceOf(thin, request({ hours: 14 }))

    if (cost.firstDeficitDayBefore !== null && cost.firstDeficitDayAfter !== null) {
      expect(cost.firstDeficitDayAfter).toBeLessThanOrEqual(cost.firstDeficitDayBefore)
    }
  })
})
