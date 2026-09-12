import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../engine'
import { isValid, overlaps } from './constraints'
import { rebalance } from './hillClimb'
import { score } from './objective'
import { makeRng } from './rng'
import { makeSchedule, restItem, socialBaseline, studyItem } from './testSupport'
import type { Schedule, ScheduledItem } from './types'

/** Three pieces of assessed work stacked on one day, all with slack to move into. */
const pileUp = () =>
  makeSchedule([
    ...socialBaseline(),
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
    const after = rebalance(before, DEFAULT_PARAMS, makeRng(1), 0)

    expect(score(after.schedule, DEFAULT_PARAMS)).toBeGreaterThanOrEqual(
      score(before, DEFAULT_PARAMS) - 1e-9,
    )
  })

  it('improves a schedule that piles three deadlines onto one day', () => {
    const after = rebalance(pileUp(), DEFAULT_PARAMS, makeRng(1), 0)

    expect(after.worstAfter).toBeGreaterThan(after.worstBefore)
    expect(after.moves.length).toBeGreaterThan(0)
  })

  it('only ever returns a valid schedule', () => {
    expect(isValid(rebalance(pileUp(), DEFAULT_PARAMS, makeRng(7), 0).schedule, DEFAULT_PARAMS))
      .toBe(true)
  })

  // §2.1, §5.1: the constraint that expresses the app's whole stance, asserted end to
  // end rather than only at the neighbour generator.
  it('never moves protected rest', () => {
    const before = makeSchedule([...pileUp().items, restItem('rest', 4, 20)])
    const after = rebalance(before, DEFAULT_PARAMS, makeRng(3), 0)
    const rest = after.schedule.items.find((item) => item.id === 'rest')

    expect(rest?.dayIndex).toBe(4)
    expect(rest?.startHour).toBe(20)
  })

  it('is deterministic for a given seed', () => {
    const a = rebalance(pileUp(), DEFAULT_PARAMS, makeRng(42), 0)
    const b = rebalance(pileUp(), DEFAULT_PARAMS, makeRng(42), 0)

    expect(a.schedule.items).toEqual(b.schedule.items)
  })

  it('keeps the schedule it started from, so undo is exact', () => {
    const before = pileUp()
    const after = rebalance(before, DEFAULT_PARAMS, makeRng(1), 0)

    expect(after.before).toEqual(before)
  })

  it('does not mutate the schedule it was given', () => {
    const before = pileUp()
    const snapshot = JSON.stringify(before)
    rebalance(before, DEFAULT_PARAMS, makeRng(1), 0)

    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('returns an untouched empty schedule rather than throwing', () => {
    const empty = makeSchedule([])
    const after = rebalance(empty, DEFAULT_PARAMS, makeRng(1), 0)

    expect(isValid(after.schedule, DEFAULT_PARAMS)).toBe(true)
  })

  /**
   * §2.1 budgets the whole solve at under 100ms on a phone, client-side, no backend call.
   *
   * Asserted in evaluations rather than milliseconds, deliberately. A wall-clock bound
   * measures whose machine is running it -- the CI runner is several times slower than a
   * development laptop, and the first version of this test failed there at 1666ms while
   * passing locally at 900ms. A time bound in that position either flakes or gets quietly
   * raised until it asserts nothing, which is worse than having no test. Evaluations are
   * identical on every machine for a given schedule and seed, so this catches the thing
   * worth catching: an algorithmic regression that makes the search consider far more
   * arrangements than it needs to.
   *
   * Sized at a realistic full schedule -- 50 items is roughly what three weeks of
   * lectures, labs, shifts, assessed work and errands comes to -- because an earlier
   * 25-item version passed comfortably while the real thing took over three seconds.
   *
   * **§2.1's 100ms budget is not met yet, and this test does not pretend otherwise.** A
   * full solve runs in roughly 900ms on a laptop, down from 3131ms. Closing the rest
   * needs incremental scoring -- recomputing only the days a move touches instead of the
   * whole horizon per candidate -- which is a design change, not a tuning pass.
   */
  it('does not consider more arrangements than the search needs', () => {
    const fixtures = Array.from({ length: 25 }, (_, i) => ({
      ...studyItem(`fixed${i}`, i % 21, 2),
      fixed: true,
      startHour: 9,
    }))
    const movable = Array.from({ length: 25 }, (_, i) => ({
      ...studyItem(`t${i}`, i % 14, 1.5),
      startHour: 14,
      deadlineDay: 14 + (i % 7),
    }))

    const result = rebalance(makeSchedule([...fixtures, ...movable]), DEFAULT_PARAMS, makeRng(5), 0)

    // Measured at 2,322 for this fixture and seed after the restart loop came out, and it
    // has since done its job: Ruling 20's deadline-pressure term drove this to 4,326 on a first
    // attempt that fell off smoothly with buffer, which gave the objective a gradient at
    // every item and left the climber always able to find one more fractional improvement.
    // Charging only the last day or two brought it back inside. The bound leaves room for a
    // small legitimate change and fails on anything that widens the search materially -- a
    // decision worth making consciously rather than absorbing silently.
    expect(result.evaluations).toBeGreaterThan(0)
    expect(result.evaluations).toBeLessThan(3_000)
  })

  it('counts every candidate it scored, so the budget above is measuring something', () => {
    const result = rebalance(pileUp(), DEFAULT_PARAMS, makeRng(1), 0)

    expect(result.evaluations).toBeGreaterThan(result.moves.length)
  })
})

/**
 * A week that arrived with a clash comes back without one.
 *
 * The gap this closes: `violations` counted a loose block sitting on a fixed one or on
 * protected rest, but only ever as a gate on candidate moves -- "no worse than you started"
 * -- and the score cannot see overlap at all. So a repairing move was permitted and never
 * preferred. Four probes confirmed it, the worst being a study block on top of protected
 * rest surviving a full rebalance, which §5.1 makes the version of this that matters.
 */
describe('a week that arrives broken', () => {
  const at = (id: string, over: Partial<ScheduledItem> = {}): ScheduledItem => ({
    ...studyItem(id, 2, 2),
    startHour: 14,
    ...over,
  })

  const clashing = (over: Partial<ScheduledItem>): Schedule =>
    makeSchedule([at('Lecture', over), at('Reading')])

  const stillClashing = (schedule: Schedule): boolean =>
    schedule.items.some((a) =>
      schedule.items.some(
        (b) => a.id !== b.id && a.dayIndex === b.dayIndex && overlaps(a, b) && (a.fixed || a.protectedRest),
      ),
    )

  it('separates a block sitting on a fixed commitment', () => {
    const result = rebalance(clashing({ fixed: true }), DEFAULT_PARAMS, makeRng(1), 0)

    expect(stillClashing(result.schedule)).toBe(false)
  })

  it('separates a block sitting on protected rest', () => {
    const result = rebalance(
      clashing({ kind: 'rest', title: 'Rest', protectedRest: true }),
      DEFAULT_PARAMS,
      makeRng(1),
      0,
    )

    expect(stillClashing(result.schedule)).toBe(false)
  })

  /** A repair can cost a point of score by breaking up a day, and the clash still has to go
   *  -- so the search's own bar cannot be what decides whether it is kept. */
  it('keeps the repair even when the search finds nothing worth doing', () => {
    const result = rebalance(clashing({ fixed: true }), DEFAULT_PARAMS, makeRng(1), 0)

    expect(result.moves.some((move) => move.kind === 'clearClash')).toBe(true)
  })

  /** Undo means "as it was", not "as it was once we had tidied it". */
  it('remembers the week the student actually had, clash and all', () => {
    const before = clashing({ fixed: true })

    expect(rebalance(before, DEFAULT_PARAMS, makeRng(1), 0).before).toEqual(before)
  })

  it('leaves a week with no clash exactly as the search left it', () => {
    const clean = makeSchedule([
      at('Lecture', { startHour: 9, fixed: true }),
      at('Reading'),
    ])

    expect(
      rebalance(clean, DEFAULT_PARAMS, makeRng(1), 0).moves.some(
        (move) => move.kind === 'clearClash',
      ),
    ).toBe(false)
  })
})
