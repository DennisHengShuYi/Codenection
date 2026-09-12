import { summarise, type EngineParams } from '../engine'
import { candidates, type Candidate } from './neighbours'
import { clearClashes } from './repair'
import { ALL_PRESENT, score, toDayInputs } from './objective'
import type { Rng } from './rng'
import type { Move, RebalanceResult, Schedule } from './types'

/** §2.1: "repeat to convergence or 200 iterations". */
const MAX_ITERATIONS = 200

/** Floating-point slack, so a move that changes the score by nothing is not mistaken for
 *  an improvement and does not spin the loop to its iteration cap. */
const EPSILON = 1e-9

/**
 * How much a single move must be worth before it is worth asking somebody to make it.
 *
 * In reserve points, the unit the objective is already in. Floating-point slack was the only
 * bar before this, which was the right bar while the model had a flat plateau at full reserve
 * and only genuinely consequential moves scored at all. `headroomAt` ended the plateau: a
 * week now settles at a level instead of pinning, so nearly every rearrangement moves the
 * score by *something* and the climber could always find one more fractional improvement to
 * chase. Measured, the two budget fixtures went to 8,164 and 7,586 evaluations against a
 * bound of 3,000 -- which is the lesson `objective.deadlinePressure` records twice in its own
 * comments, arriving a third time from the model rather than from a penalty term.
 *
 * §2.2 is what sets the figure rather than the runtime: "a student will do one thing; they
 * will not follow a nine-change reshuffle", which is why `smallestFixes` exists at all. A
 * rebalance proposing nineteen changes to an ordinary fortnight has the same problem, and a
 * move worth a fiftieth of a reserve point is not one a student should be asked to rearrange
 * their week for.
 *
 * Measured at 0.02, 0.05, 0.1 and 0.25. At 0.02 the ordinary fortnight is unchanged at 2,663
 * evaluations and nineteen moves, so it does not answer the problem. At 0.25 the week comes
 * back visibly worse for six moves. 0.05 puts an ordinary solve at 1,028 evaluations and
 * eight moves -- a plan somebody might actually follow, at very close to the cost the search
 * had before the model gained a gradient -- for 2.5 points of score, which is the price of
 * not proposing the eleven changes that were each worth almost nothing.
 */
const MIN_GAIN = 0.05

// No check-in data exists for a schedule under exploration -- `ALL_PRESENT` names that.
const worstOf = (schedule: Schedule, params: EngineParams): number =>
  summarise(schedule.start, toDayInputs(schedule, ALL_PRESENT), params).worstFloor

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
  today: number,
): { schedule: Schedule; moves: Move[]; evaluations: number } {
  let current = start
  let currentScore = score(current, params)
  let evaluations = 1
  const taken: Move[] = []

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const options = candidates(current, params, today)
    if (options.length === 0) break

    const offset = Math.floor(rng() * options.length)
    let best: Candidate | null = null
    let bestScore = currentScore

    for (let i = 0; i < options.length; i += 1) {
      const candidate = options[(i + offset) % options.length]!
      const candidateScore = score(candidate.result, params)
      evaluations += 1

      if (candidateScore > bestScore + MIN_GAIN) {
        best = candidate
        bestScore = candidateScore
      }
    }

    if (!best) break

    current = best.result
    currentScore = bestScore
    taken.push(best.move)
  }

  return { schedule: current, moves: taken, evaluations }
}

/**
 * §2.1: hill climbing, best neighbour, repeat to convergence or 200 iterations. No solver
 * library, no backend call.
 *
 * **One climb, not §2.1's three restarts, and that is a measured decision rather than a
 * shortcut.** As written the three restarts were three *identical* climbs: they all began
 * from the same schedule, and the seed only rotates the scan order while best-neighbour
 * selection picks the same maximum regardless. Five different seeds produced byte-
 * identical results on both fixtures -- same score, same moves -- so two thirds of every
 * solve was work that could not change the answer.
 *
 * The obvious repair is to make the restarts genuinely random by perturbing the starting
 * point, which is what the technique means. That was measured too, and it does not earn
 * its cost here: five perturbed starts found nothing better at all on an ordinary
 * fortnight, and improved the crunch fortnight by 0.31 -- roughly one deficit day -- for
 * 5.5x the evaluations. Against a §2.1 budget already an order of magnitude over, paying
 * five times the runtime for a day is the wrong trade.
 *
 * So the restart loop is gone and the output is unchanged. `rng` stays because the scan
 * offset still breaks ties, and because a solver that takes its randomness as a parameter
 * remains testable if restarts are ever reinstated.
 *
 * `today` bounds the neighbourhood to days the student can still act on. Without it the
 * cheapest improvement available was always to insert recovery into days already lived --
 * the engine re-projects from day zero, so retroactive rest lifts the whole fortnight,
 * including the trough `worstFloor` reads. On a real account that turned a true gain of one
 * reserve point into a reported thirty-three, and put three of four proposed social blocks on
 * days that had already happened.
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
  today: number,
): RebalanceResult {
  /*
   * A week that arrived broken, put right before anything is scored on it.
   *
   * `violations` counts a loose block sitting on a fixed one or on protected rest, but that
   * count is only ever a gate on candidate moves -- "no worse than you started" -- and the
   * score cannot see overlap at all. So a repairing move was permitted and never preferred,
   * and a study block on top of protected rest survived a full rebalance untouched, which
   * §5.1 makes the worst version of this bug.
   *
   * Ahead of the climb rather than inside the objective, so it cannot be traded against the
   * reserves: see `repair.ts`. It is also why the comparison below starts from the repaired
   * week -- a repair can cost a point of score by breaking up a day, and the clash still has
   * to go.
   */
  const repair = clearClashes(schedule, today)

  const baseScore = score(repair.schedule, params)
  const attempt = climb(repair.schedule, params, rng, today)
  const improved = score(attempt.schedule, params) > baseScore + EPSILON

  const best = improved ? attempt.schedule : repair.schedule

  return {
    schedule: best,
    // The week the student actually had, so §2.1's one-tap undo puts the clash back with
    // everything else. Undo means "as it was", not "as it was once we had tidied it".
    before: schedule,
    moves: [...repair.moves, ...(improved ? attempt.moves : [])],
    evaluations: attempt.evaluations + 2,
    worstBefore: worstOf(schedule, params),
    worstAfter: worstOf(best, params),
  }
}
