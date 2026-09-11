import { FULL_RESERVE } from '../../engine'
/**
 * The top of the gauge, which is a full reserve.
 *
 * §1.2 describes "0 to 120%, with the needle past the maximum when overloaded", and that
 * describes a gauge of *load*. This one shows reserve, which `tick` clamps to
 * `FULL_RESERVE` -- so the needle could never enter the top sixth of the arc, the
 * `Math.min` guarding it was a no-op, and the `capacity > 100` branch beside it was
 * unreachable code styled to look like a warning state. §1.2 and §12's "dial in the corner
 * at 106%" are amended to match what the app actually measures.
 */
export const DIAL_MAX_PERCENT = FULL_RESERVE

const START_DEGREES = -90
const END_DEGREES = 90

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/** Zero degrees points up, angles increase clockwise. The -90 shift converts from the
 *  usual mathematical convention, where zero points right. */
const toRadians = (degrees: number): number => ((degrees - 90) * Math.PI) / 180

export function angleForPercent(percent: number): number {
  const ratio = clamp(percent, 0, DIAL_MAX_PERCENT) / DIAL_MAX_PERCENT
  return START_DEGREES + ratio * (END_DEGREES - START_DEGREES)
}

export function pointOnArc(
  cx: number,
  cy: number,
  r: number,
  degrees: number,
): { x: number; y: number } {
  const radians = toRadians(degrees)
  return { x: cx + r * Math.cos(radians), y: cy + r * Math.sin(radians) }
}

/**
 * An SVG arc between two angles.
 *
 * Kept as pure maths with no React in sight, so the geometry can be asserted directly
 * rather than through a rendered picture -- and a broken number here makes the whole
 * gauge silently vanish rather than draw wrongly, which is worth being able to test for.
 */
export function arcPath(
  cx: number,
  cy: number,
  r: number,
  fromDeg: number,
  toDeg: number,
): string {
  const start = pointOnArc(cx, cy, r, fromDeg)
  const end = pointOnArc(cx, cy, r, toDeg)
  const largeArc = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0

  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`
}
