import { describe, expect, it } from 'vitest'
import {
  describeEnergyHistory,
  energyHistory,
  HISTORY_DAYS,
  MIN_POINTS_TO_PLOT,
} from './energyHistory'
import type { EnergyPrediction } from './predictions'

const reported = (forDate: string, value: number | null): EnergyPrediction => ({
  forDate,
  predicted: 50,
  reported: value,
})

/**
 * The brief asks for a stress tracker that logs how you feel over time. Every energy answer
 * a student has ever given is already stored, dated, on the calibration profile -- and none
 * of it was displayed anywhere. The week grid shows load, which is what the app plans; this
 * is what the student actually reported feeling, which is a different question.
 */
describe('energyHistory', () => {
  it('reads the reported energy back out, oldest first', () => {
    const history = energyHistory([
      reported('2026-09-03', 30),
      reported('2026-09-01', 70),
      reported('2026-09-02', 50),
    ])

    expect(history).toEqual([
      { date: '2026-09-01', value: 70 },
      { date: '2026-09-02', value: 50 },
      { date: '2026-09-03', value: 30 },
    ])
  })

  /**
   * An unresolved prediction is a claim nobody has checked. Plotting `predicted` alongside
   * `reported` would draw the app's own guesses as though the student had said them, which
   * is the one thing a self-report chart must never do.
   */
  it('plots only what the student actually reported', () => {
    const history = energyHistory([
      reported('2026-09-01', 70),
      reported('2026-09-02', null),
      reported('2026-09-03', 50),
      reported('2026-09-04', 30),
      reported('2026-09-05', null),
    ])

    expect(history).toEqual([
      { date: '2026-09-01', value: 70 },
      { date: '2026-09-03', value: 50 },
      { date: '2026-09-04', value: 30 },
    ])
  })

  it('keeps only the most recent fortnight-and-a-bit', () => {
    const many = Array.from({ length: HISTORY_DAYS + 10 }, (_, index) =>
      reported(`2026-09-${String(index + 1).padStart(2, '0')}`, index),
    )

    const history = energyHistory(many)

    expect(history).toHaveLength(HISTORY_DAYS)
    // The tail, not the head: a trend is about now, not about three weeks ago.
    expect(history.at(-1)?.date).toBe(many.at(-1)?.forDate)
  })

  /**
   * §0's no-cold-start rule, and the honest version of it: two dots are not a trend, and
   * drawing a line through them claims a shape nobody measured.
   */
  it('says nothing at all until there is enough to be a trend', () => {
    const tooFew = Array.from({ length: MIN_POINTS_TO_PLOT - 1 }, (_, index) =>
      reported(`2026-09-0${index + 1}`, 50),
    )

    expect(energyHistory(tooFew)).toEqual([])
  })

  it('plots as soon as there is', () => {
    const just = Array.from({ length: MIN_POINTS_TO_PLOT }, (_, index) =>
      reported(`2026-09-0${index + 1}`, 50),
    )

    expect(energyHistory(just)).toHaveLength(MIN_POINTS_TO_PLOT)
  })

  it('has nothing to show for a student who has never answered', () => {
    expect(energyHistory([])).toEqual([])
  })

  // A mutation here would corrupt the profile the app writes back to storage.
  it('does not modify the predictions it was given', () => {
    const before = [reported('2026-09-02', 30), reported('2026-09-01', 70)]
    const snapshot = JSON.stringify(before)

    energyHistory(before)

    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

/**
 * §1.5: colour and shape never carry meaning alone. A line drawn on a chart is exactly the
 * kind of information a sighted student reads in a glance and nobody else gets at all, so
 * the same reading exists in words.
 */
describe('describeEnergyHistory', () => {
  const points = (...values: number[]) =>
    values.map((value, index) => ({ date: `2026-09-0${index + 1}`, value }))

  it('says nothing when there is nothing plotted', () => {
    expect(describeEnergyHistory([])).toBeNull()
  })

  it('reports a rise over the span', () => {
    expect(describeEnergyHistory(points(30, 40, 70))).toMatch(/up|higher|rising/i)
  })

  it('reports a fall over the span', () => {
    expect(describeEnergyHistory(points(70, 50, 30))).toMatch(/down|lower|falling/i)
  })

  /** A wobble is not a direction. Reporting one would claim a trend out of noise, which is
   *  the same overclaim `MIN_POINTS_TO_PLOT` guards against from the other side. */
  it('reports no direction when it has barely moved', () => {
    expect(describeEnergyHistory(points(50, 52, 49))).toMatch(/steady|about the same|flat/i)
  })

  it('says how many days it is speaking about', () => {
    expect(describeEnergyHistory(points(30, 40, 70))).toContain('3')
  })
})
