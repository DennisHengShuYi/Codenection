import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../engine'
import { smallestFixes } from './smallestFix'
import { makeSchedule, restItem, studyItem } from './testSupport'

const pileUp = () =>
  makeSchedule([
    { ...studyItem('essay', 2, 4), deadlineDay: 10 },
    { ...studyItem('lab', 2, 3), deadlineDay: 12 },
    { ...studyItem('reading', 2, 2), deadlineDay: 14 },
  ])

describe('smallestFixes', () => {
  // §2.2: "A student will do one thing; they will not follow a nine-change reshuffle."
  it('returns at most three', () => {
    expect(smallestFixes(pileUp(), DEFAULT_PARAMS).length).toBeLessThanOrEqual(3)
  })

  it('honours a caller-supplied limit', () => {
    expect(smallestFixes(pileUp(), DEFAULT_PARAMS, 1).length).toBeLessThanOrEqual(1)
  })

  it('orders them by how much they actually help', () => {
    const fixes = smallestFixes(pileUp(), DEFAULT_PARAMS)

    for (let i = 1; i < fixes.length; i += 1) {
      expect(fixes[i - 1]!.gain).toBeGreaterThanOrEqual(fixes[i]!.gain)
    }
  })

  it('only ever returns single moves that genuinely improve the floor', () => {
    for (const fix of smallestFixes(pileUp(), DEFAULT_PARAMS)) {
      expect(fix.worstAfter).toBeGreaterThan(fix.worstBefore)
      expect(fix.gain).toBeGreaterThan(0)
    }
  })

  it('reports the before and after a student can read', () => {
    for (const fix of smallestFixes(pileUp(), DEFAULT_PARAMS)) {
      expect(fix.move.description.length).toBeGreaterThan(0)
      expect(fix.gain).toBeCloseTo(fix.worstAfter - fix.worstBefore)
    }
  })

  // An empty week is not a healthy one. Social reserve drains from isolation (§1.2), so
  // there is still something worth doing -- and the app saying "nothing to fix" to a
  // student with an empty, lonely fortnight would be exactly wrong.
  it('suggests rest even on an empty week, because isolation still drains', () => {
    const fixes = smallestFixes(makeSchedule([]), DEFAULT_PARAMS)

    expect(fixes.length).toBeGreaterThan(0)
    expect(fixes.every((fix) => fix.move.kind === 'insertRest')).toBe(true)
  })

  it('returns nothing when every day is already protected and nothing can move', () => {
    const saturated = makeSchedule(
      Array.from({ length: 21 }, (_, day) => restItem(`rest-${day}`, day, 20)),
    )

    expect(smallestFixes(saturated, DEFAULT_PARAMS)).toEqual([])
  })

  it('never proposes moving protected rest', () => {
    const schedule = makeSchedule([...pileUp().items, restItem('rest', 4, 20)])

    for (const fix of smallestFixes(schedule, DEFAULT_PARAMS)) {
      expect(fix.move.itemId).not.toBe('rest')
    }
  })

  it('does not mutate the schedule it is given', () => {
    const schedule = pileUp()
    const before = JSON.stringify(schedule)
    smallestFixes(schedule, DEFAULT_PARAMS)

    expect(JSON.stringify(schedule)).toBe(before)
  })
})
