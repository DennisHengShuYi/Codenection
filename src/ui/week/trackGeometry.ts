import {
  DEFICIT_THRESHOLD,
  floorReserve,
  FULL_RESERVE,
  LOAD_TYPES,
  type LoadType,
  type Projection,
} from '../../engine'

/**
 * The fortnight's reserves as a shape, ready to draw.
 *
 * §4's grid answers "what is on Thursday" and the open day answers "how am I on Thursday".
 * Neither answers "where is this week going", which is the question the projection exists
 * for and the one a student actually has when a warning sits eight days out.
 *
 * Named `trackGeometry` rather than `reserveTrack` because Windows filesystems are
 * case-insensitive: a module beside `ReserveTrack.tsx` differing only in the first letter
 * resolves to whichever the OS feels like, and the component ends up importing itself. The
 * same collision took `todayPanel.ts` out once already, and its rename comment says so.
 *
 * The geometry is here rather than inside the JSX for the reason every other pure module in
 * this codebase gives: a scale that lives in a component can only be checked by looking at
 * it, and the ways a chart goes wrong -- a point outside its own box, an inverted axis, a
 * threshold line drawn at the wrong height -- are all arithmetic.
 */

/** Room for the axis labels, so nothing is drawn under them. */
const PAD_LEFT = 26
const PAD_RIGHT = 6
const PAD_TOP = 8
const PAD_BOTTOM = 16

export interface TrackPoint {
  readonly x: number
  readonly y: number
}

export interface TrackLine {
  readonly type: LoadType
  readonly points: readonly TrackPoint[]
}

/** The spread around the floor, as two y values per day. */
export interface BandPoint {
  readonly x: number
  readonly bestY: number
  readonly worstY: number
}

export interface ReserveTrack {
  readonly lines: readonly TrackLine[]
  readonly band: readonly BandPoint[]
  /** Where 30 falls, so the drawing marks the line the deficit test actually uses. */
  readonly deficitY: number
  readonly width: number
  readonly height: number
}

export function reserveTrack(
  projection: Projection,
  { width, height }: { readonly width: number; readonly height: number },
): ReserveTrack {
  const days = projection.central.length

  const x = (dayIndex: number): number =>
    days <= 1
      ? PAD_LEFT
      : PAD_LEFT + (dayIndex / (days - 1)) * (width - PAD_LEFT - PAD_RIGHT)

  // Inverted on purpose, and the one thing an SVG scale routinely gets backwards: y grows
  // downward, so a full reserve belongs at a *small* y.
  const y = (value: number): number =>
    PAD_TOP + (1 - value / FULL_RESERVE) * (height - PAD_TOP - PAD_BOTTOM)

  const lines = LOAD_TYPES.map((type) => ({
    type,
    points: projection.central.map((reserves, dayIndex) => ({
      x: x(dayIndex),
      y: y(reserves[type]),
    })),
  }))

  /**
   * The spread, for the floor alone.
   *
   * §8.2: the 21-day projection is a decision aid and is never described as validated, so
   * four hard lines with no spread on them read as a measurement. Drawn around the floor
   * rather than around each reserve because four translucent regions over one another is a
   * smear nobody can read a value off -- and the floor is the quantity the deficit mark is
   * computed from, so it is the one whose uncertainty actually decides anything.
   */
  const band = projection.central.map((_, dayIndex) => ({
    x: x(dayIndex),
    bestY: y(floorReserve(projection.optimistic[dayIndex] ?? projection.central[dayIndex]!)),
    worstY: y(floorReserve(projection.pessimistic[dayIndex] ?? projection.central[dayIndex]!)),
  }))

  return { lines, band, deficitY: y(DEFICIT_THRESHOLD), width, height }
}
