/**
 * The room's colours and its one shared coordinate, in a single place.
 *
 * These were fourteen hex literals inlined through the drawing, which made "warm this up"
 * a fourteen-edit change and made it impossible to read the palette as a palette.
 *
 * The neutrals are warm because the room is somewhere a tired student is meant to want to
 * be. The *semantic* colours are not warmed: the weather stays cold, the plant stays green
 * and attention stays amber, because those carry meaning rather than mood.
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
  attention: '#f59e0b',
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
