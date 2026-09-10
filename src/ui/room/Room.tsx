import { Character } from './Character'
import type { RoomModel } from './roomModel'
import { describeRoomFully } from './roomText'
import { Door, Light, Window } from './scene/Fixtures'
import { Bed, Desk, Mirror, Phone } from './scene/Furniture'
import { Clutter, Papers, Plant } from './scene/Loose'
import { PALETTE } from './scene/palette'
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
 */
export function Room({ model }: { model: RoomModel }) {
  const { state } = model

  return (
    /* No longer locked to the viewBox's 3:2 ratio for hotspot alignment -- nothing is laid
       over it any more -- but the ratio still reads as a room, so it stays. Capped at the
       viewport so a tall screen does not stretch it. */
    <section className="relative mx-auto aspect-[3/2] max-h-dvh w-full">
      {/* viewBox and no width: it scales to its container at every breakpoint without a
          media query, which is §10's argument for hand-rolled SVG over an image. */}
      <svg
        data-testid="room-scene"
        viewBox="0 0 300 200"
        className="absolute inset-0 h-full w-full overflow-hidden rounded-lg"
        role="img"
        aria-label={describeRoomFully(state)}
        focusable="false"
      >
        <defs>
          <linearGradient id="room-wall-wash" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PALETTE.wallTop} />
            <stop offset="100%" stopColor={PALETTE.wallBottom} />
          </linearGradient>
          <linearGradient id="room-floor-wash" x1="0" y1="0" x2="0" y2="1">
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
        <Window weather={state.weather} />
        <Door lit={state.doorLit} />
        <Desk />
        <Bed sleepDebt={state.sleepDebt} />
        <Phone />
        <Papers height={state.paperHeight} />
        <Character state={state.character} />
        <Plant health={state.plantHealth} />
        <Clutter boxes={state.clutter} />

        {/* Overhead last: the ceiling presses over everything, and the lamp's glow has to
            fall on the room rather than under it. */}
        <Ceiling pressure={state.ceilingPressure} />
        <Light level={state.lightLevel} />
      </svg>

      {/* §1.1: the reserve, in one corner as a compact readout -- no tap required.
          AFTER the scene, not before it (Ruling 52). Both are absolutely positioned
          siblings in one stacking context with no z-index between them, so CSS paints
          them in document order -- placed first, the gauge rendered correctly and was
          hidden behind the room's own opaque wall rect. */}
      <div
        data-testid="room-gauge"
        className="absolute right-2 top-2 rounded-full bg-surface/90 px-3 py-1 text-sm font-semibold text-ink-soft shadow"
      >
        {Math.round(state.lightLevel * 100)}%
      </div>
    </section>
  )
}
