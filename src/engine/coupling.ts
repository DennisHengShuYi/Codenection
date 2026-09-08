import { COUPLING, DEFICIT_THRESHOLD, FULL_RESERVE } from './params'
import { LOAD_TYPES, type LoadType, type Reserves } from './types'

/**
 * §6.3: physical depletion drags mental capacity; social isolation slows recovery across
 * the board.
 *
 * Directional and subtractive only. A reserve below the deficit threshold pulls the
 * others down in proportion to how far below it has fallen; a reserve *above* the
 * threshold pulls nothing. A surplus must never lift another reserve, because that would
 * let a well-rested body paper over an isolated month -- precisely the reading this
 * section exists to prevent.
 *
 * The stated consequence: a student who is not busy but is isolated shows as unwell,
 * where a single-number model would call them healthy.
 */
export function applyCoupling(reserves: Reserves): Reserves {
  const out: Record<LoadType, number> = { mental: 0, physical: 0, social: 0, errands: 0 }

  for (const target of LOAD_TYPES) {
    let drag = 0

    for (const source of LOAD_TYPES) {
      if (source === target) continue
      const deficit = Math.max(0, DEFICIT_THRESHOLD - reserves[source]) / FULL_RESERVE
      drag += COUPLING[source][target] * deficit * FULL_RESERVE
    }

    out[target] = Math.max(0, reserves[target] - drag)
  }

  return out
}
