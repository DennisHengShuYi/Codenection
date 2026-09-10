import type { EngineParams } from '../engine'
import { DAY_END_HOUR, isWork, overlaps, type Schedule, type ScheduledItem } from '../optimizer'

/**
 * What a hand-placed block clashes with, said to the student rather than to the solver.
 *
 * This is not `violations`, and the difference is the whole reason it exists. `violations`
 * answers "may the search adopt this schedule", and it deliberately permits two movable
 * blocks sitting on top of each other, because rejecting that would cut legal paths out of
 * the neighbourhood. A student who has just put two things at the same hour has made a real
 * mistake and must be told -- the solver's tolerance is not the student's.
 *
 * These are warnings and never refusals. A student saying a lecture was cancelled, or that
 * two things genuinely do collide this week, is recording their life; an app that refuses
 * the entry is wrong about its own subject, and the fortnight it then holds is a fiction
 * every forecast is computed from. The double-booking is precisely the signal they came for.
 *
 * `overlaps` and `isWork` both come from `constraints.ts` rather than being redefined here,
 * so the warning and the constraint can never disagree about what counts as an overlap or
 * about what counts as work.
 */

/** One decimal, so a half-hour block does not report "7.000000000000001 hours". */
const round = (hours: number): number => Math.round(hours * 10) / 10

export function editWarnings({
  schedule,
  item,
  params,
}: {
  readonly schedule: Schedule
  /**
   * The block as it WOULD be.
   *
   * Not necessarily in `schedule` yet. When it is, it is matched by id and excluded below,
   * so a block moved two hours along its own day is never reported as clashing with its own
   * former self.
   */
  readonly item: ScheduledItem
  readonly params: EngineParams
}): readonly string[] {
  const found: string[] = []
  const others = schedule.items.filter((candidate) => candidate.id !== item.id)

  if (item.startHour + item.hours > DAY_END_HOUR) {
    found.push('This runs past midnight, so part of it falls outside the day it is on.')
  }

  if (item.deadlineDay !== null && item.dayIndex > item.deadlineDay) {
    found.push('This lands after its own deadline.')
  }

  for (const other of others) {
    if (!overlaps(item, other)) continue

    if (other.protectedRest) {
      found.push(`This sits on ${other.title}, which is protected recovery.`)
    } else if (other.fixed) {
      found.push(`This clashes with ${other.title}, which your week is built around.`)
    } else {
      found.push(`This overlaps ${other.title}.`)
    }
  }

  const dayHours = others
    .filter((candidate) => candidate.dayIndex === item.dayIndex && isWork(candidate))
    .reduce((total, candidate) => total + candidate.hours, isWork(item) ? item.hours : 0)

  if (dayHours > params.dailyHoursCap) {
    found.push(
      `That day would come to ${round(dayHours)} hours of work, past the ${round(params.dailyHoursCap)} you can hold.`,
    )
  }

  return found
}
