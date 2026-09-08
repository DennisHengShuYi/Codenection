import { summarise, type EngineParams } from '../engine'
import { candidates, type Candidate } from './neighbours'
import { score, toDayInputs } from './objective'
import type { Rng } from './rng'
import type { Move, RebalanceResult, Schedule } from './types'

/** §2.1: "repeat to convergence or 200 iterations, three restarts". */
const MAX_ITERATIONS = 200
const RESTARTS = 3

/** Floating-point slack, so a move that changes the score by nothing is not mistaken for
 *  an improvement and does not spin the loop to its iteration cap. */
const EPSILON = 1e-9

const worstOf = (schedule: Schedule, params: EngineParams): number =>
  summarise(schedule.start, toDayInputs(schedule), params).worstFloor

/**
 * One climb: take the best neighbour while one improves, up to the iteration cap.
 *
 * The scan starts at a random offset rather than at index zero. With best-neighbour
 * selection the offset changes nothing when a single move is strictly best, but it
 * breaks ties differently on each restart -- which is what makes the restarts explore
 * different basins instead of retracing the same path three times.
 */
function climb(
  start: Schedule,
  params: EngineParams,
  rng: Rng,
): { schedule: Schedule; moves: Move[] } {
  let current = start
  let currentScore = score(current, params)
  const taken: Move[] = []

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const options = candidates(current, params)
    if (options.length === 0) break

    const offset = Math.floor(rng() * options.length)
    let best: Candidate | null = null
    let bestScore = currentScore

    for (let i = 0; i < options.length; i += 1) {
      const candidate = options[(i + offset) % options.length]!
      const candidateScore = score(candidate.result, params)

      if (candidateScore > bestScore + EPSILON) {
        best = candidate
        bestScore = candidateScore
      }
    }

    if (!best) break

    current = best.result
    currentScore = bestScore
    taken.push(best.move)
  }

  return { schedule: current, moves: taken }
}

/**
 * §2.1: hill climbing with random restarts. Best neighbour, repeat to convergence or 200
 * iterations, three restarts. No solver library, no backend call.
 *
 * Never returns a schedule worse than the one it was given: the incumbent starts as the
 * input, so a search that finds nothing returns the input unchanged with an empty move
 * list. A rebalance that quietly made a week worse would cost far more trust than one
 * that found nothing -- and §2.1's reporting rule ("never optimised, always specific")
 * only means anything if the reported change is real.
 */
export function rebalance(
  schedule: Schedule,
  params: EngineParams,
  rng: Rng,
): RebalanceResult {
  let best = schedule
  let bestScore = score(schedule, params)
  let bestMoves: Move[] = []

  for (let restart = 0; restart < RESTARTS; restart += 1) {
    const attempt = climb(schedule, params, rng)
    const attemptScore = score(attempt.schedule, params)

    if (attemptScore > bestScore + EPSILON) {
      best = attempt.schedule
      bestScore = attemptScore
      bestMoves = attempt.moves
    }
  }

  return {
    schedule: best,
    before: schedule,
    moves: bestMoves,
    worstBefore: worstOf(schedule, params),
    worstAfter: worstOf(best, params),
  }
}
