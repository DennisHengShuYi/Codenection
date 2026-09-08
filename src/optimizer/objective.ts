import { summarise, type DayInput, type EngineParams } from '../engine'
import type { Schedule, ScheduledItem } from './types'

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
/** One pass over the items instead of one pass per day. The search calls this for every
 *  candidate it scores, so filtering the whole schedule 21 times over is 21x the work to
 *  answer a question a single grouping pass answers. */
function groupByDay(schedule: Schedule): ScheduledItem[][] {
  const byDay: ScheduledItem[][] = Array.from({ length: schedule.horizonDays }, () => [])

  for (const item of schedule.items) {
    byDay[item.dayIndex]?.push(item)
  }

  return byDay
}

/**
 * The nearest deadline at or after each day.
 *
 * One backward sweep: walking from the end, the nearest deadline for a day is either one
 * falling on that day or whatever the following day already found. Only deadlines still
 * ahead create anticipatory stress -- one already passed is either met or moot, and
 * either way it has stopped weighing.
 */
function nearestDeadlineByDay(schedule: Schedule): (number | null)[] {
  const deadlines = new Set<number>()
  for (const item of schedule.items) {
    if (item.deadlineDay !== null) deadlines.add(item.deadlineDay)
  }

  const out: (number | null)[] = Array.from({ length: schedule.horizonDays }, () => null)
  let nearest: number | null = null

  for (let day = schedule.horizonDays - 1; day >= 0; day -= 1) {
    if (deadlines.has(day)) nearest = day
    out[day] = nearest
  }

  return out
}

export function toDayInputs(schedule: Schedule): DayInput[] {
  return dayInputsFrom(schedule, groupByDay(schedule))
}

function dayInputsFrom(
  schedule: Schedule,
  byDay: readonly ScheduledItem[][],
): DayInput[] {
  const nearestDeadline = nearestDeadlineByDay(schedule)

  return byDay.map((onThisDay, dayIndex) => {
    let workingBlocks = 0
    for (const item of onThisDay) if (isWork(item.kind)) workingBlocks += 1

    const deadline = nearestDeadline[dayIndex] ?? null

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
      venueChanges: Math.max(0, workingBlocks - 1),
      daysToNearestDeadline: deadline === null ? null : deadline - dayIndex,
      checkedIn: true,
    }
  })
}

function fragmentationOf(byDay: readonly ScheduledItem[][]): number {
  let total = 0

  for (const onThisDay of byDay) {
    let working = 0
    for (const item of onThisDay) if (isWork(item.kind)) working += 1
    total += Math.max(0, working - 1)
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
  // Grouped once and shared. The search calls this for every candidate on every
  // iteration, so a second pass over the same items to count fragmentation is pure waste.
  const byDay = groupByDay(schedule)
  const projection = summarise(schedule.start, dayInputsFrom(schedule, byDay), params)

  return (
    projection.worstFloor -
    DEFICIT_DAY_WEIGHT * projection.deficitDays -
    FRAGMENTATION_WEIGHT * fragmentationOf(byDay) -
    DEFICIT_AREA_WEIGHT * projection.deficitArea
  )
}
