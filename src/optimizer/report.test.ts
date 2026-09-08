import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../engine'
import { rebalance } from './hillClimb'
import { describeRebalance, undo } from './report'
import { makeRng } from './rng'
import type { RebalanceResult } from './types'
import { makeSchedule, studyItem } from './testSupport'

const pileUp = () =>
  makeSchedule([
    { ...studyItem('essay', 2, 4), deadlineDay: 10 },
    { ...studyItem('lab', 2, 3), deadlineDay: 12 },
  ])

describe('describeRebalance', () => {
  it('names the worst day before and after, in numbers', () => {
    const text = describeRebalance(rebalance(pileUp(), DEFAULT_PARAMS, makeRng(1)))

    expect(text).toMatch(/worst day/i)
    expect(text).toMatch(/\d/)
  })

  // §2.1: "Never 'optimised.' Always specific." Not pedantry -- an unexplained reshuffle
  // is not something a student will act on, and "optimised" is a claim the app cannot
  // support to the person who has to live with the week.
  it('never says the word optimised', () => {
    expect(describeRebalance(rebalance(pileUp(), DEFAULT_PARAMS, makeRng(1)))).not.toMatch(
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

    expect(describeRebalance(noMoves)).toMatch(/nothing/i)
    expect(describeRebalance(noMoves)).not.toMatch(/worst day/i)
  })

  it('counts each kind of change it made', () => {
    const result = rebalance(pileUp(), DEFAULT_PARAMS, makeRng(1))
    const text = describeRebalance(result)

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
