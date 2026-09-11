import { DAY_END_HOUR, WAKE_HOUR, type Schedule } from '../optimizer'
import { blocksOnDay } from './dayBlocks'
import type { NightBite } from './nightBite'

/**
 * What an over-full day is going to cost, said before the night rather than after it.
 *
 * `ui/room/dayLoad.ts` has computed this quantity all along -- its `spillHours` is the hours a
 * day asks for beyond a waking day, and its own docstring already attributes them to sleep:
 * they "have to come out of sleep". Nothing ever acted on it. Spill only dimmed the room's
 * light and darkened its window, so the app knew and never said.
 *
 * Ruling 65: a FORECAST, and deliberately never a record. Nothing here writes to `sleepByDay`, so the
 * app never asserts what a student slept on a night it did not observe -- the same rule that
 * keeps the bed row silent about a night nobody answered. The consequence, stated rather than
 * hidden: the projection still assumes the planned night on an over-committed day, so it is
 * optimistic there, and this sentence plus the room's own darkening is what covers it.
 *
 * Not shared with `dayLoad` despite computing the same thing, for a layering reason: that
 * module is in `src/ui` and takes a block log, and `src/domain` may not import `src/ui`. Both
 * derive the day's length from `WAKE_HOUR` and `DAY_END_HOUR` -- the solver's own boundaries --
 * so there is still exactly one idea in this codebase of how long a day is, which is the
 * property `dayLoad`'s comment protects.
 */

/** Sixteen hours: the window the solver will place work into. */
const WAKING_HOURS = DAY_END_HOUR - WAKE_HOUR

/**
 * Under half an hour is a day running slightly long, not a night being eaten.
 *
 * The same figure as `gaps.MIN_GAP_HOURS`, which is the smallest span this app considers worth
 * scheduling at all -- so warning about less would be warning about something nobody could
 * have placed differently.
 */
const WORTH_WARNING_HOURS = 0.5

export interface SleepSqueeze {
  /** Hours the day asks for beyond a waking day. Zero when it fits. */
  readonly hours: number
  /** Whether a REAL deadline falls on this day. Soft deadlines are excluded by design -- see
   *  the module comment and `softDeadlines.ts`. */
  readonly deadlineToday: boolean
}

/**
 * What this day is going to take out of the night after it.
 *
 * Measured against everything the day asks for rather than what is left of it, for the reason
 * `dayLoad` gives: a day that could never have fitted was over-committed when it was planned,
 * and working through it one block at a time does not retrospectively make it fit.
 */
export function squeezeOn(schedule: Schedule, dayIndex: number): SleepSqueeze {
  // `blocksOnDay` rather than a filter of its own: the question "which blocks are on this day"
  // already has one answer in this codebase, and a second here would be free to drift from it.
  const onDay = blocksOnDay(schedule, dayIndex)
  const asked = onDay.reduce((total, item) => total + item.hours, 0)

  return {
    hours: Math.max(0, Math.round((asked - WAKING_HOURS) * 10) / 10),
    // `deadlineDay`, never `effectiveDeadline`. A synthetic deadline lands on rest and
    // recovery as readily as on coursework, so reading the effective one here would have the
    // app tell a student their overdue walk is costing them sleep.
    deadlineToday: onDay.some((item) => item.deadlineDay === dayIndex),
  }
}

/**
 * The sentence, or nothing.
 *
 * Two claims of different strength, and keeping them apart is what makes either trustworthy:
 *
 * - CERTAIN -- something is booked over the night, and it can be named. `nightBite` finds it
 *   by the clock, so the sentence points at a block a student can move.
 * - INFERRED -- the day asks for more hours than a day holds. Something must give and sleep
 *   usually does, but nothing is literally scheduled at one in the morning.
 *
 * The certain one wins when both are true: a named block beats an arithmetic remainder. And
 * the weaker one is worded as an inference rather than stated like the strong one, which is
 * what the volume-only detector got wrong -- it made every claim sound equally solid, so none
 * of them could be relied on.
 *
 * Both are about a night still ahead. The app has observed nothing, so it forecasts and never
 * reports.
 *
 * `dayLabel` is supplied rather than derived. `domain/calendar.shortDayLabel` is the only
 * place a day index becomes a name -- §9 puts this app at UTC+8, where a second answer to
 * that question is wrong for the first eight hours of every day.
 */
export function sleepForecastLine(
  bite: NightBite,
  squeeze: SleepSqueeze,
  dayLabel: string,
): string | null {
  const cost = (hours: number): string => (hours === 1 ? '1 hour' : `${hours} hours`)

  if (bite.hours >= WORTH_WARNING_HOURS) {
    // The biggest offender, where several run late. Naming them all makes a sentence nobody
    // reads; naming the worst one makes a move somebody can act on.
    const worst = bite.blocks.reduce(
      (largest, item) => (item.hours > largest.hours ? item : largest),
      bite.blocks[0]!,
    )
    const due = bite.deadlineToday ? ' is due, and' : ''

    return `${dayLabel}: ${worst.title}${due} runs past bedtime — about ${cost(bite.hours)} off that night.`
  }

  if (squeeze.hours >= WORTH_WARNING_HOURS) {
    return `${dayLabel} asks for about ${cost(squeeze.hours)} more than the day has.`
  }

  return null
}
