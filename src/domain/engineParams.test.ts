import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE, type CalibrationProfile } from './calibration'
import { paramsFor } from './engineParams'
import { DEFAULT_PARAMS } from '../engine'

const profile = (over: Partial<CalibrationProfile> = {}): CalibrationProfile => ({
  ...DEFAULT_PROFILE,
  ...over,
})

const overran = (count: number, type: 'mental' | 'errands' = 'mental') =>
  Array.from({ length: count }, () => ({ type, plannedHours: 2, actualHours: 4 }))

/**
 * The last loop between what the app measures about a student and what its model does with
 * it. Until this existed, calibration informed the student on the "how you work" screen and
 * changed nothing the engine computed.
 */
describe('paramsFor', () => {
  /**
   * §7.7's no cold start, at the parameter level: an uncalibrated student gets exactly the
   * population defaults, byte for byte. Anything else would mean the act of opening the app
   * quietly changed the model.
   */
  it('is the defaults exactly, for a student who has calibrated nothing', () => {
    expect(paramsFor(DEFAULT_PROFILE)).toEqual(DEFAULT_PARAMS)
  })

  // §2.4's designed slot, which the engine already applies in drain.
  it('feeds a measured estimate bias into the engine', () => {
    const params = paramsFor(profile({ confirmations: overran(5) }))

    expect(params.estimateBias.mental).toBeGreaterThan(1)
  })

  it('leaves types with no measured bias at one', () => {
    const params = paramsFor(profile({ confirmations: overran(5, 'mental') }))

    expect(params.estimateBias.errands).toBe(1)
  })

  it('does not invent a bias from a single block', () => {
    expect(paramsFor(profile({ confirmations: overran(1) })).estimateBias.mental).toBe(1)
  })

  /**
   * §7.3: the painter's measured baseline sets what counts as breaking even. Seven hours is
   * a gain for somebody who normally gets six and a deficit for somebody who normally gets
   * nine.
   */
  it('takes the sleep baseline from what was painted', () => {
    const params = paramsFor(profile({ painted: true, sleepBaselineHours: 8 }))

    expect(params.sleepBaselineHours).toBe(8)
  })

  // Nothing painted means nothing measured, and §7.2 is explicit that fiction calibrated
  // into the model is worse than no data.
  it('keeps the population baseline when nothing was painted', () => {
    const params = paramsFor(profile({ painted: false, sleepBaselineHours: 8 }))

    expect(params.sleepBaselineHours).toBe(DEFAULT_PARAMS.sleepBaselineHours)
  })

  it('refuses an implausible baseline rather than trusting it', () => {
    for (const hours of [0, 24, -3]) {
      expect(paramsFor(profile({ painted: true, sleepBaselineHours: hours })).sleepBaselineHours).toBe(
        DEFAULT_PARAMS.sleepBaselineHours,
      )
    }
  })

  it('changes nothing else about the parameters', () => {
    const params = paramsFor(profile({ confirmations: overran(5), painted: true }))

    expect(params.kSleep).toEqual(DEFAULT_PARAMS.kSleep)
    expect(params.dailyHoursCap).toBe(DEFAULT_PARAMS.dailyHoursCap)
    expect(params.isolationDrainPerDay).toBe(DEFAULT_PARAMS.isolationDrainPerDay)
  })
})
