import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, HORIZON_DAYS, project } from '../engine'
import { ALL_PRESENT, toDayInputs, type Schedule, type ScheduledItem } from '../optimizer'
import type { BlockOutcome } from './calibration'
import { paramsFor } from './engineParams'

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
