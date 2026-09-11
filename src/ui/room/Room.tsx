import { Character } from './Character'
import { ReserveGauge } from './ReserveGauge'
import type { RoomModel } from './roomModel'
import { describeRoomFully } from './roomText'
import { Clock, Door, Light, Window } from './scene/Fixtures'
import { Bed, Desk, Mirror, Phone } from './scene/Furniture'
import { Clutter, Company, Dumbbell, Papers } from './scene/Loose'
import { FLOOR_Y, PALETTE } from './scene/palette'
import { Ceiling, Floor, Wall } from './scene/Walls'

/**
 * §1.3's room, drawn as one scalable scene -- and, per §3, a picture rather than a control
 * surface. The twelve invisible buttons that used to sit over the artwork are gone, along
 * with them the only thing that gave the drawing an accessible name. So the drawing now
 * carries its own: the full, uncapped description as its `aria-label`, so a screen-reader
 * user loses nothing that the buttons used to say between them.
 *
 * The scene itself lives in `scene/`, one module per kind of thing: the building, what is
 * fixed to it, what is owned, and what is lying about. That split exists because drawing the
 * room properly is roughly three hundred lines, and until this port landed the room was nine
 * bare `<rect>`s on one flat field -- which is why the deployed page read as coloured boxes.
 *
 * Ported from the artwork branch rather than merged from it: everything there hung off
 * `hotspots.ts`, `objects.ts` and `model.rows`, all of which §3 deleted. The attention halo
 * went with them, because nothing on this branch computes attention any more and a mark
 * nothing can switch on is an orphan, not a feature.
 *
 * Two framings, one drawing (Ruling 54):
 *
 * - `inline` is the boxed 3:2 room the request box puts side by side with itself, where the
 *   room is one element among several on a scrolling page.
 * - `fill` is the room screen, where the room IS the screen. The drawing aligns to the top
 *   of its stage and the viewBox runs on past the scene's own 200 units, so the floor keeps
 *   going underneath the band that overlays the lower screen -- which is how the band lands
 *   on floor rather than on the bed, the desk and the character (Ruling 55).
 *
 * Required rather than defaulted, on the same reasoning as Rulings 39, 41 and 51: a default
 * here would let a new call site pick a framing by accident, and the two are not
 * interchangeable -- `fill` only means anything inside a positioned, screen-sized parent.
 */
export type RoomFrame = 'inline' | 'fill'

/**
 * The gauge's box, shared by both variants so they cannot drift apart in size or position.
 *
 * 44px square because that is the minimum touch target and the ring is drawn to fill it. A
 * solid `surface` disc under the ring rather than the old `surface/90`: the room's wall is a
 * mid-brown and a translucent disc let it through, which is what left the number sitting at
 * roughly the contrast of the wall behind it.
 */
const GAUGE_BOX =
  'absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center rounded-full bg-surface shadow'

export function Room({
  model,
  frame,
  onOpenReserves,
}: {
  model: RoomModel
  frame: RoomFrame
  /** Ruling 59: what the corner gauge opens. Omitted where there is nowhere for it to go
   *  -- `RoomComparison`, and the low-energy interface, which withholds the breakdown --
   *  and the gauge stays the readout it has always been rather than becoming a button that
   *  does nothing. */
  onOpenReserves?: () => void
}) {
  const { state } = model
  // Ruling 45: the reserve, not the light. The light means the day's spill now, and deriving the
  // gauge from it read 100% on a nine-hour day at 43% reserve.
  const percent = Math.round(state.reserve * 100)
  const fills = frame === 'fill'

  return (
    /* The inline framing is no longer locked to the viewBox's 3:2 ratio for hotspot
       alignment -- nothing is laid over it any more -- but the ratio still reads as a room,
       so it stays. The fill framing covers its stage instead, and paints the floor's near
       colour behind the drawing so that the letterboxing a 3:2 room gets on a tall phone
       reads as more floor rather than as a void under the room. */
    <section
      className={
        fills ? 'absolute inset-0 overflow-hidden' : 'relative mx-auto aspect-[3/2] max-h-dvh w-full'
      }
      style={fills ? { backgroundColor: PALETTE.floorNear } : undefined}
    >
      {/* viewBox and no width: it scales to its container at every breakpoint without a
          media query, which is §10's argument for hand-rolled SVG over an image. */}
      <svg
        data-testid="room-scene"
        viewBox={fills ? '0 0 300 260' : '0 0 300 200'}
        /* Top-aligned in the fill framing so the slack collects at the bottom of the stage,
           where the band is, instead of being split above and below the drawing. */
        preserveAspectRatio={fills ? 'xMidYMin meet' : 'xMidYMid meet'}
        className={`absolute inset-0 h-full w-full overflow-hidden ${fills ? '' : 'rounded-lg'}`}
        role="img"
        aria-label={describeRoomFully(state)}
        focusable="false"
      >
        <defs>
          {/* Both washes are in user space, not in the rect's own box: the wall and the
              floor are drawn far past the viewBox so they fill a letterboxed stage
              (`BLEED`), and an object-bounding-box gradient would have spread each wash
              over that whole bled rect and washed the room out. Past each wash's end the
              pad spread holds its last colour, which is exactly what the bleed should be. */}
          <linearGradient
            id="room-wall-wash"
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="0"
            x2="0"
            y2={FLOOR_Y}
          >
            <stop offset="0%" stopColor={PALETTE.wallTop} />
            <stop offset="100%" stopColor={PALETTE.wallBottom} />
          </linearGradient>
          <linearGradient
            id="room-floor-wash"
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1={FLOOR_Y}
            x2="0"
            y2="200"
          >
            <stop offset="0%" stopColor={PALETTE.floorFar} />
            <stop offset="100%" stopColor={PALETTE.floorNear} />
          </linearGradient>
          <radialGradient id="room-lamp-glow">
            <stop offset="0%" stopColor={PALETTE.glow} stopOpacity="0.5" />
            <stop offset="100%" stopColor={PALETTE.glow} stopOpacity="0" />
          </radialGradient>
        </defs>

        <Wall />
        <Floor />

        {/* Back to front, so nearer things overlap what is behind them -- the depth the flat
            elevation gets instead of perspective. */}
        <Mirror />
        <Clock full={state.dayFull} />
        <Window weather={state.weather} dark={state.windowDark} />
        <Door lit={state.doorLit} />
        <Desk />
        <Bed sleepDebt={state.sleepDebt} />
        <Phone />
        <Papers height={state.paperHeight} />
        <Character state={state.character} />
        <Dumbbell waiting={state.exerciseWaiting} />
        <Company waiting={state.companyWaiting} />
        <Clutter boxes={state.clutter} />

        {/* Overhead last: the ceiling presses over everything, and the lamp's glow has to
            fall on the room rather than under it. */}
        <Ceiling />
        <Light level={state.lightLevel} />
      </svg>

      {/* §1.1: the reserve, in one corner as a compact readout -- no tap required.
          AFTER the scene, not before it (Ruling 52). Both are absolutely positioned
          siblings in one stacking context with no z-index between them, so CSS paints
          them in document order -- placed first, the gauge rendered correctly and was
          hidden behind the room's own opaque wall rect. */}
      {onOpenReserves === undefined ? (
        <div data-testid="room-gauge" className={GAUGE_BOX}>
          <ReserveGauge percent={percent} />
        </div>
      ) : (
        /* Ruling 59: the same readout, now the door to the full one. Named for where it
           goes as well as what it says -- "43%" alone tells a screen reader nothing about
           being a way in. */
        <button
          type="button"
          data-testid="room-gauge"
          onClick={onOpenReserves}
          aria-label={`Where your reserves stand: ${percent}%`}
          className={`${GAUGE_BOX} transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none`}
        >
          <ReserveGauge percent={percent} />
        </button>
      )}
    </section>
  )
}
