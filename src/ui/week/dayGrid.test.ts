import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import { DEFAULT_FIRST_HOUR, DEFAULT_LAST_HOUR, dayGrid } from './dayGrid'

const item = (id: string, startHour: number, hours: number): ScheduledItem => ({
  id,
  title: id,
  type: 'mental',
  kind: 'studyBlock',
  hours,
  intensity: 1,
  dayIndex: 0,
  startHour,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
})

const week = (items: ScheduledItem[]): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

describe('dayGrid', () => {
  it('falls back to a sensible window on an empty day, rather than rendering nothing', () => {
    const grid = dayGrid(week([]), 0)

    expect(grid.firstHour).toBe(DEFAULT_FIRST_HOUR)
    expect(grid.lastHour).toBe(DEFAULT_LAST_HOUR)
    expect(grid.blocks).toEqual([])
  })

  it('derives the window from the day, with an hour of air either side', () => {
    const grid = dayGrid(week([item('a', 9, 2)]), 0)

    expect(grid.firstHour).toBe(8)
    expect(grid.lastHour).toBe(12)
  })

  it('never runs past midnight or before midnight', () => {
    const grid = dayGrid(week([item('a', 0, 1), item('b', 23, 1)]), 0)

    expect(grid.firstHour).toBe(0)
    expect(grid.lastHour).toBe(24)
  })

  it('lists every hour in the window inclusive of the last', () => {
    const grid = dayGrid(week([item('a', 9, 1)]), 0)

    expect(grid.hours).toEqual([8, 9, 10, 11])
  })

  it('positions a block by its start and sizes it by its duration', () => {
    // Window 8..12 is four hours. A 2h block at 09:00 starts a quarter in and covers half.
    const grid = dayGrid(week([item('a', 9, 2)]), 0)

    expect(grid.blocks[0]?.topPercent).toBeCloseTo(25)
    expect(grid.blocks[0]?.heightPercent).toBeCloseTo(50)
  })

  it('orders blocks as the day happens', () => {
    const grid = dayGrid(week([item('late', 20, 1), item('early', 9, 1)]), 0)

    expect(grid.blocks.map((block) => block.item.id)).toEqual(['early', 'late'])
  })

  it('reads only the day it was asked for', () => {
    const other = { ...item('other', 9, 1), dayIndex: 4 }
    const grid = dayGrid(week([item('mine', 9, 1), other]), 0)

    expect(grid.blocks.map((block) => block.item.id)).toEqual(['mine'])
  })

  it('keeps a window at least an hour wide even when a block runs past midnight, so positioning never divides by zero', () => {
    // startHour(25) + hours(1) puts the raw upper bound at 27, clamped down to 24, while the
    // raw lower bound (24) is already inside range and left untouched by clamping alone --
    // collapsing the window to zero width unless the derivation itself guarantees a minimum.
    // A zero-width window turns the percentage maths into a division by zero: Infinity when
    // the numerator is non-zero (as here), NaN when it also happens to be zero -- both invalid
    // in a style attribute, so both are checked via finiteness rather than either name alone.
    const grid = dayGrid(week([item('a', 25, 1)]), 0)

    expect(grid.lastHour - grid.firstHour).toBeGreaterThanOrEqual(1)
    expect(Number.isFinite(grid.blocks[0]?.topPercent)).toBe(true)
    expect(Number.isFinite(grid.blocks[0]?.heightPercent)).toBe(true)
  })
})
