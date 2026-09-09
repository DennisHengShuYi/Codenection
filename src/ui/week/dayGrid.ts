import { blocksOnDay } from '../../domain/dayBlocks'
import type { Schedule, ScheduledItem } from '../../optimizer'

/**
 * §4's day view: one column, so it survives 320px where seven columns cannot.
 *
 * The window is derived from the day rather than fixed at 00:00-24:00, because a fixed
 * window renders an empty day as twenty-four rows of nothing and a two-block day as two
 * blocks lost in a field.
 */

/** Used when there is nothing to derive a window from. Waking hours a student would
 *  recognise as "the day", rather than a full 24 that makes one block look tiny. */
export const DEFAULT_FIRST_HOUR = 8
export const DEFAULT_LAST_HOUR = 22

export interface GridBlock {
  readonly item: ScheduledItem
  /** Percentages of the grid's height, so the layout is resolution-independent and the
   *  component needs no measurement pass. */
  readonly topPercent: number
  readonly heightPercent: number
}

export interface DayGrid {
  readonly firstHour: number
  readonly lastHour: number
  /** Every label to draw down the left, inclusive of `lastHour`. */
  readonly hours: readonly number[]
  readonly blocks: readonly GridBlock[]
}

const clampHour = (hour: number): number => Math.min(24, Math.max(0, hour))

export function dayGrid(schedule: Schedule, dayIndex: number): DayGrid {
  const items = blocksOnDay(schedule, dayIndex)

  const firstHour =
    items.length === 0
      ? DEFAULT_FIRST_HOUR
      : clampHour(Math.floor(Math.min(...items.map((item) => item.startHour))) - 1)

  const lastHour =
    items.length === 0
      ? DEFAULT_LAST_HOUR
      : clampHour(Math.ceil(Math.max(...items.map((item) => item.startHour + item.hours))) + 1)

  const span = lastHour - firstHour

  return {
    firstHour,
    lastHour,
    hours: Array.from({ length: span + 1 }, (_, index) => firstHour + index),
    // `blocksOnDay` already sorts by start hour and returns a copy, so the schedule handed
    // in is never reordered here.
    blocks: items.map((item) => ({
      item,
      topPercent: ((item.startHour - firstHour) / span) * 100,
      heightPercent: (item.hours / span) * 100,
    })),
  }
}
