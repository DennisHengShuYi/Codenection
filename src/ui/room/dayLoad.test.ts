import { describe, expect, it } from 'vitest'
import type { BlockRecord } from '../../domain/blockLog'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule } from '../../optimizer'
import { WAKING_HOURS, dayLoadFor } from './dayLoad'

/**
 * Ruling 45: what today actually consists of.
 *
 * The room's nine bindings all read the same few numbers -- the overall reserve, the mental
 * reserve, the projected deficit -- which is a coherent picture of a fortnight and a vague
 * one about today. A student could tell that things were heavy in general and nothing about
 * what the day in front of them contained.
 *
 * This module answers that one question and knows nothing about drawing. The arithmetic is
 * where the mistakes will be, so it is testable without a DOM; the binding to furniture is a
 * thin layer on top of it.
 */
const block = (over: Partial<Schedule['items'][number]> = {}) => ({
  id: 'a',
  title: 'Essay',
  type: 'mental' as const,
  kind: 'studyBlock' as const,
  hours: 2,
  intensity: 1,
  dayIndex: 0,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const week = (items: Schedule['items'] = []): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const answered = (id: string): BlockRecord => ({
  blockId: id,
  answer: 'right',
  answeredAt: 0,
  dayIndex: 0,
  type: 'mental',
  plannedHours: 2,
})

describe('the hours today asks for, by kind', () => {
  it('counts the hours rather than the blocks', () => {
    const load = dayLoadFor(
      week([
        block({ id: 'one', hours: 3 }),
        block({ id: 'two', hours: 1 }),
      ]),
      0,
      [],
    )

    // Four hours of study, not "two blocks" -- a long block fills the desk more than a
    // short one, which is the whole reason quantity is hours.
    expect(load.hoursByKind.studyBlock).toBe(4)
  })

  it('keeps each kind apart, so one object never speaks for another', () => {
    const load = dayLoadFor(
      week([
        block({ id: 'study', kind: 'studyBlock', hours: 2 }),
        block({ id: 'gym', kind: 'hardExercise', type: 'physical', hours: 1 }),
        block({ id: 'admin', kind: 'errands', type: 'errands', hours: 0.5 }),
      ]),
      0,
      [],
    )

    expect(load.hoursByKind.studyBlock).toBe(2)
    expect(load.hoursByKind.hardExercise).toBe(1)
    expect(load.hoursByKind.errands).toBe(0.5)
    expect(load.hoursByKind.socialDraining).toBe(0)
  })

  it('ignores every other day', () => {
    const load = dayLoadFor(
      week([block({ id: 'today', dayIndex: 2, hours: 2 }), block({ id: 'later', dayIndex: 5, hours: 8 })]),
      2,
      [],
    )

    expect(load.hoursByKind.studyBlock).toBe(2)
    expect(load.totalHours).toBe(2)
  })

  it('reports an empty day as empty rather than as missing', () => {
    const load = dayLoadFor(week(), 0, [])

    expect(load.totalHours).toBe(0)
    expect(load.hoursByKind.studyBlock).toBe(0)
    expect(load.spillHours).toBe(0)
  })
})

/**
 * Ruling 45's fourth decision: the room empties as the day is worked through. A block the student
 * has answered on the today card is put away -- nothing is counted up, which is what keeps
 * the room a mirror rather than a scoreboard (§1.3).
 */
describe('what is left of today', () => {
  it('puts an answered block away', () => {
    const items = [block({ id: 'done', hours: 2 }), block({ id: 'todo', hours: 1 })]

    const load = dayLoadFor(week(items), 0, [answered('done')])

    expect(load.hoursByKind.studyBlock, 'the day still asked for three hours').toBe(3)
    expect(load.remainingByKind.studyBlock, 'one of them has been answered').toBe(1)
  })

  it('leaves nothing behind once every block is answered', () => {
    const load = dayLoadFor(week([block({ id: 'done' })]), 0, [answered('done')])

    expect(load.remainingByKind.studyBlock).toBe(0)
  })

  it('is the whole day when nothing has been answered', () => {
    const load = dayLoadFor(week([block({ id: 'todo', hours: 2 })]), 0, [])

    expect(load.remainingByKind.studyBlock).toBe(2)
  })

  /**
   * An answer about another day says nothing about this one. The log is durable and spans
   * the fortnight, so a block answered yesterday must not empty today's desk.
   */
  it('ignores an answer about a block that is not on today', () => {
    const items = [block({ id: 'today', hours: 2 })]

    const load = dayLoadFor(week(items), 0, [{ ...answered('yesterday'), dayIndex: 0 }])

    expect(load.remainingByKind.studyBlock).toBe(2)
  })
})

/**
 * Ruling 45's darkness. What spills past the end of the waking day is what has to come out of
 * sleep, and it is computed BEFORE the bad night -- the last moment at which the student can
 * still move something.
 */
describe('the hours that do not fit', () => {
  it('is nothing on a day with room to spare', () => {
    expect(dayLoadFor(week([block({ hours: 4 })]), 0, []).spillHours).toBe(0)
  })

  it('is nothing on a day that exactly fills the waking hours', () => {
    expect(dayLoadFor(week([block({ hours: WAKING_HOURS })]), 0, []).spillHours).toBe(0)
  })

  it('is what runs past the end of the day', () => {
    const load = dayLoadFor(week([block({ hours: WAKING_HOURS + 2 })]), 0, [])

    expect(load.spillHours).toBe(2)
  })

  /**
   * Measured against everything the day asked for, not against what is left. A day that
   * could never have fitted was over-committed at the moment it was planned, and answering
   * the blocks one by one does not retrospectively make it fit -- the sleep was already
   * spent.
   */
  it('does not shrink as blocks are answered', () => {
    const items = [
      block({ id: 'done', hours: WAKING_HOURS }),
      block({ id: 'todo', hours: 3 }),
    ]

    const load = dayLoadFor(week(items), 0, [answered('done')])

    expect(load.spillHours).toBe(3)
  })
})
