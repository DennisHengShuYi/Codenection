import { applyCoupling } from './coupling'
import { drainForDay } from './drain'
import { efficiencyAt, headroomAt } from './efficiency'
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
 *
 * And from each reserve's *own* start-of-day level, so a collapsed mental reserve slows
 * mental recovery without discounting what a rested body still gets back. `next` is a
 * separate object from `reserves`, so no partially-updated value can leak into a later
 * type's efficiency -- the day-start guarantee holds per type as well as overall.
 *
 * Note what that removes. Reading efficiency off the mean made it a second, undeclared
 * coupling channel: one empty reserve pulled every reserve's recovery down at an implicit
 * weight of a quarter each, far larger than anything in §6.3's matrix, whose biggest entry
 * is 0.12. `applyCoupling` below is now the only path by which one reserve's deficit
 * reaches another, which is where §6.3 always said that decision lived.
 */
export function tick(reserves: Reserves, day: DayInput, params: EngineParams): Reserves {
  const drain = drainForDay(day, reserves, params)
  const recovery = recoveryForDay(day, params)

  const next: Record<LoadType, number> = { mental: 0, physical: 0, social: 0, errands: 0 }

  for (const type of LOAD_TYPES) {
    /*
     * §6.1 amended: `recovery × efficiency × headroom`.
     *
     * `headroomAt` is read from the same start-of-day level as `efficiencyAt`, for the same
     * reason given above -- and it answers a different question, so the two multiply rather
     * than compete. Efficiency is how well a depleted student converts rest; headroom is how
     * much of the reserve is missing to convert into. Without the second, recovery grew as a
     * student filled and drain grew as they depleted, both directions reinforced, and the
     * middle of the range was a knife edge no week could rest on -- see
     * `params.RECOVERY_HEADROOM_SPAN` for the measurement.
     */
    next[type] = clamp(
      reserves[type] -
        drain[type] +
        recovery[type] * efficiencyAt(reserves[type]) * headroomAt(reserves[type]),
    )
  }

  return applyCoupling(next)
}
