import { describe, expect, it } from 'vitest'
import { ANSWER_FACTOR, answeredIds, checkedInDays, outcomesFrom, type BlockRecord } from './blockLog'

const record = (over: Partial<BlockRecord> = {}): BlockRecord => ({
  blockId: 'essay',
  type: 'mental',
  plannedHours: 3,
  dayIndex: 2,
  answer: 'right',
  answeredAt: 1_757_000_000_000,
  ...over,
})

describe('outcomesFrom', () => {
  it('turns each answer into planned hours times its factor', () => {
    const log = [
      record({ blockId: 'a', answer: 'didnt' }),
      record({ blockId: 'b', answer: 'longer' }),
    ]

    expect(outcomesFrom(log).map((outcome) => outcome.actualHours)).toEqual([
      0,
      3 * ANSWER_FACTOR.longer,
    ])
  })

  it('keeps what was planned, which is half of what Reality Check compares', () => {
    expect(outcomesFrom([record()])[0]).toEqual({
      type: 'mental',
      plannedHours: 3,
      actualHours: 3,
    })
  })
})

describe('answeredIds', () => {
  it('lists every block already asked about, so none is asked twice', () => {
    expect(answeredIds([record({ blockId: 'a' }), record({ blockId: 'b' })])).toEqual(['a', 'b'])
  })
})

describe('checkedInDays', () => {
  it('counts a past day with an answer as checked in', () => {
    expect(checkedInDays([record({ dayIndex: 1 })], 3, 5)[1]).toBe(true)
  })

  it('counts a past day with no answer as silence, which is what §6.5 wants to see', () => {
    expect(checkedInDays([record({ dayIndex: 1 })], 3, 5)[2]).toBe(false)
  })

  it('treats every day still ahead as checked in', () => {
    // The trap: a future day has nothing to check in about. Marking the horizon as missed
    // compounds to 1 + 0.08 x 21 = 2.68x pessimism on every projection, permanently.
    const days = checkedInDays([], 3, 21)

    expect(days.slice(4).every(Boolean)).toBe(true)
  })

  it('treats today as checked in until the day is over', () => {
    expect(checkedInDays([], 3, 5)[3]).toBe(true)
  })

  it('returns one entry per day of the horizon', () => {
    expect(checkedInDays([], 3, 21)).toHaveLength(21)
  })
})

/**
 * What a record keeps so §2.4's narrower rungs have anything to read.
 *
 * The title is stored rather than the bucket derived from it, deliberately: a bucket written
 * down at answer time freezes that grouping for ever, and `taskKey`'s rules are guesses we
 * will want to sharpen. Kept as the title, the day those rules improve, a whole semester of
 * past answers regroups with them.
 *
 * Both optional. A record written before this existed, or by a path with neither to hand, is
 * still evidence at the rungs that do not need them.
 */
describe('what an outcome carries beyond the hours', () => {
  it('keeps the title the student typed', () => {
    const log = [record({ title: 'WIA3001 essay' })]

    expect(outcomesFrom(log)[0]?.title).toBe('WIA3001 essay')
  })

  it('keeps what kind of work it was', () => {
    const log = [record({ kind: 'hardExercise' })]

    expect(outcomesFrom(log)[0]?.kind).toBe('hardExercise')
  })

  it('carries neither when the record has neither', () => {
    const outcome = outcomesFrom([record()])[0]

    expect(outcome?.title).toBeUndefined()
    expect(outcome?.kind).toBeUndefined()
  })
})
