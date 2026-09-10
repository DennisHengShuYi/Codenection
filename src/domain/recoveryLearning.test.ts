import { describe, expect, it } from 'vitest'
import type { EnergyPrediction } from './predictions'
import {
  MAX_SCALE,
  MIN_SAMPLES,
  MIN_SCALE,
  NEUTRAL_SCALES,
  recoveryScales,
} from './recoveryLearning'

/** A sample the learner can attribute to sleep: sleep moves the claim, rest does not. */
const sleepSample = (index: number, residual: number): EnergyPrediction => ({
  forDate: `2026-09-${String(index + 1).padStart(2, '0')}`,
  predicted: 50,
  reported: 50 + residual,
  basis: {
    assumedSleepHours: 7,
    assumedRestHours: 0,
    sleepScaleSensitivity: 10,
    restScaleSensitivity: 0,
  },
})

const restSample = (index: number, residual: number): EnergyPrediction => ({
  ...sleepSample(index, residual),
  basis: {
    assumedSleepHours: 5,
    assumedRestHours: 4,
    sleepScaleSensitivity: 0,
    restScaleSensitivity: 10,
  },
})

const runOf = (make: (i: number, r: number) => EnergyPrediction, n: number, residual: number) =>
  Array.from({ length: n }, (_, index) => make(index, residual))

/**
 * The loop closed.
 *
 * The app already predicts energy 48 hours out and resolves it against what the student
 * reported. Until now that error was measured and then thrown away -- displayed as a
 * scoreboard figure and read by nothing. This turns it into the one thing that makes the
 * model the student's rather than the population's.
 */
describe('recoveryScales', () => {
  it('assumes nothing about a student it has never seen', () => {
    expect(recoveryScales([])).toEqual(NEUTRAL_SCALES)
  })

  /** §7.7 and `realityCheck.MIN_SAMPLES`: say nothing until there is enough to say it
   *  honestly. Two samples is a coincidence, however large the residual. */
  it('stays neutral below the sample threshold, however wrong it was', () => {
    expect(recoveryScales(runOf(sleepSample, MIN_SAMPLES - 1, 40))).toEqual(NEUTRAL_SCALES)
  })

  it('learns that sleep does more for this student than the population default', () => {
    const scales = recoveryScales(runOf(sleepSample, MIN_SAMPLES, 8))

    expect(scales.sleep).toBeGreaterThan(1)
  })

  it('learns that it does less, when the app kept over-predicting', () => {
    const scales = recoveryScales(runOf(sleepSample, MIN_SAMPLES, -8))

    expect(scales.sleep).toBeLessThan(1)
  })

  /**
   * The identifiability rule, and the reason this can be trusted at all.
   *
   * `kSleep` and `kRest` are confounded whenever both move the claim: the residual could
   * belong to either, and splitting it between them makes the two chase each other. A
   * sample where both moved is not evidence about either, so it is thrown away rather than
   * apportioned -- the same honesty as returning 1 below MIN_SAMPLES.
   */
  it('throws away a sample it cannot attribute to one coefficient or the other', () => {
    const confounded = Array.from({ length: MIN_SAMPLES * 3 }, (_, index) => ({
      ...sleepSample(index, 20),
      basis: {
        assumedSleepHours: 7,
        assumedRestHours: 4,
        sleepScaleSensitivity: 10,
        restScaleSensitivity: 10,
      },
    }))

    expect(recoveryScales(confounded)).toEqual(NEUTRAL_SCALES)
  })

  it('never updates both coefficients from one sample', () => {
    const scales = recoveryScales(runOf(sleepSample, MIN_SAMPLES, 8))

    expect(scales.rest).toBe(1)
  })

  it('learns rest separately, from samples that are about rest', () => {
    const scales = recoveryScales(runOf(restSample, MIN_SAMPLES, 8))

    expect(scales.rest).toBeGreaterThan(1)
    expect(scales.sleep).toBe(1)
  })

  /**
   * A week with no rest in it, or one spent below the sleep baseline, produces a
   * sensitivity of nearly zero -- and dividing a residual by nearly zero invents an
   * enormous correction out of a week that said nothing.
   */
  it('throws away a sample where the coefficient could not have mattered', () => {
    const flat = Array.from({ length: MIN_SAMPLES * 2 }, (_, index) => ({
      ...sleepSample(index, 30),
      basis: {
        assumedSleepHours: 4,
        assumedRestHours: 0,
        sleepScaleSensitivity: 0.01,
        restScaleSensitivity: 0,
      },
    }))

    expect(recoveryScales(flat)).toEqual(NEUTRAL_SCALES)
  })

  it('never runs away, however absurd the evidence', () => {
    const wild = runOf(sleepSample, 30, 500)

    expect(recoveryScales(wild).sleep).toBeLessThanOrEqual(MAX_SCALE)
  })

  it('never collapses to nothing either', () => {
    expect(recoveryScales(runOf(sleepSample, 30, -500)).sleep).toBeGreaterThanOrEqual(MIN_SCALE)
  })

  /** One catastrophic fortnight must not consume the whole correction. Smoothing is what
   *  makes this a nudge rather than a lurch. */
  it('moves gradually rather than jumping on one bad week', () => {
    const many = recoveryScales(runOf(sleepSample, 20, 8)).sleep
    const few = recoveryScales(runOf(sleepSample, MIN_SAMPLES, 8)).sleep

    expect(few).toBeLessThan(many)
  })

  it('ignores a prediction nobody has checked', () => {
    const unresolved = runOf(sleepSample, MIN_SAMPLES * 2, 8).map((p) => ({ ...p, reported: null }))

    expect(recoveryScales(unresolved)).toEqual(NEUTRAL_SCALES)
  })

  it('skips a prediction recorded before any of this existed', () => {
    const old = runOf(sleepSample, MIN_SAMPLES * 2, 8).map(({ basis: _basis, ...rest }) => rest)

    expect(recoveryScales(old)).toEqual(NEUTRAL_SCALES)
  })

  /**
   * Settings come back from IndexedDB or Supabase unvalidated, so a malformed basis is
   * ordinary input rather than an exceptional one. It must be skipped, never thrown on --
   * one corrupt row cannot be allowed to take down the room screen.
   */
  it('survives a malformed basis rather than throwing', () => {
    const corrupt = [
      { ...sleepSample(0, 8), basis: { ...sleepSample(0, 8).basis, sleepScaleSensitivity: NaN } },
      ...runOf(sleepSample, MIN_SAMPLES, 8),
    ] as EnergyPrediction[]

    expect(() => recoveryScales(corrupt)).not.toThrow()
    expect(Number.isFinite(recoveryScales(corrupt).sleep)).toBe(true)
  })

  /** Resolutions can arrive out of order, so the answer must not depend on array order. */
  it('gives the same answer whatever order the samples arrive in', () => {
    const samples = runOf(sleepSample, MIN_SAMPLES + 2, 8)

    expect(recoveryScales([...samples].reverse())).toEqual(recoveryScales(samples))
  })

  it('does not modify the predictions it was given', () => {
    const before = runOf(sleepSample, MIN_SAMPLES, 8)
    const snapshot = JSON.stringify(before)

    recoveryScales(before)

    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

/**
 * §18: `estimateBias` was the only parameter that learned, and this pass added `kSleep` and
 * `kRest`. The list names four more. Two of them can be learned honestly from a scalar
 * prediction and two cannot, and saying which is which is the point.
 *
 * `kSocialContact` and `isolationDrainPerDay` both move the social reserve continuously, so
 * a residual can be attributed to either the same way sleep and rest already are.
 * `typeIntensity` is four numbers and one scalar cannot separate them.
 * `socialFloorHoursPerDay` is a threshold: its derivative is zero everywhere except a cliff,
 * so a finite difference reads either nothing or nonsense.
 */
describe('recoveryScales, the social coefficients', () => {
  const socialSample = (index: number, residual: number): EnergyPrediction => ({
    forDate: `2026-10-${String(index + 1).padStart(2, '0')}`,
    predicted: 50,
    reported: 50 + residual,
    basis: {
      assumedSleepHours: 5,
      assumedRestHours: 0,
      sleepScaleSensitivity: 0,
      restScaleSensitivity: 0,
      socialScaleSensitivity: 10,
      isolationScaleSensitivity: 0,
    },
  })

  const isolationSample = (index: number, residual: number): EnergyPrediction => ({
    ...socialSample(index, residual),
    basis: {
      assumedSleepHours: 5,
      assumedRestHours: 0,
      sleepScaleSensitivity: 0,
      restScaleSensitivity: 0,
      socialScaleSensitivity: 0,
      isolationScaleSensitivity: 10,
    },
  })

  const run = (make: (i: number, r: number) => EnergyPrediction, n: number, residual: number) =>
    Array.from({ length: n }, (_, index) => make(index, residual))

  it('assumes the population default for a student it has learned nothing about', () => {
    expect(recoveryScales([]).socialContact).toBe(1)
    expect(recoveryScales([]).isolation).toBe(1)
  })

  it('learns that seeing people does more for this student than the default', () => {
    expect(recoveryScales(run(socialSample, MIN_SAMPLES, 8)).socialContact).toBeGreaterThan(1)
  })

  it('learns that being alone costs this student more', () => {
    expect(recoveryScales(run(isolationSample, MIN_SAMPLES, -8)).isolation).toBeLessThan(1)
  })

  /** The same identifiability rule, extended: these two both move the social reserve, so a
   *  fortnight where both mattered is evidence about neither. */
  it('throws away a sample where both social coefficients moved', () => {
    const confounded = Array.from({ length: MIN_SAMPLES * 3 }, (_, index) => ({
      ...socialSample(index, 20),
      basis: {
        assumedSleepHours: 5,
        assumedRestHours: 0,
        sleepScaleSensitivity: 0,
        restScaleSensitivity: 0,
        socialScaleSensitivity: 10,
        isolationScaleSensitivity: 10,
      },
    }))

    expect(recoveryScales(confounded).socialContact).toBe(1)
    expect(recoveryScales(confounded).isolation).toBe(1)
  })

  it('never updates more than one coefficient from one sample', () => {
    const scales = recoveryScales(run(socialSample, MIN_SAMPLES, 8))

    expect(scales.sleep).toBe(1)
    expect(scales.rest).toBe(1)
    expect(scales.isolation).toBe(1)
  })

  /** Predictions recorded before the social sensitivities existed carry neither field, and
   *  must still teach what they can about sleep and rest. */
  it('still learns sleep from a record made before the social fields existed', () => {
    expect(recoveryScales(runOf(sleepSample, MIN_SAMPLES, 8)).sleep).toBeGreaterThan(1)
  })

  it('bounds them exactly as it bounds the others', () => {
    expect(recoveryScales(run(socialSample, 30, 500)).socialContact).toBeLessThanOrEqual(MAX_SCALE)
    expect(recoveryScales(run(isolationSample, 30, -500)).isolation).toBeGreaterThanOrEqual(MIN_SCALE)
  })
})
