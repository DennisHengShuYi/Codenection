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
 * reachable from any screen.
 *
 * This is not for an almost-empty movable set -- with no candidates, `neighbours()` comes
 * back empty for both searches, `smallestFixes` finds nothing either, and that case is
 * already `describeRebalance`'s own line for an overloaded week with nothing to move. It is
 * for the case where there *are* movable candidates but the hill climb rejects all of them
 * under `score` (usually on fragmentation or floor grounds), while at least one of those
 * same candidates still measurably helps the student under `smallestFixes`' own ranking --
 * see `smallestFix.ts` for why the two rankings deliberately disagree. §2.5 warns this is
 * the likely case for a real final-year student, so "your fortnight has nothing to move,
 * but here is the one thing that would help most" is not a consolation prize, it is the
 * more likely headline.
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
