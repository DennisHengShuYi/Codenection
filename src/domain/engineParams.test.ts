import { describe, expect, it } from 'vitest'
import type { BlockOutcome } from './calibration'
import { paramsFor } from './engineParams'
import type { EnergyPrediction } from './predictions'
import { DEFAULT_PARAMS } from '../engine'

const overran = (count: number, type: BlockOutcome['type'] = 'mental'): BlockOutcome[] =>
  Array.from({ length: count }, () => ({ type, plannedHours: 2, actualHours: 4 }))

/**
 * The last loop between what the app measures about a student and what its model does with
 * it. Until this existed, calibration informed the student on the "how you work" screen and
 * changed nothing the engine computed.
 *
 * §8b moved the source of that measurement from the calibration profile's `confirmations`
 * to the block log's outcomes -- the same shape, `BlockOutcome[]`, now read from a durable
 * record both writers can reach instead of from state that lived only on the profile.
 */
describe('paramsFor', () => {
  /**
   * §7.7's no cold start, at the parameter level: a student with no logged outcomes gets
   * exactly the population defaults, byte for byte. Anything else would mean the act of
   * opening the app quietly changed the model.
   */
  it('is the defaults exactly, for a student with no logged outcomes', () => {
    expect(paramsFor([])).toEqual(DEFAULT_PARAMS)
  })

  // §2.4's designed slot, which the engine already applies in drain.
  it('feeds a measured estimate bias into the engine', () => {
    const params = paramsFor(overran(5))

    expect(params.estimateBias.mental).toBeGreaterThan(1)
  })

  it('leaves types with no measured bias at one', () => {
    const params = paramsFor(overran(5, 'mental'))

    expect(params.estimateBias.errands).toBe(1)
  })

  it('does not invent a bias from a single block', () => {
    expect(paramsFor(overran(1)).estimateBias.mental).toBe(1)
  })

  it('changes nothing else about the parameters', () => {
    const params = paramsFor(overran(5))

    expect(params.dailyHoursCap).toBe(DEFAULT_PARAMS.dailyHoursCap)
    expect(params.isolationDrainPerDay).toBe(DEFAULT_PARAMS.isolationDrainPerDay)
    expect(params.sleepBaselineHours).toBe(DEFAULT_PARAMS.sleepBaselineHours)
  })
})

/**
 * The second parameter that learns.
 *
 * `estimateBias` was the only one; everything else -- `kSleep`, `kRest`, `kSocialContact`,
 * `typeIntensity`, the whole coupling matrix -- was a population constant, so an introvert
 * and an extrovert got the same numbers and the app called them the same thing. This is the
 * one the prediction loop can actually support, because the app already claims a figure 48
 * hours out and already finds out whether it was right.
 */
describe('paramsFor and what the prediction loop has learned', () => {
  const sleepSamples = (n: number, residual: number): EnergyPrediction[] =>
    Array.from({ length: n }, (_, index) => ({
      forDate: `2026-09-${String(index + 1).padStart(2, '0')}`,
      predicted: 50,
      reported: 50 + residual,
      basis: {
        assumedSleepHours: 7,
        assumedRestHours: 0,
        sleepScaleSensitivity: 10,
        restScaleSensitivity: 0,
      },
    }))

  /** §7.7's no cold start, kept byte for byte. Opening the app must not quietly change the
   *  model, and a caller that passes no predictions at all must be unaffected. */
  it('is exactly the population default for a student it has learned nothing about', () => {
    expect(paramsFor([])).toEqual(paramsFor([], []))
    expect(paramsFor([], []).kSleep).toEqual(DEFAULT_PARAMS.kSleep)
    expect(paramsFor([], []).kRest).toEqual(DEFAULT_PARAMS.kRest)
  })

  it('scales what sleep restores once the loop has enough to go on', () => {
    const learned = paramsFor([], sleepSamples(6, 8))

    expect(learned.kSleep.mental).toBeGreaterThan(DEFAULT_PARAMS.kSleep.mental)
  })

  /**
   * The highest-risk line in the whole change.
   *
   * `params.ts` states outright that these zeros are load-bearing rather than rounded
   * down: a non-zero coefficient lets an isolated student recover by sleeping, which makes
   * the app's answer to loneliness an early night and erases the one signal the engine
   * exists to surface. A multiplier must leave an exact zero exactly zero.
   */
  it('never lets a learned scale give sleep or rest power over the social reserve', () => {
    const learned = paramsFor([], sleepSamples(20, 40))

    expect(learned.kSleep.social).toBe(0)
    expect(learned.kRest.social).toBe(0)
  })

  /**
   * §18 draws a line, and this is it. `typeIntensity` is four numbers a single scalar
   * residual cannot separate, and `socialFloorHoursPerDay` is a threshold whose derivative
   * is zero everywhere but a cliff. Both stay population constants on purpose -- learning
   * them from this evidence would be inventing precision.
   */
  it('leaves the parameters it cannot honestly identify alone', () => {
    const learned = paramsFor([], sleepSamples(6, 8))

    expect(learned.typeIntensity).toEqual(DEFAULT_PARAMS.typeIntensity)
    expect(learned.socialFloorHoursPerDay).toBe(DEFAULT_PARAMS.socialFloorHoursPerDay)
    expect(learned.sleepBaselineHours).toBe(DEFAULT_PARAMS.sleepBaselineHours)
  })

  /** A sample about sleep must not disturb the social coefficients either. */
  it('leaves the social coefficients alone when the evidence is about sleep', () => {
    const learned = paramsFor([], sleepSamples(6, 8))

    expect(learned.kSocialContact).toBe(DEFAULT_PARAMS.kSocialContact)
    expect(learned.isolationDrainPerDay).toBe(DEFAULT_PARAMS.isolationDrainPerDay)
  })

  /** The two learners are independent: one measures estimates, the other measures
   *  recovery, and neither may quietly disturb the other. */
  it('composes with the estimate bias rather than replacing it', () => {
    const both = paramsFor(overran(5), sleepSamples(6, 8))

    expect(both.estimateBias.mental).toBeGreaterThan(1)
    expect(both.kSleep.mental).toBeGreaterThan(DEFAULT_PARAMS.kSleep.mental)
  })
})
