import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule } from '../../optimizer'
import { calendarFor, dayLabelsFor } from './dayLabels'

/**
 * §43: the horizon's days, named the way a student recognises them.
 *
 * The chip asks which day an item lands on, and a `<select>` of "Day 0" through "Day 20"
 * is the modelling term, not the week. This is the translation, kept out of the chip
 * because the names depend on when the week started and the chip holds no week.
 */
const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

describe('the horizon, in a student\'s words', () => {
  it('gives one label per day of the horizon', () => {
    expect(dayLabelsFor(week({ startedOn: '2026-09-07' }), 0)).toHaveLength(HORIZON_DAYS)
  })

  it('names each day by its weekday and date', () => {
    const labels = dayLabelsFor(week({ startedOn: '2026-09-07' }), 0)

    // 2026-09-07 is a Monday.
    expect(labels[1]).toMatch(/Tue/)
    expect(labels[1]).toMatch(/8 Sep/)
  })

  /**
   * "Today" and "Tomorrow" are how a student refers to the two days they are most likely
   * to be adding something to, and both are answers a date alone does not give.
   */
  it('says today and tomorrow by name', () => {
    const labels = dayLabelsFor(week({ startedOn: '2026-09-07' }), 0)

    expect(labels[0]).toMatch(/^Today/)
    expect(labels[1]).toMatch(/^Tomorrow/)
  })

  it('moves today along as the week ages', () => {
    const labels = dayLabelsFor(week({ startedOn: '2026-09-07' }), 3)

    expect(labels[3]).toMatch(/^Today/)
    expect(labels[0]).not.toMatch(/^Today/)
  })

  /**
   * A week with no anchor is an ordinary state -- the seeded fortnight has never been
   * dated -- and the chip must still be able to ask its question. Day numbers are a worse
   * answer than dates and a much better one than a select that cannot render.
   */
  it('falls back to day numbers when the week has never been dated', () => {
    const labels = dayLabelsFor(week(), 0)

    expect(labels).toHaveLength(HORIZON_DAYS)
    expect(labels[0]).toMatch(/^Today/)
    expect(labels[2]).toMatch(/Day 3/)
  })
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
    expect(calendarFor(week({ startedOn: '2026-09-11' }), 0).startWeekday).toBe(5)
  })

  it('carries today, so a named weekday counts forward from the right place', () => {
    expect(calendarFor(week({ startedOn: '2026-09-11' }), 3).today).toBe(3)
  })

  it('names today in words a model can anchor on', () => {
    expect(calendarFor(week({ startedOn: '2026-09-11' }), 0).todayLabel).toMatch(/11 September 2026/)
  })

  it('moves the label along with today', () => {
    expect(calendarFor(week({ startedOn: '2026-09-11' }), 3).todayLabel).toMatch(/14 September 2026/)
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
