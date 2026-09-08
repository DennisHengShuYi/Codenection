import { CARRYOVER_HALF_LIFE_HOURS, CROSS_EFFECT } from './params'
import { LOAD_TYPES, type Activity, type LoadType, type Reserves } from './types'

/**
 * Exponential decay to half over `halfLife` hours.
 *
 * A half-life of zero means the residue does not persist at all, which is how sleep is
 * modelled: §6.6 calls it a full reset rather than a trailing effect.
 */
function decay(hoursSince: number, halfLife: number): number {
  if (halfLife <= 0) return 0
  return Math.pow(0.5, hoursSince / halfLife)
}

/**
 * §6.6: the residue recent activity leaves on each reserve's capacity, evaluated at a
 * given hour of the day.
 *
 * Returned as a delta on a multiplier, so -0.25 means "a quarter less mental capacity
 * than usual" and +0.1 means a tenth more. Only activities that have already *finished*
 * count: an activity still in progress has not left a residue yet, it is simply
 * happening.
 *
 * The consequence, per §6.6, is that sequencing becomes a lever. The optimizer can no
 * longer stack gym at 5pm and deep study at 7pm and call it a good day -- which is also
 * what partly answers the degrees-of-freedom problem in §2.5, since even when the days
 * are fixed the order within a day is usually free.
 */
export function carryoverAt(activities: readonly Activity[], hour: number): Reserves {
  const totals: Record<LoadType, number> = {
    mental: 0,
    physical: 0,
    social: 0,
    errands: 0,
  }

  for (const activity of activities) {
    const endHour = activity.startHour + activity.hours
    if (endHour > hour) continue

    const weight =
      activity.intensity * decay(hour - endHour, CARRYOVER_HALF_LIFE_HOURS[activity.kind])
    if (weight === 0) continue

    const effect = CROSS_EFFECT[activity.kind]
    for (const type of LOAD_TYPES) {
      totals[type] += effect[type] * weight
    }
  }

  return totals
}
