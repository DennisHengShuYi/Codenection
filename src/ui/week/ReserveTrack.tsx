import { LOAD_TYPES, type LoadType, type Projection } from '../../engine'
import { LOAD_TYPE_LABELS } from '../kit/labels'
import { reserveTrack } from './trackGeometry'

/**
 * The fortnight's four reserves, drawn.
 *
 * §4's grid answers "what is on Thursday" and the open day answers "how am I on Thursday".
 * This answers "where is this week going" -- the question a student actually has when a
 * warning sits eight days out, and the one the projection was computed for.
 *
 * Hand-rolled SVG with a viewBox and no width, which is §10's own argument: it scales to its
 * container at every breakpoint without a media query. The geometry lives in
 * `trackGeometry.ts` because a scale inside JSX can only be checked by looking at it.
 *
 * §1.5 is doing real work here. A line chart is the most exclusionary thing in this app for
 * a screen reader, so the drawing is hidden from assistive technology and the same reading
 * is given in words underneath -- and the four lines are named in a visible legend, because
 * four colours with nothing beside them is exactly the "colour carries meaning alone" this
 * codebase refuses everywhere else.
 */
const WIDTH = 320
const HEIGHT = 150

/** Warm neutrals apart from the two that carry meaning. Named beside the labels below, never
 *  relied on alone. */
const LINE_COLOUR: Record<LoadType, string> = {
  mental: '#5c4a36',
  physical: '#a9784b',
  social: '#8a5f38',
  errands: '#bda781',
}

const pathOf = (points: readonly { x: number; y: number }[]): string =>
  points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ')

/**
 * The same reading in a sentence.
 *
 * Names the reserve that ends lowest and when the horizon first crosses, because those are
 * the two things the picture is actually for. Says plainly when it holds, rather than
 * leaving a screen reader with a chart described as "a chart".
 */
function describeTrack(projection: Projection, dayLabel: (dayIndex: number) => string): string {
  const last = projection.central.at(-1)
  if (last === undefined) return 'There is no fortnight to draw yet.'

  const lowest = LOAD_TYPES.reduce((worst, type) => (last[type] < last[worst] ? type : worst))

  const crossing =
    projection.firstDeficitDay === null
      ? 'Nothing on this plan takes you into deficit.'
      : `On this plan you first cross into deficit on ${dayLabel(projection.firstDeficitDay)}.`

  return `${crossing} By the end of the horizon ${LOAD_TYPE_LABELS[lowest].toLowerCase()} is the lowest, at about ${Math.round(last[lowest])}.`
}

export function ReserveTrack({
  projection,
  dayLabel,
}: {
  readonly projection: Projection
  /** Naming a day needs the week's anchor, which this component does not hold. */
  readonly dayLabel: (dayIndex: number) => string
}) {
  const track = reserveTrack(projection, { width: WIDTH, height: HEIGHT })

  const bandPath =
    track.band.length === 0
      ? ''
      : [
          ...track.band.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.bestY}`),
          ...[...track.band]
            .reverse()
            .map((point) => `L${point.x} ${point.worstY}`),
          'Z',
        ].join(' ')

  return (
    <section data-testid="reserve-track" className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        aria-hidden="true"
        focusable="false"
      >
        {/* The spread, around the floor only -- see `trackGeometry.ts` for why not around
            each line. Drawn first so the lines sit on top of it. */}
        {bandPath !== '' && <path d={bandPath} fill="currentColor" fillOpacity="0.08" />}

        {/* Where 30 falls. The deficit mark on the grid is computed from this line, so the
            chart draws the same one rather than an approximate gridline. */}
        <line
          x1="26"
          y1={track.deficitY}
          x2={WIDTH - 6}
          y2={track.deficitY}
          stroke="currentColor"
          strokeOpacity="0.35"
          strokeDasharray="3 3"
        />
        <text x="4" y={track.deficitY + 3} fontSize="9" fill="currentColor" fillOpacity="0.6">
          30
        </text>

        {track.lines.map((line) => (
          <path
            key={line.type}
            d={pathOf(line.points)}
            fill="none"
            stroke={LINE_COLOUR[line.type]}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>

      <ul data-testid="reserve-track-legend" className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {LOAD_TYPES.map((type) => (
          <li key={type} className="flex items-center gap-1.5 text-ink-soft">
            <span
              aria-hidden="true"
              className="inline-block h-0.5 w-4 rounded"
              style={{ backgroundColor: LINE_COLOUR[type] }}
            />
            {LOAD_TYPE_LABELS[type]}
          </li>
        ))}
      </ul>

      {/* §1.5: a primary view, not a fallback. It stays in the document for everyone. */}
      <p data-testid="reserve-track-text" className="text-xs text-ink-soft">
        {describeTrack(projection, dayLabel)}
      </p>
    </section>
  )
}
