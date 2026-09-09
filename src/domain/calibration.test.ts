import { describe, expect, it } from 'vitest'
import {
  calibrationProgress,
  DEFAULT_PROFILE,
  focusMinutes,
  type CalibrationProfile,
  type FocusBucket,
} from './calibration'

const profile = (over: Partial<CalibrationProfile> = {}): CalibrationProfile => ({
  ...DEFAULT_PROFILE,
  ...over,
})

describe('DEFAULT_PROFILE', () => {
  /**
   * §7.7: population defaults produce a working app on first open. The defaults are a
   * working app, not a placeholder -- nothing in the app may be gated behind calibration.
   */
  it('is usable before anybody has calibrated anything', () => {
    expect(DEFAULT_PROFILE.mode).toBeTruthy()
    expect(DEFAULT_PROFILE.sleepBaselineHours).toBeGreaterThan(0)
    expect(focusMinutes(DEFAULT_PROFILE.focus)).toBeGreaterThan(0)
  })

  it('starts with nothing confirmed and nothing calibrated', () => {
    expect(DEFAULT_PROFILE.confirmations).toEqual([])
    expect(DEFAULT_PROFILE.calibratedDays).toBe(0)
  })

  // §7.1: semester break is a toggle on top of mode, not a fifth option.
  it('treats semester break as a toggle rather than a mode', () => {
    expect(DEFAULT_PROFILE.semesterBreak).toBe(false)
    expect(profile({ semesterBreak: true }).mode).toBe(DEFAULT_PROFILE.mode)
  })
})

describe('focusMinutes', () => {
  // §7.5: buckets, not numbers. "How long before you drift", not "how many hours".
  it('turns each bucket into a plausible length', () => {
    const buckets: FocusBucket[] = ['under30', 'about1h', 'couple', 'longer']

    for (const bucket of buckets) {
      expect(focusMinutes(bucket), bucket).toBeGreaterThan(0)
    }
  })

  it('orders the buckets the way the words do', () => {
    expect(focusMinutes('under30')).toBeLessThan(focusMinutes('about1h'))
    expect(focusMinutes('about1h')).toBeLessThan(focusMinutes('couple'))
    expect(focusMinutes('couple')).toBeLessThan(focusMinutes('longer'))
  })
})

describe('calibrationProgress', () => {
  /**
   * §7.7: the meter shows tuning progress so setup reads as progress, never as a gate. It
   * starts low rather than at zero -- a student who has opened the app already has a
   * working model, and a bar at nothing would say otherwise.
   */
  it('starts above nothing, because the defaults already work', () => {
    expect(calibrationProgress(DEFAULT_PROFILE)).toBeGreaterThan(0)
  })

  it('rises when the mode has been chosen deliberately', () => {
    expect(calibrationProgress(profile({ modeChosen: true }))).toBeGreaterThan(
      calibrationProgress(DEFAULT_PROFILE),
    )
  })

  it('rises when the painter has been filled in', () => {
    expect(calibrationProgress(profile({ painted: true }))).toBeGreaterThan(
      calibrationProgress(DEFAULT_PROFILE),
    )
  })

  it('rises as blocks get confirmed', () => {
    const some = profile({ confirmations: [{ type: 'mental', plannedHours: 2, actualHours: 3 }] })

    expect(calibrationProgress(some)).toBeGreaterThan(calibrationProgress(DEFAULT_PROFILE))
  })

  it('never exceeds one, however much is confirmed', () => {
    const many = profile({
      modeChosen: true,
      painted: true,
      confirmations: Array.from({ length: 200 }, () => ({
        type: 'mental' as const,
        plannedHours: 2,
        actualHours: 3,
      })),
    })

    expect(calibrationProgress(many)).toBeLessThanOrEqual(1)
  })

  it('reaches one when everything has been done', () => {
    const done = profile({
      modeChosen: true,
      painted: true,
      confirmations: Array.from({ length: 20 }, () => ({
        type: 'mental' as const,
        plannedHours: 2,
        actualHours: 3,
      })),
    })

    expect(calibrationProgress(done)).toBe(1)
  })
})
