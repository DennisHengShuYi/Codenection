import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, HORIZON_DAYS } from '../engine'
import { ALL_PRESENT, type Schedule, type ScheduledItem } from '../optimizer'
import type { BlockRecord } from './blockLog'
import { anchorTo } from './calendar'
import {
  accuracyLine,
  meanAbsoluteError,
  predictEnergy,
  predictionsAfter,
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

/** A heavy enough run of real load that missing-data pessimism over a silent stretch
 *  measurably drags the two-day-out prediction down, not just the 21-day worst floor. */
const dailyMentalLoad = (days: number, hours: number): ScheduledItem[] =>
  Array.from({ length: days }, (_, dayIndex) => ({
    id: `daily-${dayIndex}`,
    title: `daily ${dayIndex}`,
    type: 'mental' as const,
    kind: 'studyBlock' as const,
    hours,
    intensity: 1,
    dayIndex,
    startHour: 9,
    fixed: false,
    deadlineDay: null,
    protectedRest: false,
  }))

/** One answered block per day, so `checkedInDays` reads every day as checked in. */
const fullyCheckedInLog = (days: number): BlockRecord[] =>
  Array.from({ length: days }, (_, dayIndex) => ({
    blockId: `daily-${dayIndex}`,
    type: 'mental' as const,
    plannedHours: 8,
    dayIndex,
    answer: 'right' as const,
    answeredAt: 0,
  }))

const resolved = (pairs: ReadonlyArray<[number, number]>): EnergyPrediction[] =>
  pairs.map(([predicted, reported], index) => ({
    forDate: `2026-09-${String(10 + index).padStart(2, '0')}`,
    predicted,
    reported,
  }))

const at = (iso: string) => new Date(`${iso}T09:00:00Z`)

describe('predictEnergy', () => {
  /**
   * §8.1: predict tomorrow's reported energy, 24 to 48 hours out. These resolve regardless
   * of whether the student intervenes, which is exactly what the 21-day projection cannot
   * do -- and why this is the falsifiable claim and that one is not.
   */
  it('predicts a figure for a day inside the horizon', () => {
    const predicted = predictEnergy(week(), DEFAULT_PARAMS, 2, ALL_PRESENT)

    expect(predicted).toBeGreaterThan(0)
    expect(predicted).toBeLessThanOrEqual(100)
  })

  it('predicts a lower figure for a heavier week', () => {
    const heavy = week({ start: { mental: 20, physical: 20, social: 20, errands: 20 } })

    const depleted = predictEnergy(heavy, DEFAULT_PARAMS, 2, ALL_PRESENT)
    const rested = predictEnergy(week(), DEFAULT_PARAMS, 2, ALL_PRESENT)

    expect(depleted).not.toBeNull()
    expect(rested).not.toBeNull()
    expect(depleted ?? 0).toBeLessThan(rested ?? 0)
  })

  // It comes from the same projection the rest of the app runs on. A separate predictor
  // would be scoring something the student never saw.
  it('predicts nothing for a day outside the horizon', () => {
    expect(predictEnergy(week(), DEFAULT_PARAMS, HORIZON_DAYS + 5, ALL_PRESENT)).toBeNull()
  })
})

describe('recordPrediction', () => {
  it('keeps the prediction unresolved until it is reported on', () => {
    const kept = recordPrediction([], '2026-09-11', 64)

    expect(kept).toHaveLength(1)
    expect(kept[0]?.reported).toBeNull()
  })

  it('keeps predictions already made', () => {
    expect(recordPrediction(recordPrediction([], '2026-09-11', 64), '2026-09-12', 61)).toHaveLength(2)
  })

  it('does not record the same day twice', () => {
    expect(recordPrediction(recordPrediction([], '2026-09-11', 64), '2026-09-11', 70)).toHaveLength(1)
  })
})

describe('resolvePrediction', () => {
  it('attaches what the student actually reported', () => {
    const out = resolvePrediction(recordPrediction([], '2026-09-11', 64), '2026-09-11', 58)

    expect(out[0]?.reported).toBe(58)
  })

  it('leaves an unknown day alone', () => {
    const before = recordPrediction([], '2026-09-11', 64)

    expect(resolvePrediction(before, '2026-12-25', 58)).toEqual(before)
  })

  // A resolved prediction is a scored one. Rewriting it later would let the number be
  // improved after the fact, which is the opposite of a falsifiable claim.
  it('never re-resolves one that has already been scored', () => {
    const once = resolvePrediction(recordPrediction([], '2026-09-11', 64), '2026-09-11', 58)

    expect(resolvePrediction(once, '2026-09-11', 90)[0]?.reported).toBe(58)
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
    expect(meanAbsoluteError(recordPrediction([], '2026-09-11', 64))).toBeNull()
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
    const mixed = [...resolved([[70, 60]]), { forDate: '2026-09-20', predicted: 40, reported: null }]

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

/**
 * The entry point that was missing, and the reason §8.1 sat inert: a prediction has to be
 * about a real day or it can never be checked against anything.
 */
describe('predictionsAfter', () => {
  const anchored = () => anchorTo(week(), at('2026-09-09'))

  it('makes a prediction about the day two days out', () => {
    const out = predictionsAfter([], anchored(), DEFAULT_PARAMS, at('2026-09-09'))

    expect(out).toHaveLength(1)
    expect(out[0]?.forDate).toBe('2026-09-11')
  })

  it('does not predict the same day twice across sessions', () => {
    const once = predictionsAfter([], anchored(), DEFAULT_PARAMS, at('2026-09-09'))

    expect(predictionsAfter(once, anchored(), DEFAULT_PARAMS, at('2026-09-09'))).toHaveLength(1)
  })

  it('makes a new prediction on a new day', () => {
    const once = predictionsAfter([], anchored(), DEFAULT_PARAMS, at('2026-09-09'))

    expect(predictionsAfter(once, anchored(), DEFAULT_PARAMS, at('2026-09-10'))).toHaveLength(2)
  })

  /**
   * An unanchored week has no real dates, so there is no honest claim to make. Recording one
   * anyway would produce rows that look like predictions and could never resolve -- exactly
   * the theatre §8 exists to avoid.
   */
  it('records nothing for a week with no date anchor', () => {
    expect(predictionsAfter([], week(), DEFAULT_PARAMS, at('2026-09-09'))).toEqual([])
  })

  it('records nothing once the fortnight is behind them', () => {
    expect(predictionsAfter([], anchored(), DEFAULT_PARAMS, at('2026-12-01'))).toEqual([])
  })

  it('records nothing when two days out is past the horizon', () => {
    const nearlyOver = anchorTo(week(), at('2026-09-09'))

    // Day 20 is the last in the horizon, so day 22 has no projection to read.
    expect(predictionsAfter([], nearlyOver, DEFAULT_PARAMS, at('2026-09-29'))).toEqual([])
  })

  it('leaves predictions already made untouched', () => {
    const existing = resolved([[70, 60]])

    expect(predictionsAfter(existing, anchored(), DEFAULT_PARAMS, at('2026-09-09'))[0]).toEqual(
      existing[0],
    )
  })

  /**
   * §8.1's published claim is only honest if it is scored against what the student was
   * actually shown -- and the room and the dial already read a silent past as a bad sign
   * (§6.5). A predictor that skips that would be publishing an accuracy figure for a
   * projection nobody saw.
   *
   * The direction matters more than the number: a silent student gets a *more pessimistic*
   * prediction, which is *harder* to hit, so wiring this can only make the published error
   * more honest, never flatter it.
   */
  it('predicts against the same silence-aware projection the room shows, not an optimistic one', () => {
    const busyStart = anchorTo(
      week({
        start: { mental: 60, physical: 60, social: 60, errands: 60 },
        items: dailyMentalLoad(10, 8),
      }),
      at('2026-09-01'),
    )
    const now = at('2026-09-11') // ten days later: today = 10, forDay = 12

    const silent = predictionsAfter([], busyStart, DEFAULT_PARAMS, now)
    const checkedIn = predictionsAfter([], busyStart, DEFAULT_PARAMS, now, fullyCheckedInLog(10))

    expect(silent[0]?.predicted).toBeLessThan(checkedIn[0]?.predicted ?? Infinity)
  })
})
