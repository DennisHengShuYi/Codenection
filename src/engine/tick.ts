import { applyCoupling } from './coupling'
import { drainForDay } from './drain'
import { recoveryEfficiency } from './efficiency'
import { FULL_RESERVE } from './params'
import { recoveryForDay } from './recovery'
import { LOAD_TYPES, type DayInput, type EngineParams, type LoadType, type Reserves } from './types'

export { applyCoupling } from './coupling'
export { recoveryForDay } from './recovery'

const clamp = (value: number): number => Math.min(FULL_RESERVE, Math.max(0, value))

/**
 * §6.1: `reserve[d+1] = reserve[d] − drain[d] + recovery[d] × efficiency[d]`, then
 * coupling, then clamp.
 *
 * Efficiency is computed from the reserves at the *start* of the day, and that ordering
 * is the whole model. It is what makes this a spiral rather than a line: the worse today
 * starts, the less tonight's rest gives back (§6.2), so a bad week compounds instead of
 * levelling off. Computing efficiency after the drain would soften exactly the effect
 * the app exists to show.
 */
export function tick(reserves: Reserves, day: DayInput, params: EngineParams): Reserves {
  const drain = drainForDay(day, reserves, params)
  const recovery = recoveryForDay(day, params)
  const efficiency = recoveryEfficiency(reserves)

  const next: Record<LoadType, number> = { mental: 0, physical: 0, social: 0, errands: 0 }

  for (const type of LOAD_TYPES) {
    next[type] = clamp(reserves[type] - drain[type] + recovery[type] * efficiency)
  }

  return applyCoupling(next)
}
