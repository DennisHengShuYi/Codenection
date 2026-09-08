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

  // §1.2: "with the needle past the maximum when overloaded". Clamping at 100 would
  // erase exactly the state the dial exists to show.
  it('keeps climbing past a hundred percent', () => {
    expect(angleForPercent(110)).toBeGreaterThan(angleForPercent(100))
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
