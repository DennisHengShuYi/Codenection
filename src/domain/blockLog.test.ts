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
