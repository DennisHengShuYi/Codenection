import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../engine'
import { smallestFixes } from './smallestFix'
import { makeSchedule, restItem, socialBaseline, studyItem } from './testSupport'

const pileUp = () =>
  makeSchedule([
    ...socialBaseline(),
    { ...studyItem('essay', 2, 4), deadlineDay: 10 },
    { ...studyItem('lab', 2, 3), deadlineDay: 12 },
    { ...studyItem('reading', 2, 2), deadlineDay: 14 },
  ])

describe('smallestFixes', () => {
  // §2.2: "A student will do one thing; they will not follow a nine-change reshuffle."
  it('returns at most three', () => {
    expect(smallestFixes(pileUp(), DEFAULT_PARAMS).length).toBeLessThanOrEqual(3)
  })

  it('honours a caller-supplied limit', () => {
    expect(smallestFixes(pileUp(), DEFAULT_PARAMS, 1).length).toBeLessThanOrEqual(1)
  })

  it('orders them by how much they actually help', () => {
    const fixes = smallestFixes(pileUp(), DEFAULT_PARAMS)

    for (let i = 1; i < fixes.length; i += 1) {
      expect(fixes[i - 1]!.gain).toBeGreaterThanOrEqual(fixes[i]!.gain)
    }
  })

  it('only ever returns single moves that genuinely improve the fortnight', () => {
    for (const fix of smallestFixes(pileUp(), DEFAULT_PARAMS)) {
      const better =
        fix.worstAfter > fix.worstBefore || fix.deficitDaysAfter < fix.deficitDaysBefore
      expect(better).toBe(true)
    }
  })

  /**
   * The case that made this worth changing.
   *
   * A student already at the floor gains nothing measurable in `worstFloor` from any
   * single move, so ranking on floor gain returned an empty list for exactly the person
   * §2.2 is written for -- and the app's answer to someone in crisis became silence.
   * Ranking on days out of deficit keeps the advice coming.
   */
  it('still finds fixes for a student who has already bottomed out', () => {
    const crisis = makeSchedule(
      Array.from({ length: 21 }, (_, d) => studyItem(`c${d}`, d, 9)),
      5,
    )

    const fixes = smallestFixes(crisis, DEFAULT_PARAMS)

    expect(fixes.length).toBeGreaterThan(0)
    expect(fixes[0]!.worstBefore).toBe(0)
    expect(fixes[0]!.deficitDaysAfter).toBeLessThan(fixes[0]!.deficitDaysBefore)
  })

  it('reports the before and after a student can read', () => {
    for (const fix of smallestFixes(pileUp(), DEFAULT_PARAMS)) {
      expect(fix.move.description.length).toBeGreaterThan(0)
      expect(fix.gain).toBeCloseTo(fix.worstAfter - fix.worstBefore)
    }
  })

  /**
   * An empty week is not a healthy one, and what it needs is specifically *not* rest.
   *
   * Social reserve drains from isolation (§1.2) and only contact refills it (§5.2), so on
   * an empty fortnight the one thing that moves the floor is seeing someone. An earlier
   * version of the model let rest cover this, which is exactly the "prescribe an early
   * night for loneliness" answer §5.2 rules out.
   */
  it('prescribes seeing someone on an empty week, not rest', () => {
    const fixes = smallestFixes(makeSchedule([]), DEFAULT_PARAMS)

    expect(fixes.length).toBeGreaterThan(0)
    expect(fixes.every((fix) => fix.move.kind === 'insertSocial')).toBe(true)
  })

  it('returns nothing when every day is already protected and nothing can move', () => {
    // Rest *and* company on every day: with both of the solver's add-from-nothing moves
    // already taken and everything else protected, there is genuinely nothing left.
    const saturated = makeSchedule([
      ...Array.from({ length: 21 }, (_, day) => restItem(`rest-${day}`, day, 20)),
      ...socialBaseline(),
      ...Array.from({ length: 21 }, (_, day) => day)
        .filter((day) => day % 7 !== 2 && day % 7 !== 5)
        .map((day) => ({
          id: `extra-social-${day}`,
          title: 'Seeing people',
          type: 'social' as const,
          kind: 'socialRestorative' as const,
          hours: 2,
          intensity: 1,
          dayIndex: day,
          startHour: 18,
          fixed: true,
          deadlineDay: null,
          protectedRest: true,
        })),
    ])

    expect(smallestFixes(saturated, DEFAULT_PARAMS)).toEqual([])
  })

  it('never proposes moving protected rest', () => {
    const schedule = makeSchedule([...pileUp().items, restItem('rest', 4, 20)])

    for (const fix of smallestFixes(schedule, DEFAULT_PARAMS)) {
      expect(fix.move.itemId).not.toBe('rest')
    }
  })

  it('does not mutate the schedule it is given', () => {
    const schedule = pileUp()
    const before = JSON.stringify(schedule)
    smallestFixes(schedule, DEFAULT_PARAMS)

    expect(JSON.stringify(schedule)).toBe(before)
  })
})
