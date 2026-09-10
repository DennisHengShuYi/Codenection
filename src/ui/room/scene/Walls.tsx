import { BLEED, FLOOR_Y, PALETTE } from './palette'

/**
 * The building: the surfaces every other object stands on or hangs from.
 *
 * Before these existed every object sat on one flat field, which is the single biggest
 * reason the room read as a chart rather than a place.
 *
 * All three surfaces are drawn `BLEED` units past the viewBox on every side. Nothing stands
 * out there -- it is the same wall, ceiling and floor -- but it is what lets the room screen
 * reach the edges of a screen whose shape does not match the drawing's, instead of framing
 * the room in bands of flat colour. See `BLEED` in `palette.ts`.
 */

/** The bleeding surfaces span the viewBox plus `BLEED` on each side. */
const WIDE_X = -BLEED
const WIDE_WIDTH = 300 + BLEED * 2

export function Wall() {
  return (
    <g data-testid="room-wall">
      <rect
        x={WIDE_X}
        y={-BLEED}
        width={WIDE_WIDTH}
        height={FLOOR_Y + BLEED}
        fill="url(#room-wall-wash)"
      />
    </g>
  )
}

export function Floor() {
  return (
    <g data-testid="room-floor">
      <rect x={WIDE_X} y={FLOOR_Y} width={WIDE_WIDTH} height={BLEED} fill="url(#room-floor-wash)" />
      {/* The skirting reads as the join. Without it the two washes meet in a band that
          looks like a rendering seam rather than a corner. */}
      <rect x={WIDE_X} y={FLOOR_Y - 3} width={WIDE_WIDTH} height="3" fill={PALETTE.skirting} />
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
      <rect x={WIDE_X} y={-BLEED} width={WIDE_WIDTH} height={depth + BLEED} fill={PALETTE.ink} />
      <rect x={WIDE_X} y={depth} width={WIDE_WIDTH} height="1.5" fill={PALETTE.ink} opacity="0.35" />

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
