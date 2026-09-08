import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../engine'
import { isValid } from './constraints'
import { neighbours } from './neighbours'
import { errandItem, makeSchedule, restItem, studyItem } from './testSupport'

describe('neighbours', () => {
  it('offers to move a movable task to another day', () => {
    const moves = neighbours(makeSchedule([studyItem('a', 3, 2)]), DEFAULT_PARAMS)

    expect(moves.some((m) => m.kind === 'shiftDay' && m.itemId === 'a')).toBe(true)
  })

  it('never offers to move a fixed block', () => {
    const lecture = { ...studyItem('lecture', 3, 2), fixed: true }
    const moves = neighbours(makeSchedule([lecture]), DEFAULT_PARAMS)

    expect(moves.some((m) => m.itemId === 'lecture')).toBe(false)
  })

  // §2.1 and §5.1. If the search can reach a state where rest has moved, protected rest
  // is not protected -- so this is checked at generation, not only at validation.
  it('never offers to move protected rest', () => {
    const moves = neighbours(makeSchedule([restItem('rest', 3, 20)]), DEFAULT_PARAMS)

    expect(moves.some((m) => m.itemId === 'rest')).toBe(false)
  })

  it('never offers to move a task past its deadline', () => {
    const due = { ...studyItem('due', 2, 2), deadlineDay: 2 }
    const schedule = makeSchedule([due])

    for (const move of neighbours(schedule, DEFAULT_PARAMS).filter((m) => m.kind === 'shiftDay')) {
      expect(move.apply(schedule).items[0]!.dayIndex).toBeLessThanOrEqual(2)
    }
  })

  it('never offers to move a task off the start of the horizon', () => {
    const schedule = makeSchedule([studyItem('a', 0, 2)])

    for (const move of neighbours(schedule, DEFAULT_PARAMS).filter((m) => m.kind === 'shiftDay')) {
      expect(move.apply(schedule).items[0]!.dayIndex).toBeGreaterThanOrEqual(0)
    }
  })

  it('offers to batch two errands onto the same day', () => {
    const moves = neighbours(
      makeSchedule([errandItem('e1', 1, 9), errandItem('e2', 4, 14)]),
      DEFAULT_PARAMS,
    )

    expect(moves.some((m) => m.kind === 'batchErrands')).toBe(true)
  })

  it('offers to insert a rest block', () => {
    const moves = neighbours(makeSchedule([studyItem('a', 1, 2)]), DEFAULT_PARAMS)

    expect(moves.some((m) => m.kind === 'insertRest')).toBe(true)
  })

  it('does not offer a second rest block on a day that already has one', () => {
    const moves = neighbours(makeSchedule([restItem('rest', 3, 20)]), DEFAULT_PARAMS)
    const onDayThree = moves.filter((m) => m.kind === 'insertRest' && m.itemId === 'rest-3')

    expect(onDayThree).toHaveLength(0)
  })

  // §6.6: even when the days are fixed, the order within a day is usually free -- which
  // is what partly answers §2.5's degrees-of-freedom problem, since no timetable takes
  // sequencing away.
  it('offers to reorder two items within the same day', () => {
    const gym = {
      ...studyItem('gym', 1, 1),
      type: 'physical' as const,
      kind: 'hardExercise' as const,
      startHour: 17,
    }
    const study = { ...studyItem('study', 1, 2), startHour: 19 }
    const moves = neighbours(makeSchedule([gym, study]), DEFAULT_PARAMS)

    expect(moves.some((m) => m.kind === 'reorderWithinDay')).toBe(true)
  })

  // Filtering at generation rather than scoring badly is what stops the search walking
  // through an illegal schedule on its way somewhere better.
  it('only ever offers moves that leave the schedule valid', () => {
    const schedule = makeSchedule([
      studyItem('a', 1, 2),
      studyItem('b', 3, 2),
      errandItem('e', 2, 15),
      restItem('rest', 4, 20),
    ])

    for (const move of neighbours(schedule, DEFAULT_PARAMS)) {
      expect(isValid(move.apply(schedule), DEFAULT_PARAMS)).toBe(true)
    }
  })

  it('does not mutate the schedule it is given', () => {
    const schedule = makeSchedule([studyItem('a', 3, 2)])
    const before = JSON.stringify(schedule)

    for (const move of neighbours(schedule, DEFAULT_PARAMS)) move.apply(schedule)

    expect(JSON.stringify(schedule)).toBe(before)
  })

  it('offers nothing but rest insertion on an empty schedule', () => {
    const moves = neighbours(makeSchedule([]), DEFAULT_PARAMS)

    expect(moves.every((m) => m.kind === 'insertRest')).toBe(true)
  })

  it('describes every move in plain language', () => {
    for (const move of neighbours(makeSchedule([studyItem('a', 3, 2)]), DEFAULT_PARAMS)) {
      expect(move.description.length).toBeGreaterThan(0)
      expect(move.description).not.toMatch(/optimis|optimiz/i)
    }
  })
})
