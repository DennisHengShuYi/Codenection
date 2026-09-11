import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { localDateOf, readEvents } from './events'

// `null` rather than `undefined` for "no anchor": passing `undefined` to a parameter with a
// default triggers the default, so `week(undefined)` would quietly stay anchored and the
// test below would pass for the wrong reason.
const week = (startedOn: string | null = '2026-09-07'): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...(startedOn === null ? {} : { startedOn }),
})

/** A timed event as Google actually returns one. */
const timed = (over: Record<string, unknown> = {}) => ({
  id: 'evt-1',
  summary: 'WIA3001 lecture',
  start: { dateTime: '2026-09-09T09:00:00+08:00' },
  end: { dateTime: '2026-09-09T11:00:00+08:00' },
  ...over,
})

/**
 * The calendar boundary.
 *
 * Everything here arrives from outside and is treated the way every other outside input in
 * this codebase is: an event that does not fit the shape is dropped rather than guessed at.
 * §1.4's rule about a wrong class time silently poisoning every prediction applies with more
 * force here than to a photo, because a calendar import can bring in fifty rows at once.
 */
describe('localDateOf', () => {
  /**
   * The bug this function exists to prevent.
   *
   * Google returns the event's own offset. A 9pm event in Malaysia is
   * `2026-09-09T21:00:00+08:00`, which is 13:00 UTC on the same day -- fine. But an 8am
   * event is `2026-09-09T08:00:00+08:00`, which is `2026-09-09T00:00:00Z`, and a 7am one
   * rolls back to the *previous* UTC day. Reaching for `toISOString().split('T')[0]` puts a
   * Wednesday lecture on Tuesday, silently, for everybody east of Greenwich.
   */
  it('keeps an early-morning event on the day it is actually on', () => {
    expect(localDateOf('2026-09-09T07:00:00+08:00')).toBe('2026-09-09')
  })

  it('keeps a late-evening event on the day it is actually on', () => {
    expect(localDateOf('2026-09-09T23:30:00+08:00')).toBe('2026-09-09')
  })

  it('handles a timezone behind UTC too', () => {
    expect(localDateOf('2026-09-09T22:00:00-05:00')).toBe('2026-09-09')
  })

  it('reads a plain all-day date unchanged', () => {
    expect(localDateOf('2026-09-09')).toBe('2026-09-09')
  })

  it('refuses something that is not a date at all', () => {
    expect(localDateOf('next tuesday')).toBeNull()
  })
})

describe('readEvents', () => {
  it('reads a lecture into the shape the add flow already takes', () => {
    const [item] = readEvents([timed()], week())

    expect(item?.title).toBe('WIA3001 lecture')
    expect(item?.hours).toBe(2)
    expect(item?.deadlineDay).toBe(2)
  })

  /**
   * The one thing a calendar is genuinely authoritative about. Importing a 9am lecture and
   * letting placement put it at 19:00 throws away the only fact worth having.
   */
  it('keeps the hour the event actually starts at', () => {
    expect(readEvents([timed()], week())[0]?.startHour).toBe(9)
  })

  /** A timed calendar event is a commitment at a time -- which is what `fixed` means. */
  it('treats a timed event as pinned to its time', () => {
    expect(readEvents([timed()], week())[0]?.fixed).toBe(true)
  })

  /**
   * Ruling 21's horizon. `dayIndexFor` returns null both for "before the week" and "past the
   * horizon", and null means *undated* downstream -- `placeItems` would drop a lecture from
   * next month onto today + 2. Dropping it is the honest answer, and the screen says how
   * many were left out.
   */
  it('leaves out anything outside the fortnight', () => {
    const distant = timed({ start: { dateTime: '2026-12-01T09:00:00+08:00' }, end: { dateTime: '2026-12-01T10:00:00+08:00' } })

    expect(readEvents([distant], week())).toEqual([])
  })

  it('leaves out anything before the week started', () => {
    const past = timed({ start: { dateTime: '2026-08-01T09:00:00+08:00' }, end: { dateTime: '2026-08-01T10:00:00+08:00' } })

    expect(readEvents([past], week())).toEqual([])
  })

  /**
   * An all-day event has no hours and no start time, so a block made from one would carry an
   * invented duration at an invented hour. Kept, because a deadline on a calendar is real,
   * but flagged as something the app guessed at -- which is what `confident: false` means and
   * what the chip shows.
   */
  it('keeps an all-day event but does not pretend to know how long it takes', () => {
    const allDay = readEvents([timed({ start: { date: '2026-09-09' }, end: { date: '2026-09-10' } })], week())

    expect(allDay[0]?.confident).toBe(false)
    expect(allDay[0]?.fixed).toBe(false)
    // Null rather than absent: Ruling 43 made a stated hour a required answer, and "no time of
    // day" is a real answer to it rather than a missing one.
    expect(allDay[0]?.startHour).toBeNull()
  })

  it('is confident about an event it read exactly', () => {
    expect(readEvents([timed()], week())[0]?.confident).toBe(true)
  })

  /**
   * Recurrence is Google's job, not ours.
   *
   * The events endpoint asks for `singleEvents=true`, so a weekly class arrives as the
   * instances it really has -- the cancelled one already gone, the moved one already moved.
   * Reproducing that from an RRULE is work we would get wrong on the first cancelled
   * lecture, so each instance becomes its own row and Ruling 37's `suggestRepeat` is what offers
   * to turn a visible pattern into a series.
   */
  it('leaves recurrence to the instances Google already expanded', () => {
    const weekly = timed({ recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=WE'] })

    expect(readEvents([weekly], week())[0]?.repeat).toBeNull()
  })

  /** Every event carries the id it came from, so a second import can tell what it has
   *  already seen and a push knows what not to send back. */
  it('remembers which calendar event each item came from', () => {
    expect(readEvents([timed()], week())[0]?.sourceId).toBe('evt-1')
  })

  it.each([
    ['no summary', { summary: undefined }],
    ['no start', { start: undefined }],
    ['no end', { end: undefined }],
    ['a start that is not a date', { start: { dateTime: 'soon' } }],
    ['an end before its start', { end: { dateTime: '2026-09-09T08:00:00+08:00' } }],
  ])('drops an event with %s rather than guessing', (_name, over) => {
    expect(readEvents([timed(over)], week())).toEqual([])
  })

  it('drops anything that is not an object at all', () => {
    expect(readEvents([null, 'nope', 42], week())).toEqual([])
  })

  /** A cancelled event is not a commitment. */
  it('leaves out an event that has been cancelled', () => {
    expect(readEvents([timed({ status: 'cancelled' })], week())).toEqual([])
  })

  /**
   * A week with no real dates has nothing to map an event onto, and guessing would put a
   * whole timetable on the wrong days -- the same judgement `expandRecurring` makes.
   */
  it('reads nothing at all from a week that does not know when it started', () => {
    expect(readEvents([timed()], week(null))).toEqual([])
  })

  it('gives every item a distinct id', () => {
    const two = [timed(), timed({ id: 'evt-2', summary: 'Lab' })]

    expect(new Set(readEvents(two, week()).map((item) => item.id)).size).toBe(2)
  })

  it('reads an empty calendar as an empty week rather than an error', () => {
    expect(readEvents([], week())).toEqual([])
  })
})
