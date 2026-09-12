import { MAX_SLEEP_HOURS } from './sleepPlan'

/**
 * When a night happens, as against how long it is.
 *
 * `Schedule.sleepByDay[d]` says how many hours the night at the end of day d holds. This says
 * where those hours sit on a clock, so the week can draw the night instead of only counting
 * it -- and so the forecast's "this day will cost you about two hours of sleep" has a picture
 * behind it rather than being a claim a student has to take on faith.
 *
 * ## Why the night is not an event
 *
 * Sleep is deliberately not a block on the grid: `engine/types.ts` records that a sleep block
 * "would be charged nothing by `drain.ts` while `sleepByDay` counted the same hours again",
 * and `engine/reachable.test.ts` pins it. So this is a DRAWING, not a schedule entry, and it
 * changes no number the model reads.
 *
 * ## How it crosses midnight without being drawn twice
 *
 * It does not cross anything, because a night is not inside a day -- it is the boundary
 * between two of them, which is exactly what `sleepByDay[d]` already means. The band belongs
 * to day d, is drawn once at the foot of that day, and lives outside the day's hour axis. A
 * night from 23:00 to 07:00 spans two columns only if you try to lay it on an hours grid that
 * stops at midnight; laid on the boundary it spans nothing.
 *
 * The alternatives were worse. Drawing it in both columns states one night twice and leaves
 * the reader adding the halves. Extending every day's axis to 00:00-24:00 adds eight empty
 * rows to every day to hold one band -- and `dayGrid`'s own comment already refuses that for
 * blocks, because "a fixed window renders an empty day as twenty-four rows of nothing".
 *
 * ## Why it is anchored on waking
 *
 * The morning is the fixed end of a night: a student gets up for a nine o'clock class whatever
 * time they got to bed. Bedtime is what moves when a day runs long. So the wake hour is what
 * is stored and the bedtime is counted back from it -- which means a night that loses two
 * hours loses them off the front, which is what actually happens to a student finishing an
 * essay at one in the morning.
 */
export interface NightWindow {
  /** Clock hour the night begins, 0..24. Fractional for a half hour. */
  readonly bedHour: number
  /** Clock hour it ends. The anchored end -- see above. */
  readonly wakeHour: number
  readonly hours: number
  /**
   * Whether bedtime falls on the evening BEFORE the morning of waking.
   *
   * True for an ordinary night (23:00 to 07:00) and false for a short one that begins after
   * midnight (01:00 to 07:00). Midnight exactly is the boundary rather than a crossing of it.
   */
  readonly crossesMidnight: boolean
}

const HOURS_IN_A_DAY = 24

export function nightWindow(wakeHour: number, hours: number): NightWindow {
  const held = Math.min(Math.max(hours, 0), MAX_SLEEP_HOURS)
  const raw = wakeHour - held

  return {
    // `% 24` after the shift, so a 24-hour night wraps exactly once rather than landing at 24.
    bedHour: ((raw % HOURS_IN_A_DAY) + HOURS_IN_A_DAY) % HOURS_IN_A_DAY,
    wakeHour,
    hours: held,
    crossesMidnight: raw < 0,
  }
}

/**
 * The window as two clock times.
 *
 * Its own formatter rather than `kit/labels.hourLabel`, which prints ":00" always because it
 * labels whole-hour pickers. A night is the one place a fractional clock time arises: the
 * hours come in halves and the bedtime is counted back from waking, so 6.5 hours before 07:00
 * is half past midnight and rounding it away would misstate the one number this exists to
 * show.
 */
export function nightWindowLabel(window: NightWindow): string {
  if (window.hours === 0) return 'no night at all'

  const clock = (hour: number): string => {
    const whole = Math.floor(hour)
    const minutes = Math.round((hour - whole) * 60)

    return `${String(whole).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }

  return `${clock(window.bedHour)} → ${clock(window.wakeHour)}`
}

/**
 * When a student gets up, until they say otherwise.
 *
 * Seven, which with an eight-hour night puts bedtime at eleven -- a shape a student
 * recognises rather than one the app invented. Only a drawing depends on it, so a wrong guess
 * costs a picture that looks slightly off and never a number.
 */
export const DEFAULT_WAKE_HOUR = 7
