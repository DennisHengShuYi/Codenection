import type { Schedule } from './types'

/**
 * When a student's day actually starts. Borrowed from `dayGrid.DEFAULT_FIRST_HOUR` -- the
 * codebase's existing answer to the same question -- so nothing is ever placed before
 * anyone is awake to do it.
 */
export const WAKE_HOUR = 8

/** Midnight. Past here is tomorrow, and `sleepByDay` already counts those hours. */
export const DAY_END_HOUR = 24

/** Under half an hour there is nothing worth scheduling, and reporting one as an opening
 *  produces suggestions nobody can act on. */
export const MIN_GAP_HOURS = 0.5

/** A stretch of a day with nothing on it. */
export interface FreeSlot {
  readonly startHour: number
  readonly hours: number
}

/**
 * Every opening on a day, in order, clamped to the waking window.
 *
 * The one gap-walker in the codebase, and it lives here rather than in `src/domain` for a
 * layering reason worth stating: `domain` depends on `optimizer` and never the reverse, so a
 * solver that imported a domain gap-walker would invert that and close a cycle through the
 * module graph. It needs nothing but a `Schedule`, so this is where it can be shared without
 * either layer learning about the other.
 *
 * Overlapping blocks are merged rather than producing a negative gap: two movable blocks on
 * top of each other is a legal state `constraints.ts` deliberately permits, so the walker
 * meets it routinely rather than exceptionally.
 */
export function gapsOn(schedule: Schedule, dayIndex: number): readonly FreeSlot[] {
  const onDay = schedule.items
    .filter((item) => item.dayIndex === dayIndex)
    .sort((a, b) => a.startHour - b.startHour)

  const gaps: FreeSlot[] = []
  let cursor = WAKE_HOUR

  for (const block of onDay) {
    const start = Math.max(block.startHour, WAKE_HOUR)
    const end = Math.min(block.startHour + block.hours, DAY_END_HOUR)
    if (end <= cursor) continue

    if (start - cursor >= MIN_GAP_HOURS) gaps.push({ startHour: cursor, hours: start - cursor })

    cursor = Math.max(cursor, end)
    if (cursor >= DAY_END_HOUR) return gaps
  }

  const tail = DAY_END_HOUR - cursor
  if (tail >= MIN_GAP_HOURS) gaps.push({ startHour: cursor, hours: tail })

  return gaps
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), high)

/**
 * An hour on this day where `hours` fits, as near `preferred` as the day allows.
 *
 * The solver's own use of `gapsOn`, and deliberately the plain one: `domain/slotFinder`
 * layers per-kind preferences on top of this for the add flow, which the search has no
 * business knowing about.
 *
 * Null when nothing fits, which callers treat as "leave it where the constant says" rather
 * than as a failure -- a candidate that lands badly is thrown out by `constraints` anyway,
 * and inventing a placement would be worse than declining to improve one.
 */
export function hourNear(
  schedule: Schedule,
  dayIndex: number,
  hours: number,
  preferred: number,
): number | null {
  const fitting = gapsOn(schedule, dayIndex).filter((gap) => gap.hours >= hours)
  if (fitting.length === 0) return null

  const placeIn = (gap: FreeSlot) =>
    clamp(preferred, gap.startHour, gap.startHour + gap.hours - hours)

  // Ties keep the earlier gap: `fitting` is already in order and `reduce` holds the
  // incumbent on equality.
  const best = fitting.reduce((winner, gap) =>
    Math.abs(placeIn(gap) - preferred) < Math.abs(placeIn(winner) - preferred) ? gap : winner,
  )

  return placeIn(best)
}
