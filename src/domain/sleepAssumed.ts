import type { Schedule } from '../optimizer'
import { dateFor } from './calendar'
import { nightBite } from './nightBite'
import { reportedOn, type SleepNight } from './sleepLog'
import { isRealSleepHours } from './sleepPlan'

/**
 * What the app BELIEVES each night will be, as against what the student typed.
 *
 * Those were the same field, and one field cannot be both: the page could either show a
 * student their own figure or let the projection reason from an honest one, never both. So
 * the two are separated -- the chosen figures live in `StoredSettings` (a target, plus any
 * night the student spoke about) and this derives what to assume from them.
 *
 * Every night from today onward is the figure the student chose, lowered to what their last
 * week of reported sleep actually shows (`sleepReality.measuredNight`). That is the point of
 * the whole feature: a student who plans eight hours and sleeps six had their fortnight
 * projected off eight, so the dial told them a week was survivable on sleep they do not get.
 *
 * Derived on every render and never the source of truth, which is what makes it safe for the
 * result to reach storage: a stale figure saved into a week is overwritten the next time this
 * runs, because the durable facts behind it -- the target, the chosen nights, the reported
 * log -- are held elsewhere.
 */
export function assumeSleep({
  schedule,
  today,
  measuredHours,
  chosenByDate,
  targetHours,
  wakeHour,
  reportedNights,
}: {
  readonly schedule: Schedule
  readonly today: number
  /** The last week's average, or null while fewer than three nights have been reported --
   *  below that the honest assumption is the student's own plan. */
  readonly measuredHours: number | null
  /** Hours the student chose for the night that BEGAN on each date. */
  readonly chosenByDate: Readonly<Record<string, number>>
  readonly targetHours: number
  /** The clock hour the student gets up, which fixes each night's bedtime and so decides what
   *  counts as booked over it (`domain/nightBite`). */
  readonly wakeHour: number
  /** §8's answered nights (`domain/sleepLog`), keyed by the morning each night ended. The
   *  ground truth for a night already past. */
  readonly reportedNights: readonly SleepNight[]
}): Schedule {
  return {
    ...schedule,
    sleepByDay: schedule.sleepByDay.map((existing, day) => {
      /*
       * Nights already past are history, not a forecast -- but history has a better source
       * than this array.
       *
       * What the student REPORTED is read from the log, keyed by the morning the night ended
       * (the day after the night itself). `sleepByDay` held the plan for a past night unless
       * the today card happened to have written the answer in, so the same fact had two homes
       * and they could disagree: a night reported over Telegram on the fortnight's first day
       * writes no week entry at all, because there is no day before day 0.
       *
       * An unreported past night keeps the plan that stood at the time, which is not ours to
       * revise -- rewriting it would change what the student's own week looked like.
       */
      if (day < today) {
        const morning = dateFor(schedule, day + 1)
        const reported = morning === null ? null : reportedOn(reportedNights, morning)

        return reported !== null && isRealSleepHours(reported) ? reported : existing
      }

      const date = dateFor(schedule, day)
      const stated = date === null ? undefined : chosenByDate[date]

      // Stored state is not trusted state. The page validates what it types, but a figure
      // could reach that store from an older build, a hand-edited blob, or a writer added
      // later -- and this is the layer every projection goes through, so this is where the
      // guarantee has to hold. `isRealSleepHours` is the same rule the field applies.
      const planned =
        stated !== undefined && isRealSleepHours(stated) ? stated : targetHours

      /*
       * What is actually booked over this night, believed rather than merely announced.
       *
       * Three surfaces said a day would cost hours of sleep -- the forecast sentence, the
       * week's night band, the room -- while the model went on assuming a full night. It
       * warned and then forecast as though the warning were false.
       *
       * The bedtime comes from the PLANNED hours, so this is not circular: the student
       * intended to be asleep by eleven, and work sitting over that is the bite.
       */
      const bitten = planned - nightBite({ schedule, dayIndex: day, wakeHour, plannedHours: planned }).hours

      /*
       * The LOWEST of the three, never the plan minus everything.
       *
       * `realityCheck` refuses to correct in the generous direction for the reason it states
       * -- that would "quietly make a heavy week look survivable, which is the opposite of
       * what this app is for" -- so nothing here raises a night. And taking the lowest rather
       * than subtracting both causes matters: a student who habitually over-commits already
       * has those lost hours inside their measured average, so subtracting the bite from it
       * as well would count the same hours twice. Whichever cause is worse decides.
       */
      const floor = Math.max(0, Math.min(bitten, measuredHours ?? planned))

      return Math.round(floor * 10) / 10
    }),
  }
}
