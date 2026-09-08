import { describe, expect, it } from 'vitest'
import type { ParsedItem } from '../ai'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { addItems } from './addItems'

const empty = (): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const parsed = (over: Partial<ParsedItem> = {}): ParsedItem => ({
  id: 'a',
  title: 'Essay',
  type: 'mental',
  hours: 3,
  deadlineDay: null,
  hard: false,
  confident: true,
  ...over,
})

describe('addItems', () => {
  it('puts accepted items into the week', () => {
    expect(addItems(empty(), [parsed()]).items).toHaveLength(1)
  })

  it('keeps what was already there', () => {
    const once = addItems(empty(), [parsed()])

    expect(addItems(once, [parsed({ id: 'b', title: 'Gym' })]).items).toHaveLength(2)
  })

  it('carries the title, type and effort across', () => {
    const item = addItems(empty(), [parsed({ title: 'Lab report', hours: 2.5 })]).items[0]

    expect(item?.title).toBe('Lab report')
    expect(item?.type).toBe('mental')
    expect(item?.hours).toBe(2.5)
  })

  // Without this the optimizer would happily move the item past a date the student stated.
  it('keeps a stated deadline', () => {
    expect(addItems(empty(), [parsed({ deadlineDay: 4, hard: true })]).items[0]?.deadlineDay).toBe(4)
  })

  it('places a deadlined item on or before its deadline', () => {
    expect(
      addItems(empty(), [parsed({ deadlineDay: 2, hard: true })]).items[0]?.dayIndex,
    ).toBeLessThanOrEqual(2)
  })

  it('leaves an undated item movable', () => {
    const item = addItems(empty(), [parsed()]).items[0]

    expect(item?.deadlineDay).toBeNull()
    expect(item?.fixed).toBe(false)
  })

  /**
   * A parse may propose but never originate authority. Protected rest is the one thing the
   * optimizer may not move, and §5.1 calls that the most important design decision in the
   * app -- so nothing arriving from text may create it or pin anything.
   */
  it('never creates protected rest or a pinned block from parsed text', () => {
    const item = addItems(empty(), [parsed({ title: 'rest', type: 'mental' })]).items[0]

    expect(item?.protectedRest).toBe(false)
    expect(item?.fixed).toBe(false)
  })

  /**
   * A parse cannot tell a restorative coffee from an obligation, so the cautious error is
   * chosen. Crediting recovery a student never got would report them as fine while they
   * sink -- the same failure the engine already refuses when it will not let sleep cure
   * loneliness.
   */
  it('treats a parsed social item as draining rather than restorative', () => {
    const item = addItems(empty(), [parsed({ type: 'social', title: 'Group meeting' })]).items[0]

    expect(item?.kind).toBe('socialDraining')
  })

  it('gives every added item a distinct id', () => {
    const week = addItems(empty(), [parsed(), parsed({ id: 'b' })])

    expect(new Set(week.items.map((item) => item.id)).size).toBe(2)
  })

  // A mutation here would corrupt the state the room and the dial are drawing from.
  it('does not modify the week it was given', () => {
    const before = empty()
    const snapshot = JSON.stringify(before)

    addItems(before, [parsed()])

    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('does nothing when nothing was accepted', () => {
    expect(addItems(empty(), []).items).toEqual([])
  })
})
