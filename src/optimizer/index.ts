/**
 * The optimizer's public surface.
 *
 * Pure like the engine it sits on, with one deliberate exception: the search takes an
 * `Rng` so §2.1's random restarts are reproducible under test. Nothing here touches
 * storage, the network or the clock.
 */
export type {
  Commitment,
  Move,
  MoveKind,
  RebalanceResult,
  Schedule,
  ScheduledItem,
} from './types'
export { isValid, violations } from './constraints'
export { DEFICIT_DAY_WEIGHT, FRAGMENTATION_WEIGHT, score, toDayInputs } from './objective'
export { neighbours } from './neighbours'
export { makeRng, type Rng } from './rng'
export { rebalance } from './hillClimb'
export { smallestFixes, type Fix } from './smallestFix'
export { describeRebalance, undo } from './report'
