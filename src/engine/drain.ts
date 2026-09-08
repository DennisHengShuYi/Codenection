import { carryoverAt } from './carryover'
import { overallReserve } from './efficiency'
import { stateMultiplier } from './stateCost'
import type { Activity, DayInput, EngineParams, LoadType, Reserves } from './types'

/**
 * What costs a reserve.
 *
 * Rest and sleep are recovery rather than load, which is what stops a well-rested day
 * reading as a busy one. Restorative social contact is excluded for a less obvious
 * reason: §5.2 prescribes *a person* when social reserve is low, so an evening with a
 * friend has to give social reserve back rather than take it. Charging it as drain would
 * be exactly the sums-the-hours mistake §1.2 warns against -- it would make the app
 * treat seeing people as a cost and quietly recommend isolation.
 *
 * Draining social obligations -- the networking event, the group project nobody wants --
 * are a separate kind and do still cost.
 */
const isDraining = (activity: Activity): boolean =>
  activity.kind !== 'rest' && activity.kind !== 'sleep' && activity.kind !== 'socialRestorative'

/** What breaks up a day. Wider than `isDraining`: an evening out is restorative and
 *  still interrupts an afternoon of work, so it counts as a context switch even though
 *  it costs no reserve. */
const isSwitch = (activity: Activity): boolean =>
  activity.kind !== 'rest' && activity.kind !== 'sleep'

/**
 * §6.4: fragmented days drain more than blocked days at equal hours.
 *
 * Counts the switches between separate blocks -- one block is zero, four blocks is
 * three switches. This is also what §2.1's objective penalises, to stop the solver
 * "fixing" a week by scattering ten small tasks across every day: that lowers peak load
 * while draining more.
 */
export function fragmentation(activities: readonly Activity[]): number {
  let blocks = 0
  for (const activity of activities) {
    if (isSwitch(activity)) blocks += 1
  }

  return Math.max(0, blocks - 1)
}

/** Anticipatory stress is real (§6.4). The closer the nearest deadline, the more mental
 *  load the day carries before any work is done. */
function deadlineDrain(daysToNearestDeadline: number | null, weight: number): number {
  if (daysToNearestDeadline === null) return 0
  return weight / (1 + Math.max(0, daysToNearestDeadline))
}

/**
 * §6.4. Per-type drain for a single day.
 *
 * Each activity costs `hours × intensity × typeIntensity × estimateBias`, scaled by the
 * §6.6 state multiplier for the reserve it spends. The state multiplier is what makes
 * this a model rather than a sum of hours: the same two hours cost more when the student
 * reaches them already spent, and cost differently depending on what they just did.
 *
 * On top of the per-activity cost sit four day-level terms: context switching and
 * deadline proximity on mental, travel on errands, and isolation on social.
 */
export function drainForDay(
  day: DayInput,
  reserves: Reserves,
  params: EngineParams,
): Reserves {
  const overall = overallReserve(reserves)

  const totals: Record<LoadType, number> = {
    mental: 0,
    physical: 0,
    social: 0,
    errands: 0,
  }

  for (const activity of day.activities) {
    if (!isDraining(activity)) continue

    const residue = carryoverAt(day.activities, activity.startHour)[activity.type]

    totals[activity.type] +=
      activity.hours *
      activity.intensity *
      params.typeIntensity[activity.type] *
      params.estimateBias[activity.type] *
      stateMultiplier(overall, residue)
  }

  totals.mental +=
    fragmentation(day.activities) * params.contextSwitchPenalty +
    deadlineDrain(day.daysToNearestDeadline, params.deadlineProximityWeight)

  totals.errands += day.venueChanges * params.travelLoadPerVenueChange

  // §1.2: low social load is a warning, not "good". Most trackers would count a quiet
  // day as healthy. Social is therefore the one reserve that drains from *absence* of
  // activity -- which is what makes a student who is not busy but is isolated show as
  // unwell, and it is the clearest evidence the model understands burnout rather than
  // doing bookkeeping on hours.
  let socialHours = 0
  for (const activity of day.activities) {
    if (activity.type === 'social') socialHours += activity.hours
  }

  if (socialHours < params.socialFloorHoursPerDay) {
    totals.social += params.isolationDrainPerDay
  }

  return totals
}
