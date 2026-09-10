/**
 * The room's colours and its one shared coordinate, in a single place.
 *
 * These were fourteen hex literals inlined through the drawing, which made "warm this up"
 * a fourteen-edit change and made it impossible to read the palette as a palette.
 *
 * The neutrals are warm because the room is somewhere a tired student is meant to want to
 * be. The *semantic* colours are not warmed: the weather stays cold and the plant stays
 * green, because those carry meaning rather than mood.
 *
 * There was an `attention` amber here too, ported across from the source's `Halo`. The
 * `Halo` deliberately did not come with it -- nothing on this branch computes attention any
 * more (`scene/marks.tsx`) -- so the token had zero references and looked load-bearing while
 * being nothing of the kind. Deleted rather than reserved (Ruling 57): the app-level
 * `--color-attention` in `styles.css` is still there for anything that needs the hue, and a
 * halo that comes back can add its own colour alongside the flag it would be driven by.
 */
export const PALETTE = {
  wallTop: '#f8f2e7',
  wallBottom: '#eee1cd',
  floorFar: '#dac6a6',
  floorNear: '#c9b08d',
  skirting: '#bda781',
  ink: '#5c4a36',
  inkSoft: '#a08e77',
  wood: '#a9784b',
  woodDark: '#8a5f38',
  linen: '#e9e2d6',
  paper: '#f2ece1',
  paperEdge: '#cdbfa8',
  glass: '#dfe7ee',
  screen: '#3f4a56',
  bedDebt: '#b3a3d6',
  bedRested: '#d5cbef',
  leaf: '#4f9d5d',
  pot: '#b4643a',
  clutter: '#f0a02a',
  glow: '#fcd34d',
} as const

/**
 * Where the back wall meets the floor.
 *
 * Everything already drawn keeps its coordinates -- this line was chosen to fit them, not
 * the other way round. Bases fall at 148 (desk, against the wall), 154-156 (papers, bed,
 * door), 162 (plant) and 184 (clutter), and that spread is what gives the flat elevation
 * its sense of depth: the nearer a thing is, the lower it stands.
 */
export const FLOOR_Y = 148

/**
 * How far past the viewBox the building is painted.
 *
 * The scene is 300x200 units, but the room screen shows it in a viewBox taller than that
 * and inside a stage of whatever shape the phone or the laptop is -- so `preserveAspectRatio`
 * letterboxes it, leaving bands at the sides or below the drawing. An `<svg>` clips to its
 * own element box rather than to its viewBox, so a wall and a floor drawn well past the
 * viewBox fill those bands with the same two surfaces, meeting the drawing exactly at the
 * skirting. That is why the room reaches the edge of the screen at every width instead of
 * sitting in a rectangle of background colour, and it costs two numbers rather than a
 * per-breakpoint layout.
 *
 * The inline framing (the two-room comparison) is boxed to the viewBox's own ratio, so
 * nothing bleeds into view there -- the element box clips it all.
 */
export const BLEED = 400
