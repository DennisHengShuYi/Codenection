import { describe, expect, it } from 'vitest'
import type { ParsedItem } from '../ai'
import { DEFAULT_PARAMS, HORIZON_DAYS, project } from '../engine'
import { ALL_PRESENT, toDayInputs, type Schedule, type ScheduledItem } from '../optimizer'
import type { BlockRecord } from './blockLog'
import { firstDeficitDay, priceRequest } from './requestCost'

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

/** A heavy enough run of real load that missing-data pessimism over a silent stretch
 *  measurably changes what a request would cost, not just the 21-day worst floor. */
const dailyMentalLoad = (days: number, hours: number): ScheduledItem[] =>
  Array.from({ length: days }, (_, dayIndex) => ({
    id: `daily-${dayIndex}`,
    title: `daily ${dayIndex}`,
    type: 'mental' as const,
    kind: 'studyBlock' as const,
    hours,
    intensity: 1,
    dayIndex,
    startHour: 9,
    fixed: false,
    deadlineDay: null,
    protectedRest: false,
  }))

/** One answered block per day, so `checkedInDays` reads every day as checked in. */
const fullyCheckedInLog = (days: number): BlockRecord[] =>
  Array.from({ length: days }, (_, dayIndex) => ({
    blockId: `daily-${dayIndex}`,
    type: 'mental' as const,
    plannedHours: 8,
    dayIndex,
    answer: 'right' as const,
    answeredAt: 0,
  }))

const request = (over: Partial<ParsedItem> = {}): ParsedItem => ({
  id: 'r1',
  title: 'FYP presentation help',
  type: 'mental',
  kind: 'studyBlock',
  hours: 3,
  deadlineDay: 4,
  startHour: null,
  fixed: false,
  confident: true,
  repeat: null,
  ...over,
})

/**
 * Day 0 with an empty log, said out loud rather than left to a default.
 *
 * Ruling 41 made both required, so "no evidence" is now something a call site states. These
 * cases are about the pricing arithmetic itself and want a fortnight nothing has happened
 * in yet -- which `checkedInDays` already treats as fully checked in at day 0 -- so this is
 * deliberate, not an omission.
 */
const NO_EVIDENCE_YET = { today: 0, log: [] as readonly BlockRecord[] }

const priceOf = (schedule: Schedule, item = request()) =>
  priceRequest(schedule, item, DEFAULT_PARAMS, NO_EVIDENCE_YET.today, NO_EVIDENCE_YET.log)

describe('firstDeficitDay', () => {
  it('is null for a fortnight that never crosses', () => {
    const projection = project(week().start, toDayInputs(week(), ALL_PRESENT), DEFAULT_PARAMS)

    expect(firstDeficitDay(projection)).toBeNull()
  })

  /**
   * §2.3 asks for "moves your deficit crossing from day 21 to day 14". The projection
   * already counts deficit days but has never said when the first one arrives, and the day
   * is the half a student can act on.
   */
  it('names the first day the floor falls into deficit', () => {
    const exhausted = week({ start: { mental: 8, physical: 8, social: 8, errands: 8 } })
    const projection = project(exhausted.start, toDayInputs(exhausted, ALL_PRESENT), DEFAULT_PARAMS)

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

  /**
   * §6.5/§8b: pricing a request runs the same silence-aware projection the room and the
   * dial already show. A student who has gone quiet is judged against a more pessimistic
   * "before" and "after" than one who has been answering -- so the price this shows is the
   * price of the fortnight they are actually living, not an optimistic stand-in for it.
   *
   * `start` is calibrated, and was re-derived when §6.2/§6.6 went per-type: mental now
   * drains at its own depleted efficiency rather than one subsidised by the other three, so
   * at 60 the silent fortnight bottoms out at zero and the six-hour request takes the
   * answered one there too -- leaving the comparison `0 < 0` and the assertion unable to
   * say anything. At 80 neither branch saturates (46.6 silent against 81.5 answered before
   * the request lands), so the gap this test exists to measure is actually measurable.
   */
  it('prices against the same silence-aware projection the room shows, not an optimistic one', () => {
    const busy = week({
      start: { mental: 80, physical: 80, social: 80, errands: 80 },
      items: dailyMentalLoad(10, 8),
    })
    const today = 10

    const silent = priceRequest(busy, request({ hours: 6 }), DEFAULT_PARAMS, today, [])
    const checkedIn = priceRequest(
      busy,
      request({ hours: 6 }),
      DEFAULT_PARAMS,
      today,
      fullyCheckedInLog(10),
    )

    expect(silent.floorBefore).toBeLessThan(checkedIn.floorBefore)
    expect(silent.floorAfter).toBeLessThan(checkedIn.floorAfter)
  })
})
