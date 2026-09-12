import { blocksOnDay } from '../../domain/dayBlocks'
import { MIN_SAMPLES_TO_SPEAK } from '../../domain/evidence'
import type { ActivityKind } from '../../engine'
import type { Schedule } from '../../optimizer'
import { trendOf, type Trend } from '../dial/trend'

/**
 * Which way a room object's load is heading, and how the panel says so.
 *
 * Loadline's SEE bullet asks for "load, contributing factors, and trends" per object. The
 * Today panel already answered the first two -- the row's number, and the blocks behind it
 * when the row is opened -- and nothing answered the third. Trend existed, but per *reserve*
 * and on another screen, so there was no way to learn that study has been growing all week.
 *
 * `objectTrend` is forward-looking, across today and the next two days. The panel is about
 * today, and what a capacity app is for is saying what is coming before it arrives; a backward
 * window would describe a week the student has already lived and cannot change.
 *
 * `sleepTrend` is the one exception, and looks backward, because a schedule is a plan and the
 * only honest evidence about a night is what was reported afterwards. The exception is stated
 * here rather than left to be discovered: reading `sleepByDay` forward would present the plan
 * as a measurement, which is the confusion that kept the bed row silent in the first place.
 */

/** Today and the next two. Matches `trendOf`'s own window, so the two readings a student can
 *  see at once are over the same number of days. */
export const TREND_DAYS = 3

/**
 * Hours. Half an hour more a day is scheduling noise; this is where three days of drift
 * becomes something worth a sentence.
 *
 * Deliberately not `trendOf`'s reserve-point default of 1.5, which on an hours scale would
 * call two hours becoming three and a quarter flat -- most of a study block.
 */
export const HOURS_EPSILON = 0.75

/** Things. A count has no fractions, so anything short of one whole extra errand has not
 *  moved at all. */
export const COUNT_EPSILON = 1

/**
 * What a row measures, which decides both the arithmetic and the wording.
 *
 * `room` is rest, and it is its own unit rather than `hours` for one reason: the wording has
 * to describe room available and never a shortfall. Rest is the one object the room
 * deliberately does not draw, because it is not a duty owed to anyone.
 */
export type TrendUnit = 'hours' | 'count' | 'room' | 'sleep'

/**
 * Which way the student's nights are going.
 *
 * The one trend on this panel that looks BACKWARD, and it has to: every other row reads a
 * schedule, which is a plan, while sleep's only honest evidence is what was actually reported
 * (`domain/sleepLog`). A forward window over `sleepByDay` would be reading the plan back as
 * though it were a measurement -- the precise confusion that kept this row silent.
 *
 * Flat below the shared evidence floor, which is what makes the row say nothing: two points
 * make a line out of a coincidence, and `MIN_SAMPLES_TO_SPEAK` is the one rule the whole app
 * uses before it says anything measured about somebody.
 */
export function sleepTrend(reportedNights: readonly number[]): Trend {
  if (reportedNights.length < MIN_SAMPLES_TO_SPEAK) return 'flat'

  return trendOf(reportedNights, HOURS_EPSILON)
}

export function objectTrend(
  schedule: Schedule,
  today: number,
  kinds: readonly ActivityKind[],
  unit: TrendUnit,
): Trend {
  /**
   * Only days the fortnight actually has.
   *
   * Padding the window to three with days past the horizon was the first attempt, and it read
   * a four-hour final day as *falling* -- because it was comparing against two days that do
   * not exist and therefore hold nothing. A day beyond the horizon is not a quiet day; it is
   * not a day. Truncating instead leaves `trendOf` a one- or two-point series near the end,
   * which is what its own "fewer than two points is flat" rule is for.
   */
  const lastDay = Math.min(today + TREND_DAYS - 1, schedule.horizonDays - 1)

  // `blocksOnDay` rather than a filter of its own, for the reason `panelRowsFor` uses it:
  // "which blocks are on this day" already has one answer in this codebase, and a second one
  // here would be free to drift from it -- over protected rest, say, which it includes.
  const series = Array.from({ length: Math.max(0, lastDay - today + 1) }, (_, offset) => {
    const onDay = blocksOnDay(schedule, today + offset).filter((item) =>
      kinds.includes(item.kind),
    )

    return unit === 'count'
      ? onDay.length
      : onDay.reduce((total, item) => total + item.hours, 0)
  })

  return trendOf(series, unit === 'count' ? COUNT_EPSILON : HOURS_EPSILON)
}

/**
 * The row's phrase, or null when there is nothing to say.
 *
 * Words rather than the arrow the reserve bars use, and that is the whole of the decision: on
 * a bar an up arrow means the reserve rose, which is good news, while here rising hours is bad
 * news. One glyph meaning opposite things two taps apart is worse than two vocabularies.
 *
 * Null when flat, because a phrase on a row with nothing behind it is a claim -- the same rule
 * `DomainBarList` already applies to its glyph.
 */
export function trendPhrase(trend: Trend, unit: TrendUnit): string | null {
  if (trend === 'flat') return null

  if (unit === 'count') return trend === 'rising' ? 'piling up' : 'clearing'
  if (unit === 'room') return trend === 'rising' ? 'more room than usual' : 'less room ahead'
  // Sleep is the one row where RISING is good news, so it cannot borrow the hours wording
  // below: "easing off" on a row about sleep reads as reassurance about the thing going
  // wrong. Plainly descriptive instead, and it never tells the student what to do about it.
  if (unit === 'sleep') return trend === 'rising' ? 'getting longer' : 'getting shorter'

  // "picking up" rather than "more coming", decided by looking at it: on a row reading
  // "nothing today", "more coming" claims more than something when there is nothing yet.
  // This works from zero and from four hours alike, and pairs with "easing off".
  return trend === 'rising' ? 'picking up' : 'easing off'
}
