import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { editWarnings } from './editWarnings'

const item = (id: string, over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id,
  title: id,
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex: 3,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const week = (items: ScheduledItem[]): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const warn = (schedule: Schedule, candidate: ScheduledItem): string =>
  editWarnings({ schedule, item: candidate, params: DEFAULT_PARAMS }).join(' ')

describe('what a hand-placed block clashes with', () => {
  it('says nothing about a block with the day to itself', () => {
    expect(editWarnings({
      schedule: week([item('lab', { dayIndex: 1 })]),
      item: item('essay'),
      params: DEFAULT_PARAMS,
    })).toEqual([])
  })

  /**
   * `violations` deliberately permits two movable blocks on top of each other, because
   * rejecting that state would cut legal paths out of the search's neighbourhood. A student
   * who has just put two things at the same hour has made a real mistake, and the solver's
   * tolerance is not theirs -- which is the whole reason this module is not `violations`.
   */
  it('names the block it sits on top of', () => {
    const schedule = week([item('lab', { title: 'WIA3001 tutorial', startHour: 10 })])

    expect(warn(schedule, item('essay', { startHour: 9 }))).toContain('WIA3001 tutorial')
  })

  it('says a fixed block is one the week is built around', () => {
    const schedule = week([item('lab', { title: 'Lab', startHour: 10, fixed: true })])

    expect(warn(schedule, item('essay', { startHour: 9 }))).toMatch(/built around/i)
  })

  // Louder than an ordinary overlap, because it is a bigger thing to override (5.1).
  it('says protected rest is protected recovery', () => {
    const schedule = week([item('nap', { title: 'Rest', startHour: 10, protectedRest: true })])

    expect(warn(schedule, item('essay', { startHour: 9 }))).toMatch(/protected recovery/i)
  })

  it('never warns that a block clashes with its own former self', () => {
    const existing = item('essay', { startHour: 9 })

    expect(
      editWarnings({
        schedule: week([existing]),
        item: { ...existing, startHour: 10 },
        params: DEFAULT_PARAMS,
      }),
    ).toEqual([])
  })

  it('says when it lands past its own deadline', () => {
    expect(warn(week([]), item('essay', { dayIndex: 6, deadlineDay: 4 }))).toMatch(/deadline/i)
  })

  it('says when it runs past midnight', () => {
    expect(warn(week([]), item('essay', { startHour: 23, hours: 3 }))).toMatch(/past midnight/i)
  })

  it('says when the day would run past what the student can sustain', () => {
    const packed = Array.from({ length: 6 }, (_, index) =>
      item(`block-${index}`, { dayIndex: 3, startHour: index * 2, hours: 2 }),
    )

    expect(warn(week(packed), item('essay', { dayIndex: 3, startHour: 14 }))).toMatch(
      /hours of work/i,
    )
  })

  // Rest is what recovers from the load, not load the cap is capping -- the same predicate
  // `constraints.ts` applies to the solver's own daily limit.
  it('does not count rest towards the day’s working hours', () => {
    const naps = Array.from({ length: 8 }, (_, index) =>
      item(`nap-${index}`, { dayIndex: 3, startHour: index, hours: 1, kind: 'rest' }),
    )

    expect(warn(week(naps), item('essay', { dayIndex: 3, startHour: 20 }))).not.toMatch(
      /hours of work/i,
    )
  })
})
