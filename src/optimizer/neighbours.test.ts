import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../engine'
import { isValid, violations } from './constraints'
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

  // A schedule can arrive already broken -- a student adds a clashing commitment, or an
  // OCR import (§1.4) drops a class on top of existing work. Filtering candidates on
  // "is the result valid" rejects every move in that state, because the pre-existing
  // violation survives all of them. The app would then tell an over-committed student
  // that their week is already the best arrangement, which is the worst possible answer
  // for exactly the person it exists to help.
  /**
   * Two *independent* clashes, on different days. One move can clear at most one of
   * them, so no single neighbour reaches a fully valid schedule -- which is the case
   * that breaks a validity filter, and the case a single clash does not reproduce.
   */
  const doublyBroken = () =>
    makeSchedule([
      { ...studyItem('lecture-a', 1, 2), fixed: true, startHour: 9 },
      { ...studyItem('clash-a', 1, 2), startHour: 10 },
      { ...studyItem('lecture-b', 8, 2), fixed: true, startHour: 9 },
      { ...studyItem('clash-b', 8, 2), startHour: 10 },
    ])

  it('still offers moves when the schedule arrives already invalid', () => {
    const broken = doublyBroken()

    expect(isValid(broken, DEFAULT_PARAMS)).toBe(false)
    expect(violations(broken, DEFAULT_PARAMS)).toHaveLength(2)
    expect(neighbours(broken, DEFAULT_PARAMS).length).toBeGreaterThan(0)
  })

  it('offers moves that reduce the damage even when none can fully repair it', () => {
    const broken = doublyBroken()
    const before = violations(broken, DEFAULT_PARAMS).length

    const improving = neighbours(broken, DEFAULT_PARAMS).filter(
      (move) => violations(move.apply(broken), DEFAULT_PARAMS).length < before,
    )

    expect(improving.length).toBeGreaterThan(0)
  })

  it('never offers a move that makes a broken schedule worse', () => {
    const broken = doublyBroken()
    const before = violations(broken, DEFAULT_PARAMS).length

    for (const move of neighbours(broken, DEFAULT_PARAMS)) {
      expect(violations(move.apply(broken), DEFAULT_PARAMS).length).toBeLessThanOrEqual(before)
    }
  })

  it('does not mutate the schedule it is given', () => {
    const schedule = makeSchedule([studyItem('a', 3, 2)])
    const before = JSON.stringify(schedule)

    for (const move of neighbours(schedule, DEFAULT_PARAMS)) move.apply(schedule)

    expect(JSON.stringify(schedule)).toBe(before)
  })

  // Nothing to move or reorder, so the only things on offer are the two the solver can
  // add from nothing: rest, and time with other people.
  it('offers only the things it can add on an empty schedule', () => {
    const moves = neighbours(makeSchedule([]), DEFAULT_PARAMS)

    expect(moves.length).toBeGreaterThan(0)
    expect(moves.every((m) => m.kind === 'insertRest' || m.kind === 'insertSocial')).toBe(true)
  })

  it('describes every move in plain language', () => {
    for (const move of neighbours(makeSchedule([studyItem('a', 3, 2)]), DEFAULT_PARAMS)) {
      expect(move.description.length).toBeGreaterThan(0)
      expect(move.description).not.toMatch(/optimis|optimiz/i)
    }
  })
})

/**
 * §13/§14: the solver's two remaining hardcoded hours.
 *
 * `REST_START_HOUR` and `SOCIAL_START_HOUR` placed every inserted block at 20:00 and 18:00
 * whatever was already there. For rest that was merely wasteful -- inserted rest is
 * `protectedRest`, so an overlap is a constraint violation and the candidate was thrown
 * away, meaning the solver simply could not offer rest to anyone whose evening was busy.
 * For social it was worse: inserted social is movable, and movable-movable overlap is
 * deliberately not a violation, so it landed silently on top of existing work.
 *
 * The hours survive as preferences. A block still goes where that kind of block belongs
 * when the day allows it.
 */
describe('neighbours placing what it inserts', () => {
  const evening = (id: string, day: number, startHour: number, hours: number) => ({
    ...studyItem(id, day, 2),
    startHour,
    hours,
  })

  const insertedRestOn = (schedule: Parameters<typeof neighbours>[0], day: number) => {
    const move = neighbours(schedule, DEFAULT_PARAMS).find(
      (m) => m.kind === 'insertRest' && m.itemId === `rest-${day}`,
    )

    return move === undefined
      ? null
      : (move.apply(schedule).items.find((item) => item.id === `rest-${day}`) ?? null)
  }

  it('still prefers the evening when the evening is free', () => {
    const rest = insertedRestOn(makeSchedule([studyItem('a', 3, 2)]), 3)

    expect(rest?.startHour).toBe(20)
  })

  /** The case the constant could not survive: an evening already spoken for. */
  it('finds another hour when the evening is taken', () => {
    const busyEvening = makeSchedule([evening('a', 3, 19, 5)])

    const rest = insertedRestOn(busyEvening, 3)

    expect(rest).not.toBeNull()
    expect(rest?.startHour).toBeLessThan(19)
    expect(rest?.startHour).toBeGreaterThanOrEqual(8)
  })

  /**
   * The reason this mattered for rest specifically: inserted rest is `protectedRest`, so an
   * overlapping candidate is a violation and gets discarded -- the solver was unable to
   * suggest rest at all to the students who most needed it.
   */
  it('produces a rest insertion that does not violate the week it lands in', () => {
    const busyEvening = makeSchedule([evening('a', 3, 19, 5)])
    const move = neighbours(busyEvening, DEFAULT_PARAMS).find(
      (m) => m.kind === 'insertRest' && m.itemId === 'rest-3',
    )

    expect(move).toBeDefined()
    expect(violations(move!.apply(busyEvening), DEFAULT_PARAMS)).toEqual(
      violations(busyEvening, DEFAULT_PARAMS),
    )
  })

  /** §17: one candidate per insertion. A finder that returned a list here would multiply the
   *  neighbourhood, and the search is already at four thousand evaluations on the crunch
   *  fixture. */
  it('still offers exactly one rest insertion per day', () => {
    const moves = neighbours(makeSchedule([studyItem('a', 3, 2)]), DEFAULT_PARAMS)
    const onDayThree = moves.filter((m) => m.kind === 'insertRest' && m.itemId === 'rest-3')

    expect(onDayThree).toHaveLength(1)
  })

  it('places inserted social away from what is already on the day', () => {
    const busyEvening = makeSchedule([evening('a', 3, 17, 6)])
    const move = neighbours(busyEvening, DEFAULT_PARAMS).find(
      (m) => m.kind === 'insertSocial' && m.itemId === 'social-3',
    )

    const social = move?.apply(busyEvening).items.find((item) => item.id === 'social-3')

    expect(social).toBeDefined()
    // Movable-movable overlap is legal, so nothing would have complained. It still must not
    // be dropped on top of the student's evening.
    expect(social!.startHour + social!.hours).toBeLessThanOrEqual(17)
  })
})
