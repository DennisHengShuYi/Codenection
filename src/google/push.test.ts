import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import {
  BLOCK_MARKER,
  CALENDAR_NAME,
  calendarEventBody,
  ourCalendarId,
  plannedEvents,
  pushPlan,
} from './push'

const block = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'b1',
  title: 'FYP writing',
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex: 0,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

// `null` rather than `undefined` for "no anchor": passing `undefined` explicitly would
// trigger the default parameter and quietly anchor the very week the test is about.
const week = (items: ScheduledItem[], startedOn: string | null = '2026-09-11'): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...(startedOn === null ? {} : { startedOn }),
})

/**
 * What would be written to the calendar, computed away from anything that can write.
 *
 * Pure for one reason above all: the summary the student is shown before they press the
 * button is produced by this function, and the events that are actually written are
 * produced by this function, so the two cannot drift. A screen that says "12 blocks" and
 * an endpoint that writes 14 is exactly the kind of quiet mismatch that makes somebody
 * stop trusting the feature.
 */
describe('plannedEvents', () => {
  it('turns a block into an event on its real date, at the hour it was placed', () => {
    expect(plannedEvents(week([block()]), 0)).toEqual([
      {
        blockId: 'b1',
        summary: 'FYP writing',
        startsAt: '2026-09-11T09:00:00',
        endsAt: '2026-09-11T11:00:00',
      },
    ])
  })

  /**
   * No anchor means no real dates, and the app genuinely does not know which day is which
   * -- a week saved before anchoring existed has none. Guessing today would write somebody
   * a fortnight of events on the wrong dates, in their real calendar, which they would then
   * have to delete by hand.
   */
  it('writes nothing at all for a week with no real dates', () => {
    expect(plannedEvents(week([block()], null), 0)).toEqual([])
  })

  /**
   * The one that stops the feature eating itself. A block read from Google and pushed back
   * appears twice in the calendar it came from; the next import reads both, places both,
   * and the next push writes four.
   */
  it('never sends a block back to the calendar it was read from', () => {
    const events = plannedEvents(week([block({ sourceId: 'gcal-evt-1' }), block({ id: 'b2' })]), 0)

    expect(events.map((event) => event.blockId)).toEqual(['b2'])
  })

  /** The past is not rewritten. Yesterday already happened, however it actually went, and
   *  an event written into it now says nothing true. */
  it('leaves the days before today alone', () => {
    const events = plannedEvents(week([block({ dayIndex: 1 }), block({ id: 'b2', dayIndex: 4 })]), 3)

    expect(events.map((event) => event.blockId)).toEqual(['b2'])
  })

  it('starts from today itself, not tomorrow', () => {
    expect(plannedEvents(week([block({ dayIndex: 3 })]), 3)).toHaveLength(1)
  })

  it('handles a block that does not run for a whole number of hours', () => {
    expect(plannedEvents(week([block({ hours: 1.5, startHour: 14 })]), 0)[0]).toMatchObject({
      startsAt: '2026-09-11T14:00:00',
      endsAt: '2026-09-11T15:30:00',
    })
  })

  /**
   * An event Google would read as ending on the following day, when the block is placed
   * late and runs long. Ending it at the last minute of its own day keeps it on the day the
   * app placed it -- the alternative writes a block onto a day the student never chose.
   */
  it('keeps a late block inside the day it was placed on', () => {
    expect(plannedEvents(week([block({ startHour: 22, hours: 4 })]), 0)[0]?.endsAt).toBe(
      '2026-09-11T23:59:00',
    )
  })

  it('crosses into the next month correctly', () => {
    expect(plannedEvents(week([block({ dayIndex: 20 })], '2026-09-11'), 0)[0]?.startsAt).toBe(
      '2026-10-01T09:00:00',
    )
  })

  /** So the summary reads as a week rather than as whatever order the optimizer left the
   *  items in. */
  it('reads in the order the week happens', () => {
    const events = plannedEvents(
      week([
        block({ id: 'late', dayIndex: 2, startHour: 15 }),
        block({ id: 'early', dayIndex: 2, startHour: 8 }),
        block({ id: 'first', dayIndex: 0, startHour: 20 }),
      ]),
      0,
    )

    expect(events.map((event) => event.blockId)).toEqual(['first', 'early', 'late'])
  })

  it('drops a block sitting outside the horizon rather than dating it wrongly', () => {
    expect(plannedEvents(week([block({ dayIndex: HORIZON_DAYS + 2 })]), 0)).toEqual([])
  })

  /** Protected rest is pushed like anything else. It is the part of the week most likely to
   *  be given away to somebody who can see the calendar and not the reason. */
  it('pushes protected rest too', () => {
    const events = plannedEvents(week([block({ protectedRest: true, title: 'Sleep' })]), 0)

    expect(events[0]?.summary).toBe('Sleep')
  })
})

/**
 * The dedicated calendar, found among whatever else the student keeps.
 *
 * The safeguard the whole write side rests on: this app writes only to a calendar it
 * created itself. It cannot touch a shared work or family calendar, cannot modify an event
 * it did not write, and switching the feature off is one deletion of one calendar.
 */
describe('ourCalendarId', () => {
  it('finds the calendar this app made', () => {
    const list = [
      { id: 'primary-abc', summary: 'ada@um.edu.my', primary: true },
      { id: 'ours-xyz', summary: CALENDAR_NAME },
    ]

    expect(ourCalendarId(list)).toBe('ours-xyz')
  })

  it('says there is none rather than falling back to the primary calendar', () => {
    expect(ourCalendarId([{ id: 'primary-abc', summary: 'ada@um.edu.my', primary: true }])).toBeNull()
  })

  /**
   * A calendar the student named "Codenection" themselves is not one this app may write to,
   * and their primary calendar is the one thing the whole design exists to keep out of.
   */
  it('never answers with the primary calendar, whatever it is called', () => {
    expect(ourCalendarId([{ id: 'theirs', summary: CALENDAR_NAME, primary: true }])).toBeNull()
  })

  it('copes with a list that is not a list of calendars', () => {
    expect(ourCalendarId(undefined)).toBeNull()
    expect(ourCalendarId([{ summary: CALENDAR_NAME }, 'nonsense', null])).toBeNull()
  })
})

describe('calendarEventBody', () => {
  const event = {
    blockId: 'b1',
    summary: 'FYP writing',
    startsAt: '2026-09-11T09:00:00',
    endsAt: '2026-09-11T11:00:00',
  }

  it('sends the local wall clock with the zone beside it, never an offset of its own', () => {
    expect(calendarEventBody(event, 'Asia/Kuala_Lumpur')).toMatchObject({
      summary: 'FYP writing',
      start: { dateTime: '2026-09-11T09:00:00', timeZone: 'Asia/Kuala_Lumpur' },
      end: { dateTime: '2026-09-11T11:00:00', timeZone: 'Asia/Kuala_Lumpur' },
    })
  })

  /**
   * The marker is what makes a second push an update rather than a duplicate, and it is
   * also what stops this app touching anything it did not write. An event without it is
   * somebody else's, even inside our own calendar.
   */
  it('marks the event with the block it came from', () => {
    expect(calendarEventBody(event, 'UTC').extendedProperties).toEqual({
      private: { [BLOCK_MARKER]: 'b1' },
    })
  })
})

/**
 * What to write, what to change, and what to take away, decided here rather than in the
 * endpoint, so the count the student is shown is the count that happens.
 */
describe('pushPlan', () => {
  const event = (blockId: string) => ({
    blockId,
    summary: blockId,
    startsAt: '2026-09-11T09:00:00',
    endsAt: '2026-09-11T10:00:00',
  })

  it('creates what is not there yet', () => {
    const plan = pushPlan([event('b1')], [])

    expect(plan.create.map((one) => one.blockId)).toEqual(['b1'])
    expect(plan.update).toEqual([])
    expect(plan.remove).toEqual([])
  })

  /** A second push must not double the week. The marker written the first time is what
   *  makes the same block resolve to the same event. */
  it('updates the event a block already has rather than adding a second', () => {
    const plan = pushPlan([event('b1')], [{ id: 'gcal-1', blockId: 'b1' }])

    expect(plan.create).toEqual([])
    expect(plan.update).toEqual([{ id: 'gcal-1', event: event('b1') }])
  })

  /** A block deleted or rescheduled out of the horizon leaves an event behind. Left there,
   *  the calendar slowly fills with a plan that is no longer the plan. */
  it('takes away an event whose block is gone from the week', () => {
    const plan = pushPlan([], [{ id: 'gcal-1', blockId: 'gone' }])

    expect(plan.remove).toEqual(['gcal-1'])
  })

  /** Nothing without our marker is ever touched, even inside our own calendar, since a
   *  student may well have put something in it by hand. */
  it('leaves an unmarked event alone', () => {
    const plan = pushPlan([], [{ id: 'by-hand', blockId: null }])

    expect(plan.remove).toEqual([])
  })
})
