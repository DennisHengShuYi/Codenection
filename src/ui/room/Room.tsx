import { Character } from './Character'
import type { RoomModel } from './roomModel'
import type { RoomState } from './roomState'
import { describeRoomFully } from './roomText'

const WEATHER_FILL: Record<RoomState['weather'], string> = {
  clear: '#bae6fd',
  clouding: '#cbd5e1',
  storm: '#64748b',
}

/**
 * §1.3's room, drawn as one scalable scene -- and, per §3, a picture rather than a control
 * surface. The twelve invisible buttons that used to sit over the artwork are gone, along
 * with them the only thing that gave the drawing an accessible name. So the drawing now
 * carries its own: the full, uncapped description as its `aria-label`, so a screen-reader
 * user loses nothing that the buttons used to say between them.
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
        className="absolute inset-0 h-full w-full rounded-lg bg-slate-900/5"
        role="img"
        aria-label={describeRoomFully(state)}
        focusable="false"
      >
        {/* Light level: the reserve, as how lit the room is. */}
        <rect
          data-testid="room-light"
          x="0"
          y="0"
          width="300"
          height="200"
          fill="#fef3c7"
          opacity={state.lightLevel * 0.4}
        />

        {/* Ceiling weights: total load, pressing lower as it rises. */}
        <g data-testid="room-ceiling">
          <rect x="0" y="0" width="300" height={10 + state.ceilingPressure * 34} fill="#475569" />
        </g>

        {/* Window weather: the projection, rendered literally. */}
        <g data-testid="room-window">
          <rect
            x="196"
            y="56"
            width="60"
            height="44"
            fill={WEATHER_FILL[state.weather]}
            stroke="#334155"
            strokeWidth="2"
          />
        </g>

        {/* Paper stack: mental load. */}
        <g data-testid="room-papers">
          <rect
            x="40"
            y={150 - state.paperHeight * 40}
            width="34"
            height={4 + state.paperHeight * 40}
            fill="#e2e8f0"
            stroke="#94a3b8"
          />
        </g>

        {/* Bed: sleep debt. */}
        <g data-testid="room-bed">
          <rect
            x="212"
            y="130"
            width="66"
            height="26"
            rx="4"
            fill={state.sleepDebt > 0 ? '#a5b4fc' : '#c7d2fe'}
          />
        </g>

        {/* Plant: physical health, wilting with sleep debt and inactivity. */}
        <g data-testid="room-plant">
          <rect x="20" y="146" width="14" height="14" fill="#b45309" />
          <path
            d={`M 27 146 Q ${27 - (1 - state.plantHealth) * 12} ${132 + (1 - state.plantHealth) * 10} 27 ${124 + (1 - state.plantHealth) * 14}`}
            stroke="#16a34a"
            strokeWidth="3"
            fill="none"
          />
        </g>

        {/* Door: lit when getting outside is the highest-value action. */}
        <g data-testid="room-door" data-lit={String(state.doorLit)}>
          <rect
            x="112"
            y="70"
            width="30"
            height="86"
            fill={state.doorLit ? '#fde68a' : '#78716c'}
            stroke="#44403c"
            strokeWidth="2"
          />
        </g>

        {/* Floor clutter: one box per pending errand. */}
        <g data-testid="room-clutter">
          {state.clutter.map((box, index) => (
            <rect
              key={box.id}
              data-testid={`clutter-box-${box.id}`}
              x={44 + index * 22}
              y="166"
              width="18"
              height="18"
              rx="2"
              fill="#f59e0b"
            />
          ))}
        </g>

        <Character state={state.character} />
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
