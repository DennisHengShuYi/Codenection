import { describe, expect, it } from 'vitest'
import { actualCost, stateMultiplier } from './stateCost'

describe('stateMultiplier', () => {
  // §6.6 states both anchors outright: "At 70% reserve, two hours of study costs two
  // hours. At 25% reserve it costs closer to three."
  it('costs what it says it costs at 70% reserve', () => {
    expect(stateMultiplier(70, 0)).toBeCloseTo(1.0, 2)
  })

  it('costs about half again as much at 25% reserve', () => {
    expect(actualCost(2, 25, 0)).toBeGreaterThan(2.8)
    expect(actualCost(2, 25, 0)).toBeLessThan(3.2)
  })

  it('does not make work cheaper than nominal above the pivot', () => {
    expect(stateMultiplier(100, 0)).toBeCloseTo(1.0)
  })

  // The property that matters most. A curve that made depletion cheaper anywhere would
  // let the optimizer "solve" a week by running the student into the ground.
  it('is monotonically non-increasing in reserve: depleted is never cheaper', () => {
    let previous = Infinity
    for (let r = 0; r <= 100; r += 5) {
      const current = stateMultiplier(r, 0)
      expect(current).toBeLessThanOrEqual(previous + 1e-9)
      previous = current
    }
  })

  it('makes a block more expensive after a draining activity', () => {
    expect(stateMultiplier(70, -0.25)).toBeGreaterThan(stateMultiplier(70, 0))
  })

  it('makes a block cheaper after light movement', () => {
    expect(stateMultiplier(70, 0.1)).toBeLessThan(stateMultiplier(70, 0))
  })

  it('never returns a non-positive multiplier, however bad the state', () => {
    expect(stateMultiplier(0, -5)).toBeGreaterThan(0)
  })

  it('never lets a good state make work almost free', () => {
    expect(stateMultiplier(100, 5)).toBeGreaterThanOrEqual(0.5)
  })
})

describe('actualCost', () => {
  it('scales the base cost by the multiplier', () => {
    expect(actualCost(3, 70, 0)).toBeCloseTo(3 * stateMultiplier(70, 0))
  })

  it('costs nothing for a zero-length block', () => {
    expect(actualCost(0, 25, 0)).toBe(0)
  })
})
