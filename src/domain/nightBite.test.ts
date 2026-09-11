import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { nightBite } from './nightBite'

let seq = 0
const block = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: `i${(seq += 1)}`,
  title: 'Ethics essay',
  kind: 'studyBlock',
  type: 'mental',
  dayIndex: 3,
  startHour: 9,
  hours: 2,
  intensity: 1,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const week = (items: readonly ScheduledItem[]): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 8),
})

/** An eight-hour night before a 07:00 alarm, so bedtime is 23:00. */
const bite = (items: readonly ScheduledItem[], day = 3) =>
  nightBite({ schedule: week(items), dayIndex: day, wakeHour: 7, plannedHours: 8 })

/**
 * What is actually booked over the night, by the clock.
 *
 * The volume check this replaces read "more than sixteen hours today", which is wrong in both
 * directions. It misses an essay running 22:00 to 01:00 on an otherwise empty day -- three
 * hours total, no warning -- and it fires on seventeen hours of *overlapping* blocks that all
 * sit before midnight, which `constraints.ts` deliberately permits.
 *
 * Worse, it cannot see the one thing most likely to cause the problem: moving a block from
 * 14:00 to 22:00 changes a day's total hours by exactly nothing.
 */
describe('nightBite', () => {
  it('finds nothing when the day ends well before bedtime', () => {
    expect(bite([block({ startHour: 9, hours: 2 })]).hours).toBe(0)
  })

  /** The case the volume check could never see: three hours on an empty day, two of them
   *  after a 23:00 bedtime. */
  it('finds work that runs past bedtime, however light the day is', () => {
    expect(bite([block({ startHour: 22, hours: 3 })]).hours).toBe(2)
  })

  it('counts only the part that is actually over the night', () => {
    expect(bite([block({ startHour: 21, hours: 3 })]).hours).toBe(1)
  })

  /** A block written past midnight -- `dayGrid`'s comment notes the optimizer does not
   *  reject one -- is still one block, and one bite. */
  it('handles a block that runs past midnight without counting it twice', () => {
    expect(bite([block({ startHour: 23, hours: 3 })]).hours).toBe(3)
  })

  /**
   * The other end of the night. A 06:00 gym session with a 07:00 alarm took an hour off the
   * night just as surely as a late essay did, and it belongs to the night that ENDS that
   * morning -- which is the night of the day before.
   */
  it('finds work that starts before the alarm on the following morning', () => {
    expect(bite([block({ dayIndex: 4, startHour: 6, hours: 1 })]).hours).toBe(1)
  })

  it('adds up both ends of the same night', () => {
    expect(
      bite([
        block({ dayIndex: 3, startHour: 22, hours: 2 }),
        block({ dayIndex: 4, startHour: 5, hours: 2 }),
      ]).hours,
    ).toBe(3)
  })

  /** A short night begins after midnight, so nothing in the evening can touch it. */
  it('leaves the evening alone when the night itself starts after midnight', () => {
    const short = nightBite({
      schedule: week([block({ startHour: 22, hours: 2 })]),
      dayIndex: 3,
      wakeHour: 7,
      plannedHours: 6,
    })

    expect(short.hours).toBe(0)
  })

  it('never claims more than the night holds', () => {
    expect(bite([block({ startHour: 8, hours: 20 })]).hours).toBeLessThanOrEqual(8)
  })

  /**
   * The blocks responsible, because naming them is the point. "Your essay runs to 01:00" is
   * something a student can act on; "this day asks for more than it has" is not.
   */
  it('names what is doing the biting', () => {
    const found = bite([
      block({ startHour: 9, hours: 2, title: 'Lecture' }),
      block({ startHour: 22, hours: 3, title: 'Ethics essay' }),
    ])

    expect(found.blocks.map((b) => b.title)).toEqual(['Ethics essay'])
  })

  it('reports whether a real deadline falls on the day', () => {
    expect(bite([block({ startHour: 22, hours: 2, deadlineDay: 3 })]).deadlineToday).toBe(true)
    expect(bite([block({ startHour: 22, hours: 2 })]).deadlineToday).toBe(false)
  })

  /** Real deadlines only -- `softDeadlines.ts` forbids a synthetic one reaching a stress
   *  path, because it "would model a student dreading having to relax". */
  it('ignores a soft deadline', () => {
    const soft = bite([block({ startHour: 22, hours: 2, deadlineDay: null, softDeadlineDay: 3 })])

    expect(soft.deadlineToday).toBe(false)
  })

  it('is empty past the end of the fortnight rather than erroring', () => {
    expect(bite([], HORIZON_DAYS - 1).hours).toBe(0)
  })
})
