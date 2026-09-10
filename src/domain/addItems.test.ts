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
  kind: 'studyBlock',
  hours: 3,
  deadlineDay: null,
  fixed: false,
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
    expect(addItems(empty(), [parsed({ deadlineDay: 4 })]).items[0]?.deadlineDay).toBe(4)
  })

  it('places a deadlined item on or before its deadline', () => {
    expect(
      addItems(empty(), [parsed({ deadlineDay: 2 })]).items[0]?.dayIndex,
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
   * app -- so nothing arriving from text may create it.
   *
   * Pinning is now a separate, weaker power the student may grant on the chip; this item
   * was not confirmed as fixed, so it stays movable on both counts.
   */
  it('never creates protected rest, and leaves an unconfirmed item movable', () => {
    const item = addItems(empty(), [parsed({ title: 'rest', type: 'mental' })]).items[0]

    expect(item?.protectedRest).toBe(false)
    expect(item?.fixed).toBe(false)
  })

  /**
   * The parse itself carries the kind now -- addItems no longer invents one from the type.
   * §6.6's cross-effect table keys on kind, and a fixed four-row table by type made
   * `hardExercise`, `socialRestorative`, `rest` and `sleep` unreachable from any text.
   */
  it('carries the parsed kind through rather than deriving one from the type', () => {
    const item = addItems(empty(), [parsed({ type: 'physical', kind: 'hardExercise' })]).items[0]

    expect(item?.kind).toBe('hardExercise')
  })

  /**
   * Kind `rest` is not the `protectedRest` flag. §5.1's guarantee is that nothing from a
   * parse may become *untouchable* -- a movable rest block is a different thing and is
   * safe, and so is a rest block the student pinned to a time.
   */
  it('never turns a claimed rest kind into protected rest', () => {
    const item = addItems(empty(), [parsed({ type: 'mental', kind: 'rest' })]).items[0]

    expect(item?.fixed).toBe(false)
    expect(item?.protectedRest).toBe(false)
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

/**
 * `fixed` and `deadlineDay` are different properties, and the schema used to conflate them
 * into one discarded boolean.
 *
 * `fixed` means pinned to a time -- a lecture, a lab, a shift. `deadlineDay` means it
 * cannot move past a day but is free before it -- an essay. An essay with a hard deadline
 * is maximally movable, which is why one flag could never have served both.
 *
 * The invariant that survives untouched: a *parse* still cannot pin anything. What lands
 * in the week is what the student confirmed on the chip, not what the model claimed.
 */
describe('addItems and what the student pinned', () => {
  it('pins a block the student confirmed as fixed', () => {
    const item = addItems(empty(), [parsed({ title: 'WIA3001 lecture', fixed: true })]).items[0]

    expect(item?.fixed).toBe(true)
  })

  it('leaves a block movable when the student did not confirm it as fixed', () => {
    expect(addItems(empty(), [parsed({ fixed: false })]).items[0]?.fixed).toBe(false)
  })

  /**
   * The half of §5.1 that does not move. Protected rest is the one thing the optimizer may
   * never touch, and §5.1 calls that the most important design decision in the app -- so
   * even a student ticking "fixed" cannot originate it from the add flow. Pinning a time
   * and creating untouchable rest are different powers, and only the first is on offer.
   */
  it('never creates protected rest, however the item was confirmed', () => {
    const pinned = addItems(empty(), [parsed({ kind: 'rest', fixed: true })]).items[0]

    expect(pinned?.fixed).toBe(true)
    expect(pinned?.protectedRest).toBe(false)
  })

  /** A fixed class and a deadlined essay must not be collapsed into each other. */
  it('keeps a deadline movable rather than treating it as a pinned time', () => {
    const essay = addItems(empty(), [parsed({ deadlineDay: 4, fixed: false })]).items[0]

    expect(essay?.deadlineDay).toBe(4)
    expect(essay?.fixed).toBe(false)
  })
})
