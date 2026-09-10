import { FLOOR_Y, PALETTE } from './palette'

/**
 * The building: the surfaces every other object stands on or hangs from.
 *
 * Before these existed every object sat on one flat field, which is the single biggest
 * reason the room read as a chart rather than a place.
 */

export function Wall() {
  return (
    <g data-testid="room-wall">
      <rect x="0" y="0" width="300" height={FLOOR_Y} fill="url(#room-wall-wash)" />
    </g>
  )
}

export function Floor() {
  return (
    <g data-testid="room-floor">
      <rect x="0" y={FLOOR_Y} width="300" height={200 - FLOOR_Y} fill="url(#room-floor-wash)" />
      {/* The skirting reads as the join. Without it the two washes meet in a band that
          looks like a rendering seam rather than a corner. */}
      <rect x="0" y={FLOOR_Y - 3} width="300" height="3" fill={PALETTE.skirting} />
    </g>
  )
}

/**
 * Total load, as weight overhead.
 *
 * The beam comes down as pressure rises, and hangs blocks as it does -- a beam alone only
 * gets thicker, which reads as architecture. Blocks read as something put there.
 */
export function Ceiling({ pressure }: { pressure: number }) {
  const depth = 10 + pressure * 34
  const blocks = Math.round(pressure * 5)

  return (
    <g data-testid="room-ceiling">
      <rect x="0" y="0" width="300" height={depth} fill={PALETTE.ink} />
      <rect x="0" y={depth} width="300" height="1.5" fill={PALETTE.ink} opacity="0.35" />

      {Array.from({ length: blocks }, (_, index) => (
        <rect
          key={index}
          x={30 + index * 52}
          y={depth}
          width="16"
          height="7"
          rx="1.5"
          fill={PALETTE.inkSoft}
        />
      ))}
    </g>
  )
}
