import { FULL_RESERVE, STATE_COST_PIVOT, STATE_COST_SLOPE } from './params'

/** Bounds on the multiplier. Without them a deep deficit combined with a heavy residue
 *  can produce a cost so large that a single block empties every reserve, which reads as
 *  a model bug rather than as a bad day. */
const MIN_MULTIPLIER = 0.5
const MAX_MULTIPLIER = 3

/**
 * §6.6: `actual_cost = base_cost × state_multiplier(reserve, recent_activity)`.
 *
 * At 70% reserve two hours of study costs two hours. At 25% it costs closer to three,
 * because you work slower and retain less. This mirrors the efficiency curve in §6.2:
 * depleted people are less efficient in both directions -- rest gives back less, and
 * work takes more.
 *
 * `reserve` is the level of the one reserve the block spends -- not the mean of the four.
 * The name used to say `overall` while this docstring said "reserve", and the signature is
 * what the caller in `drain.ts` was written from, so the block was priced on the average
 * for as long as both existed. Renamed so the same misreading is not available twice.
 *
 * `carryoverForType` is §6.6's residue for the reserve being spent, as a delta on the
 * multiplier: negative makes the block dearer, positive makes it cheaper. Above the
 * pivot the depletion term is zero, so a well-rested student pays nominal cost rather
 * than a discount -- the model does not reward being fresh, it only penalises being
 * spent.
 */
export function stateMultiplier(reserve: number, carryoverForType: number): number {
  const depletion = Math.max(0, STATE_COST_PIVOT - reserve) / FULL_RESERVE
  const raw = 1 + STATE_COST_SLOPE * depletion - carryoverForType

  return Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, raw))
}

export function actualCost(
  baseCost: number,
  reserve: number,
  carryoverForType: number,
): number {
  return baseCost * stateMultiplier(reserve, carryoverForType)
}
