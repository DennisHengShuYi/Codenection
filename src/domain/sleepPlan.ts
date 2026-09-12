import type { Schedule } from '../optimizer'

/**
 * `Schedule.sleepByDay` is THE PLAN: what the app assumes each night will be.
 *
 * What was actually reported lives in `./sleepLog`, and the two are compared in
 * `./sleepReality`. Keeping them apart is what lets the app tell "slept eight hours" from
 * "nobody has asked yet" -- the defect `ui/room/todayRows.ts` states twice, and the reason
 * the bed row could not draw a trend.
 *
 * These are the only writers of `sleepByDay`, and they live here rather than in `src/ui`
 * because the plan is now COMPOSED -- from a stated target, the nights the student edited, and
 * the nights they reported. `withSleep` sat in `ui/today/checkIn.ts` while it had one caller
 * and one meaning, the night just reported; composing it there would have meant the Telegram
 * bot reaching into `src/ui` to write the model, which it already did and which the layering
 * rule forbids in spirit.
 */

export type SleepBucket = 'under5' | 'six' | 'seven' | 'eightPlus' | 'tenPlus'

/**
 * Buckets, not a typed number (§7.5): nobody reports their night to the half hour, and asking
 * for one collects a figure that means nothing.
 *
 * `tenPlus` was added once a short night began costing reserve (Ruling 67). The top bucket
 * stopped at 8.5, so a student who slept eleven hours after a bad week had no way to say so --
 * and the one night that most deserves recording is the recovery night. The four original
 * values are unchanged: the log stores hours rather than bucket names, so nothing already
 * reported is rewritten by this.
 */
export const SLEEP_HOURS: Record<SleepBucket, number> = {
  under5: 4.5,
  six: 6,
  seven: 7,
  eightPlus: 8.5,
  tenPlus: 10,
}

/** A night is somewhere between none at all and a whole day. Zero is deliberately allowed:
 *  an all-nighter is a real night, and it has to be tellable from a blank field. */
export const MAX_SLEEP_HOURS = 24

/**
 * Whether a figure is a night the model can actually hold.
 *
 * Here rather than only in the input that happens to be on screen, because the sleep page now
 * lets a student type a number and this project's rule is that untrusted input is validated at
 * the boundary and never becomes trusted by passing through a layer. Every writer of
 * `sleepByDay` goes through `withSleepHours`, so this is the boundary.
 *
 * It guards the model and not just the display: `recovery = max(0, sleep - 5) x k_sleep`
 * (§6.1), so a night of 500 would hand a student a fortnight of invented recovery, and a
 * `NaN` would poison every projection that touched it.
 */
export function isRealSleepHours(hours: number): boolean {
  return Number.isFinite(hours) && hours >= 0 && hours <= MAX_SLEEP_HOURS
}

/** One decimal. The rule `editWarnings` and `blockLog` already apply, for their reason: this
 *  figure is summed and averaged repeatedly downstream, and a raw binary-float remainder
 *  drifts further with every operation on it for a measurement nobody made. */
const round = (hours: number): number => Math.round(hours * 10) / 10

/**
 * One night, in hours.
 *
 * Two things are declined rather than written, and for the same reason: a write that cannot
 * be right is worse than no write, because it corrupts a week every other reader treats as
 * settled.
 *
 * An index outside the fortnight -- `sleepByDay` has to stay `horizonDays` long, or every
 * reader that zips the two (the solver's day inputs, the projection, the bed) silently
 * desynchronises.
 *
 * A figure the model cannot hold -- see `isRealSleepHours`. The sleep page validates before
 * calling and tells the student what is wrong; this is the layer that makes the same
 * guarantee for the Telegram side and for anything written later.
 */
export function withSleepHours(schedule: Schedule, dayIndex: number, hours: number): Schedule {
  if (!isRealSleepHours(hours)) return schedule

  return {
    ...schedule,
    sleepByDay: schedule.sleepByDay.map((existing, index) =>
      index === dayIndex ? round(hours) : existing,
    ),
  }
}

/** One night, from a reported bucket. The signature the today card and the Telegram bot
 *  already call, unchanged by the move. */
export function withSleep(
  schedule: Schedule,
  dayIndex: number,
  bucket: SleepBucket,
): Schedule {
  return withSleepHours(schedule, dayIndex, SLEEP_HOURS[bucket])
}


/**
 * The day whose end-of-day night a student is reporting this morning.
 *
 * `sleepByDay[d]` is the night at the END of day d, which §6.1's arithmetic decides rather
 * than anyone choosing: sleep enters `recovery[d]`, and `recovery[d]` produces `reserve[d+1]`.
 * So the night that finished this morning belongs to yesterday's entry.
 *
 * This subtraction is done here and nowhere else, because getting it wrong is invisible. The
 * check-in card asked "how much sleep last night?" and wrote the answer to `sleepByDay[today]`
 * -- tonight, a night that had not happened. Last night's sleep therefore never reached the
 * day it explained, so the app could never say "you are low today because you slept five
 * hours", and tonight's plan was overwritten by a night already past.
 *
 * Null on day 0, and that is the honest answer rather than a clamp. The night before the
 * fortnight began is outside the week the app holds; `domain/sleepLog` can still record it,
 * because that log is keyed by date and not bounded by the horizon.
 */
export function lastNight(today: number): number | null {
  return today <= 0 ? null : today - 1
}
