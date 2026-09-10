import { describe, expect, it } from 'vitest'
import type { ParsedItem } from '../ai'
import { HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { expandRecurring, looksRecurring } from './recurrence'

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

/**
 * §37: the same class, noticed rather than declared.
 *
 * If a student adds something and a similar-titled block already sits on the same weekday
 * at the same hour, that is a series they are typing out one instance at a time. Offering to
 * fill the horizon costs no new screen and no new input path -- and it is the best answer
 * available for part-time shifts, which arrive as photos in group chats and change week to
 * week, so they never come with the word "every" attached.
 */
describe('looksRecurring', () => {
  const block = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
    id: 'existing',
    title: 'WIA3001 lecture',
    type: 'mental',
    kind: 'studyBlock',
    hours: 2,
    intensity: 1,
    dayIndex: 1,
    startHour: 9,
    fixed: true,
    deadlineDay: null,
    protectedRest: false,
    ...over,
  })

  const anchored = (items: ScheduledItem[]) => ({ ...week('2026-09-07'), items })

  it('spots the same class a week later at the same hour', () => {
    const existing = anchored([block({ dayIndex: 1, startHour: 9 })])

    expect(looksRecurring(parsed({ deadlineDay: 8 }), existing, 9)).toBe(true)
  })

  it('says nothing about a different day of the week', () => {
    const existing = anchored([block({ dayIndex: 1, startHour: 9 })])

    expect(looksRecurring(parsed({ deadlineDay: 9 }), existing, 9)).toBe(false)
  })

  it('says nothing about the same weekday at a different hour', () => {
    const existing = anchored([block({ dayIndex: 1, startHour: 9 })])

    expect(looksRecurring(parsed({ deadlineDay: 8 }), existing, 14)).toBe(false)
  })

  /** The title is what makes it the same thing rather than a coincidence of timetabling. */
  it('says nothing about an unrelated block that happens to share the slot', () => {
    const existing = anchored([block({ title: 'Gym', dayIndex: 1, startHour: 9 })])

    expect(looksRecurring(parsed({ deadlineDay: 8 }), existing, 9)).toBe(false)
  })

  it('is not fooled by capitals or stray spacing', () => {
    const existing = anchored([block({ title: '  wia3001 LECTURE ', dayIndex: 1, startHour: 9 })])

    expect(looksRecurring(parsed({ deadlineDay: 8 }), existing, 9)).toBe(true)
  })

  it('says nothing about an undated item, which has no weekday to match', () => {
    const existing = anchored([block({ dayIndex: 1, startHour: 9 })])

    expect(looksRecurring(parsed({ deadlineDay: null }), existing, 9)).toBe(false)
  })

  it('says nothing when the week does not know what day it starts on', () => {
    expect(looksRecurring(parsed({ deadlineDay: 8 }), { ...week(), items: [block()] }, 9)).toBe(false)
  })

  /** Something already declared as repeating needs no offer. */
  it('says nothing about an item that already repeats', () => {
    const existing = anchored([block({ dayIndex: 1, startHour: 9 })])
    const already = parsed({ deadlineDay: 8, repeat: { weekdays: [2], untilDay: null } })

    expect(looksRecurring(already, existing, 9)).toBe(false)
  })
})
