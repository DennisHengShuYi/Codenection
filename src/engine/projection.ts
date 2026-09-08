import { floorReserve, overallReserve } from './efficiency'
import { BAND_BIASES, DEFICIT_THRESHOLD } from './params'
import { tick } from './tick'
import { LOAD_TYPES, type DayInput, type EngineParams, type LoadType, type Reserves } from './types'

export interface Projection {
  /** The band the app quotes. */
  readonly central: readonly Reserves[]
  readonly optimistic: readonly Reserves[]
  readonly pessimistic: readonly Reserves[]
  /** Lowest headline (mean) reserve reached anywhere on the horizon. What the dial's
   *  worst-day figure quotes. */
  readonly worstOverall: number
  /**
   * Lowest *single* reserve reached anywhere on the horizon, across every type and day.
   *
   * This is what §2.1's objective maximises. Burnout is a floor problem in both
   * directions: across days, because a fortnight that averages fine but bottoms out at 8
   * is still a crash; and across reserves, because a student whose mental reserve is
   * empty is in crisis whatever their physical reserve says. Scoring against the mean
   * would let the optimizer trade a wrecked mind for a rested body and call it an
   * improvement.
   */
  readonly worstFloor: number
  readonly deficitDays: number
  /**
   * How far below the deficit threshold the floor falls, summed over the horizon.
   *
   * `worstFloor` saturates: once any reserve bottoms out on any day it reads zero, and
   * every candidate schedule looks identical to a `min()`. That is exactly the state a
   * student in genuine crisis is in -- so without this the optimizer has no gradient
   * left, smallest-fix search finds nothing to rank, and the app tells the person who
   * most needs an answer that their worst day goes "from 0 to 0".
   *
   * Deficit area keeps varying below that saturation point, so the search can still tell
   * a bad fortnight from a worse one and the app can say something true and useful:
   * still short, but fewer days underwater.
   */
  readonly deficitArea: number
  /** The "deficit crossing" the product copy refers to, or null if the horizon holds. */
  readonly firstDeficitDay: number | null
}

/**
 * How much each consecutive missed check-in inflates the estimate.
 *
 * §6.5 in its stronger form: treat absence as signal. Non-check-in correlates with bad
 * weeks, so a model that gets more worried when the user goes quiet is behaving
 * correctly. Compounding per consecutive miss rather than applying a flat penalty is
 * what makes a long silence worse than a single skipped day -- and checking in again
 * clears the run, so the model forgives rather than holding a grudge.
 */
const MISSING_CHECKIN_PENALTY = 0.08

/** Scales every type's estimate bias by a factor, returning fresh params. Never mutates
 *  the caller's params: the engine is pure, and the projection runs three bands over the
 *  same input. */
function withBias(params: EngineParams, factor: number): EngineParams {
  const scaled: Record<LoadType, number> = { mental: 0, physical: 0, social: 0, errands: 0 }

  for (const type of LOAD_TYPES) {
    scaled[type] = params.estimateBias[type] * factor
  }

  return { ...params, estimateBias: scaled }
}

function runBand(
  start: Reserves,
  days: readonly DayInput[],
  params: EngineParams,
  bias: number,
): Reserves[] {
  const biased = withBias(params, bias)

  const out: Reserves[] = []
  let current = start
  let missedRun = 0

  for (const day of days) {
    missedRun = day.checkedIn ? 0 : missedRun + 1
    current = tick(current, day, withBias(biased, 1 + MISSING_CHECKIN_PENALTY * missedRun))
    out.push(current)
  }

  return out
}

/**
 * §6.5: three projections at estimate biases 0.95x, 1.15x and 1.4x, shown as a band.
 *
 * The middle band is the central estimate the app quotes; the spread is the honesty. It
 * widens when the model has less to go on, which is what §8.2 requires the product copy
 * to reflect -- the 21-day projection is a decision aid and is never described as
 * validated. What the app does validate is the 48-hour claim (§8.1), which resolves
 * whether or not the student intervenes.
 */
export function project(
  start: Reserves,
  days: readonly DayInput[],
  params: EngineParams,
): Projection {
  const [optimisticBias, centralBias, pessimisticBias] = BAND_BIASES

  const central = runBand(start, days, params, centralBias)
  const overalls = central.map(overallReserve)
  const floors = central.map(floorReserve)

  // Deficit is measured on the floor, not the mean: the day a student's mental reserve
  // empties is the day that matters, even if their physical reserve is untouched.
  const firstDeficitIndex = floors.findIndex((value) => value < DEFICIT_THRESHOLD)

  return {
    central,
    optimistic: runBand(start, days, params, optimisticBias),
    pessimistic: runBand(start, days, params, pessimisticBias),
    // With no schedule there is nothing to project, so the worst the horizon holds is
    // simply where the student is now. §0 requires every screen to render something
    // useful with zero user data, and that starts here.
    worstOverall: overalls.length === 0 ? overallReserve(start) : Math.min(...overalls),
    worstFloor: floors.length === 0 ? floorReserve(start) : Math.min(...floors),
    deficitDays: floors.filter((value) => value < DEFICIT_THRESHOLD).length,
    deficitArea: floors.reduce(
      (sum, value) => sum + Math.max(0, DEFICIT_THRESHOLD - value),
      0,
    ),
    firstDeficitDay: firstDeficitIndex === -1 ? null : firstDeficitIndex,
  }
}
