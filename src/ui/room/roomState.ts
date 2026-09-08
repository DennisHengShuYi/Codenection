import { floorReserve, overallReserve, type Projection, type Reserves } from '../../engine'
import type { Schedule } from '../../optimizer'
import { characterStateFor, type CharacterState } from './characterState'

export type { CharacterState } from './characterState'

/** §1.3 says one box per pending item -- but a floor with twenty boxes on it is not
 *  readable, and the room's whole job is being readable without being read. */
const MAX_CLUTTER_BOXES = 6

/** Hours below which sleep debt accrues. */
const SLEEP_DEBT_BASELINE = 7

/** Below this on physical *and* social, getting outside is the highest-value move: it is
 *  the one action that answers both at once (§5.3). */
const DOOR_LIGHTS_BELOW = 25

/** A deficit this close reads as a storm rather than clouds gathering. */
const STORM_WITHIN_DAYS = 7

const PLANT_DROOPS_BELOW = 0.4

export interface ClutterBox {
  readonly id: string
  readonly title: string
  readonly dayIndex: number
}

export interface RoomState {
  /** 0..1. How far the ceiling has come down. */
  readonly ceilingPressure: number
  /** 0..1. How high the paper has stacked. */
  readonly paperHeight: number
  readonly clutter: readonly ClutterBox[]
  /** 0..1, where 1 is thriving. */
  readonly plantHealth: number
  /** Hours of sleep owed. */
  readonly sleepDebt: number
  readonly weather: 'clear' | 'clouding' | 'storm'
  /** 0..1. */
  readonly lightLevel: number
  readonly doorLit: boolean
  readonly character: CharacterState
}

export { PLANT_DROOPS_BELOW }

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/**
 * §1.3's nine bindings, derived from numbers the engine already produces.
 *
 * Every one is a *reflection*. Nothing here is a score, a streak or a target, because
 * §1.3 is explicit that the room is a mirror rather than something a student can succeed
 * or fail at.
 */
export function roomStateFor(
  reserves: Reserves,
  projection: Projection,
  schedule: Schedule,
): RoomState {
  const overall = overallReserve(reserves)

  const pendingErrands = schedule.items.filter(
    (item) => item.type === 'errands' && !item.fixed,
  )

  const averageSleep =
    schedule.sleepByDay.length === 0
      ? SLEEP_DEBT_BASELINE
      : schedule.sleepByDay.reduce((sum, hours) => sum + hours, 0) / schedule.sleepByDay.length

  const sleepDebt = Math.max(0, SLEEP_DEBT_BASELINE - averageSleep)

  return {
    ceilingPressure: clamp01(1 - overall / 100),
    paperHeight: clamp01(1 - reserves.mental / 100),

    clutter: pendingErrands.slice(0, MAX_CLUTTER_BOXES).map((item) => ({
      id: item.id,
      title: item.title,
      dayIndex: item.dayIndex,
    })),

    // Sleep and movement both feed it, which is why §1.3 binds the plant to "sleep debt
    // and inactivity" rather than to either one alone.
    plantHealth: clamp01((reserves.physical / 100) * (1 - sleepDebt / SLEEP_DEBT_BASELINE)),
    sleepDebt,

    weather:
      projection.firstDeficitDay === null
        ? 'clear'
        : projection.firstDeficitDay <= STORM_WITHIN_DAYS
          ? 'storm'
          : 'clouding',

    lightLevel: clamp01(overall / 100),

    // Both, not either. Going outside is the single action that answers physical and
    // social at once, and that is what makes it the highest-value move rather than
    // simply a good one.
    doorLit: reserves.physical < DOOR_LIGHTS_BELOW && reserves.social < DOOR_LIGHTS_BELOW,

    character: characterStateFor(floorReserve(reserves)),
  }
}
