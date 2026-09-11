import { LOAD_TYPES, type DayInput, type EngineParams, type LoadType, type Reserves } from './types'

/**
 * §5.1: recovery has a ceiling as well as a floor. Past this many hours in a single
 * block, returns go flat and then negative -- a 12-hour scroll session is not recovery,
 * and the model must not count it as neutral free time.
 *
 * Capped per block rather than per day, so three separate hours of rest still pay out
 * three hours' worth. It is the single unbroken twelve-hour block that is suspect.
 */
export const USEFUL_REST_HOURS = 3

/**
 * §6.1: `recovery[d] = max(0, sleep − 5) × k_sleep + rest_blocks × k_rest`.
 *
 * Restorative social contact is credited here rather than charged in drain, because
 * §5.2 prescribes a person when social reserve is low -- the model's own advice has to
 * move the number it is prescribed for.
 */
export function recoveryForDay(day: DayInput, params: EngineParams): Reserves {
  const sleepCredit = Math.max(0, day.sleepHours - params.sleepBaselineHours)

  // One pass rather than two filter-and-reduce chains. This runs 21 times per projection
  // and the optimizer evaluates thousands of projections per solve, so the intermediate
  // arrays those chains allocate are a measurable share of the search's runtime -- the
  // one place in this codebase where that trade is worth making against readability.
  let restHours = 0
  let socialHours = 0

  for (const activity of day.activities) {
    if (activity.kind === 'rest') {
      restHours += Math.min(activity.hours, USEFUL_REST_HOURS)
    } else if (activity.kind === 'socialRestorative') {
      socialHours += Math.min(activity.hours, USEFUL_REST_HOURS)
    }
  }

  const out: Record<LoadType, number> = { mental: 0, physical: 0, social: 0, errands: 0 }

  for (const type of LOAD_TYPES) {
    out[type] = sleepCredit * params.kSleep[type] + restHours * params.kRest[type]
  }

  out.social += socialHours * params.kSocialContact

  return out
}
