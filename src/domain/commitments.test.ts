import { describe, expect, it } from 'vitest'
import type { ParsedItem } from '../ai'
import { DEFAULT_PARAMS, HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { accept, lapsed, REVIEW_DAYS } from './commitments'

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

const item = (over: Partial<ParsedItem> = {}): ParsedItem => ({
  id: 'r1',
  title: 'FYP presentation help',
  type: 'mental',
  hours: 3,
  deadlineDay: 4,
  hard: false,
  confident: true,
  ...over,
})

describe('accept', () => {
  it('puts the commitment into the week', () => {
    expect(accept(week(), item(), 0).items).toHaveLength(1)
  })

  // §2.3: every acceptance carries a review date.
  it('remembers it with a review date', () => {
    const after = accept(week(), item(), 0)

    expect(after.commitments).toHaveLength(1)
    expect(after.commitments?.[0]?.reviewDay).toBe(REVIEW_DAYS)
  })

  it('names what was accepted, so a lapse can be explained rather than announced', () => {
    expect(accept(week(), item(), 0).commitments?.[0]?.title).toBe('FYP presentation help')
  })

  it('points at the item it created, so a lapse can remove the right one', () => {
    const after = accept(week(), item(), 0)

    expect(after.commitments?.[0]?.itemId).toBe(after.items[0]?.id)
  })

  it('keeps commitments already remembered', () => {
    const once = accept(week(), item(), 0)

    expect(accept(once, item({ id: 'r2' }), 0).commitments).toHaveLength(2)
  })

  it('does not modify the week it was given', () => {
    const before = week()
    const snapshot = JSON.stringify(before)

    accept(before, item(), 0)

    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

describe('lapsed', () => {
  it('finds nothing before the review date arrives', () => {
    expect(lapsed(accept(week(), item(), 0), 1, DEFAULT_PARAMS)).toEqual([])
  })

  /**
   * The direction-flip §2.3 is built on: saying no becomes the thing that happens by
   * itself, and staying in requires the act.
   */
  it('lapses a commitment the reserve can no longer hold', () => {
    const thin = week({ start: { mental: 10, physical: 10, social: 10, errands: 10 } })
    const accepted = accept(thin, item({ hours: 20 }), 0)

    expect(lapsed(accepted, REVIEW_DAYS, DEFAULT_PARAMS)).toHaveLength(1)
  })

  // The other direction, so a lapse means something when it happens.
  it('leaves one the reserve can still hold', () => {
    const accepted = accept(week(), item({ hours: 1 }), 0)

    expect(lapsed(accepted, REVIEW_DAYS, DEFAULT_PARAMS)).toEqual([])
  })

  it('finds nothing in a week with no commitments at all', () => {
    expect(lapsed(week(), 30, DEFAULT_PARAMS)).toEqual([])
  })

  /**
   * Weeks saved before this feature have no commitments field at all, and they must keep
   * loading. This is the test that makes "no migration needed" safe rather than merely
   * convenient -- a student who opened the app yesterday should not lose their week today.
   */
  it('handles a week saved before commitments existed', () => {
    const old = JSON.parse(JSON.stringify(week())) as Schedule

    expect(old.commitments).toBeUndefined()
    expect(() => lapsed(old, 30, DEFAULT_PARAMS)).not.toThrow()
    expect(lapsed(old, 30, DEFAULT_PARAMS)).toEqual([])
  })
})
