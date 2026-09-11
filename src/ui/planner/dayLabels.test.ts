import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule } from '../../optimizer'
import { dayLabelsFor } from './dayLabels'

/**
 * Ruling 43: the horizon's days, named the way a student recognises them.
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
