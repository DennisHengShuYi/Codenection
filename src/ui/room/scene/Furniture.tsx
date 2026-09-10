import { Shadow } from './marks'
import { FLOOR_Y, PALETTE } from './palette'

/**
 * The furniture: the things in the room that are owned rather than built in.
 *
 * The desk, the mirror and the phone carry no reading. They were specified in §1.3 and
 * drawn once on a branch that never merged, so for the whole life of this branch the room
 * has been a bed and eight state bindings on a flat field. They are here because a room
 * with nothing in it that is merely furniture does not read as a room -- which is the
 * complaint this port answers.
 */

/** Where work goes. Not a state reading: a desk does not represent a reserve, it is simply
 *  where the week gets planned. */
export function Desk() {
  return (
    <g data-testid="room-desk">
      <Shadow cx={183} cy={FLOOR_Y} rx={24} />

      {/* An open notebook on the top, which is what makes it a desk rather than a table. */}
      <rect x="170" y="108" width="12" height="9" rx="1" fill={PALETTE.paper} />
      <rect x="182" y="108" width="12" height="9" rx="1" fill={PALETTE.linen} />
      <line x1="182" y1="108" x2="182" y2="117" stroke={PALETTE.paperEdge} strokeWidth="0.8" />

      <rect x="160" y="117" width="46" height="4" rx="1.5" fill={PALETTE.wood} />
      <rect x="163" y="121" width="3" height="27" fill={PALETTE.woodDark} />
      <rect x="200" y="121" width="3" height="27" fill={PALETTE.woodDark} />
      {/* A stretcher between the legs. Two bare verticals read as a bench. */}
      <rect x="163" y="138" width="40" height="2" fill={PALETTE.woodDark} opacity="0.7" />
    </g>
  )
}

/** The one object in the room a student would look at themselves in. */
export function Mirror() {
  return (
    <g data-testid="room-mirror">
      <rect x="44" y="52" width="26" height="34" rx="12" fill={PALETTE.wood} />
      <rect x="47" y="55" width="20" height="28" rx="9.5" fill={PALETTE.glass} />
      {/* One sheen line. Two make it read as a window. */}
      <line
        x1="51"
        y1="76"
        x2="63"
        y2="60"
        stroke="#ffffff"
        strokeWidth="2.5"
        opacity="0.65"
        strokeLinecap="round"
      />
    </g>
  )
}

/** The outside world, on a shelf above the bed. */
export function Phone() {
  return (
    <g data-testid="room-phone">
      <rect x="254" y="126" width="28" height="3" rx="1" fill={PALETTE.wood} />
      <rect x="262" y="106" width="14" height="20" rx="2.5" fill={PALETTE.ink} />
      <rect x="263.5" y="108" width="11" height="16" rx="1.5" fill={PALETTE.screen} />
    </g>
  )
}

/** Sleep debt, as an unmade bed. The blanket pulls back as the debt grows -- the colour
 *  change alone was doing all the work, and at this size it was barely a change. */
export function Bed({ sleepDebt }: { sleepDebt: number }) {
  const owed = sleepDebt > 0
  const blanketX = owed ? 240 : 226

  return (
    <g data-testid="room-bed">
      <Shadow cx={245} cy={FLOOR_Y + 11} rx={34} />

      {/* Headboard, frame and legs, so it stands on the floor rather than hovering over it.
          Without them the mattress was a pale bar the same value as the wall behind it, and
          at a glance the bed simply was not there. */}
      <rect x="209" y="122" width="7" height="36" rx="2" fill={PALETTE.woodDark} />
      <rect x="212" y="150" width="4" height="8" fill={PALETTE.woodDark} />
      <rect x="272" y="150" width="4" height="8" fill={PALETTE.woodDark} />
      <rect x="209" y="143" width="70" height="8" rx="2" fill={PALETTE.wood} />

      <rect x="214" y="132" width="64" height="12" rx="3" fill={PALETTE.paper} />
      <rect
        x={blanketX}
        y="130"
        width={279 - blanketX}
        height="15"
        rx="3"
        fill={owed ? PALETTE.bedDebt : PALETTE.bedRested}
      />
      {/* The turned-down edge, which is what makes the blanket read as bedding. */}
      <rect x={blanketX} y="130" width={279 - blanketX} height="3" rx="1.5" fill={PALETTE.paper} />
      <rect
        x="218"
        y="127"
        width="20"
        height="9"
        rx="4"
        fill={PALETTE.linen}
        stroke={PALETTE.paperEdge}
        strokeWidth="0.6"
      />
    </g>
  )
}
