import { Shadow } from './marks'
import { FLOOR_Y, PALETTE } from './palette'
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

/**
 * §45: exercise still waiting on today, as a dumbbell on the floor.
 *
 * One object for both kinds. The engine's split between hard and light exercise is about
 * what a session COSTS -- which the reserve models and the breakdown states -- and the room
 * is only saying that a session is on today. Two nearly identical dumbbells would be a
 * distinction a student has to squint at, for information they already have elsewhere.
 *
 * It grows rather than multiplying: a second dumbbell reads as owning two dumbbells, where
 * a heavier one reads as a heavier session.
 */
export function Dumbbell({ waiting }: { waiting: number }) {
  if (waiting <= 0) return null

  const size = 3 + waiting * 2.2
  const span = 15 + waiting * 7

  return (
    <g data-testid="room-dumbbell">
      {/* In front of the desk, on open floor. It sat at the foot of the paper stack first
          and was drawn inside it -- the objects today puts in the room have to keep clear of
          the furniture that is always there, or a heavy day reads as a mess rather than as a
          list of things to do. */}
      <Shadow cx={172} cy={FLOOR_Y + 26} rx={span * 0.6} />

      <rect x={172 - span / 2} y={FLOOR_Y + 22 - size / 2} width={span} height={size * 0.5} rx={1} fill={PALETTE.iron} />
      <rect x={172 - span / 2 - size / 2} y={FLOOR_Y + 22 - size} width={size} height={size * 2} rx={1.2} fill={PALETTE.iron} />
      <rect x={172 + span / 2 - size / 2} y={FLOOR_Y + 22 - size} width={size} height={size * 2} rx={1.2} fill={PALETTE.iron} />
    </g>
  )
}

/**
 * §45: people on today, as people in the room.
 *
 * Both kinds of company together, for the same reason the dumbbell takes both exercises:
 * whether an hour with someone drains or restores is what the reserve is for, and the room
 * is saying who is here. Restorative company drawn as a warmer figure would also be the app
 * telling a student how their afternoon went before they have had it.
 *
 * These multiply rather than growing, because that is what more time with people looks
 * like -- and they are capped, because a room with nine figures in it is a crowd scene, not
 * a Tuesday.
 */
const MOST_FIGURES = 3

export function Company({ waiting }: { waiting: number }) {
  const figures = Math.min(MOST_FIGURES, Math.ceil(waiting * MOST_FIGURES))
  if (figures <= 0) return null

  return (
    <g data-testid="room-company">
      {Array.from({ length: figures }, (_, index) => {
        const x = 96 + index * 21

        return (
          <g key={index}>
            <Shadow cx={x} cy={FLOOR_Y + 8} rx={7} />
            {/* Head and body only: at this size a figure with limbs reads as scribble, and
                the character beside them is the one the eye is meant to go to. */}
            <circle cx={x} cy={FLOOR_Y - 22} r={5} fill={PALETTE.visitor} />
            <path
              d={`M ${x - 6} ${FLOOR_Y + 6} L ${x - 4} ${FLOOR_Y - 16} L ${x + 4} ${FLOOR_Y - 16} L ${x + 6} ${FLOOR_Y + 6} Z`}
              fill={PALETTE.visitor}
            />
          </g>
        )
      })}
    </g>
  )
}
