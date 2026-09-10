import { summarise, type EngineParams } from '../engine'
import { neighbours } from './neighbours'
import { toDayInputs } from './objective'
import type { Move, Schedule } from './types'

export interface Fix {
  readonly move: Move
  readonly worstBefore: number
  readonly worstAfter: number
  /** Improvement in the reserve floor. Zero when the student is already bottomed out --
   *  which is why it is not what the fixes are ranked by. */
  readonly gain: number
  readonly deficitDaysBefore: number
  readonly deficitDaysAfter: number
}

/** §2.2: "single move, top three by effect". */
const DEFAULT_LIMIT = 3

interface Measured {
  readonly worstFloor: number
  readonly deficitDays: number
  readonly deficitArea: number
}

const measure = (schedule: Schedule, params: EngineParams): Measured => {
  const projection = summarise(schedule.start, toDayInputs(schedule), params)
  return {
    worstFloor: projection.worstFloor,
    deficitDays: projection.deficitDays,
    deficitArea: projection.deficitArea,
  }
}

/**
 * §2.2's smallest-fix search: the same machinery as the full rebalance, but one move,
 * ranked by effect.
 *
 * "Move the lab report to Monday. Day 21 reserve goes 11 to 44."
 *
 * A student will do one thing; they will not follow a nine-change reshuffle. So the
 * smallest fix is often the one that actually happens -- which makes it worth more than
 * a better plan nobody enacts. Ranked on how much the fortnight improves for the student
 * -- days out of deficit first, then depth, then floor gain -- rather than on `score`
 * from `objective.ts`, because the number shown to the student has to be the number they
 * were sold. See `improvement` below for why that is a deliberate divergence from the
 * hill climb's own ranking, not an inconsistency.
 */
export function smallestFixes(
  schedule: Schedule,
  params: EngineParams,
  limit: number = DEFAULT_LIMIT,
): Fix[] {
  const before = measure(schedule, params)

  /**
   * Ranked by how much better the fortnight actually gets, not by floor gain alone.
   *
   * Floor gain is zero for a student who has already bottomed out, so ranking on it
   * returned *nothing* for exactly the person §2.2 is written for. Days out of deficit
   * come first because that is the improvement a student can feel, then depth, and floor
   * gain breaks the remaining ties.
   *
   * This ranking is deliberately not `score` from `objective.ts`, and the two are not
   * meant to be reconciled. `smallestFixes` measures student-visible improvement --
   * days out of deficit first, because that is what a student can feel -- while `score`
   * measures the solver's objective, which also weighs fragmentation: a solver that
   * scatters ten tasks across the fortnight lowers peak load while draining more reserve
   * overall, and `score` is what makes the hill climb refuse that trade. Because of that,
   * this fallback surfaces exactly the moves the climb rejected on fragmentation or floor
   * grounds but that still help the student in a way they can feel. Aligning the two
   * weightings would silently reintroduce the bottomed-out bug above, and would also make
   * this fallback fire *never*: any move that scores positively under `score` is one the
   * hill climb would already have taken, leaving nothing left for this search to find.
   */
  const improvement = (after: Measured): number =>
    (before.deficitDays - after.deficitDays) * 10 +
    (before.deficitArea - after.deficitArea) * 0.1 +
    (after.worstFloor - before.worstFloor)

  return neighbours(schedule, params)
    .map((move) => {
      const after = measure(move.apply(schedule), params)
      return {
        move,
        worstBefore: before.worstFloor,
        worstAfter: after.worstFloor,
        gain: after.worstFloor - before.worstFloor,
        deficitDaysBefore: before.deficitDays,
        deficitDaysAfter: after.deficitDays,
        rank: improvement(after),
      }
    })
    .filter((fix) => fix.rank > 1e-9)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit)
    .map(({ rank: _rank, ...fix }) => fix)
}
