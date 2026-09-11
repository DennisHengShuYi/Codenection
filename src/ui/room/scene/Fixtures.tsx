import { FLOOR_Y, PALETTE } from './palette'
import type { RoomState } from '../roomState'

/**
 * The fixtures: what is fixed to the building rather than owned.
 *
 * All three carry a reading. The window is the projection, the door is whether getting
 * outside is the best move available, and the light is the reserve.
 */

const WEATHER_FILL: Record<RoomState['weather'], string> = {
  clear: '#bae6fd',
  clouding: '#cbd5e1',
  storm: '#64748b',
}

/** The projection, rendered literally. Panes rather than one sheet, because a single filled
 *  rectangle at this size reads as a wall-mounted screen -- which is what it looked like. */
export function Window({
  weather,
  dark,
}: {
  weather: RoomState['weather']
  /**
   * §45: 0..1, how far into the night the sky outside has gone, from the hours today
   * cannot fit inside its waking day.
   *
   * A separate pane over the weather rather than a different set of weather fills: the two
   * are independent facts and both have to stay readable at once. A dark clear window is an
   * exhausted student with a calm week ahead; a bright storm is a rested one with a rough
   * patch coming.
   */
  dark: number
}) {
  return (
    <g data-testid="room-window">
      <rect x="196" y="56" width="60" height="44" fill={WEATHER_FILL[weather]} />

      {weather === 'storm' &&
        Array.from({ length: 7 }, (_, index) => (
          <line
            key={index}
            x1={202 + index * 8}
            y1={62}
            x2={198 + index * 8}
            y2={94}
            stroke="#e2e8f0"
            strokeWidth="1"
            opacity="0.55"
          />
        ))}

      {/* Night over the weather, under the glazing bars: the bars and the frame stay part of
          the room's own lit interior, so the window still reads as a window at full dark. */}
      {dark > 0 && (
        <rect
          data-testid="window-night"
          x="196"
          y="56"
          width="60"
          height="44"
          fill={PALETTE.night}
          opacity={dark * 0.82}
        />
      )}

      {/* Glazing bars, then the frame over them, so the bars sit behind the frame's edge. */}
      <line x1="226" y1="56" x2="226" y2="100" stroke={PALETTE.linen} strokeWidth="2.5" />
      <line x1="196" y1="78" x2="256" y2="78" stroke={PALETTE.linen} strokeWidth="2.5" />

      <rect
        x="196"
        y="56"
        width="60"
        height="44"
        fill="none"
        stroke={PALETTE.linen}
        strokeWidth="4"
      />
      <rect x="192" y="100" width="68" height="4" rx="1" fill={PALETTE.linen} />
    </g>
  )
}

/** Lit when getting outside is the highest-value action -- the one move that answers
 *  physical and social at once. */
export function Door({ lit }: { lit: boolean }) {
  return (
    <g data-testid="room-door" data-lit={String(lit)}>
      {/* Light spilling under a lit door: the reason to look at it, before the panel colour
          is read at all. */}
      {lit && (
        <ellipse cx="127" cy={FLOOR_Y + 4} rx="26" ry="7" fill={PALETTE.glow} opacity="0.5" />
      )}

      <rect x="110" y="68" width="34" height="88" rx="2" fill={PALETTE.woodDark} />
      <rect x="113" y="71" width="28" height="82" fill={lit ? PALETTE.glow : PALETTE.wood} />
      <rect
        x="118"
        y="78"
        width="18"
        height="30"
        rx="1"
        fill="none"
        stroke={PALETTE.woodDark}
        strokeWidth="1.5"
        opacity="0.7"
      />
      <rect
        x="118"
        y="116"
        width="18"
        height="30"
        rx="1"
        fill="none"
        stroke={PALETTE.woodDark}
        strokeWidth="1.5"
        opacity="0.7"
      />
      <circle cx="137" cy="114" r="1.8" fill={PALETTE.ink} />
    </g>
  )
}

/**
 * The reserve, as how lit the room is.
 *
 * This replaces a full-bleed amber rectangle over the whole scene, which washed every
 * colour in the room toward beige at exactly the moment the student was doing well. A lamp
 * that glows says the same thing without flattening everything else.
 */
export function Light({ level }: { level: number }) {
  const brightness = 0.25 + level * 0.75

  return (
    <g data-testid="room-light">
      <circle cx="277" cy="58" r="46" fill="url(#room-lamp-glow)" opacity={brightness} />

      <line x1="277" y1="0" x2="277" y2="44" stroke={PALETTE.ink} strokeWidth="1.2" />
      <path d="M 268 56 L 272 44 L 282 44 L 286 56 Z" fill={PALETTE.ink} />
      <circle cx="277" cy="59" r="3.5" fill={PALETTE.glow} opacity={brightness} />
    </g>
  )
}
