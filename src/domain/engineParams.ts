import { DEFAULT_PARAMS, LOAD_TYPES, type EngineParams, type Reserves } from '../engine'
import type { BlockOutcome } from './calibration'
import type { EnergyPrediction } from './predictions'
import { recoveryScales } from './recoveryLearning'
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
/**
 * Scales a per-type coefficient, leaving an exact zero exactly zero.
 *
 * The most important line in this file. `params.ts` states outright that `kSleep.social`
 * and `kRest.social` being zero is load-bearing rather than rounded down: any non-zero
 * value there lets an isolated student recover by sleeping -- measured at 20 to 65 over a
 * fortnight of seeing nobody -- which makes the app's answer to loneliness an early night
 * and erases the isolation signal the engine exists to surface. A multiplier that treated
 * these as ordinary numbers would reintroduce that quietly, through a parameter nobody was
 * looking at.
 */
const scaledReserves = (reserves: Reserves, scale: number): Reserves =>
  Object.fromEntries(
    LOAD_TYPES.map((type) => [type, reserves[type] === 0 ? 0 : reserves[type] * scale]),
  ) as Reserves

export function paramsFor(
  outcomes: readonly BlockOutcome[],
  /**
   * §8.1's resolved predictions, for the recovery coefficients.
   *
   * Defaulted to empty so §7.7's no-cold-start guarantee holds byte for byte and every
   * caller written before the loop existed keeps compiling and behaving as it did.
   */
  predictions: readonly EnergyPrediction[] = [],
): EngineParams {
  const estimateBias = Object.fromEntries(
    LOAD_TYPES.map((type) => [type, paddingFor(outcomes, type)]),
  ) as Reserves

  // Two independent learners over two different measurements: what the student's estimates
  // do, and what recovery does for them. Neither may disturb the other, which is why they
  // are composed here rather than folded into one correction.
  const { sleep, rest, socialContact, isolation } = recoveryScales(predictions)

  return {
    ...DEFAULT_PARAMS,
    estimateBias,
    kSleep: scaledReserves(DEFAULT_PARAMS.kSleep, sleep),
    kRest: scaledReserves(DEFAULT_PARAMS.kRest, rest),
    // §18's other two learnable coefficients. Both are plain scalars rather than per-type
    // maps, so there is no load-bearing zero to preserve here -- but see `scaledReserves`
    // for why that mattered so much on the two above.
    kSocialContact: DEFAULT_PARAMS.kSocialContact * socialContact,
    isolationDrainPerDay: DEFAULT_PARAMS.isolationDrainPerDay * isolation,
  }
}
