import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, HORIZON_DAYS, project } from '../engine'
import { ALL_PRESENT, toDayInputs, type Schedule, type ScheduledItem } from '../optimizer'
import type { BlockOutcome } from './calibration'
import { paramsFor } from './engineParams'
import type { EnergyPrediction } from './predictions'

const item = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'essay',
  title: 'WIA3001 essay',
  type: 'mental',
  kind: 'studyBlock',
  hours: 6,
  intensity: 1,
  dayIndex: 1,
  startHour: 10,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [item()],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

/**
 * The lowest a single reserve type reaches.
 *
 * Deliberately not the projection's `worstFloor`, which is the minimum across all four types
 * at once -- for a rested student that is social isolation three weeks out, and neither study
 * work nor sleep moves it. The same trap `requestCost` fell into, and it would have made
 * these assertions pass on a number that never changes.
 */
const lowestOf = (projection: { central: readonly Record<string, number>[] }, type: string) =>
  projection.central.reduce((low, day) => Math.min(low, day[type] ?? 100), 100)

const overran = (count: number): BlockOutcome[] =>
  Array.from({ length: count }, () => ({
    type: 'mental' as const,
    plannedHours: 2,
    actualHours: 4,
  }))

/**
 * The point of the whole change, asserted where it actually matters: not that a multiplier
 * was computed, but that the projection a student is shown is different because of it.
 *
 * This replaces a test that asserted the padded *hours* were saved. That approach applied the
 * correction a second time on top of the engine's own `estimateBias`, which `drain` has
 * always multiplied by -- a 1.7x bias would have landed as 2.89x. One correction, in the slot
 * the engine was built with.
 */
describe('what the app measures reaches what it projects', () => {
  it('projects a heavier week for a student who consistently overruns', () => {
    const schedule = week()
    const uncalibrated = project(schedule.start, toDayInputs(schedule, ALL_PRESENT), DEFAULT_PARAMS)
    const calibrated = project(schedule.start, toDayInputs(schedule, ALL_PRESENT), paramsFor(overran(5)))

    expect(lowestOf(calibrated, 'mental')).toBeLessThan(lowestOf(uncalibrated, 'mental'))
  })

  it('projects identically for a student with no logged outcomes', () => {
    const schedule = week()

    expect(project(schedule.start, toDayInputs(schedule, ALL_PRESENT), paramsFor([]))).toEqual(
      project(schedule.start, toDayInputs(schedule, ALL_PRESENT), DEFAULT_PARAMS),
    )
  })

  // The bias applies to the type it was measured on, and only to that one.
  it('applies the bias to the measured type and leaves the others alone', () => {
    const schedule = week({ items: [item({ type: 'errands', kind: 'errands' })] })
    // Measured on errands this time, so errands should move and mental should not.
    const uncalibrated = project(schedule.start, toDayInputs(schedule, ALL_PRESENT), DEFAULT_PARAMS)
    const calibrated = project(
      schedule.start,
      toDayInputs(schedule, ALL_PRESENT),
      paramsFor(
        Array.from({ length: 5 }, () => ({
          type: 'errands' as const,
          plannedHours: 2,
          actualHours: 4,
        })),
      ),
    )

    expect(lowestOf(calibrated, 'errands')).toBeLessThan(lowestOf(uncalibrated, 'errands'))
    expect(lowestOf(calibrated, 'mental')).toBe(lowestOf(uncalibrated, 'mental'))
  })
})

/**
 * The other half of the same question, for the parameter that learns from prediction error.
 *
 * A learned coefficient that does not move a projection is a number in a settings blob, not
 * a model of anybody -- and the accuracy figure has been measured and discarded for long
 * enough that "it is computed somewhere" is not evidence it does anything.
 */
describe('what the prediction loop has learned reaching the engine', () => {
  const sleepSamples = (n: number, residual: number): EnergyPrediction[] =>
    Array.from({ length: n }, (_, index) => ({
      forDate: `2026-09-${String(index + 1).padStart(2, '0')}`,
      predicted: 50,
      reported: 50 + residual,
      basis: {
        assumedSleepHours: 8,
        assumedRestHours: 0,
        sleepScaleSensitivity: 10,
        restScaleSensitivity: 0,
      },
    }))

  /** A hard fortnight on good sleep: reserves stay off both the floor and the ceiling, so
   *  what sleep restores is actually visible in the numbers. */
  const strained = week({
    start: { mental: 45, physical: 45, social: 45, errands: 45 },
    items: Array.from({ length: 10 }, (_, dayIndex) =>
      item({ id: `d${dayIndex}`, dayIndex, hours: 8 }),
    ),
    sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 9),
  })

  const worstOn = (predictions: EnergyPrediction[]) =>
    project(strained.start, toDayInputs(strained, ALL_PRESENT), paramsFor([], predictions))
      .worstOverall

  it('leaves a student it has learned nothing about exactly where they were', () => {
    expect(worstOn([])).toBeCloseTo(
      project(strained.start, toDayInputs(strained, ALL_PRESENT), DEFAULT_PARAMS).worstOverall,
    )
  })

  it('carries a student sleep restores more than average further through the fortnight', () => {
    expect(worstOn(sleepSamples(8, 8))).toBeGreaterThan(worstOn([]))
  })

  it('and one it restores less, not as far', () => {
    expect(worstOn(sleepSamples(8, -8))).toBeLessThan(worstOn([]))
  })
})
