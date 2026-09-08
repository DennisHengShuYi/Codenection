import { project, type EngineParams } from '../engine'
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
  const projection = project(schedule.start, toDayInputs(schedule), params)
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
 * a better plan nobody enacts. Ranked on the reserve floor rather than the objective
 * score, because the number shown to the student has to be the number they were sold.
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
