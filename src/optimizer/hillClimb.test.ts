import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../engine'
import { isValid } from './constraints'
import { rebalance } from './hillClimb'
import { score } from './objective'
import { makeRng } from './rng'
import { makeSchedule, restItem, studyItem } from './testSupport'

/** Three pieces of assessed work stacked on one day, all with slack to move into. */
const pileUp = () =>
  makeSchedule([
    { ...studyItem('essay', 2, 4), deadlineDay: 10 },
    { ...studyItem('lab', 2, 3), deadlineDay: 12 },
    { ...studyItem('reading', 2, 2), deadlineDay: 14 },
  ])

describe('makeRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = makeRng(7)
    const b = makeRng(7)

    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('produces different sequences for different seeds', () => {
    expect(makeRng(1)()).not.toBe(makeRng(2)())
  })

  it('stays within [0, 1)', () => {
    const rng = makeRng(99)

    for (let i = 0; i < 200; i += 1) {
      const value = rng()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})

describe('rebalance', () => {
  // The incumbent starts as the input, so a search that finds nothing returns the input.
  // A rebalance that quietly made a week worse would cost more trust than one that found
  // nothing at all.
  it('never returns a worse schedule than it was given', () => {
    const before = pileUp()
    const after = rebalance(before, DEFAULT_PARAMS, makeRng(1))

    expect(score(after.schedule, DEFAULT_PARAMS)).toBeGreaterThanOrEqual(
      score(before, DEFAULT_PARAMS) - 1e-9,
    )
  })

  it('improves a schedule that piles three deadlines onto one day', () => {
    const after = rebalance(pileUp(), DEFAULT_PARAMS, makeRng(1))

    expect(after.worstAfter).toBeGreaterThan(after.worstBefore)
    expect(after.moves.length).toBeGreaterThan(0)
  })

  it('only ever returns a valid schedule', () => {
    expect(isValid(rebalance(pileUp(), DEFAULT_PARAMS, makeRng(7)).schedule, DEFAULT_PARAMS))
      .toBe(true)
  })

  // §2.1, §5.1: the constraint that expresses the app's whole stance, asserted end to
  // end rather than only at the neighbour generator.
  it('never moves protected rest', () => {
    const before = makeSchedule([...pileUp().items, restItem('rest', 4, 20)])
    const after = rebalance(before, DEFAULT_PARAMS, makeRng(3))
    const rest = after.schedule.items.find((item) => item.id === 'rest')

    expect(rest?.dayIndex).toBe(4)
    expect(rest?.startHour).toBe(20)
  })

  it('is deterministic for a given seed', () => {
    const a = rebalance(pileUp(), DEFAULT_PARAMS, makeRng(42))
    const b = rebalance(pileUp(), DEFAULT_PARAMS, makeRng(42))

    expect(a.schedule.items).toEqual(b.schedule.items)
  })

  it('keeps the schedule it started from, so undo is exact', () => {
    const before = pileUp()
    const after = rebalance(before, DEFAULT_PARAMS, makeRng(1))

    expect(after.before).toEqual(before)
  })

  it('does not mutate the schedule it was given', () => {
    const before = pileUp()
    const snapshot = JSON.stringify(before)
    rebalance(before, DEFAULT_PARAMS, makeRng(1))

    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('returns an untouched empty schedule rather than throwing', () => {
    const empty = makeSchedule([])
    const after = rebalance(empty, DEFAULT_PARAMS, makeRng(1))

    expect(isValid(after.schedule, DEFAULT_PARAMS)).toBe(true)
  })

  // §2.1 budgets the whole solve at under 100ms on a phone. A CI runner is not a phone,
  // so this asserts an order of magnitude rather than the target itself: a regression
  // past a second means the search has stopped being interactive.
  it('completes a realistic solve in well under a second', () => {
    const items = Array.from({ length: 25 }, (_, i) => ({
      ...studyItem(`t${i}`, i % 14, 1.5),
      deadlineDay: 14 + (i % 7),
    }))

    const started = performance.now()
    rebalance(makeSchedule(items), DEFAULT_PARAMS, makeRng(5))

    expect(performance.now() - started).toBeLessThan(1000)
  })
})
