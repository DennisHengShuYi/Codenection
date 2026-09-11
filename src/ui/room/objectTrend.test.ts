import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import { objectTrend, trendPhrase } from './objectTrend'

const block = (id: string, dayIndex: number, hours: number): ScheduledItem => ({
  id,
  title: id,
  type: 'mental',
  kind: 'studyBlock',
  hours,
  intensity: 1,
  dayIndex,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
})

const week = (items: readonly ScheduledItem[]): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const STUDY = ['studyBlock'] as const

/**
 * The trend the Today panel puts on each room object, which is the one part of Loadline's
 * "load, contributing factors, and trends" that nothing answered.
 *
 * Forward-looking on purpose: the panel is about today, and what a capacity app is for is
 * saying what is coming before it arrives. A backward window would describe a week the
 * student has already lived and cannot change.
 */
describe('objectTrend', () => {
  it('reads growing load across today and the next two days', () => {
    const schedule = week([block('a', 0, 1), block('b', 1, 2), block('c', 2, 4)])

    expect(objectTrend(schedule, 0, STUDY, 'hours')).toBe('rising')
  })

  it('reads easing load', () => {
    const schedule = week([block('a', 0, 4), block('b', 1, 2), block('c', 2, 1)])

    expect(objectTrend(schedule, 0, STUDY, 'hours')).toBe('falling')
  })

  /** The answer that suppresses the phrase entirely, so it is stated as its own case rather
   *  than left to fall out of the others. */
  it('reads an even three days as flat', () => {
    const schedule = week([block('a', 0, 2), block('b', 1, 2), block('c', 2, 2)])

    expect(objectTrend(schedule, 0, STUDY, 'hours')).toBe('flat')
  })

  it('reads a day with nothing on it either side as flat', () => {
    expect(objectTrend(week([]), 0, STUDY, 'hours')).toBe('flat')
  })

  /** Half an hour more a day is scheduling noise. `trendOf`'s reserve default of 1.5 would go
   *  further and call two hours becoming three and a quarter flat, which is a whole block. */
  it('ignores a change too small to mean anything in hours', () => {
    const schedule = week([block('a', 0, 2), block('b', 1, 2.2), block('c', 2, 2.4)])

    expect(objectTrend(schedule, 0, STUDY, 'hours')).toBe('flat')
  })

  /** Boxes are counted, not timed -- one errand is one box whatever it takes -- so a count has
   *  not moved until a whole extra thing appears. */
  it('counts things rather than hours when the unit is a count', () => {
    const oneMore = week([block('a', 0, 3), block('b', 1, 3), block('c', 2, 3), block('d', 2, 3)])

    expect(objectTrend(oneMore, 0, STUDY, 'count')).toBe('rising')
  })

  /**
   * The horizon's last day has nothing ahead of it to compare against.
   *
   * Worth having rather than assuming: the first implementation padded the window to three
   * days with days *past* the horizon, which hold nothing because they are not days -- so a
   * four-hour final day read as falling against two phantom zeroes.
   */
  it('is flat at the end of the horizon, where there is nothing ahead', () => {
    const schedule = week([block('a', HORIZON_DAYS - 1, 4)])

    expect(objectTrend(schedule, HORIZON_DAYS - 1, STUDY, 'hours')).toBe('flat')
  })

  /** One day from the end there are two real days, and two is enough to have a direction. */
  it('still reads a direction from the two real days before the horizon ends', () => {
    const schedule = week([block('a', HORIZON_DAYS - 2, 1), block('b', HORIZON_DAYS - 1, 4)])

    expect(objectTrend(schedule, HORIZON_DAYS - 2, STUDY, 'hours')).toBe('rising')
  })
})

describe('trendPhrase', () => {
  it('says nothing at all when flat, so a row with no reading carries no claim', () => {
    expect(trendPhrase('flat', 'hours')).toBeNull()
    expect(trendPhrase('flat', 'count')).toBeNull()
    expect(trendPhrase('flat', 'room')).toBeNull()
  })

  /**
   * "picking up" rather than "more coming", and that was decided by looking at the screen
   * rather than by reasoning: on a row whose number reads "nothing today", "more coming"
   * claims more than something when there is nothing yet. This reads from zero and from four
   * hours alike.
   */
  it('names more and less time in the student own terms', () => {
    expect(trendPhrase('rising', 'hours')).toBe('picking up')
    expect(trendPhrase('falling', 'hours')).toBe('easing off')
  })

  it('speaks in things for a counted row', () => {
    expect(trendPhrase('rising', 'count')).toBe('piling up')
    expect(trendPhrase('falling', 'count')).toBe('clearing')
  })

  /**
   * Rest is the one row the room deliberately draws no object for, because it "is not a duty
   * you owe anyone". So its phrase describes room available and never a shortfall -- and the
   * vocabulary of instruction is forbidden rather than merely avoided, so the rule survives
   * the next person rewording it.
   */
  it('describes rest as room available, never as a shortfall', () => {
    expect(trendPhrase('rising', 'room')).toBe('more room than usual')
    expect(trendPhrase('falling', 'room')).toBe('less room ahead')

    for (const phrase of [trendPhrase('rising', 'room'), trendPhrase('falling', 'room')]) {
      expect(phrase).not.toMatch(/should|need|must|try to/i)
    }
  })
})
