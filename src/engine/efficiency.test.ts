import { describe, expect, it } from 'vitest'
import { efficiencyAt, overallReserve } from './efficiency'

describe('efficiencyAt', () => {
  it('returns all of your rest at full reserve', () => {
    expect(efficiencyAt(100)).toBeCloseTo(1.0)
  })

  // §6.2 states this number outright: "At full reserve you get 100% of your rest back.
  // At 20% reserve, 56%."
  it('returns 56% of your rest at 20% reserve', () => {
    expect(efficiencyAt(20)).toBeCloseTo(0.56)
  })

  it('never returns less than the floor, even at zero', () => {
    expect(efficiencyAt(0)).toBeCloseTo(0.45)
  })

  // The property, not just the two anchors. A curve that dipped anywhere in the middle
  // would break the spiral the model exists to show -- it would mean rest sometimes
  // pays out *more* when you are further down.
  it('is monotonically increasing in reserve, which is what makes the spiral a spiral', () => {
    let previous = -Infinity
    for (let r = 0; r <= 100; r += 5) {
      const current = efficiencyAt(r)
      expect(current).toBeGreaterThan(previous)
      previous = current
    }
  })

  /**
   * The guard that keeps the audit's finding from coming back.
   *
   * This curve takes a reserve level, so it has no way to see the other three -- and that
   * is the property worth pinning. Were it ever handed a `Reserves` again and reduced to a
   * mean, a collapsed reserve would start recovering as though it were the body average,
   * and §6.2's spiral would flatten exactly where it matters most.
   */
  it('reads one reserve level and cannot be influenced by any other', () => {
    expect(efficiencyAt(20)).toBeCloseTo(0.56)
    expect(efficiencyAt(80)).toBeCloseTo(0.89)
    expect(efficiencyAt(20)).toBeLessThan(efficiencyAt(80))
  })
})

describe('overallReserve', () => {
  it('averages the four reserves', () => {
    expect(overallReserve({ mental: 40, physical: 60, social: 20, errands: 80 })).toBe(50)
  })

  it('is unaffected by which reserve carries the deficit', () => {
    const mentalLow = overallReserve({ mental: 20, physical: 80, social: 80, errands: 80 })
    const socialLow = overallReserve({ mental: 80, physical: 80, social: 20, errands: 80 })
    expect(mentalLow).toBe(socialLow)
  })
})
