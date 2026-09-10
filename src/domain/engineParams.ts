import { DEFAULT_PARAMS, LOAD_TYPES, type EngineParams, type Reserves } from '../engine'
import type { BlockOutcome } from './calibration'
import { paddingFor } from './realityCheck'

/**
 * Turns what the app has measured about a student into the parameters its model runs on.
 *
 * This is the loop that was open: calibration told the student things on the "how you work"
 * screen and changed nothing the engine computed. §7.3's table asks for exactly this, and
 * §2.4's estimate bias has had a slot in `EngineParams` since the engine was written --
 * `drain` already multiplies by it. It was simply always 1.
 *
 * Takes the outcomes themselves -- §8b's block log, read through `outcomesFrom` -- rather
 * than the calibration profile that used to carry them. The profile was never the source of
 * truth: it was where `confirmations` happened to live before there was a durable record
 * both the room and the Telegram bot could write to.
 *
 * A student with no logged outcomes gets the population defaults byte for byte (§7.7).
 * Anything else would mean opening the app quietly changed the model.
 */
export function paramsFor(outcomes: readonly BlockOutcome[]): EngineParams {
  const estimateBias = Object.fromEntries(
    LOAD_TYPES.map((type) => [type, paddingFor(outcomes, type)]),
  ) as Reserves

  return { ...DEFAULT_PARAMS, estimateBias }
}
