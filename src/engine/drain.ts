import { carryoverAt } from './carryover'
import { stateMultiplier } from './stateCost'
import { LOAD_TYPES } from './types'
import type { Activity, ActivityKind, DayInput, EngineParams, LoadType, Reserves } from './types'

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
 * "For the reserve it spends" is now literally true. It read the mean of all four, which
 * left every other factor in the expression indexed by `activity.type` and this one not --
 * so an empty social reserve quietly taxed every study hour, and a student with nothing
 * left mentally paid for a study block as though they were evenly two-thirds full. §6.6
 * names one reserve percentage against one study block, and the reserve a study block
 * spends is mental.
 *
 * On top of the per-activity cost sit four day-level terms: context switching and
 * deadline proximity on mental, travel on errands, and isolation on social.
 */
export function drainForDay(
  day: DayInput,
  reserves: Reserves,
  params: EngineParams,
): Reserves {
  const totals: Record<LoadType, number> = {
    mental: 0,
    physical: 0,
    social: 0,
    errands: 0,
  }

  /*
   * §6.1 amended: a night short of the baseline costs something.
   *
   * Bounded by the baseline itself, so a night of none at all is the worst there is -- there
   * is no negative sleep to charge for. Charged flat rather than through `actualCost`'s state
   * multiplier: that multiplier prices the effort of DOING something at a given reserve, and
   * a night that did not happen is not an activity. The compounding comes from the reserve
   * itself falling, which makes the next day's work dearer.
   *
   * `params.kSleepDebt` carries the reasoning for the coefficients, including why social is
   * zero here exactly as it is in `kSleep`.
   */
  const short = Math.max(0, params.sleepBaselineHours - day.sleepHours)
  if (short > 0) {
    for (const type of LOAD_TYPES) totals[type] += short * params.kSleepDebt[type]
  }

  for (const activity of day.activities) {
    if (!isDraining(activity)) continue

    const residue = carryoverAt(day.activities, activity.startHour)[activity.type]

    // The block's own correction where §2.4 has enough to give it one, the area-wide
    // figure otherwise. A student whose essays run 3x over and whose lab reports land on
    // time used to pay the average of the two on both.
    const bias = activity.estimateBias ?? params.estimateBias[activity.type]

    totals[activity.type] +=
      activity.hours *
      activity.intensity *
      params.typeIntensity[activity.type] *
      bias *
      stateMultiplier(reserves[activity.type], residue)
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

/** One line of a day's drain, in the terms the model actually charged it. */
export interface DrainSource {
  /** The kind of work, or the name of a day-level charge. */
  readonly source: ActivityKind | 'fragmentation' | 'deadline' | 'travel' | 'isolation'
  readonly type: LoadType
  readonly points: number
}

/**
 * The same day's drain, itemised.
 *
 * `drainForDay` returns four totals, which is everything the model needs and nothing a
 * student can be told. Explaining a deficit day means naming where the points went, so this
 * returns the same arithmetic with the sources kept apart -- activities gathered by kind, and
 * each day-level charge on its own line.
 *
 * A second function rather than a refactor of the first, deliberately. `drainForDay` runs
 * thousands of times inside §2.1's search, and building a breakdown object per day per
 * candidate is a cost the search would pay for a sentence it never reads. This is called once,
 * for one day, when a student asks why.
 *
 * That leaves two copies of one formula. `drain.test.ts` binds them: the sources must sum to
 * exactly what `drainForDay` charged, or they have drifted and the explanation is describing
 * a day the projection never simulated.
 */
export function drainSources(
  day: DayInput,
  reserves: Reserves,
  params: EngineParams,
): readonly DrainSource[] {
  const byKind = new Map<string, DrainSource>()

  const add = (source: DrainSource['source'], type: LoadType, points: number): void => {
    if (points <= 0) return

    const key = `${source}:${type}`
    const existing = byKind.get(key)
    byKind.set(key, { source, type, points: (existing?.points ?? 0) + points })
  }

  for (const activity of day.activities) {
    if (!isDraining(activity)) continue

    const residue = carryoverAt(day.activities, activity.startHour)[activity.type]
    const bias = activity.estimateBias ?? params.estimateBias[activity.type]

    add(
      activity.kind,
      activity.type,
      activity.hours *
        activity.intensity *
        params.typeIntensity[activity.type] *
        bias *
        stateMultiplier(reserves[activity.type], residue),
    )
  }

  add('fragmentation', 'mental', fragmentation(day.activities) * params.contextSwitchPenalty)
  add(
    'deadline',
    'mental',
    deadlineDrain(day.daysToNearestDeadline, params.deadlineProximityWeight),
  )
  add('travel', 'errands', day.venueChanges * params.travelLoadPerVenueChange)

  let socialHours = 0
  for (const activity of day.activities) {
    if (activity.type === 'social') socialHours += activity.hours
  }

  if (socialHours < params.socialFloorHoursPerDay) {
    add('isolation', 'social', params.isolationDrainPerDay)
  }

  return [...byKind.values()]
}
