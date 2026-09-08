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
})
