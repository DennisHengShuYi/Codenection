import { DEFAULT_PARAMS, LOAD_TYPES, type EngineParams, type Reserves } from '../engine'
import type { CalibrationProfile } from './calibration'
import { paddingFor } from './realityCheck'

/** Outside this, a painted sleep baseline is a mis-tap rather than a measurement. */
const PLAUSIBLE_SLEEP = { min: 3, max: 14 }

/**
 * Turns what the app has measured about a student into the parameters its model runs on.
 *
 * This is the loop that was open: calibration told the student things on the "how you work"
 * screen and changed nothing the engine computed. §7.3's table asks for exactly this, and
 * §2.4's estimate bias has had a slot in `EngineParams` since the engine was written --
 * `drain` already multiplies by it. It was simply always 1.
 *
 * An uncalibrated student gets the population defaults byte for byte (§7.7). Anything else
 * would mean opening the app quietly changed the model.
 */
export function paramsFor(profile: CalibrationProfile): EngineParams {
  const estimateBias = Object.fromEntries(
    LOAD_TYPES.map((type) => [type, paddingFor(profile.confirmations, type)]),
  ) as Reserves

  // Only a painted baseline is a measurement. §7.2: fiction calibrated into the model is
  // worse than no data, so an unpainted profile keeps the population figure rather than
  // having its default read back as though somebody had reported it.
  const painted = profile.painted ? profile.sleepBaselineHours : null
  const sleepBaselineHours =
    painted !== null && painted >= PLAUSIBLE_SLEEP.min && painted <= PLAUSIBLE_SLEEP.max
      ? painted
      : DEFAULT_PARAMS.sleepBaselineHours

  return { ...DEFAULT_PARAMS, estimateBias, sleepBaselineHours }
}
