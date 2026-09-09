import { describe, expect, it } from 'vitest'
import type { BlockOutcome } from './calibration'
import { biasLine, MIN_SAMPLES, paddingFor } from './realityCheck'

const overran = (count: number, type: BlockOutcome['type'] = 'mental'): BlockOutcome[] =>
  Array.from({ length: count }, () => ({ type, plannedHours: 2, actualHours: 4 }))

describe('paddingFor', () => {
  /**
   * §7.4: estimate bias comes from day 7 onward. Before there is data the honest answer is
   * no padding at all -- a multiplier invented from nothing would silently distort every
   * projection while looking like a measurement.
   */
  it('pads nothing when there is no history', () => {
    expect(paddingFor([], 'mental')).toBe(1)
  })

  // One block that overran is noise, not a bias.
  it('pads nothing below the sample floor', () => {
    expect(paddingFor(overran(MIN_SAMPLES - 1), 'mental')).toBe(1)
  })

  it('pads once a consistent overrun has actually been shown', () => {
    expect(paddingFor(overran(MIN_SAMPLES), 'mental')).toBeGreaterThan(1)
  })

  it('pads roughly by how much was underestimated', () => {
    // Planned 2, took 4, so about twice.
    expect(paddingFor(overran(MIN_SAMPLES), 'mental')).toBeCloseTo(2, 1)
  })

  /**
   * An unbounded multiplier from a couple of bad weeks would put a student's fortnight into
   * fiction -- the same failure §7.2 warns about, arriving from the other direction.
   */
  it('stays bounded however badly the estimates went', () => {
    const disastrous = Array.from({ length: 10 }, () => ({
      type: 'mental' as const,
      plannedHours: 0.5,
      actualHours: 40,
    }))

    expect(paddingFor(disastrous, 'mental')).toBeLessThanOrEqual(3)
  })

  /**
   * §2.4 is about underestimation. Padding downward would quietly make a heavy week look
   * survivable, which is the opposite of what this app is for.
   */
  it('never pads below one when things finish early', () => {
    const early = Array.from({ length: 10 }, () => ({
      type: 'mental' as const,
      plannedHours: 4,
      actualHours: 1,
    }))

    expect(paddingFor(early, 'mental')).toBe(1)
  })

  it('keeps each load type independent', () => {
    const mixed = [...overran(MIN_SAMPLES, 'mental')]

    expect(paddingFor(mixed, 'mental')).toBeGreaterThan(1)
    expect(paddingFor(mixed, 'physical')).toBe(1)
  })

  it('ignores a block that was planned as nothing', () => {
    const zero = Array.from({ length: 10 }, () => ({
      type: 'mental' as const,
      plannedHours: 0,
      actualHours: 3,
    }))

    expect(paddingFor(zero, 'mental')).toBe(1)
  })
})

describe('biasLine', () => {
  // §7.6's payoff line, and §2.4's second surface.
  it('says nothing when nothing has been measured', () => {
    expect(biasLine([], 'mental')).toBeNull()
  })

  it('says nothing below the sample floor', () => {
    expect(biasLine(overran(MIN_SAMPLES - 1), 'mental')).toBeNull()
  })

  it('names the bias and the multiplier once it is real', () => {
    const line = biasLine(overran(MIN_SAMPLES), 'mental')

    expect(line).toMatch(/underestimate/i)
    expect(line).toMatch(/2(\.0)?×|2(\.0)?x/i)
  })

  // §2.4: "We pad it automatically." The student is told the correction is already applied.
  it('says the padding is applied automatically', () => {
    expect(biasLine(overran(MIN_SAMPLES), 'mental')).toMatch(/pad/i)
  })

  it('says nothing for someone who estimates well', () => {
    const accurate = Array.from({ length: 10 }, () => ({
      type: 'mental' as const,
      plannedHours: 2,
      actualHours: 2,
    }))

    expect(biasLine(accurate, 'mental')).toBeNull()
  })

  it("names the load type in the student's words rather than the model's", () => {
    expect(biasLine(overran(MIN_SAMPLES, 'mental'), 'mental')).not.toMatch(/\bmental\b/i)
  })
})
