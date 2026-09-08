/**
 * The engine's public surface.
 *
 * Everything here is pure: no I/O, no clock, no randomness. That is what lets the
 * optimizer call `project` thousands of times inside a search loop without a network
 * round trip (§2.1 budgets the whole solve at under 100ms on a phone) and what lets the
 * whole model be tested without a single mock.
 */
export {
  LOAD_TYPES,
  type Activity,
  type ActivityKind,
  type CouplingMatrix,
  type CrossEffect,
  type DayInput,
  type EngineParams,
  type LoadType,
  type Reserves,
} from './types'

export {
  BAND_BIASES,
  CARRYOVER_HALF_LIFE_HOURS,
  COUPLING,
  CROSS_EFFECT,
  DEFAULT_PARAMS,
  DEFICIT_THRESHOLD,
  EFFICIENCY_FLOOR,
  EFFICIENCY_SPAN,
  FULL_RESERVE,
  HORIZON_DAYS,
  SLEEP_BASELINE_HOURS,
  STATE_COST_PIVOT,
  STATE_COST_SLOPE,
} from './params'

export { floorReserve, overallReserve, recoveryEfficiency } from './efficiency'
export { carryoverAt } from './carryover'
export { actualCost, stateMultiplier } from './stateCost'
export { drainForDay, fragmentation } from './drain'
export { applyCoupling, recoveryForDay, tick } from './tick'
export { project, summarise, type Projection, type ProjectionSummary } from './projection'
