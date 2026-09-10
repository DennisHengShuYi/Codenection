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
export { DAY_END_HOUR, gapsOn, hourNear, MIN_GAP_HOURS, WAKE_HOUR, type FreeSlot } from './gaps'
export { isValid, violations } from './constraints'
export { ALL_PRESENT, DEFICIT_DAY_WEIGHT, FRAGMENTATION_WEIGHT, score, toDayInputs } from './objective'
export { neighbours } from './neighbours'
export { makeRng, type Rng } from './rng'
export { rebalance } from './hillClimb'
export { smallestFixes, type Fix } from './smallestFix'
export { describeProposal, describeRebalance, undo } from './report'
