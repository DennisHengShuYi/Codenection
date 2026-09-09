import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import {
  accuracyLine,
  meanAbsoluteError,
  predictEnergy,
  recordPrediction,
  resolvePrediction,
  type EnergyPrediction,
} from './predictions'

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

const resolved = (pairs: ReadonlyArray<[number, number]>): EnergyPrediction[] =>
  pairs.map(([predicted, reported], index) => ({ forDay: index, predicted, reported }))

describe('predictEnergy', () => {
  /**
   * §8.1: predict tomorrow's reported energy, 24 to 48 hours out. These resolve regardless
   * of whether the student intervenes, which is exactly what the 21-day projection cannot
   * do -- and why this is the falsifiable claim and that one is not.
   */
  it('predicts a figure for a day inside the horizon', () => {
    const predicted = predictEnergy(week(), DEFAULT_PARAMS, 2)

    expect(predicted).toBeGreaterThan(0)
    expect(predicted).toBeLessThanOrEqual(100)
  })

  it('predicts a lower figure for a heavier week', () => {
    const heavy = week({ start: { mental: 20, physical: 20, social: 20, errands: 20 } })

    const depleted = predictEnergy(heavy, DEFAULT_PARAMS, 2)
    const rested = predictEnergy(week(), DEFAULT_PARAMS, 2)

    expect(depleted).not.toBeNull()
    expect(rested).not.toBeNull()
    expect(depleted ?? 0).toBeLessThan(rested ?? 0)
  })

  // It comes from the same projection the rest of the app runs on. A separate predictor
  // would be scoring something the student never saw.
  it('predicts nothing for a day outside the horizon', () => {
    expect(predictEnergy(week(), DEFAULT_PARAMS, HORIZON_DAYS + 5)).toBeNull()
  })
})

describe('recordPrediction', () => {
  it('keeps the prediction unresolved until it is reported on', () => {
    const kept = recordPrediction([], 2, 64)

    expect(kept).toHaveLength(1)
    expect(kept[0]?.reported).toBeNull()
  })

  it('keeps predictions already made', () => {
    expect(recordPrediction(recordPrediction([], 2, 64), 3, 61)).toHaveLength(2)
  })

  it('does not record the same day twice', () => {
    expect(recordPrediction(recordPrediction([], 2, 64), 2, 70)).toHaveLength(1)
  })
})

describe('resolvePrediction', () => {
  it('attaches what the student actually reported', () => {
    const out = resolvePrediction(recordPrediction([], 2, 64), 2, 58)

    expect(out[0]?.reported).toBe(58)
  })

  it('leaves an unknown day alone', () => {
    const before = recordPrediction([], 2, 64)

    expect(resolvePrediction(before, 9, 58)).toEqual(before)
  })

  // A resolved prediction is a scored one. Rewriting it later would let the number be
  // improved after the fact, which is the opposite of a falsifiable claim.
  it('never re-resolves one that has already been scored', () => {
    const once = resolvePrediction(recordPrediction([], 2, 64), 2, 58)

    expect(resolvePrediction(once, 2, 90)[0]?.reported).toBe(58)
  })
})

describe('meanAbsoluteError', () => {
  /**
   * Zero resolved predictions is **not zero error** -- it is no measurement. Reporting 0.0
   * would be a lie that flatters the app, and §8 is the section that exists to be honest
   * about exactly this.
   */
  it('is unknown rather than zero when nothing has resolved', () => {
    expect(meanAbsoluteError([])).toBeNull()
    expect(meanAbsoluteError(recordPrediction([], 2, 64))).toBeNull()
  })

  it('is zero for a perfect prediction', () => {
    expect(meanAbsoluteError(resolved([[60, 60]]))).toBe(0)
  })

  // Absolute, not signed: over- and under-predicting must not cancel out into a flattering
  // average.
  it('does not let over- and under-prediction cancel out', () => {
    expect(meanAbsoluteError(resolved([[70, 60], [50, 60]]))).toBe(10)
  })

  it('averages across what has resolved', () => {
    expect(meanAbsoluteError(resolved([[70, 60], [65, 60]]))).toBeCloseTo(7.5, 1)
  })

  it('ignores predictions still waiting to be reported on', () => {
    const mixed = [...resolved([[70, 60]]), { forDay: 5, predicted: 40, reported: null }]

    expect(meanAbsoluteError(mixed)).toBe(10)
  })
})

describe('accuracyLine', () => {
  it('says there is not enough data rather than claiming accuracy', () => {
    expect(accuracyLine([])).toMatch(/not enough|no.*yet/i)
    expect(accuracyLine([])).not.toMatch(/0(\.0)?\s*(points|%)/)
  })

  it('names the error once predictions have actually resolved', () => {
    expect(accuracyLine(resolved([[70, 60], [65, 60]]))).toMatch(/7\.5|8/)
  })

  it('says how many it is based on, so the number can be judged', () => {
    expect(accuracyLine(resolved([[70, 60], [65, 60]]))).toMatch(/2/)
  })
})
