import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { modeOf } from './mode'

const block = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'a',
  title: 'Block',
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex: 0,
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

/** A timetable: short fixed blocks, most days, at ordinary hours. */
const classes = (): ScheduledItem[] =>
  Array.from({ length: 12 }, (_, index) =>
    block({ id: `class-${index}`, dayIndex: index, hours: 2, fixed: true, startHour: 9 }),
  )

/** Shift work: long fixed blocks, few days. */
const shifts = (): ScheduledItem[] =>
  Array.from({ length: 4 }, (_, index) =>
    block({ id: `shift-${index}`, dayIndex: index * 5, hours: 9, fixed: true, startHour: 8 }),
  )

/**
 * §21: derive the mode rather than asking for it.
 *
 * The mode picker was cut for the right reason -- nothing read it, so it was a question
 * asked of every student for no effect. This brings the idea back without asking anybody
 * anything: the shape of a fortnight's fixed load already says which kind of week it is.
 *
 * It reads *fixed* load only, and that is the point. Movable work is what a student is
 * trying to fit; fixed work is the frame they have to fit it into, and the frame is what
 * distinguishes a timetable from a roster from an empty diary.
 */
describe('modeOf', () => {
  it('reads a timetable of short classes as studying', () => {
    expect(modeOf(week(classes()))).toBe('studying')
  })

  it('reads long blocks on a few days as shift work', () => {
    expect(modeOf(week(shifts()))).toBe('shifts')
  })

  /**
   * The case the whole idea exists for. With almost nothing fixed, burnout comes from drift
   * rather than overload -- so the objective should be defending a floor rather than
   * flattening peaks, and a week that looks empty is not the same as a week that is fine.
   */
  it('reads a fortnight with almost nothing fixed as low structure', () => {
    expect(modeOf(week([block({ fixed: true }), block({ id: 'b', dayIndex: 6, fixed: true })]))).toBe(
      'lowStructure',
    )
  })

  it('reads an entirely empty fortnight as low structure', () => {
    expect(modeOf(week([]))).toBe('lowStructure')
  })

  /** Movable work is what is being fitted, not the frame. A fortnight of essays with no
   *  classes is still a low-structure week, however full it looks. */
  it('ignores movable work entirely', () => {
    const essays = Array.from({ length: 15 }, (_, index) =>
      block({ id: `essay-${index}`, dayIndex: index, hours: 4 }),
    )

    expect(modeOf(week(essays))).toBe('lowStructure')
  })

  /** Protected rest is fixed load the optimizer put there, not something the student's life
   *  imposed -- counting it would let the app infer a timetable from its own suggestions. */
  it('does not read its own protected rest as structure', () => {
    const rest = Array.from({ length: 12 }, (_, index) =>
      block({ id: `rest-${index}`, dayIndex: index, fixed: true, protectedRest: true, kind: 'rest' }),
    )

    expect(modeOf(week(rest))).toBe('lowStructure')
  })

  it('answers the same way twice', () => {
    expect(modeOf(week(classes()))).toBe(modeOf(week(classes())))
  })
})
