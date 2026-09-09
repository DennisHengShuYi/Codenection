import { describe, expect, it } from 'vitest'
import { CELL_CYCLE, cycleCell, emptyGrid, extractParameters, type Cell } from './painter'

const gridWith = (day: number, hours: readonly number[], cell: Cell) => {
  let grid = emptyGrid()
  for (const hour of hours) {
    // Cycle round until the cell reads what the test wants.
    while (grid[day]?.[hour] !== cell) grid = cycleCell(grid, day, hour)
  }
  return grid
}

describe('the grid', () => {
  it('is three days of twenty-four hours', () => {
    const grid = emptyGrid()

    expect(grid).toHaveLength(3)
    for (const day of grid) expect(day).toHaveLength(24)
  })

  it('starts entirely free, so the student corrects rather than enters', () => {
    for (const day of emptyGrid()) {
      for (const cell of day) expect(cell).toBe('free')
    }
  })

  // §7.2's cycle, verbatim.
  it('cycles in the order the spec names', () => {
    expect(CELL_CYCLE).toEqual(['free', 'study', 'work', 'errands', 'rest', 'social', 'sleep'])
  })

  it('advances one step at a time', () => {
    expect(cycleCell(emptyGrid(), 0, 9)[0]?.[9]).toBe('study')
  })

  it('wraps back to free at the end', () => {
    let grid = emptyGrid()
    for (let i = 0; i < CELL_CYCLE.length; i += 1) grid = cycleCell(grid, 0, 9)

    expect(grid[0]?.[9]).toBe('free')
  })

  it('does not modify the grid it was given', () => {
    const before = emptyGrid()
    const snapshot = JSON.stringify(before)

    cycleCell(before, 0, 9)

    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('leaves every other cell alone', () => {
    const grid = cycleCell(emptyGrid(), 1, 9)

    expect(grid[0]?.[9]).toBe('free')
    expect(grid[1]?.[10]).toBe('free')
  })

  it('ignores a tap outside the grid rather than throwing', () => {
    expect(() => cycleCell(emptyGrid(), 9, 99)).not.toThrow()
  })
})

/**
 * §7.3's table is the contract: max focus run from the longest unbroken study block, sleep
 * baseline from the mean of sleep blocks, peak hours from where study clusters.
 */
describe('extractParameters', () => {
  it('finds the longest unbroken study run', () => {
    const grid = gridWith(0, [9, 10, 11], 'study')

    expect(extractParameters(grid).maxFocusRunHours).toBe(3)
  })

  // The longest *unbroken* run, not the total. A student who studies three separate hours
  // has not shown they can focus for three.
  it('does not merge runs across a gap', () => {
    const grid = gridWith(0, [9, 10, 13, 14], 'study')

    expect(extractParameters(grid).maxFocusRunHours).toBe(2)
  })

  it('does not merge runs across days', () => {
    let grid = gridWith(0, [22, 23], 'study')
    for (const hour of [0, 1]) while (grid[1]?.[hour] !== 'study') grid = cycleCell(grid, 1, hour)

    expect(extractParameters(grid).maxFocusRunHours).toBe(2)
  })

  it('takes the sleep baseline as a mean per day rather than a total', () => {
    let grid = gridWith(0, [0, 1, 2, 3, 4, 5, 6], 'sleep')
    for (const hour of [0, 1, 2, 3, 4, 5, 6]) {
      while (grid[1]?.[hour] !== 'sleep') grid = cycleCell(grid, 1, hour)
    }

    // Seven hours on two of the three days.
    expect(extractParameters(grid).sleepBaselineHours).toBeCloseTo(14 / 3, 1)
  })

  it('reports where study clusters as the peak hour', () => {
    const grid = gridWith(0, [9, 10], 'study')

    expect(extractParameters(grid).peakStartHour).toBe(9)
  })

  /**
   * §7.2: fiction calibrated into the model is worse than no data. An empty grid has
   * measured nothing, and saying so with nulls is the only honest answer -- a default that
   * looks measured is exactly the fiction being warned about.
   */
  it('reports nothing rather than inventing numbers from an empty grid', () => {
    const empty = extractParameters(emptyGrid())

    expect(empty.maxFocusRunHours).toBeNull()
    expect(empty.peakStartHour).toBeNull()
    expect(empty.sleepBaselineHours).toBeNull()
  })

  it('extracts sleep alone from a grid with only sleep in it', () => {
    const grid = gridWith(0, [0, 1, 2, 3, 4, 5], 'sleep')
    const out = extractParameters(grid)

    expect(out.sleepBaselineHours).toBeGreaterThan(0)
    expect(out.maxFocusRunHours).toBeNull()
    expect(out.peakStartHour).toBeNull()
  })

  it('reports the load shape so the whole grid can be projected', () => {
    const grid = gridWith(0, [9, 10], 'study')
    const shape = extractParameters(grid).loadShape

    expect(shape.study).toBe(2)
    expect(shape.free).toBeGreaterThan(0)
  })
})
