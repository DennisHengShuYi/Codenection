import { EFFICIENCY_FLOOR, EFFICIENCY_SPAN, FULL_RESERVE } from './params'
import { LOAD_TYPES, type Reserves } from './types'

/**
 * The single headline number: what the dial shows (§1.2).
 *
 * An equal-weighted mean. No reserve is privileged, because §6.3's whole point is that a
 * deficit anywhere propagates -- weighting mental above social here would quietly undo
 * the coupling matrix's claim that an isolated student is unwell.
 *
 * A headline and nothing more. This is deliberately *not* an input to any mechanism: both
 * §6.2's efficiency curve and §6.6's state cost read the reserve they belong to, via
 * `efficiencyAt` and `stateMultiplier`. It used to feed both, which meant a student with
 * mental at 0 and everything else at 80 recovered and paid as though they were at 60 --
 * the single-number failure the next function down exists to prevent.
 */
export function overallReserve(reserves: Reserves): number {
  const total = LOAD_TYPES.reduce((sum, type) => sum + reserves[type], 0)
  return total / LOAD_TYPES.length
}

/**
 * The lowest of the four reserves.
 *
 * §2.1 states the principle for days -- "burnout is a floor problem", a fortnight that
 * averages fine but bottoms out at 8 is still a crash -- and it holds just as strongly
 * across reserve types. A student with mental at 0 and physical at 70 averages 35 and is
 * in crisis; the mean would call them fine, which is the single-number failure §6.3
 * exists to prevent.
 *
 * So the mean is the headline the dial shows (§1.2), and this is what the deficit
 * crossing and the optimizer's objective are measured against.
 */
export function floorReserve(reserves: Reserves): number {
  return Math.min(...LOAD_TYPES.map((type) => reserves[type]))
}

/**
 * §6.2, the mechanic that makes the model real: recovery efficiency falls as reserve
 * falls. At full reserve you get 100% of your rest back; at 20% reserve, 56%.
 *
 * This nonlinearity is what produces the spiral where a week looks survivable right up
 * until it isn't -- a depleted student recovers more slowly, which keeps them depleted.
 * It is the phenomenon the brief's background paragraph describes and the thing a linear
 * tracker cannot represent.
 *
 * Takes one reserve's level, not the four. §6.1 writes `efficiency[d] = 0.45 + 0.55 ×
 * (reserve[d] / 100)` in the same block as `reserve[d+1] = reserve[d] − drain[d] +
 * recovery[d] × efficiency[d]`, where `reserve` is the four-vector -- so per-type indexing
 * is what that notation already says, and the mean was an interpretation laid over it.
 *
 * The interpretation mattered: averaging let three healthy reserves subsidise a collapsed
 * one, so the spiral was damped exactly where a real student's worst reserve would be
 * driving it, and `floorReserve`'s "burnout is a floor problem" held everywhere downstream
 * of this function while this function itself denied it. Scalar rather than vector-valued
 * to stay the same shape as `stateMultiplier`, §6.6's curve: both are now functions of one
 * reserve, called per type by their caller.
 */
export function efficiencyAt(reserve: number): number {
  const ratio = reserve / FULL_RESERVE
  return EFFICIENCY_FLOOR + EFFICIENCY_SPAN * ratio
}
