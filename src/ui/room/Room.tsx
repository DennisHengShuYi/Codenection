import { Character } from './Character'
import type { RoomState } from './roomState'
import { describeRoom } from './roomText'

const WEATHER_FILL: Record<RoomState['weather'], string> = {
  clear: '#bae6fd',
  clouding: '#cbd5e1',
  storm: '#64748b',
}

/**
 * §1.3's room, drawn as one scalable scene.
 *
 * The picture is hidden from assistive technology and the words beneath it are not,
 * because announcing a drawing twice is noise rather than access — and unlike the dial,
 * the drawing alone conveys nothing at all to a screen reader.
 */
export function Room({
  state,
  onSelect,
}: {
  state: RoomState
  onSelect?: (objectId: string) => void
}) {
  const select = (id: string) => () => onSelect?.(id)

  return (
    <section className="flex flex-col gap-3">
      {/* viewBox and no width: it scales to its container at every breakpoint without a
          media query, which is §10's argument for hand-rolled SVG over an image. */}
      <svg
        data-testid="room-scene"
        viewBox="0 0 300 200"
        className="w-full rounded-lg bg-slate-900/5"
        aria-hidden="true"
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
        <g data-testid="room-ceiling" onClick={select('ceiling')} className="cursor-pointer">
          <rect x="0" y="0" width="300" height={10 + state.ceilingPressure * 34} fill="#475569" />
        </g>

        {/* Window weather: the projection, rendered literally. */}
        <g data-testid="room-window" onClick={select('window')} className="cursor-pointer">
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
        <g data-testid="room-papers" onClick={select('papers')} className="cursor-pointer">
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
        <g data-testid="room-bed" onClick={select('bed')} className="cursor-pointer">
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
        <g data-testid="room-plant" onClick={select('plant')} className="cursor-pointer">
          <rect x="20" y="146" width="14" height="14" fill="#b45309" />
          <path
            d={`M 27 146 Q ${27 - (1 - state.plantHealth) * 12} ${132 + (1 - state.plantHealth) * 10} 27 ${124 + (1 - state.plantHealth) * 14}`}
            stroke="#16a34a"
            strokeWidth="3"
            fill="none"
          />
        </g>

        {/* Door: lit when getting outside is the highest-value action. */}
        <g
          data-testid="room-door"
          data-lit={String(state.doorLit)}
          onClick={select('door')}
          className="cursor-pointer"
        >
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
              onClick={select(box.id)}
              className="cursor-pointer"
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

      {/* §1.5: a primary view, in the document for everyone. */}
      <p data-testid="room-text-equivalent" className="text-sm opacity-80">
        {describeRoom(state)}
      </p>
    </section>
  )
}
