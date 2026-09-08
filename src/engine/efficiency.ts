import { EFFICIENCY_FLOOR, EFFICIENCY_SPAN, FULL_RESERVE } from './params'
import { LOAD_TYPES, type Reserves } from './types'

/**
 * The single headline number: what the dial shows (§1.2) and the input to every
 * state-dependent calculation in the model.
 *
 * An equal-weighted mean. No reserve is privileged, because §6.3's whole point is that a
 * deficit anywhere propagates -- weighting mental above social here would quietly undo
 * the coupling matrix's claim that an isolated student is unwell.
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
 */
export function recoveryEfficiency(reserves: Reserves): number {
  const ratio = overallReserve(reserves) / FULL_RESERVE
  return EFFICIENCY_FLOOR + EFFICIENCY_SPAN * ratio
}
