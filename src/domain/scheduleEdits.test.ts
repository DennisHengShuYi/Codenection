import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { completeItem, deferItem } from './scheduleEdits'

const item = (id: string, dayIndex: number, over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id,
  title: id,
  type: 'errands',
  kind: 'errands',
  hours: 1,
  intensity: 1,
  dayIndex,
  startHour: 17,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const schedule = (items: ScheduledItem[]): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

describe('completeItem', () => {
  it('removes the item from the week', () => {
    expect(completeItem(schedule([item('a', 1), item('b', 2)]), 'a').items.map((i) => i.id)).toEqual(
      ['b'],
    )
  })

  it('leaves everything else alone', () => {
    const before = schedule([item('a', 1), item('b', 2)])
    const after = completeItem(before, 'a')

    expect(after.start).toEqual(before.start)
    expect(after.sleepByDay).toEqual(before.sleepByDay)
  })

  it('does nothing for an id that is not there', () => {
    expect(completeItem(schedule([item('a', 1)]), 'nope').items).toHaveLength(1)
  })

  it('does not mutate the week it was given', () => {
    const before = schedule([item('a', 1)])
    const snapshot = JSON.stringify(before)
    completeItem(before, 'a')

    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

describe('deferItem', () => {
  it('pushes the item later', () => {
    expect(deferItem(schedule([item('a', 1)]), 'a').items[0]!.dayIndex).toBeGreaterThan(1)
  })

  // Otherwise deferring becomes a way to make a deadline quietly disappear.
  it('never pushes an item past its deadline', () => {
    const after = deferItem(schedule([item('a', 1, { deadlineDay: 2 })]), 'a')

    expect(after.items[0]!.dayIndex).toBeLessThanOrEqual(2)
  })

  // An item pushed off the end vanishes from the model while still existing in the
  // student's life.
  it('never pushes an item off the end of the horizon', () => {
    const after = deferItem(schedule([item('a', HORIZON_DAYS - 1)]), 'a', 5)

    expect(after.items[0]!.dayIndex).toBeLessThan(HORIZON_DAYS)
  })

  it('does nothing for an id that is not there', () => {
    expect(deferItem(schedule([item('a', 1)]), 'nope').items[0]!.dayIndex).toBe(1)
  })

  it('does not mutate the week it was given', () => {
    const before = schedule([item('a', 1)])
    const snapshot = JSON.stringify(before)
    deferItem(before, 'a')

    expect(JSON.stringify(before)).toBe(snapshot)
  })
})
