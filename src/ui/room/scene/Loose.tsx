import { Shadow } from './marks'
import { PALETTE } from './palette'
import type { ClutterBox } from '../roomState'

/**
 * The things lying about: what has accumulated rather than what was put there.
 *
 * All three are load made physical, which is why they share a file -- paper stacks up,
 * boxes pile on the floor, and the plant droops when there is nothing left for it.
 */

/** Mental load, as a stack of paper. Sheets rather than one block: a solid rectangle that
 *  grows reads as a bar chart, and this room is deliberately not one. */
export function Papers({ height }: { height: number }) {
  const depth = 4 + height * 40
  const sheets = Math.max(1, Math.round(height * 7))

  return (
    <g data-testid="room-papers">
      <Shadow cx={57} cy={155} rx={20} />

      {Array.from({ length: sheets }, (_, index) => (
        <rect
          key={index}
          x={40 + (index % 3) - 1}
          y={154 - (index + 1) * (depth / sheets)}
          width="34"
          height={depth / sheets + 0.6}
          rx="0.5"
          fill={PALETTE.paper}
          stroke={PALETTE.paperEdge}
          strokeWidth="0.5"
        />
      ))}
    </g>
  )
}

/** Physical health: sleep debt and inactivity together, never either alone. */
export function Plant({ health }: { health: number }) {
  const droop = 1 - health
  const tipY = 124 + droop * 14
  const tipX = 27 - droop * 12

  return (
    <g data-testid="room-plant">
      <Shadow cx={27} cy={161} rx={11} />

      <path d="M 20 146 L 34 146 L 32 161 L 22 161 Z" fill={PALETTE.pot} />
      <rect x="19" y="144" width="16" height="4" rx="1" fill={PALETTE.pot} />

      <path
        d={`M 27 146 Q ${tipX} ${132 + droop * 10} ${tipX} ${tipY}`}
        stroke={PALETTE.leaf}
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
      />
      {/* Two leaves, which droop with the stem. A bare stem reads as a stick. */}
      <ellipse
        cx={tipX + 4}
        cy={tipY + 4}
        rx="5"
        ry="2.6"
        fill={PALETTE.leaf}
        opacity={0.5 + health * 0.5}
        transform={`rotate(${-20 + droop * 40} ${tipX + 4} ${tipY + 4})`}
      />
      <ellipse
        cx={tipX - 4}
        cy={tipY + 7}
        rx="5"
        ry="2.6"
        fill={PALETTE.leaf}
        opacity={0.5 + health * 0.5}
        transform={`rotate(${20 - droop * 40} ${tipX - 4} ${tipY + 7})`}
      />
    </g>
  )
}

/** One box per pending errand, nearest the viewer -- the things most literally in the way. */
export function Clutter({ boxes }: { boxes: readonly ClutterBox[] }) {
  return (
    <g data-testid="room-clutter">
      {boxes.map((box, index) => {
        const x = 44 + index * 22

        return (
          <g key={box.id} data-testid={`clutter-box-${box.id}`}>
            <Shadow cx={x + 9} cy={185} rx={11} />

            <rect x={x} y="166" width="18" height="18" rx="2" fill={PALETTE.clutter} />
            {/* Tape, so a box reads as a box rather than a swatch. */}
            <line
              x1={x + 9}
              y1="166"
              x2={x + 9}
              y2="184"
              stroke={PALETTE.paper}
              strokeWidth="1.6"
              opacity="0.7"
            />
            <line
              x1={x}
              y1="172"
              x2={x + 18}
              y2="172"
              stroke={PALETTE.woodDark}
              strokeWidth="1"
              opacity="0.35"
            />
          </g>
        )
      })}
    </g>
  )
}
