import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { anchorTo, calendarFor, dateFor, dayIndexFor, isAnchored, todayIndex } from './calendar'

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

/**
 * §9 is Malaysia-specific, which makes UTC+8 the case that matters -- and the one the
 * helper above never reaches. `at()` samples 09:00Z, five in the afternoon in Kuala
 * Lumpur, so every test in this file has always asked about an hour where the local date
 * and the UTC date agree.
 *
 * They disagree for the first eight hours of every Malaysian day: local 02:00 on the 11th
 * is 18:00Z on the 10th. A "today" derived from `toISOString()` reads the UTC date, so it
 * named yesterday all night, every night, and anchored a week begun after midnight to the
 * day before it started.
 *
 * The zone is passed rather than read from the runtime so these stay pure and pin the
 * behaviour on any machine, whatever its own clock is set to.
 */
const KL = 'Asia/Kuala_Lumpur'

/** 02:00 local in Kuala Lumpur, which is the previous calendar day in UTC. */
const earlyMorningKL = (iso: string) => new Date(`${iso}T02:00:00+08:00`)

describe('local rather than UTC days', () => {
  it('names the local day in the eight hours after midnight, not the UTC one', () => {
    const anchored = anchorTo(week(), at('2026-09-09'))

    expect(todayIndex(anchored, earlyMorningKL('2026-09-11'), KL)).toBe(2)
  })

  it('anchors a week begun after midnight to the day it actually began', () => {
    expect(anchorTo(week(), earlyMorningKL('2026-09-11'), KL).startedOn).toBe('2026-09-11')
  })

  it('still agrees with UTC at an hour where the two do not differ', () => {
    const anchored = anchorTo(week(), at('2026-09-09'), KL)

    expect(anchored.startedOn).toBe('2026-09-09')
    expect(todayIndex(anchored, at('2026-09-12'), KL)).toBe(3)
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

/** §44's anchor, moved here with `calendarFor` itself: the Telegram door needs it as much
 *  as the add sheet does, and a UI module is not somewhere `src/telegram` can import from. */
const dated = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

/**
 * §44: which real day the horizon's day 0 is, for the readers rather than for the screen.
 *
 * The rules parser computed a named weekday from `today % 7` -- as if day 0 were always a
 * Sunday -- and the model was told "day 0 is today" without being told what today was. Both
 * therefore put "gym thursday" on whatever day fell out, and §43's Day select is what
 * finally showed the student.
 */
describe('the calendar handed to the readers', () => {
  it('says which weekday day 0 actually is', () => {
    // 2026-09-11 is a Friday.
    expect(calendarFor(dated({ startedOn: '2026-09-11' }), 0).startWeekday).toBe(5)
  })

  it('carries today, so a named weekday counts forward from the right place', () => {
    expect(calendarFor(dated({ startedOn: '2026-09-11' }), 3).today).toBe(3)
  })

  it('names today in words a model can anchor on', () => {
    expect(calendarFor(dated({ startedOn: '2026-09-11' }), 0).todayLabel).toMatch(/11 September 2026/)
  })

  it('moves the label along with today', () => {
    expect(calendarFor(dated({ startedOn: '2026-09-11' }), 3).todayLabel).toMatch(/14 September 2026/)
  })

  /**
   * A week that has never been dated has no honest anchor, and inventing one would put a
   * stated weekday on a day chosen by nothing. Both readers fall back to what they did
   * before, which is the behaviour this week has always had.
   */
  it('offers no label for a week that has never been dated', () => {
    expect(calendarFor(week(), 0).todayLabel).toBeUndefined()
  })
})
