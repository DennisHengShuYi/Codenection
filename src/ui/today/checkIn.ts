import { answeredIds, outcomesFrom, type BlockRecord } from '../../domain/blockLog'
import type { Schedule, ScheduledItem } from '../../optimizer'

/**
 * §8: one card, three taps, once a day.
 *
 * The old version asked *did it happen* and *was it harder* about **every** block. Four
 * blocks was eight taps, which is why it would never have happened -- and the accuracy
 * number it feeds would have read "not enough data" forever.
 *
 * `BlockAnswer` and `ANSWER_FACTOR` live in `../../domain/blockLog` now, delivered and
 * tested by Task 8b -- imported by the caller from there, not redefined here.
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
 * The unconfirmed block whose load type the app knows least about.
 *
 * Asking once a day would otherwise take a fortnight to clear `MIN_SAMPLES` for all four
 * types. Choosing the least-sampled one fills the gaps first, so §2.4's correction starts
 * working as early as asking once a day allows.
 *
 * `blockLog` is §8b's durable record, threaded in optionally and defaulting to empty --
 * mirroring `scheduleView.ts` and `blockActions.ts` -- so every caller built before the log
 * existed keeps compiling and behaving exactly as it did. Task 17 dropped the profile's own
 * `confirmedItemIds`/`confirmations`: they were unioned with the log only until something
 * wrote a `BlockRecord` in the running app, which `TodayCard` and the Telegram bot now do,
 * so the log is the only source left.
 *
 * `nowHour` is required, not optional: a block on today is askable only once it has
 * finished, and an optional clock is one a caller forgets to pass -- which silently let a
 * block scheduled for later today be asked about ("how did it go?" about an 8pm block at
 * 2pm), feeding a wrong answer into the estimate bias behind the app's published accuracy
 * figure. It is threaded in from the same site as `today`, mirroring the rule in
 * `RoomShell.tsx` that the clock enters at the UI edge and nowhere deeper.
 */
export function blockToAsk({
  schedule,
  today,
  nowHour,
  blockLog = [],
}: {
  readonly schedule: Schedule
  readonly today: number
  readonly nowHour: number
  readonly blockLog?: readonly BlockRecord[]
}): ScheduledItem | null {
  const alreadyAsked = (id: string) => answeredIds(blockLog).includes(id)

  // A past day is askable as it always was. A future day never is. Today is askable only
  // once the block has actually finished -- otherwise the card can ask about something
  // that has not happened yet.
  const hasHappened = (item: ScheduledItem): boolean => {
    if (item.dayIndex < today) return true
    if (item.dayIndex > today) return false
    return item.startHour + item.hours <= nowHour
  }

  const outcomes = outcomesFrom(blockLog)
  const samples = (item: ScheduledItem): number =>
    outcomes.filter((outcome) => outcome.type === item.type).length

  const candidates = schedule.items
    .filter((item) => hasHappened(item) && !alreadyAsked(item.id))
    .slice()
    .sort(
      (left, right) =>
        samples(left) - samples(right) ||
        left.dayIndex - right.dayIndex ||
        left.startHour - right.startHour,
    )

  return candidates[0] ?? null
}

/** Writes the reported night into the week. Nothing has ever written `sleepByDay` after the
 *  week was created, which is why the plant and the bed have been reporting a constant.
 *  Returns a new week rather than writing into the one it was given -- the rule this module
 *  makes load-bearing, since this is the one place that puts something into a week that
 *  every other reader treats as already settled. */
export function withSleep(schedule: Schedule, dayIndex: number, bucket: SleepBucket): Schedule {
  return {
    ...schedule,
    sleepByDay: schedule.sleepByDay.map((hours, index) =>
      index === dayIndex ? SLEEP_HOURS[bucket] : hours,
    ),
  }
}
