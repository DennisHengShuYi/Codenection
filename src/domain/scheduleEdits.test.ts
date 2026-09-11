import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { addBlock, completeItem, deferItem, editItem, removeItem, type ItemFields } from './scheduleEdits'

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

const fields = (over: Partial<ItemFields> = {}): ItemFields => ({
  title: 'Essay draft',
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  dayIndex: 3,
  startHour: 14,
  deadlineDay: null,
  fixed: false,
  ...over,
})

describe('editing a block by hand', () => {
  it('writes the new fields onto the one block named', () => {
    const before = schedule([item('essay', 5, { startHour: 9 }), item('lab', 6)])

    const after = editItem(before, 'essay', fields({ dayIndex: 3, startHour: 14, hours: 2 }))

    expect(after.items.find((candidate) => candidate.id === 'essay')).toMatchObject({
      dayIndex: 3,
      startHour: 14,
      hours: 2,
      title: 'Essay draft',
    })
    expect(after.items.find((candidate) => candidate.id === 'lab')).toEqual(
      before.items.find((candidate) => candidate.id === 'lab'),
    )
  })

  it('never mutates the week it was handed', () => {
    const before = schedule([item('essay', 5)])

    editItem(before, 'essay', fields({ dayIndex: 1 }))

    expect(before.items[0]!.dayIndex).toBe(5)
  })

  /**
   * The test that stops the form quietly stripping protection off a nap. Everything outside
   * `ItemFields` survives.
   *
   * The deadline used to be part of that set and has deliberately left it: the form asks
   * about it now, so carrying the old value through would make the field unable to change
   * anything. What is protected here is what the form still never asks about.
   */
  it('keeps what the form never asked about', () => {
    const before = schedule([
      item('nap', 4, { protectedRest: true, intensity: 0.5, seriesId: 'series-1' }),
    ])

    expect(editItem(before, 'nap', fields({ dayIndex: 2 })).items[0]).toMatchObject({
      protectedRest: true,
      intensity: 0.5,
      seriesId: 'series-1',
      dayIndex: 2,
    })
  })

  /** The other half: a deadline the student sets reaches the week, and one they clear is
   *  cleared rather than quietly restored from what the block used to say. */
  it('writes the deadline the form was given', () => {
    const before = schedule([item('essay', 4, { deadlineDay: 4 })])

    expect(editItem(before, 'essay', fields({ deadlineDay: 6 })).items[0]?.deadlineDay).toBe(6)
    expect(editItem(before, 'essay', fields({ deadlineDay: null })).items[0]?.deadlineDay).toBeNull()
  })

  // The same stale-id case `blockSheet` already handles by closing: it happens for real.
  it('leaves the week untouched when no block has that id', () => {
    const before = schedule([item('essay', 3)])

    expect(editItem(before, 'ghost', fields())).toEqual(before)
  })
})

describe('removing a block', () => {
  it('takes it out of the week', () => {
    const before = schedule([item('essay', 3), item('lab', 4)])

    expect(removeItem(before, 'essay').items.map((candidate) => candidate.id)).toEqual(['lab'])
  })

  it('takes the acceptance that created it out too', () => {
    const before = {
      ...schedule([item('essay', 3)]),
      commitments: [{ id: 'c1', title: 'Essay', reviewDay: 7, itemId: 'essay' }],
    }

    expect(removeItem(before, 'essay').commitments).toEqual([])
  })
})

describe('adding a block by hand', () => {
  /**
   * The case that distinguishes this from `placeItems`. The student chose the day and the
   * hour on a grid they were looking at; auto-placing it elsewhere would be the app
   * overriding a decision it had just asked them to make.
   */
  it('puts it exactly where it was told, not where a solver would prefer', () => {
    const before = schedule([item('lab', 3, { startHour: 14, hours: 3 })])

    const after = addBlock(before, fields({ dayIndex: 3, startHour: 14, hours: 2 }))

    expect(after.items[after.items.length - 1]).toMatchObject({
      dayIndex: 3,
      startHour: 14,
      hours: 2,
      title: 'Essay draft',
    })
  })

  it('gives it an id nothing else in the week is using', () => {
    const ids = addBlock(schedule([item('lab', 1)]), fields()).items.map((c) => c.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  // 5.1: a student may SCHEDULE rest. Only the app's own advice may pin it as protected.
  it('never creates protected rest, whatever was typed', () => {
    const after = addBlock(schedule([]), fields({ kind: 'rest', type: 'physical' }))

    expect(after.items[0]!.protectedRest).toBe(false)
  })

  it('leaves every existing block alone', () => {
    const before = schedule([item('lab', 1)])

    expect(addBlock(before, fields()).items[0]).toEqual(before.items[0])
  })
})

/**
 * Ruling 62/Ruling 45: deferring undated work is no longer free.
 *
 * `softDeadlines`' own docstring names this function as one of the three reasons it exists
 * -- "`scheduleEdits.deferItem` clamps undated work to the horizon edge and nothing sooner"
 * -- and it was never changed when the feature landed. A walk could still be pushed two
 * weeks out in one tap, which is exactly the behaviour giving every event a deadline was
 * meant to stop.
 */
describe('deferring something with only a synthetic deadline', () => {
  const walk = {
    id: 'walk',
    title: 'Walk',
    type: 'physical' as const,
    kind: 'lightExercise' as const,
    hours: 1,
    intensity: 1,
    dayIndex: 1,
    startHour: 9,
    fixed: false,
    deadlineDay: null,
    protectedRest: false,
  }

  it('stops at the soft deadline rather than the end of the fortnight', () => {
    const week = schedule([{ ...walk, softDeadlineDay: 3 }])

    const after = deferItem(week, 'walk', 10)

    expect(after.items[0]?.dayIndex).toBe(3)
  })

  /** A real deadline still wins over a derived one -- it is a fact about the world. */
  it('still stops at a real deadline when there is one', () => {
    const week = schedule([{ ...walk, deadlineDay: 2, softDeadlineDay: 6 }])

    expect(deferItem(week, 'walk', 10).items[0]?.dayIndex).toBe(2)
  })

  /** Nothing stamped and nothing stated is the old behaviour, unchanged: there is no
   *  deadline to hold it to, so the horizon edge is the only honest limit. */
  it('falls back to the horizon when the week has never been stamped', () => {
    const week = schedule([walk])

    expect(deferItem(week, 'walk', 100).items[0]?.dayIndex).toBe(HORIZON_DAYS - 1)
  })
})
