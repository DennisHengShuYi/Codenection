import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { blocksOnDay, hasHappened } from './dayBlocks'

const block = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'b1',
  title: 'Study',
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex: 0,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const week = (items: readonly ScheduledItem[]): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

describe('blocksOnDay', () => {
  it('returns only the blocks for that day', () => {
    const schedule = week([
      block({ id: 'today', dayIndex: 3 }),
      block({ id: 'tomorrow', dayIndex: 4 }),
    ])

    expect(blocksOnDay(schedule, 3).map((entry) => entry.id)).toEqual(['today'])
  })

  // Asked about in the order they happen: a check-in that jumped around the day would be
  // harder to answer than the day was to live.
  it('returns them in the order they happen', () => {
    const schedule = week([
      block({ id: 'evening', startHour: 19 }),
      block({ id: 'morning', startHour: 8 }),
      block({ id: 'afternoon', startHour: 14 }),
    ])

    expect(blocksOnDay(schedule, 0).map((entry) => entry.id)).toEqual([
      'morning',
      'afternoon',
      'evening',
    ])
  })

  // Answered as "nothing scheduled" rather than as an error: an empty day is an ordinary
  // day, and often a good one.
  it('returns nothing for a day with nothing on it', () => {
    expect(blocksOnDay(week([block({ dayIndex: 1 })]), 5)).toEqual([])
  })

  it('returns nothing for a day outside the horizon, rather than throwing', () => {
    const schedule = week([block()])

    expect(() => blocksOnDay(schedule, 999)).not.toThrow()
    expect(blocksOnDay(schedule, 999)).toEqual([])
    expect(blocksOnDay(schedule, -1)).toEqual([])
  })

  /**
   * §5.1 makes rest a scheduled object with weight rather than a notification, so it is
   * part of the day like anything else -- and whether protected rest actually happened is
   * exactly what §5.2's failed-recovery logging needs to know.
   */
  it('includes protected rest alongside ordinary blocks', () => {
    const schedule = week([
      block({ id: 'study', startHour: 9 }),
      block({ id: 'rest', startHour: 17, protectedRest: true, kind: 'rest' }),
    ])

    expect(blocksOnDay(schedule, 0).map((entry) => entry.id)).toEqual(['study', 'rest'])
  })

  it('does not change the schedule it was given', () => {
    const items = [block({ startHour: 19 }), block({ startHour: 8 })]
    const schedule = week(items)

    blocksOnDay(schedule, 0)

    expect(schedule.items[0]?.startHour).toBe(19)
  })
})

/**
 * Whether a block has actually happened, which is the one precondition on asking how it went.
 *
 * The rule lived inside `ui/today/checkIn.blockToAsk` and nowhere else, so only the today
 * card obeyed it. Telegram's `/today` asked about the first unanswered block on the day
 * whatever the hour, and `/day` asked about days still ahead -- "Did the essay happen?"
 * about an 8pm block at 2pm, or about next Tuesday. An answer to that is not a measurement,
 * and it feeds estimate bias, which is the number behind the app's published accuracy.
 *
 * `checkIn.ts` already wrote down why the clock must be a required argument: "an optional
 * clock is one a caller forgets to pass". One rule, here, for every caller.
 */
describe('hasHappened', () => {
  const block = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
    id: 'essay',
    title: 'Essay',
    type: 'mental',
    kind: 'studyBlock',
    hours: 2,
    intensity: 1,
    dayIndex: 3,
    startHour: 20,
    fixed: false,
    deadlineDay: null,
    protectedRest: false,
    ...over,
  })

  it('is true for any day already behind us', () => {
    expect(hasHappened(block({ dayIndex: 2 }), 3, 9)).toBe(true)
  })

  it('is false for any day still ahead, however late in the day it is', () => {
    expect(hasHappened(block({ dayIndex: 4 }), 3, 23)).toBe(false)
  })

  it('is false for a block later today', () => {
    expect(hasHappened(block({ dayIndex: 3, startHour: 20, hours: 2 }), 3, 14)).toBe(false)
  })

  it('is false while a block on today is still running', () => {
    expect(hasHappened(block({ dayIndex: 3, startHour: 13, hours: 2 }), 3, 14)).toBe(false)
  })

  it('is true once a block on today has finished', () => {
    expect(hasHappened(block({ dayIndex: 3, startHour: 13, hours: 2 }), 3, 15)).toBe(true)
  })
})
