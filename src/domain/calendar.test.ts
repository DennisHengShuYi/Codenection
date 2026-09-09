import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { anchorTo, dateFor, dayIndexFor, isAnchored, todayIndex } from './calendar'

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

const at = (iso: string) => new Date(`${iso}T09:00:00Z`)

/**
 * The date anchor the app has been missing.
 *
 * Everything in this model is a day *index* -- day 0 is "now" -- which works right up until
 * something has to survive the app being closed and reopened. Two features hit that wall
 * independently: §8.1's predictions cannot resolve without knowing which real day they were
 * about, and the chat channel cannot answer "what did I do yesterday" at all.
 *
 * The clock is injected rather than read here, so this stays pure and the engine's own
 * purity rule is untouched.
 */
describe('anchorTo', () => {
  it('records the day the week began', () => {
    expect(anchorTo(week(), at('2026-09-09')).startedOn).toBe('2026-09-09')
  })

  it('does not modify the week it was given', () => {
    const before = week()
    const snapshot = JSON.stringify(before)

    anchorTo(before, at('2026-09-09'))

    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('re-anchoring moves the week rather than stacking anchors', () => {
    const once = anchorTo(week(), at('2026-09-09'))

    expect(anchorTo(once, at('2026-09-12')).startedOn).toBe('2026-09-12')
  })
})

describe('isAnchored', () => {
  /**
   * Weeks saved before this existed have no anchor, and must keep working. Everything that
   * reads a date has to cope with not having one rather than assuming today.
   */
  it('is false for a week saved before anchoring existed', () => {
    expect(isAnchored(week())).toBe(false)
  })

  it('is true once anchored', () => {
    expect(isAnchored(anchorTo(week(), at('2026-09-09')))).toBe(true)
  })

  it('is false for an anchor that is not a real date', () => {
    expect(isAnchored(week({ startedOn: 'not-a-date' }))).toBe(false)
  })
})

describe('todayIndex', () => {
  it('is zero on the day the week began', () => {
    const anchored = anchorTo(week(), at('2026-09-09'))

    expect(todayIndex(anchored, at('2026-09-09'))).toBe(0)
  })

  it('counts days forward', () => {
    const anchored = anchorTo(week(), at('2026-09-09'))

    expect(todayIndex(anchored, at('2026-09-12'))).toBe(3)
  })

  it('crosses a month boundary correctly', () => {
    const anchored = anchorTo(week(), at('2026-09-30'))

    expect(todayIndex(anchored, at('2026-10-02'))).toBe(2)
  })

  // Someone who reopens the app after the fortnight is over is not on day 40 of it.
  it('is null once the week is behind them', () => {
    const anchored = anchorTo(week(), at('2026-09-09'))

    expect(todayIndex(anchored, at('2026-11-01'))).toBeNull()
  })

  it('is null for a week with no anchor at all', () => {
    expect(todayIndex(week(), at('2026-09-09'))).toBeNull()
  })

  // A clock set backwards, or a week anchored in the future.
  it('is null for a day before the week began', () => {
    const anchored = anchorTo(week(), at('2026-09-09'))

    expect(todayIndex(anchored, at('2026-09-01'))).toBeNull()
  })
})

describe('dateFor', () => {
  it('names the real date a day index falls on', () => {
    const anchored = anchorTo(week(), at('2026-09-09'))

    expect(dateFor(anchored, 3)).toBe('2026-09-12')
  })

  it('is null without an anchor', () => {
    expect(dateFor(week(), 3)).toBeNull()
  })

  it('is null outside the horizon, rather than inventing a date past the week', () => {
    const anchored = anchorTo(week(), at('2026-09-09'))

    expect(dateFor(anchored, HORIZON_DAYS + 1)).toBeNull()
    expect(dateFor(anchored, -1)).toBeNull()
  })
})

describe('dayIndexFor', () => {
  it('turns a real date back into a day index', () => {
    const anchored = anchorTo(week(), at('2026-09-09'))

    expect(dayIndexFor(anchored, '2026-09-12')).toBe(3)
  })

  it('round-trips with dateFor', () => {
    const anchored = anchorTo(week(), at('2026-09-09'))
    const date = dateFor(anchored, 5)

    expect(date).not.toBeNull()
    expect(dayIndexFor(anchored, date ?? '')).toBe(5)
  })

  it('is null for a date outside the week', () => {
    const anchored = anchorTo(week(), at('2026-09-09'))

    expect(dayIndexFor(anchored, '2026-12-25')).toBeNull()
  })

  it('is null for something that is not a date', () => {
    const anchored = anchorTo(week(), at('2026-09-09'))

    expect(dayIndexFor(anchored, 'yesterday')).toBeNull()
  })
})
