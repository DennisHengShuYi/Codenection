import type { EngineParams } from '../../engine'
import {
  describeRebalance,
  makeRng,
  rebalance,
  smallestFixes,
  type Fix,
  type Schedule,
} from '../../optimizer'

/**
 * §4: rebalance, and what to say when it cannot help.
 *
 * `smallestFixes` has been built and tested since the optimizer landed and has never been
 * reachable from any screen. §2.5 warns that a real final-year student's movable set may be
 * almost empty -- so "your fortnight has nothing to move, but here is the one thing that
 * would help most" is not a consolation prize, it is the more likely headline.
 */
export interface RebalanceOutcome {
  /** The week to adopt. Unchanged from the input when the solver found nothing. */
  readonly schedule: Schedule
  readonly report: string
  /** The single best remaining move, when the solver could not improve the fortnight but
   *  the fortnight still needs help. Null otherwise. */
  readonly fallback: Fix | null
}

export function runRebalance(
  schedule: Schedule,
  params: EngineParams,
  seed: number,
): RebalanceOutcome {
  // Seeded rather than random: §2.1's search takes its randomness as a parameter, and a
  // student who taps twice should not see two different weeks.
  const result = rebalance(schedule, params, makeRng(seed))
  const report = describeRebalance(result, params)

  // `describeRebalance` already distinguishes a healthy week with nothing to move from an
  // overloaded one, so the fallback is only wanted in the second case -- and only when the
  // solver itself found nothing, otherwise it would be second-guessing a real improvement.
  const fallback =
    result.moves.length === 0 ? (smallestFixes(schedule, params, 1)[0] ?? null) : null

  return { schedule: result.schedule, report, fallback }
}
