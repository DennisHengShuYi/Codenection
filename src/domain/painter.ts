/**
 * §7.2's three-day painter.
 *
 * Three days rather than seven, and the reason is the important part: recall collapses past
 * 48 hours, and **fiction calibrated into the model is worse than no data**. A seven-day grid
 * would collect four days of invention. Three gives enough contrast between a loaded day and
 * a light one without asking anyone to remember what they cannot.
 *
 * Prefilled and tapped only where wrong, per §7's governing constraint: never ask the user
 * to enter, only to correct.
 */
export type Cell = 'free' | 'study' | 'work' | 'errands' | 'rest' | 'social' | 'sleep'

/** §7.2's cycle, in its order. */
export const CELL_CYCLE = [
  'free',
  'study',
  'work',
  'errands',
  'rest',
  'social',
  'sleep',
] as const satisfies readonly Cell[]

const DAYS = 3
const HOURS = 24

export type PainterGrid = readonly (readonly Cell[])[]

export interface ExtractedParameters {
  /** Longest unbroken study block, or null when none was painted. */
  readonly maxFocusRunHours: number | null
  /** Mean sleep hours per day, or null when no sleep was painted. */
  readonly sleepBaselineHours: number | null
  /** Where study clusters, or null when none was painted. */
  readonly peakStartHour: number | null
  /** The whole grid counted by cell, for the initial projection. */
  readonly loadShape: Record<Cell, number>
}

export const emptyGrid = (): PainterGrid =>
  Array.from({ length: DAYS }, () => Array.from({ length: HOURS }, (): Cell => 'free'))

export function cycleCell(grid: PainterGrid, day: number, hour: number): PainterGrid {
  const row = grid[day]
  const current = row?.[hour]
  // A tap outside the grid is ignored rather than throwing: this is driven by a dense grid
  // of buttons and a stray index should never take the screen down.
  if (!row || current === undefined) return grid

  const next = CELL_CYCLE[(CELL_CYCLE.indexOf(current) + 1) % CELL_CYCLE.length] ?? 'free'

  return grid.map((existing, index) =>
    index === day ? existing.map((cell, at) => (at === hour ? next : cell)) : existing,
  )
}

/** Longest unbroken run of one cell within a single day. Runs are not merged across a gap or
 *  across midnight -- a student who studied three separate hours has not shown they can
 *  focus for three. */
function longestRun(grid: PainterGrid, target: Cell): number {
  let best = 0

  for (const day of grid) {
    let run = 0
    for (const cell of day) {
      run = cell === target ? run + 1 : 0
      best = Math.max(best, run)
    }
  }

  return best
}

function countBy(grid: PainterGrid): Record<Cell, number> {
  const counts = Object.fromEntries(CELL_CYCLE.map((cell) => [cell, 0])) as Record<Cell, number>

  for (const day of grid) for (const cell of day) counts[cell] += 1

  return counts
}

/** The hour at which study most often begins a block. */
function peakStudyHour(grid: PainterGrid): number | null {
  const byHour = Array.from({ length: HOURS }, () => 0)

  for (const day of grid) {
    for (const [hour, cell] of day.entries()) {
      if (cell === 'study') byHour[hour] = (byHour[hour] ?? 0) + 1
    }
  }

  const best = byHour.reduce((top, count, hour) => (count > (byHour[top] ?? 0) ? hour : top), 0)

  return (byHour[best] ?? 0) > 0 ? best : null
}

/**
 * §7.3's table, as a function.
 *
 * Everything unmeasured comes back null rather than as a plausible default. §7.2's warning
 * is that fiction calibrated into the model is worse than no data, and a number that looks
 * measured but was invented is precisely that fiction.
 */
export function extractParameters(grid: PainterGrid): ExtractedParameters {
  const loadShape = countBy(grid)
  const focusRun = longestRun(grid, 'study')

  return {
    maxFocusRunHours: focusRun > 0 ? focusRun : null,
    sleepBaselineHours: loadShape.sleep > 0 ? loadShape.sleep / DAYS : null,
    peakStartHour: peakStudyHour(grid),
    loadShape,
  }
}
