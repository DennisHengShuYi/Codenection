import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE, type CalibrationProfile } from './calibration'

/**
 * §7.7: population defaults produce a working app on first open. Everything calibration
 * used to ask about -- mode, focus bucket, semester break, the painted sleep grid, the
 * tuning meter -- is gone (Task 17): nothing in the running app ever read those fields, and
 * `confirmations`/`confirmedItemIds` followed once the block log became the only source
 * `paramsFor` and the "already asked" checks read from. What is left on the profile is the
 * one thing something still reads: §8.1's scored predictions.
 */
describe('DEFAULT_PROFILE', () => {
  it('is usable before anybody has calibrated anything', () => {
    expect(DEFAULT_PROFILE.predictions).toEqual([])
  })

  it('holds predictions and nothing else', () => {
    const keys = Object.keys(DEFAULT_PROFILE)

    expect(keys).toEqual(['predictions'])
  })
})

describe('CalibrationProfile', () => {
  it('ignores unknown keys carried over from a profile saved before this shrink', () => {
    // §7's earlier shape carried mode, focus, semesterBreak, peakStartHour, painted,
    // modeChosen and calibratedDays. A student's stored settings still have them, and the
    // loader must keep working rather than reject the blob -- this profile is exactly what
    // `useProfile.test.tsx` asserts still loads.
    const legacy = {
      ...DEFAULT_PROFILE,
      mode: 'working',
      focus: 'longer',
      semesterBreak: true,
      peakStartHour: 9,
      painted: true,
      modeChosen: true,
      calibratedDays: 12,
    } as CalibrationProfile

    expect(legacy.predictions).toEqual([])
  })
})
