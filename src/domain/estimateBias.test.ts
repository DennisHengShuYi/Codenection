import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import type { BlockRecord } from './blockLog'
import { stampEstimateBias } from './estimateBias'

/**
 * Where §2.4's ladder reaches the engine.
 *
 * `paddingForItem` can say that *your essays* run 1.8x over while your lab reports land on
 * time, and `drain` can charge a block its own figure -- but nothing joined the two. This
 * is the join, and it is a stamp for the same reason `stampSoftDeadlines` is: the value is a
 * reading of the block log at a moment, not a property of the block, so it is derived where
 * the log is in hand and never saved into the week.
 */
const item = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'essay',
  title: 'WIA3001 essay',
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex: 3,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const week = (items: ScheduledItem[]): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const ran = (title: string, count: number, actual: number): BlockRecord[] =>
  Array.from({ length: count }, (_, index) => ({
    blockId: `${title}-${index}`,
    type: 'mental' as const,
    kind: 'studyBlock' as const,
    title,
    plannedHours: 2,
    dayIndex: index,
    answer: actual > 2 ? ('longer' as const) : ('right' as const),
    answeredAt: index,
  }))

describe('stampEstimateBias', () => {
  it('gives a block the figure its own history earned', () => {
    const log = ran('WIA3001 essay', 5, 3)

    expect(stampEstimateBias(week([item()]), log).items[0]?.estimateBias).toBeCloseTo(1.5, 2)
  })

  /** The whole point of the ladder: two blocks in one area of life, told apart. */
  it('gives two kinds of work in the same area different figures', () => {
    const log = [...ran('WIA3001 essay', 5, 3), ...ran('WIA3001 lab report', 5, 2)]

    const stamped = stampEstimateBias(
      week([item(), item({ id: 'lab', title: 'WIA3001 lab report' })]),
      log,
    )

    expect(stamped.items[0]?.estimateBias).toBeGreaterThan(stamped.items[1]?.estimateBias ?? 0)
  })

  /**
   * Left off rather than stamped as 1 when nothing is known.
   *
   * A stamped 1 and an absent value mean different things to `drain`: absent falls back to
   * the type-wide bias, which is where §2.4 has always put a student with no history of this
   * particular work. Writing 1 would override that with "no correction" and quietly undo the
   * area-level learning the ladder is built on top of.
   */
  it('leaves the block alone when no rung has enough behind it', () => {
    expect(stampEstimateBias(week([item()]), []).items[0]?.estimateBias).toBeUndefined()
  })

  it('does not touch the week it was given', () => {
    const before = week([item()])
    const snapshot = JSON.stringify(before)

    stampEstimateBias(before, ran('WIA3001 essay', 5, 3))

    expect(JSON.stringify(before)).toBe(snapshot)
  })
})
