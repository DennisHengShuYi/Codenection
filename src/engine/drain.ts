import { carryoverAt } from './carryover'
import { SECONDARY_COST } from './params'
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
 * What an hour of `source` load costs the `target` reserve.
 *
 * Two tables rather than one, and deliberately: `typeIntensity` is the diagonal and is a
 * calibrated `EngineParams` field, while `SECONDARY_COST` is a population constant like
 * `COUPLING` and `CROSS_EFFECT` beside it. Keeping them apart is what makes the spread unable
 * to change any primary cost -- every figure the model charged before it is charged
 * identically after -- and it keeps `objective.consequenceOf`, which asks the diagonal
 * question "how consequential is this kind of work", reading the field that answers it.
 */
const rateFor = (source: LoadType, target: LoadType, params: EngineParams): number =>
  source === target ? params.typeIntensity[source] : SECONDARY_COST[source][target]

/**
 * How much of the isolation charge a day has earned, from 1 for a day with nobody in it down
 * to 0 for one that cleared the floor.
 *
 * §1.2 amended. The charge was a switch on `socialFloorHoursPerDay`: under the floor a day
 * paid all of it, at the floor it paid none. Measured across a fortnight, that put 29 minutes
 * of contact a day at 67 on the social bar and 30 minutes at 95 -- twenty-eight points for
 * one minute, and a student who says hello in a corridor every day scored as having spoken to
 * nobody for three weeks. `neighbours.socialMoves` records the same mismatch from the other
 * side, where a fifteen-minute coffee satisfied the guard while the day went on draining.
 *
 * A straight line, and it introduces no number: the floor that used to be the wall is simply
 * where the line reaches zero. Partial contact earns partial credit, which is the only thing
 * the switch got wrong.
 */
function isolationShortfall(activities: readonly Activity[], params: EngineParams): number {
  let socialHours = 0
  for (const activity of activities) {
    if (activity.type === 'social') socialHours += activity.hours
  }

  if (params.socialFloorHoursPerDay <= 0) return 0
  return Math.max(0, 1 - socialHours / params.socialFloorHoursPerDay)
}

/**
 * How much more isolating a day is for having been a demanding one.
 *
 * §1.2 amended. The isolation charge was flat, so social fell at the same rate whether the
 * student did two hours of work in a fortnight or fifty -- the one reserve that moved, moving
 * like a metronome rather than like a life. A heavy day is precisely when somebody cancels on
 * a friend, and the model said nothing about it.
 *
 * A multiplier on `isolationDrainPerDay` rather than a term of its own, and that is the
 * design rather than a shortcut. `isolation` is one of the four coefficients
 * `domain/recoveryLearning` identifies per student; a new parameter standing beside it would
 * be one the app had no means of learning, and §7 is explicit that population priors are
 * there to be calibrated. Folding the load into the learnable coefficient keeps it one
 * number that evidence can still move.
 *
 * Measured against `dailyHoursCap` because that is already this codebase's answer to "a day
 * this long is the most the model will permit", so a day at the cap is the most isolating
 * there is and costs double. Bounded there too: without the ceiling an OCR import dropping
 * twenty hours on one day would charge a fortnight's isolation to a Tuesday.
 */
const ISOLATION_LOAD_CEILING = 2

function isolationLoadScale(
  activities: readonly Activity[],
  params: EngineParams,
): number {
  let hours = 0
  for (const activity of activities) {
    if (isDraining(activity)) hours += activity.hours
  }

  return Math.min(ISOLATION_LOAD_CEILING, 1 + hours / params.dailyHoursCap)
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

    // All four, because an activity now charges more than the reserve it belongs to. One
    // call per activity rather than one per target: `carryoverAt` returns the whole vector
    // and this loop runs inside §2.1's search thousands of times per solve.
    const residue = carryoverAt(day.activities, activity.startHour)

    // The block's own correction where §2.4 has enough to give it one, the area-wide
    // figure otherwise. A student whose essays run 3x over and whose lab reports land on
    // time used to pay the average of the two on both.
    const bias = activity.estimateBias ?? params.estimateBias[activity.type]
    const size = activity.hours * activity.intensity * bias

    for (const type of LOAD_TYPES) {
      const rate = rateFor(activity.type, type, params)
      if (rate === 0) continue

      // Priced at the target reserve's own level, never the activity's. §6.3's hard rule --
      // each reserve is priced and repaid on its own level -- applies to what an hour costs a
      // body just as much as to what it costs a head.
      totals[type] += size * rate * stateMultiplier(reserves[type], residue[type])
    }
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
  totals.social +=
    params.isolationDrainPerDay *
    isolationLoadScale(day.activities, params) *
    isolationShortfall(day.activities, params)

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

    // Spread across all four exactly as `drainForDay` spreads it, so "Ethics essay, body
    // -0.45" is a line a student can be shown. `drain.test.ts` binds the two totals.
    const residue = carryoverAt(day.activities, activity.startHour)
    const bias = activity.estimateBias ?? params.estimateBias[activity.type]
    const size = activity.hours * activity.intensity * bias

    for (const type of LOAD_TYPES) {
      const rate = rateFor(activity.type, type, params)
      if (rate === 0) continue

      add(activity.kind, type, size * rate * stateMultiplier(reserves[type], residue[type]))
    }
  }

  add('fragmentation', 'mental', fragmentation(day.activities) * params.contextSwitchPenalty)
  add(
    'deadline',
    'mental',
    deadlineDrain(day.daysToNearestDeadline, params.deadlineProximityWeight),
  )
  add('travel', 'errands', day.venueChanges * params.travelLoadPerVenueChange)

  // Scaled and tapered exactly as `drainForDay` does it. `drain.test.ts` binds the two: if
  // the itemised sources stop summing to what was charged, the explanation is describing a
  // day the projection never simulated. `add` drops a zero, so a day that cleared the floor
  // still shows no isolation line at all.
  add(
    'isolation',
    'social',
    params.isolationDrainPerDay *
      isolationLoadScale(day.activities, params) *
      isolationShortfall(day.activities, params),
  )

  return [...byKind.values()]
}
