import { describe, expect, it } from 'vitest'
import type { BlockOutcome } from './calibration'
import { paramsFor } from './engineParams'
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

    expect(params.kSleep).toEqual(DEFAULT_PARAMS.kSleep)
    expect(params.dailyHoursCap).toBe(DEFAULT_PARAMS.dailyHoursCap)
    expect(params.isolationDrainPerDay).toBe(DEFAULT_PARAMS.isolationDrainPerDay)
    expect(params.sleepBaselineHours).toBe(DEFAULT_PARAMS.sleepBaselineHours)
  })
})
