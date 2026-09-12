import { describe, expect, it } from 'vitest'
import { nightWindow, nightWindowLabel } from './nightWindow'

/**
 * When a night happens, as against how long it is.
 *
 * Anchored on WAKING rather than on bedtime, and that is the decision the whole thing turns
 * on: the morning is the fixed end of a night -- a student gets up for a nine o'clock class
 * whatever time they got to bed -- and bedtime is what moves when a day runs long. So a night
 * that loses two hours loses them off the front, which is what actually happens.
 */
describe('nightWindow', () => {
  it('counts back from waking, so a full night starts the evening before', () => {
    const night = nightWindow(7, 8)

    expect(night.bedHour).toBe(23)
    expect(night.wakeHour).toBe(7)
    expect(night.crossesMidnight).toBe(true)
  })

  /** A short night begins after midnight, on the same morning it ends. Nothing crosses. */
  it('starts after midnight when the night is short', () => {
    const night = nightWindow(7, 6)

    expect(night.bedHour).toBe(1)
    expect(night.crossesMidnight).toBe(false)
  })

  it('keeps the half hours a student actually sleeps', () => {
    expect(nightWindow(7, 6.5).bedHour).toBe(0.5)
  })

  /** Midnight exactly is the boundary, not a crossing of it. */
  it('does not call midnight a crossing', () => {
    const night = nightWindow(7, 7)

    expect(night.bedHour).toBe(0)
    expect(night.crossesMidnight).toBe(false)
  })

  it('reports a night of none at all without inventing a window', () => {
    const night = nightWindow(7, 0)

    expect(night.hours).toBe(0)
    expect(night.bedHour).toBe(7)
  })

  /** A whole day of sleep wraps exactly once. Reachable because `MAX_SLEEP_HOURS` is 24. */
  it('wraps a whole day once rather than twice', () => {
    const night = nightWindow(7, 24)

    expect(night.bedHour).toBe(7)
    expect(night.crossesMidnight).toBe(true)
  })

  /** Waking at midnight is a legal clock hour and must not wrap to 24. */
  it('handles waking at midnight', () => {
    expect(nightWindow(0, 8).bedHour).toBe(16)
  })
})

describe('nightWindowLabel', () => {
  it('reads as two clock times', () => {
    expect(nightWindowLabel(nightWindow(7, 8))).toBe('23:00 → 07:00')
  })

  /**
   * Minutes, which `kit/labels.hourLabel` deliberately does not do -- it labels whole-hour
   * pickers and prints ":00" always. A night is the one place a fractional clock time arises,
   * because the hours are halves and the bedtime is counted back from waking.
   */
  it('says the half hour rather than rounding it away', () => {
    expect(nightWindowLabel(nightWindow(7, 6.5))).toBe('00:30 → 07:00')
  })

  it('says so when there is no night at all', () => {
    expect(nightWindowLabel(nightWindow(7, 0))).toBe('no night at all')
  })
})
