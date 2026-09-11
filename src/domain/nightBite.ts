import type { Schedule, ScheduledItem } from '../optimizer'
import { blocksOnDay } from './dayBlocks'
import { nightWindow } from './nightWindow'

/**
 * What is actually booked over a night, by the clock.
 *
 * This replaces a volume check -- "more than sixteen hours scheduled today" -- that was wrong
 * in both directions. It missed an essay running 22:00 to 01:00 on an otherwise empty day,
 * because three hours is not sixteen. It fired on seventeen hours of *overlapping* blocks
 * sitting entirely before midnight, which `optimizer/constraints` deliberately permits. And
 * it could not see the likeliest cause of the problem at all: moving a block from 14:00 to
 * 22:00 changes a day's total hours by exactly nothing.
 *
 * ## One coordinate system
 *
 * A night runs from bedtime on day `d` to waking on day `d + 1`, so it would need two
 * intervals and a special case for a block written past midnight. Instead everything is
 * expressed in hours since the start of day `d`: the night is one interval, a block on day
 * `d + 1` is shifted by 24, and a block running to 01:00 needs no handling of its own because
 * its end simply exceeds 24. One overlap calculation, no cases.
 *
 * ## Where the bedtime comes from
 *
 * The PLANNED hours, not the hours left after the bite. Bedtime is what the student intended
 * -- 23:00 for an eight-hour night before a 07:00 alarm -- and work sitting over that is the
 * bite. Deriving the bedtime from the bitten night instead would be circular: the bite would
 * depend on a bedtime that depended on the bite.
 */
export interface NightBite {
  /** Hours of the night something is actually scheduled over, capped at the night itself. */
  readonly hours: number
  /** The blocks doing it, so a sentence can name them rather than describing arithmetic. */
  readonly blocks: readonly ScheduledItem[]
  /** Whether a REAL deadline falls on this day. Soft deadlines are excluded -- see below. */
  readonly deadlineToday: boolean
}

const overlap = (from: number, to: number, start: number, end: number): number =>
  Math.max(0, Math.min(to, end) - Math.max(from, start))

export function nightBite({
  schedule,
  dayIndex,
  wakeHour,
  plannedHours,
}: {
  readonly schedule: Schedule
  readonly dayIndex: number
  readonly wakeHour: number
  /** What the night was meant to hold, which is what fixes the bedtime. */
  readonly plannedHours: number
}): NightBite {
  const night = nightWindow(wakeHour, plannedHours)

  // In hours since the start of day `dayIndex`. A night that crosses midnight begins on this
  // day; a short one begins after it, so its start is already past 24.
  const from = night.crossesMidnight ? night.bedHour : 24 + night.bedHour
  const to = 24 + wakeHour

  const onDay = blocksOnDay(schedule, dayIndex)
  const onNext = blocksOnDay(schedule, dayIndex + 1)

  const biting: { item: ScheduledItem; hours: number }[] = []

  for (const [items, shift] of [
    [onDay, 0],
    [onNext, 24],
  ] as const) {
    for (const item of items) {
      const taken = overlap(from, to, shift + item.startHour, shift + item.startHour + item.hours)
      if (taken > 0) biting.push({ item, hours: taken })
    }
  }

  const taken = biting.reduce((total, entry) => total + entry.hours, 0)

  return {
    // Capped at the night: overlapping blocks can otherwise total more hours than the night
    // has, and a sentence claiming nine hours off an eight-hour night is plainly wrong.
    hours: Math.min(Math.round(taken * 10) / 10, plannedHours),
    blocks: biting.map((entry) => entry.item),
    // `deadlineDay`, never `effectiveDeadline`. A synthetic deadline lands on rest and
    // recovery as readily as on coursework, and `softDeadlines.ts` forbids one reaching a
    // stress path because it "would model a student dreading having to relax".
    deadlineToday: onDay.some((item) => item.deadlineDay === dayIndex),
  }
}
