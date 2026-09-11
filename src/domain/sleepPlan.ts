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

export type SleepBucket = 'under5' | 'six' | 'seven' | 'eightPlus'

/** Buckets, not a typed number (§7.5): nobody reports their night to the half hour, and
 *  asking for one collects a figure that means nothing. */
export const SLEEP_HOURS: Record<SleepBucket, number> = {
  under5: 4.5,
  six: 6,
  seven: 7,
  eightPlus: 8.5,
}

/**
 * One night, in hours.
 *
 * An index outside the fortnight is ignored rather than extending the array: `sleepByDay` has
 * to stay `horizonDays` long, or every reader that zips the two -- the solver's day inputs,
 * the projection, the bed -- silently desynchronises. Declining to write is the honest answer
 * to a caller bug, because it cannot corrupt the week.
 */
export function withSleepHours(schedule: Schedule, dayIndex: number, hours: number): Schedule {
  return {
    ...schedule,
    sleepByDay: schedule.sleepByDay.map((existing, index) =>
      index === dayIndex ? hours : existing,
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
 * Every night the student has not personally set, filled with their target.
 *
 * So raising the target moves the fortnight, while a night deliberately set to five stays
 * five. Without that distinction the app would overrule a student about their own life the
 * moment they adjusted the target.
 *
 * Shaped on `./softDeadlines.stampSoftDeadlines`, which already derives a field and stamps it
 * into a week -- the same pattern rather than a new one.
 */
export function seedSleepPlan(
  schedule: Schedule,
  targetHours: number,
  editedDays: readonly number[],
): Schedule {
  const edited = new Set(editedDays)

  return {
    ...schedule,
    sleepByDay: schedule.sleepByDay.map((existing, index) =>
      edited.has(index) ? existing : targetHours,
    ),
  }
}

/**
 * The whole fortnight, moved to a new target, keeping every night the student made their own.
 *
 * "Their own" is derived rather than stored: a night that still sits at the OLD target is one
 * nobody has touched, and anything else was set deliberately -- on the sleep page, or by
 * reporting what was actually slept. Both must survive a target change, and a reported night
 * especially: rewriting it would have the app overrule somebody about a night that already
 * happened.
 *
 * Derived rather than stored for a second reason too. The alternative is a list of edited day
 * indices, and day indices are fortnight-relative -- the list would silently come to describe
 * different nights the moment the fortnight rolled over, which is the same trap `sleepLog`
 * avoids by keying on a date.
 */
export function retargetSleep(
  schedule: Schedule,
  fromTarget: number,
  toTarget: number,
): Schedule {
  const edited = schedule.sleepByDay
    .map((hours, index) => (hours === fromTarget ? -1 : index))
    .filter((index) => index >= 0)

  return seedSleepPlan(schedule, toTarget, edited)
}
