import { Character } from './Character'
import { clutterHotspot, HOTSPOTS } from './hotspots'
import { isClutterId, type ObjectId } from './objects'
import type { RoomModel } from './roomModel'
import type { RoomState } from './roomState'

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
  model,
  onSelect,
  pulsing = null,
}: {
  model: RoomModel
  onSelect?: (objectId: ObjectId) => void
  /** The object a button just opened. It pulses so the mapping between the two is absorbed
   *  without anybody having to rely on it. */
  pulsing?: ObjectId | null
}) {
  const { state } = model
  const select = (_id: string) => () => undefined

  return (
    /* Locked to the viewBox's 3:2 ratio so the hotspot percentages stay over the artwork at
       every width, and capped at the viewport so a tall screen does not stretch it. */
    <section className="relative mx-auto aspect-[3/2] max-h-dvh w-full">
      {/* viewBox and no width: it scales to its container at every breakpoint without a
          media query, which is §10's argument for hand-rolled SVG over an image. */}
      <svg
        data-testid="room-scene"
        viewBox="0 0 300 200"
        className="absolute inset-0 h-full w-full rounded-lg bg-slate-900/5"
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

      {/*
        The controls. Real HTML buttons over the drawing rather than elements inside it --
        see hotspots.ts for why. Rendered in the model's fixed order, so tabbing through the
        room walks it in the same order the sidebar lists it.

        Attention is named as well as drawn: §1.5's rule that colour alone cannot carry
        meaning applies to furniture too, and a glow says nothing to somebody who cannot see
        it.
      */}
      {model.rows.map((row) => {
        const spot = isClutterId(row.id)
          ? clutterHotspot(state.clutter.findIndex((box) => row.id.endsWith(box.id)))
          : HOTSPOTS[row.id]

        return (
          <button
            key={row.id}
            type="button"
            data-testid={`object-${row.id}`}
            data-attention={String(row.attention)}
            data-pulsing={String(pulsing === row.id)}
            aria-label={row.attention ? `${row.label} — needs you` : row.label}
            onClick={() => onSelect?.(row.id)}
            style={spot}
            className={`absolute rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
              row.attention ? 'ring-2 ring-amber-400 ring-offset-1' : ''
            } ${pulsing === row.id ? 'ring-4 ring-sky-400 motion-safe:animate-pulse' : ''}`}
          />
        )
      })}
    </section>
  )
}
