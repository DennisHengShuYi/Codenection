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

/** Below this the window has nothing to lay a block out inside -- see `deriveWindow`. */
const MIN_WINDOW_HOURS = 1

/**
 * Clamps a raw first/last pair to midnight on both ends, guaranteeing at least
 * `MIN_WINDOW_HOURS` of width in the result.
 *
 * Clamping the two bounds separately is not enough on its own: a block that runs past 24:00
 * (an item the optimizer does not reject, e.g. `startHour: 25, hours: 1`) can put the raw
 * lower bound already inside range while the raw upper bound is clamped down to meet it,
 * collapsing the window to zero width and turning the percentage maths into a division by
 * zero. Guaranteeing the minimum here, as part of deriving the window, means every caller of
 * `dayGrid` gets a window it can safely divide by -- rather than a caller having to know to
 * guard the division itself.
 */
const deriveWindow = (rawFirst: number, rawLast: number): { firstHour: number; lastHour: number } => {
  const firstHour = clampHour(rawFirst)
  const lastHour = clampHour(Math.max(rawLast, firstHour + MIN_WINDOW_HOURS))
  return lastHour - firstHour >= MIN_WINDOW_HOURS
    ? { firstHour, lastHour }
    : { firstHour: lastHour - MIN_WINDOW_HOURS, lastHour }
}

export function dayGrid(schedule: Schedule, dayIndex: number): DayGrid {
  const items = blocksOnDay(schedule, dayIndex)

  const { firstHour, lastHour } =
    items.length === 0
      ? { firstHour: DEFAULT_FIRST_HOUR, lastHour: DEFAULT_LAST_HOUR }
      : deriveWindow(
          Math.floor(Math.min(...items.map((item) => item.startHour))) - 1,
          Math.ceil(Math.max(...items.map((item) => item.startHour + item.hours))) + 1,
        )

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
