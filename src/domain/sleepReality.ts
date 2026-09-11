import { MIN_SAMPLES_TO_SPEAK } from './evidence'
import { reportedNights, type SleepNight } from './sleepLog'

/**
 * §7.6's Reality Check, for sleep.
 *
 * A deliberate mirror of `./realityCheck`, which does the same job for time estimates, down
 * to both of its rules -- the shared sample floor and the one-directional correction. A second
 * module rather than a mode flag on that one, because the quantities genuinely differ:
 * estimates correct by a multiplier over block outcomes, nights by an average over reported
 * hours.
 *
 * It compares the PLAN (`./sleepPlan`, and the target behind it) against what was REPORTED
 * (`./sleepLog`). That comparison is only possible because the log records which nights were
 * answered: with `sleepByDay` alone, an unanswered default and a reported night were the same
 * number, which is the defect `ui/room/todayRows.ts` states twice.
 */

/**
 * Below this the difference is rounding rather than a bias worth telling somebody about.
 *
 * Half an hour, because that is the resolution of the question actually asked: `SLEEP_HOURS`'
 * buckets sit half an hour apart at the narrowest, so a smaller gap than that is inside the
 * granularity of the answer and says nothing about the student.
 */
const WORTH_SAYING_HOURS = 0.5

/**
 * What the student actually sleeps, or null when the app has not earned the right to say.
 *
 * Null rather than the target, and rather than a population figure: a caller wanting a
 * fallback should choose it in the open. Silently substituting one here is how an unmeasured
 * figure ends up quoted as a measured one, which §8.2 is explicit the copy must never do.
 */
export function measuredNight(log: readonly SleepNight[]): number | null {
  const reported = reportedNights(log)
  if (reported.length < MIN_SAMPLES_TO_SPEAK) return null

  const total = reported.reduce((sum, hours) => sum + hours, 0)

  // One decimal place. The figure is read by a person, and it is summed from bucket values
  // whose mean is routinely a repeating decimal -- "average about 5.933333" reads as a
  // precision the four buckets cannot support.
  return Math.round((total / reported.length) * 10) / 10
}

/**
 * §7.6's line, or nothing.
 *
 * Nothing rather than a hedged sentence, exactly as `realityCheck.biasLine` returns null:
 * §7.6 is only the sharpest answer to "how is this different from a to-do list" if every line
 * on it is true, and a screen claiming a gap nobody measured is worse than a screen with
 * fewer lines.
 *
 * Only shortfalls speak. Sleeping better than planned is not a reason to raise what the app
 * assumes -- that would make a heavy week look survivable, which is the failure `realityCheck`
 * names in its own comment and refuses for the same reason.
 */
export function sleepRealityLine(
  log: readonly SleepNight[],
  targetHours: number,
): string | null {
  const measured = measuredNight(log)
  if (measured === null) return null
  if (targetHours - measured < WORTH_SAYING_HOURS) return null

  return `You plan ${targetHours} hours and average about ${measured}.`
}
