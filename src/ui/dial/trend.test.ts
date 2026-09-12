import { describe, expect, it } from 'vitest'
import { trendOf } from './trend'

describe('trendOf', () => {
  it('reads a climbing series as rising', () => {
    expect(trendOf([40, 50, 60])).toBe('rising')
  })

  it('reads a dropping series as falling', () => {
    expect(trendOf([60, 50, 40])).toBe('falling')
  })

  it('reads a steady series as flat', () => {
    expect(trendOf([50, 50, 50])).toBe('flat')
  })

  // Without a deadband every bar flickers between arrows on noise, which makes the glyph
  // useless in exactly the place §1.5 relies on it to carry severity without colour.
  it('reads a barely-moving series as flat rather than jittering', () => {
    expect(trendOf([50, 50.4, 50.8])).toBe('flat')
  })

  it('reads a single-value series as flat rather than erroring', () => {
    expect(trendOf([50])).toBe('flat')
  })

  it('reads an empty series as flat', () => {
    expect(trendOf([])).toBe('flat')
  })

  // What a student needs to know is where things are heading now, not where they started.
  it('judges only the most recent days', () => {
    expect(trendOf([0, 0, 60, 50, 40])).toBe('falling')
  })

  /**
   * The default is calibrated for reserve points, where 1.5 on a 0-100 scale is noise. In
   * hours it is a large change -- three days going from two to three and a quarter would read
   * flat, which is most of a study block -- so a caller measuring something else passes its
   * own. Pinned in both directions, because making a threshold a parameter is exactly the
   * change that silently moves the default.
   */
  it('keeps its reserve-point default when no sensitivity is given', () => {
    expect(trendOf([50, 50.4, 50.8])).toBe('flat')
    expect(trendOf([50, 51, 52])).toBe('rising')
  })

  it('takes a sensitivity for a caller on a different scale', () => {
    expect(trendOf([2, 2.5, 3], 0.5)).toBe('rising')
    expect(trendOf([2, 2.5, 3], 5)).toBe('flat')
  })
})
