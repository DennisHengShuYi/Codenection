import { describe, expect, it } from 'vitest'
import type { ParsedItem } from '../ai'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { expandRecurring } from './recurrence'

const week = (startedOn?: string): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...(startedOn === undefined ? {} : { startedOn }),
})

const parsed = (over: Partial<ParsedItem> = {}): ParsedItem => ({
  id: 'a',
  title: 'WIA3001 lecture',
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  deadlineDay: null,
  fixed: true,
  confident: true,
  repeat: null,
  ...over,
})

/**
 * §38: recurrence is expanded at entry and never stored as a rule.
 *
 * One weekly class becomes three items across the 21-day horizon, exactly as the `umWeek`
 * fixture already hand-writes them. The engine takes a flat list by design, the horizon is
 * short enough that recurrence never compounds, and no consumer downstream needs to learn
 * that recurrence exists at all.
 */
describe('expandRecurring', () => {
  // 2026-09-07 is a Monday, so day 0 is Monday and Tuesday is day 1.
  const anchored = week('2026-09-07')

  it('leaves a one-off alone', () => {
    expect(expandRecurring(parsed(), anchored, 0)).toHaveLength(1)
  })

  it('fills the horizon with a weekly class', () => {
    const expanded = expandRecurring(parsed({ repeat: { weekdays: [2], untilDay: null } }), anchored, 0)

    expect(expanded).toHaveLength(3)
    expect(expanded.map((item) => item.deadlineDay)).toEqual([1, 8, 15])
  })

  it('handles a class that meets twice a week', () => {
    const expanded = expandRecurring(
      parsed({ repeat: { weekdays: [2, 4], untilDay: null } }),
      anchored,
      0,
    )

    expect(expanded.map((item) => item.deadlineDay)).toEqual([1, 3, 8, 10, 15, 17])
  })

  /** §40: an end date, for semester break. Nothing monthly, nothing fortnightly, no rules. */
  it('stops at the end of the series', () => {
    const expanded = expandRecurring(
      parsed({ repeat: { weekdays: [2], untilDay: 9 } }),
      anchored,
      0,
    )

    expect(expanded.map((item) => item.deadlineDay)).toEqual([1, 8])
  })

  it('never reaches past the horizon', () => {
    const expanded = expandRecurring(
      parsed({ repeat: { weekdays: [1, 2, 3, 4, 5], untilDay: null } }),
      anchored,
      0,
    )

    for (const item of expanded) {
      expect(item.deadlineDay).toBeLessThan(HORIZON_DAYS)
      expect(item.deadlineDay).toBeGreaterThanOrEqual(0)
    }
  })

  it('never puts an instance in the past', () => {
    const expanded = expandRecurring(
      parsed({ repeat: { weekdays: [2], untilDay: null } }),
      anchored,
      10,
    )

    for (const item of expanded) expect(item.deadlineDay).toBeGreaterThanOrEqual(10)
  })

  /**
   * §39: one field, and it buys the three operations expansion otherwise makes painful --
   * cancel just this Tuesday, this class has ended, it moved to Thursday. Without it,
   * dropping a module means deleting three items one at a time.
   */
  it('marks every instance as belonging to one series', () => {
    const expanded = expandRecurring(parsed({ repeat: { weekdays: [2], untilDay: null } }), anchored, 0)
    const ids = new Set(expanded.map((item) => item.seriesId))

    expect(ids.size).toBe(1)
    expect([...ids][0]).toBeTruthy()
  })

  it('gives a one-off no series at all', () => {
    expect(expandRecurring(parsed(), anchored, 0)[0]?.seriesId).toBeUndefined()
  })

  it('gives every instance its own id', () => {
    const expanded = expandRecurring(parsed({ repeat: { weekdays: [2], untilDay: null } }), anchored, 0)

    expect(new Set(expanded.map((item) => item.id)).size).toBe(expanded.length)
  })

  it('carries the title, hours, kind and pin across to every instance', () => {
    const expanded = expandRecurring(
      parsed({ repeat: { weekdays: [2], untilDay: null }, hours: 3, fixed: true }),
      anchored,
      0,
    )

    for (const item of expanded) {
      expect(item.title).toBe('WIA3001 lecture')
      expect(item.hours).toBe(3)
      expect(item.kind).toBe('studyBlock')
      expect(item.fixed).toBe(true)
    }
  })

  /**
   * A week with no anchor has no weekdays to expand against, and guessing which real day
   * "Tuesday" means would put a whole semester of classes on the wrong days -- silently.
   */
  it('refuses to expand a week that does not know what day it starts on', () => {
    const expanded = expandRecurring(
      parsed({ repeat: { weekdays: [2], untilDay: null } }),
      week(),
      0,
    )

    expect(expanded).toHaveLength(1)
    expect(expanded[0]?.seriesId).toBeUndefined()
  })

  it('refuses a repeat that names no days', () => {
    const expanded = expandRecurring(parsed({ repeat: { weekdays: [], untilDay: null } }), anchored, 0)

    expect(expanded).toHaveLength(1)
  })
})
