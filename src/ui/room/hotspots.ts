import type { ObjectId } from './objects'

/**
 * Where each object sits, as a percentage of the room's box.
 *
 * The controls are real HTML `<button>`s laid over the drawing rather than elements inside
 * the SVG. Three reasons, in order of how much they cost to get wrong:
 *
 * 1. A real button gets keyboard activation on both Enter and Space, focus rings, and
 *    screen-reader semantics from the element. Inside an SVG all of that is hand-rolled.
 * 2. `<foreignObject>` -- the other way to put a button in an SVG -- misbehaves in Safari,
 *    and this has to work on a phone.
 * 3. The drawing stays a drawing. It can be redrawn freely without touching the controls.
 *
 * Percentages align with the artwork because the room's box is locked to the viewBox's 3:2
 * ratio. If that ratio ever changes, these move with it.
 */
export interface Hotspot {
  readonly left: string
  readonly top: string
  readonly width: string
  readonly height: string
}

/** viewBox is `0 0 300 200`. */
const at = (x: number, y: number, w: number, h: number): Hotspot => ({
  left: `${(x / 300) * 100}%`,
  top: `${(y / 200) * 100}%`,
  width: `${(w / 300) * 100}%`,
  height: `${(h / 200) * 100}%`,
})

export const HOTSPOTS: Record<Exclude<ObjectId, `clutter-${string}`>, Hotspot> = {
  ceiling: at(0, 0, 300, 40),
  mirror: at(44, 52, 26, 34),
  window: at(196, 56, 60, 44),
  light: at(268, 40, 18, 22),
  door: at(112, 70, 30, 86),
  character: at(141, 92, 18, 44),
  papers: at(40, 106, 34, 46),
  desk: at(162, 116, 42, 32),
  phone: at(262, 106, 14, 20),
  bed: at(212, 130, 66, 26),
  plant: at(18, 122, 20, 40),
}

/** Clutter boxes are laid out by index along the floor, matching the drawing. */
export const clutterHotspot = (index: number): Hotspot => at(44 + index * 22, 166, 18, 18)
