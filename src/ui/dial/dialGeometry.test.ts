import { FULL_RESERVE } from '../../engine'
import { describe, expect, it } from 'vitest'
import { angleForPercent, arcPath, DIAL_MAX_PERCENT, pointOnArc } from './dialGeometry'

describe('angleForPercent', () => {
  it('puts zero at the left end of the semicircle', () => {
    expect(angleForPercent(0)).toBeCloseTo(-90)
  })

  it('puts the maximum at the right end', () => {
    expect(angleForPercent(DIAL_MAX_PERCENT)).toBeCloseTo(90)
  })

  it('puts the midpoint at the top', () => {
    expect(angleForPercent(DIAL_MAX_PERCENT / 2)).toBeCloseTo(0)
  })

  /**
   * §1.2 describes "0 to 120%, with the needle past the maximum when overloaded", and that
   * describes a gauge of *load*. This one shows reserve, which `tick` clamps to
   * `FULL_RESERVE` -- so the needle could never reach the old 120 maximum, the top sixth of
   * the arc was unreachable, and the `capacity > 100` branch drawn in the critical colour
   * was dead code shaped like a warning state.
   *
   * The contract asserted instead: a full reserve is the top of the arc, and the whole arc
   * is reachable. §1.2 and §12's "dial in the corner at 106%" are amended to match.
   */
  it('puts a full reserve at the top of the arc', () => {
    expect(DIAL_MAX_PERCENT).toBe(FULL_RESERVE)
    expect(angleForPercent(FULL_RESERVE)).toBeCloseTo(90)
  })

  it('climbs all the way there rather than topping out early', () => {
    expect(angleForPercent(FULL_RESERVE)).toBeGreaterThan(angleForPercent(FULL_RESERVE - 10))
  })

  it('clamps beyond the dial maximum rather than spinning off the arc', () => {
    expect(angleForPercent(500)).toBeCloseTo(90)
  })

  it('clamps below zero', () => {
    expect(angleForPercent(-20)).toBeCloseTo(-90)
  })
})

describe('pointOnArc', () => {
  it('places zero degrees directly above the centre', () => {
    const point = pointOnArc(100, 100, 50, 0)

    expect(point.x).toBeCloseTo(100)
    expect(point.y).toBeCloseTo(50)
  })

  it('places ninety degrees to the right of the centre', () => {
    const point = pointOnArc(100, 100, 50, 90)

    expect(point.x).toBeCloseTo(150)
    expect(point.y).toBeCloseTo(100)
  })
})

describe('arcPath', () => {
  it('produces a path that starts with a move and contains an arc', () => {
    const path = arcPath(100, 100, 50, -90, 90)

    expect(path.startsWith('M')).toBe(true)
    expect(path).toContain('A')
  })

  // A single broken number makes the whole gauge silently disappear rather than draw
  // wrongly, which is a uniquely hard failure to notice.
  it('produces a path with no broken numbers in it', () => {
    expect(arcPath(100, 100, 50, -90, 90)).not.toContain('NaN')
  })
})
