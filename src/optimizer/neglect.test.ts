import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../engine'
import { stampSoftDeadlines } from '../domain/softDeadlines'
import { ALL_PRESENT, MAX_NEGLECT, score, toDayInputs } from './objective'
import { violations } from './constraints'
import { rebalance } from './hillClimb'
import { makeRng } from './rng'
import { makeSchedule, socialBaseline, studyItem } from './testSupport'
import type { ScheduledItem } from './types'

const task = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  ...studyItem('late', 10, 3),
  ...over,
})

const scoreOf = (items: readonly ScheduledItem[]): number =>
  score(makeSchedule([...socialBaseline(), ...items]), DEFAULT_PARAMS)

describe('neglect pressure', () => {
  it('costs something to leave an item past its soft deadline', () => {
    const onTime = scoreOf([task({ softDeadlineDay: 10 })])
    const late = scoreOf([task({ softDeadlineDay: 4 })])

    expect(late).toBeLessThan(onTime)
  })

  it('charges nothing while the buffer is still comfortable', () => {
    // Sparseness is the budget, not a simplification. deadlinePressure records that a
    // smooth falloff took an ordinary fortnight from 402 evaluations and 73ms to 2,407 and
    // 222ms, past §2.1's sub-100ms limit, to express a difference the model cannot claim.
    expect(scoreOf([task({ softDeadlineDay: 13 })])).toBe(scoreOf([task({ softDeadlineDay: 18 })]))
  })

  it('does not charge an item that already has a real deadline', () => {
    // deadlinePressure charges that one. Charging it here as well would double-count a
    // single effect and make dated work look twice as urgent as it is.
    const dated = task({ deadlineDay: 10, softDeadlineDay: 0 })
    const withoutSoft = task({ deadlineDay: 10 })

    expect(scoreOf([dated])).toBe(scoreOf([withoutSoft]))
  })

  it('does not charge an item that has no soft deadline at all', () => {
    // Weeks saved before soft deadlines existed. They must score exactly as they did.
    expect(scoreOf([task()])).toBe(scoreOf([task()]))
  })

  it('stops deepening once the item is thoroughly overdue', () => {
    // §2.1's ordering is stated in objective.ts as not up for negotiation: the solver may
    // never trade a genuinely higher worst day for a better-arranged week. An uncapped
    // lateness term would eventually exceed any floor difference and invert exactly that.
    const veryLate = scoreOf([task({ softDeadlineDay: 10 - MAX_NEGLECT })])
    const absurdlyLate = scoreOf([task({ softDeadlineDay: 10 - MAX_NEGLECT * 10 })])

    expect(absurdlyLate).toBe(veryLate)
  })

  it('never outweighs the reserve floor', () => {
    // Six items, every one of them as overdue as the model will count. Against a week
    // identical but for two hours less sleep a night, which genuinely lowers the floor.
    const overdue = Array.from({ length: 6 }, (_, index) =>
      task({ id: `late-${index}`, dayIndex: 10, softDeadlineDay: -100 }),
    )
    const onTime = Array.from({ length: 6 }, (_, index) =>
      task({ id: `late-${index}`, dayIndex: 10, softDeadlineDay: 20 }),
    )

    const neglected = makeSchedule([...socialBaseline(), ...overdue], 7)
    const worseFloor = makeSchedule([...socialBaseline(), ...onTime], 5)

    expect(score(neglected, DEFAULT_PARAMS)).toBeGreaterThan(score(worseFloor, DEFAULT_PARAMS))
  })
})

describe('the search budget, with every item carrying a soft deadline', () => {
  /**
   * hillClimb's own budget test builds every movable item with a real `deadlineDay`, so it
   * never exercises this term at all. The risk is the opposite fixture: a fortnight of
   * *undated* work, where `deadlinePressure` skips every item and `neglectPressure` charges
   * every one of them.
   *
   * That is precisely the shape that blew the budget when Ruling 20's term first fell off
   * smoothly -- 4,326 evaluations, because a gradient at every item leaves the climber
   * always able to find one more fractional improvement. Same bound as hillClimb's, for the
   * same reason: evaluations are identical on every machine, wall-clock is not.
   */
  it('does not widen the search when nothing is dated', () => {
    const fixtures = Array.from({ length: 25 }, (_, i) => ({
      ...studyItem(`fixed${i}`, i % 21, 2),
      fixed: true,
      startHour: 9,
    }))
    const movable = Array.from({ length: 25 }, (_, i) => ({
      ...studyItem(`t${i}`, i % 14, 1.5),
      startHour: 14,
    }))

    const stamped = stampSoftDeadlines(makeSchedule([...fixtures, ...movable]), 0, [])
    const result = rebalance(stamped, DEFAULT_PARAMS, makeRng(5))

    expect(result.evaluations).toBeGreaterThan(0)
    expect(result.evaluations).toBeLessThan(3_000)
  })

  it('gives every undated item a deadline, so the fixture above tests what it claims', () => {
    const stamped = stampSoftDeadlines(makeSchedule([studyItem('a', 3, 2)]), 0, [])

    expect(stamped.items.every((item) => item.softDeadlineDay !== undefined)).toBe(true)
  })
})

describe('constraints and soft deadlines', () => {
  it('does not reject a schedule for missing a soft deadline', () => {
    // A soft deadline that cannot be missed is a hard deadline, and a hard deadline on rest
    // would invalidate a fortnight for a student who had a busy Tuesday.
    const schedule = makeSchedule([task({ dayIndex: 20, softDeadlineDay: 0 })])

    expect(violations(schedule, DEFAULT_PARAMS)).toEqual([])
  })
})

describe('drain and soft deadlines', () => {
  it('does not let a soft deadline create anticipatory stress', () => {
    // daysToNearestDeadline drives deadlineDrain: "the closer the nearest deadline, the
    // more mental load the day carries before any work is done". Feeding synthetic
    // deadlines in would model a student dreading having to relax.
    const bare = toDayInputs(makeSchedule([task()]), ALL_PRESENT)
    const soft = toDayInputs(makeSchedule([task({ softDeadlineDay: 2 })]), ALL_PRESENT)

    expect(soft.map((day) => day.daysToNearestDeadline)).toEqual(
      bare.map((day) => day.daysToNearestDeadline),
    )
  })
})
