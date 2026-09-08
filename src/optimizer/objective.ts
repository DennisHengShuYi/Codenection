import { project, type DayInput, type EngineParams } from '../engine'
import type { Schedule } from './types'

/** §2.1's two penalty weights. They live here rather than in the engine's params: they
 *  are properties of how we score a schedule, not of how a student's reserves behave,
 *  and `src/engine` must not depend on the optimizer. */
export const DEFICIT_DAY_WEIGHT = 0.3
export const FRAGMENTATION_WEIGHT = 0.1

/**
 * Deliberately tiny, because this is a tiebreaker and not a fourth objective.
 *
 * Deficit area runs to several hundred on a bad fortnight, so at this weight it
 * contributes well under a point -- less than any real gain in the floor and less than a
 * single deficit day. The ordering stays exactly as §2.1 states it: floor first, then
 * deficit days, then fragmentation, and only then depth. If this were large enough to
 * outrank the floor, the solver could trade a genuinely higher worst day for a flatter
 * but lower week, which is the outcome §2.1's min() exists to forbid.
 */
export const DEFICIT_AREA_WEIGHT = 0.001

/** Rest and sleep are recovery, not load, and must not count against the daily cap or
 *  the fragmentation penalty. */
const isWork = (kind: string): boolean => kind !== 'rest' && kind !== 'sleep'

/**
 * Turns a schedule into the per-day inputs the engine consumes.
 *
 * The engine knows nothing about scheduling and the optimizer knows nothing about
 * reserves; this function is the only place the two vocabularies meet, which is what
 * keeps either one replaceable without touching the other.
 */
export function toDayInputs(schedule: Schedule): DayInput[] {
  return Array.from({ length: schedule.horizonDays }, (_, dayIndex) => {
    const onThisDay = schedule.items.filter((item) => item.dayIndex === dayIndex)

    // Only deadlines still ahead of this day create anticipatory stress. A deadline
    // already passed is either met or moot, and either way it has stopped weighing.
    const pending = schedule.items
      .map((item) => item.deadlineDay)
      .filter((day): day is number => day !== null && day >= dayIndex)

    return {
      dayIndex,
      activities: onThisDay.map((item) => ({
        kind: item.kind,
        type: item.type,
        hours: item.hours,
        intensity: item.intensity,
        startHour: item.startHour,
      })),
      sleepHours: schedule.sleepByDay[dayIndex] ?? 7,
      // Each distinct working block is treated as a venue; back-to-back commitments in
      // one place are the exception rather than the rule for a student crossing campus.
      venueChanges: Math.max(0, onThisDay.filter((item) => isWork(item.kind)).length - 1),
      daysToNearestDeadline: pending.length === 0 ? null : Math.min(...pending) - dayIndex,
      checkedIn: true,
    }
  })
}

function totalFragmentation(schedule: Schedule): number {
  let total = 0

  for (let day = 0; day < schedule.horizonDays; day += 1) {
    const working = schedule.items.filter(
      (item) => item.dayIndex === day && isWork(item.kind),
    )
    total += Math.max(0, working.length - 1)
  }

  return total
}

/**
 * §2.1's objective, verbatim:
 *
 *     score = min(reserve over the horizon)
 *             − 0.3 × count(days below deficit)
 *             − 0.1 × fragmentation penalty
 *
 * It maximises the *minimum* reserve, not the total and not the evenness, because
 * burnout is a floor problem: a fortnight that averages fine but bottoms out at 8 is
 * still a crash.
 *
 * The floor is `worstFloor` -- the lowest single reserve across every type and day --
 * rather than the lowest daily mean. Scoring the mean would let the solver trade a
 * wrecked mind for a rested body and call it an improvement, which is the single-number
 * failure §6.3 exists to prevent.
 */
export function score(schedule: Schedule, params: EngineParams): number {
  const projection = project(schedule.start, toDayInputs(schedule), params)

  return (
    projection.worstFloor -
    DEFICIT_DAY_WEIGHT * projection.deficitDays -
    FRAGMENTATION_WEIGHT * totalFragmentation(schedule) -
    DEFICIT_AREA_WEIGHT * projection.deficitArea
  )
}
