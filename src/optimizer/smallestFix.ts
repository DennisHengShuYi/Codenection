import { project, type EngineParams } from '../engine'
import { neighbours } from './neighbours'
import { toDayInputs } from './objective'
import type { Move, Schedule } from './types'

export interface Fix {
  readonly move: Move
  readonly worstBefore: number
  readonly worstAfter: number
  readonly gain: number
}

/** §2.2: "single move, top three by effect". */
const DEFAULT_LIMIT = 3

const worstOf = (schedule: Schedule, params: EngineParams): number =>
  project(schedule.start, toDayInputs(schedule), params).worstFloor

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
  const worstBefore = worstOf(schedule, params)

  return neighbours(schedule, params)
    .map((move) => {
      const worstAfter = worstOf(move.apply(schedule), params)
      return { move, worstBefore, worstAfter, gain: worstAfter - worstBefore }
    })
    .filter((fix) => fix.gain > 1e-9)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, limit)
}
