import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { sleepForecastLine, squeezeOn } from './sleepForecast'

let seq = 0
const item = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: `i${(seq += 1)}`,
  title: 'Essay',
  kind: 'studyBlock',
  type: 'mental',
  dayIndex: 0,
  startHour: 9,
  hours: 4,
  intensity: 1,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const week = (items: readonly ScheduledItem[]): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 8),
})

/** Sixteen waking hours, so four five-hour blocks overflow the day by four. */
const overloaded = (deadlineDay: number | null): Schedule =>
  week([
    item({ hours: 5, deadlineDay }),
    item({ hours: 5, deadlineDay }),
    item({ hours: 5, deadlineDay }),
    item({ hours: 5, deadlineDay }),
  ])

describe('squeezeOn', () => {
  it('finds no squeeze on a day that fits', () => {
    expect(squeezeOn(week([item({ hours: 4 })]), 0).hours).toBe(0)
  })

  it('measures the hours a day asks for past the end of it', () => {
    expect(squeezeOn(overloaded(0), 0).hours).toBe(4)
  })

  /** The student's own condition: an over-full day AND something actually due. An over-full
   *  day with nothing due is a bad plan, not a deadline eating a night. */
  it('reports whether a real deadline falls on the day', () => {
    expect(squeezeOn(overloaded(0), 0).deadlineToday).toBe(true)
    expect(squeezeOn(overloaded(null), 0).deadlineToday).toBe(false)
  })

  /**
   * Real deadlines only. `softDeadlines.ts` warns in its own docstring that synthetic
   * deadlines must never reach a stress path -- it "would model a student dreading having to
   * relax" -- and an overdue walk is not a reason to tell somebody they will lose sleep.
   *
   * Without this case the obvious implementation, asking for the *effective* deadline, passes
   * everything else here and is wrong.
   */
  it('ignores a soft deadline', () => {
    const soft = week([
      item({ hours: 5, deadlineDay: null, softDeadlineDay: 0 }),
      item({ hours: 5 }),
      item({ hours: 5 }),
      item({ hours: 5 }),
    ])

    expect(squeezeOn(soft, 0).hours).toBe(4)
    expect(squeezeOn(soft, 0).deadlineToday).toBe(false)
  })

  it('is zero past the end of the fortnight rather than erroring', () => {
    expect(squeezeOn(week([]), HORIZON_DAYS + 3).hours).toBe(0)
  })
})

describe('sleepForecastLine', () => {
  it('says nothing when the day fits', () => {
    expect(sleepForecastLine(squeezeOn(week([item({ hours: 4 })]), 0), 'Thursday')).toBeNull()
  })

  it('names the day and the cost when a deadline drives it', () => {
    expect(sleepForecastLine(squeezeOn(overloaded(0), 0), 'Thursday')).toBe(
      "Thursday's deadline will cost you about 4 hours of sleep.",
    )
  })

  /** An over-full day with nothing due still costs sleep, and still gets said -- without
   *  blaming a deadline that does not exist. */
  it('says a day is over-full without inventing a deadline', () => {
    expect(sleepForecastLine(squeezeOn(overloaded(null), 0), 'Thursday')).toBe(
      'Thursday asks for about 4 hours more than the day has.',
    )
  })

  /**
   * The singular branch, which exists only to stop "1 hours" reaching a student. Found by
   * coverage rather than by thinking about it, and worth a case of its own precisely because
   * nothing else would ever exercise it: one hour of spill is a narrow band, and the wording
   * bug it guards against is the kind a reader notices immediately and a test never does.
   */
  it('says one hour in the singular', () => {
    const oneOver = week([
      item({ hours: 5, deadlineDay: 0 }),
      item({ hours: 5 }),
      item({ hours: 5 }),
      item({ hours: 2 }),
    ])

    expect(sleepForecastLine(squeezeOn(oneOver, 0), 'Thursday')).toBe(
      "Thursday's deadline will cost you about 1 hour of sleep.",
    )
  })

  /** The threshold in both directions. Half an hour is a day running slightly long rather
   *  than a night being eaten, and a test on only one side of a boundary pins nothing. */
  it('speaks at half an hour and stays quiet below it', () => {
    const spill = (hours: number) => week([item({ hours: 16 + hours })])

    expect(sleepForecastLine(squeezeOn(spill(0.5), 0), 'Thursday')).not.toBeNull()
    expect(sleepForecastLine(squeezeOn(spill(0.4), 0), 'Thursday')).toBeNull()
  })

  /**
   * A forecast, never a record. Nothing here writes, and the whole reason is that the app
   * never observed the night -- so a sentence in the past tense would undo that decision in
   * copy while the code still looked right.
   */
  it('speaks about a night ahead, not one it claims to have seen', () => {
    for (const deadline of [0, null]) {
      const line = sleepForecastLine(squeezeOn(overloaded(deadline), 0), 'Thursday') ?? ''

      expect(line).not.toBe('')
      expect(line).toMatch(/will cost|asks for/)
      expect(line).not.toMatch(/you slept|did sleep|last night/i)
    }
  })
})
