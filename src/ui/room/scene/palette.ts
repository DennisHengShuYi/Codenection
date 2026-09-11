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
  /** Ruling 45: night behind the window, laid over the weather rather than replacing it. Blue
   *  rather than black -- a black pane reads as a hole in the wall, not as a night. */
  night: '#1e2a3a',
  /** Ruling 45: the dumbbell on the floor, for exercise still on today. */
  iron: '#6b7280',
  /** Ruling 45: the figures who are in the room when company is on today. Not the character's
   *  own colours -- a visitor drawn in the student's palette reads as a second student. */
  visitor: '#8d7a9c',
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
 * The character's lowest drawn point, in scene units, across all five postures.
 *
 * This is the room screen's one load-bearing measurement (§3, *The room is the screen*).
 * The bottom band is capped at `100% - min(52.33vw, 60.38%) - 1rem`, and those two figures
 * are this number read through the fill viewBox: `157/300 = 52.33%` of the width and
 * `157/260 = 60.38%` of the height, because the drawing is scaled by
 * `min(stageWidth/300, stageHeight/260)`. If the character reaches lower -- a deeper slump,
 * longer arms, a lower `FLOOR_Y` -- the band starts covering the one thing §1.3 says may
 * never be covered.
 *
 * It lived only inside a Tailwind arbitrary-value string and two comments, so nothing in
 * code bound the cap to the artwork. `Character.test.tsx` now measures the drawing against
 * it and `RoomShell.room.test.tsx` derives the cap's percentages from it, which puts the
 * tripwire beside the thing that trips it rather than in a Playwright geometry assertion.
 */
export const CHARACTER_BOTTOM = 157

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
