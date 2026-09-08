import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../engine'
import { rebalance } from './hillClimb'
import { describeRebalance, undo } from './report'
import { makeRng } from './rng'
import type { RebalanceResult } from './types'
import { makeSchedule, socialBaseline, studyItem } from './testSupport'

const pileUp = () =>
  makeSchedule([
    ...socialBaseline(),
    { ...studyItem('essay', 2, 4), deadlineDay: 10 },
    { ...studyItem('lab', 2, 3), deadlineDay: 12 },
  ])

describe('describeRebalance', () => {
  it('names the worst day before and after, in numbers', () => {
    const text = describeRebalance(rebalance(pileUp(), DEFAULT_PARAMS, makeRng(1)), DEFAULT_PARAMS)

    expect(text).toMatch(/worst day/i)
    expect(text).toMatch(/\d/)
  })

  // §2.1: "Never 'optimised.' Always specific." Not pedantry -- an unexplained reshuffle
  // is not something a student will act on, and "optimised" is a claim the app cannot
  // support to the person who has to live with the week.
  it('never says the word optimised', () => {
    expect(describeRebalance(rebalance(pileUp(), DEFAULT_PARAMS, makeRng(1)), DEFAULT_PARAMS)).not.toMatch(
      /optimis|optimiz/i,
    )
  })

  // Constructed directly rather than by finding a schedule the search gives up on: this
  // is a test of the reporting, and it should not depend on the solver's behaviour to
  // reach the branch.
  it('says plainly when it found nothing rather than inventing a change', () => {
    const schedule = pileUp()
    const noMoves: RebalanceResult = {
      schedule,
      before: schedule,
      moves: [],
      worstBefore: 41,
      worstAfter: 41,
    }

    expect(describeRebalance(noMoves, DEFAULT_PARAMS)).toMatch(/nothing/i)
    expect(describeRebalance(noMoves, DEFAULT_PARAMS)).not.toMatch(/worst day/i)
  })

  // "Your worst day goes from 0 to 0" is both useless and faintly insulting to the
  // person it would be shown to. Once the floor is pinned, days out of deficit are what
  // still moves, so that is what the app says.
  /**
   * A fortnight rearranging genuinely cannot save: an already-empty student, ten hours a
   * day for three weeks, four hours' sleep. Rest blocks cannot outpace that drain, so the
   * floor stays pinned at zero however the solver shuffles it.
   *
   * Worth noting what this is *not*: a merely heavy fortnight. Nine hours a day on a
   * healthy student is rescued outright by adding rest to every day, floor 0 to 52. The
   * solver is not toothless -- this is the genuine edge past which no arrangement helps.
   */
  const pastSaving = () => ({
    items: Array.from({ length: 21 }, (_, d) => studyItem(`c${d}`, d, 10)),
    start: { mental: 4, physical: 4, social: 4, errands: 4 },
    horizonDays: 21,
    sleepByDay: Array.from({ length: 21 }, () => 4),
  })

  it('does not report a floor that has not moved as if it were progress', () => {
    const result = rebalance(pastSaving(), DEFAULT_PARAMS, makeRng(1))
    const text = describeRebalance(result, DEFAULT_PARAMS)

    expect(result.worstBefore).toBe(0)
    expect(result.worstAfter).toBe(0)
    expect(text).not.toMatch(/from 0 to 0/)
  })

  it('says plainly when a fortnight is past rearranging', () => {
    const text = describeRebalance(
      rebalance(pastSaving(), DEFAULT_PARAMS, makeRng(1)),
      DEFAULT_PARAMS,
    )

    expect(text).toMatch(/beyond what rearranging can fix/i)
  })

  it('counts each kind of change it made', () => {
    const result = rebalance(pileUp(), DEFAULT_PARAMS, makeRng(1))
    const text = describeRebalance(result, DEFAULT_PARAMS)

    expect(text.startsWith('I ')).toBe(true)
    expect(text.endsWith('.')).toBe(true)
  })
})

describe('undo', () => {
  it('restores exactly the schedule the rebalance started from', () => {
    const before = pileUp()
    const result = rebalance(before, DEFAULT_PARAMS, makeRng(1))

    expect(undo(result)).toEqual(before)
  })

  it('restores an empty schedule too', () => {
    const before = makeSchedule([])

    expect(undo(rebalance(before, DEFAULT_PARAMS, makeRng(1)))).toEqual(before)
  })
})
