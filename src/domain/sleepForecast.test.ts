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
  const bite = (hours: number, blocks: readonly ScheduledItem[] = [], deadlineToday = false) => ({
    hours,
    blocks,
    deadlineToday,
  })

  it('says nothing when the night is untouched and the day fits', () => {
    expect(sleepForecastLine(bite(0), squeezeOn(week([item({ hours: 4 })]), 0), 'Today')).toBeNull()
  })

  /**
   * The certain claim, and it names the block. "Your essay runs past bedtime" is something a
   * student can act on; "this day asks for more than it has" is arithmetic they cannot.
   */
  it('names the block that is actually booked over the night', () => {
    const essay = item({ title: 'Ethics essay', startHour: 22, hours: 3 })

    expect(sleepForecastLine(bite(2, [essay]), squeezeOn(week([essay]), 0), 'Today')).toBe(
      'Today: Ethics essay runs past bedtime — about 2 hours off that night.',
    )
  })

  /** The deadline explains why it cannot simply be moved, so it is worth a clause. */
  it('says when the block is also due', () => {
    const essay = item({ title: 'Ethics essay', startHour: 22, hours: 3, deadlineDay: 0 })

    expect(sleepForecastLine(bite(2, [essay], true), squeezeOn(week([essay]), 0), 'Today')).toBe(
      'Today: Ethics essay is due, and runs past bedtime — about 2 hours off that night.',
    )
  })

  it('names the biggest offender when several run late', () => {
    const small = item({ title: 'Reading', startHour: 23, hours: 1 })
    const big = item({ title: 'Ethics essay', startHour: 22, hours: 4 })

    expect(sleepForecastLine(bite(3, [small, big]), squeezeOn(week([]), 0), 'Today')).toContain(
      'Ethics essay',
    )
  })

  /**
   * The inferred claim, kept but worded as an inference. Eighteen hours in a sixteen-hour day
   * will cost sleep, but nothing is literally booked at one in the morning -- and stating that
   * with the same certainty as a block you can point at is what made the old detector
   * untrustworthy.
   */
  it('falls back to the day not fitting, worded as the weaker claim', () => {
    const crammed = week([
      item({ hours: 5 }),
      item({ hours: 5 }),
      item({ hours: 5 }),
      item({ hours: 5 }),
    ])

    expect(sleepForecastLine(bite(0), squeezeOn(crammed, 0), 'Today')).toBe(
      'Today asks for about 4 hours more than the day has.',
    )
  })

  /** The certain claim wins when both are true: a named block beats an arithmetic remainder. */
  it('prefers the booked block over the day not fitting', () => {
    const essay = item({ title: 'Ethics essay', startHour: 22, hours: 5 })
    const crammed = week([essay, item({ hours: 5 }), item({ hours: 5 }), item({ hours: 5 })])

    expect(sleepForecastLine(bite(2, [essay]), squeezeOn(crammed, 0), 'Today')).toContain(
      'runs past bedtime',
    )
  })

  it('says one hour in the singular on both wordings', () => {
    const late = item({ title: 'Reading', startHour: 23, hours: 2 })

    expect(sleepForecastLine(bite(1, [late]), squeezeOn(week([]), 0), 'Today')).toContain('1 hour ')
  })

  /**
   * A forecast, never a record. Nothing here writes, and the reason is that the app never
   * observed the night -- so a sentence in the past tense would undo that decision in copy
   * while the code still looked right.
   */
  it('speaks about a night ahead, not one it claims to have seen', () => {
    const essay = item({ title: 'Ethics essay', startHour: 22, hours: 3 })
    const line = sleepForecastLine(bite(2, [essay]), squeezeOn(week([essay]), 0), 'Today') ?? ''

    expect(line).not.toMatch(/you slept|did sleep|last night/i)
  })
})
