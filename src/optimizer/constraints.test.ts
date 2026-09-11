import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../engine'
import { isValid, overlaps, violations } from './constraints'
import { makeSchedule, restItem, studyItem } from './testSupport'

describe('constraints', () => {
  it('accepts a schedule that breaks nothing', () => {
    expect(isValid(makeSchedule([studyItem('a', 1, 2)]), DEFAULT_PARAMS)).toBe(true)
  })

  it('accepts an empty schedule', () => {
    expect(isValid(makeSchedule([]), DEFAULT_PARAMS)).toBe(true)
  })

  it('rejects anything scheduled past its deadline', () => {
    const late = makeSchedule([{ ...studyItem('a', 5, 2), deadlineDay: 3 }])

    expect(isValid(late, DEFAULT_PARAMS)).toBe(false)
    expect(violations(late, DEFAULT_PARAMS).join(' ')).toContain('deadline')
  })

  it('accepts work scheduled exactly on its deadline day', () => {
    expect(isValid(makeSchedule([{ ...studyItem('a', 3, 2), deadlineDay: 3 }]), DEFAULT_PARAMS))
      .toBe(true)
  })

  it('rejects anything overlapping a fixed block', () => {
    const lecture = { ...studyItem('lecture', 1, 2), fixed: true, startHour: 9 }
    const clash = { ...studyItem('clash', 1, 2), startHour: 10 }

    expect(isValid(makeSchedule([lecture, clash]), DEFAULT_PARAMS)).toBe(false)
  })

  it('allows a movable block that merely abuts a fixed one', () => {
    const lecture = { ...studyItem('lecture', 1, 2), fixed: true, startHour: 9 }
    const after = { ...studyItem('after', 1, 2), startHour: 11 }

    expect(isValid(makeSchedule([lecture, after]), DEFAULT_PARAMS)).toBe(true)
  })

  it('allows two movable blocks to overlap, since either one can still be moved', () => {
    const a = { ...studyItem('a', 1, 2), startHour: 9 }
    const b = { ...studyItem('b', 1, 2), startHour: 10 }

    expect(isValid(makeSchedule([a, b]), DEFAULT_PARAMS)).toBe(true)
  })

  // §2.1 and §5.1: the constraint that expresses the app's whole stance. Protected rest
  // is a hard constraint rather than a penalty term, so no gain elsewhere can buy past
  // it -- a rest block the solver could move for a good enough score is a rest block
  // that is optional again.
  it('rejects a schedule with work overlapping protected rest', () => {
    const schedule = makeSchedule([restItem('rest', 2, 20), { ...studyItem('work', 2, 2), startHour: 20 }])

    expect(isValid(schedule, DEFAULT_PARAMS)).toBe(false)
    expect(violations(schedule, DEFAULT_PARAMS).join(' ')).toContain('protected rest')
  })

  it('rejects a day that exceeds the daily hours cap', () => {
    expect(isValid(makeSchedule([studyItem('m', 0, 14)]), DEFAULT_PARAMS)).toBe(false)
  })

  it('does not count rest toward the daily hours cap', () => {
    const packed = { ...studyItem('work', 0, 9), startHour: 8 }
    const schedule = makeSchedule([packed, restItem('rest', 0, 20)])

    expect(isValid(schedule, DEFAULT_PARAMS)).toBe(true)
  })

  it('reports every violation rather than only the first', () => {
    const schedule = makeSchedule([
      { ...studyItem('late', 5, 2), deadlineDay: 3 },
      studyItem('huge', 7, 14),
    ])

    expect(violations(schedule, DEFAULT_PARAMS).length).toBeGreaterThanOrEqual(2)
  })
})

/**
 * Exported so the manual edit form can ask the same question about a block that is not in
 * the schedule yet. Two definitions of overlap -- one here, one in the form -- would
 * eventually disagree about a boundary, and the one the student saw would be the wrong one.
 */
describe('overlapping, as one definition', () => {
  const at = (dayIndex: number, startHour: number, hours: number) => ({
    ...studyItem('x', dayIndex, hours),
    startHour,
  })

  it('is true when two blocks share a day and any of the same hours', () => {
    expect(overlaps(at(1, 9, 2), at(1, 10, 1))).toBe(true)
  })

  // A block ending at 11:00 and one starting at 11:00 are back to back, not in conflict.
  it('is false when they share a day but only touch end to end', () => {
    expect(overlaps(at(1, 9, 2), at(1, 11, 1))).toBe(false)
  })

  it('is false across different days whatever the hours', () => {
    expect(overlaps(at(1, 9, 4), at(2, 9, 4))).toBe(false)
  })
})
