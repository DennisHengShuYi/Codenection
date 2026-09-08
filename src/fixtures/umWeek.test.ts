import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../engine'
import { isValid, violations } from '../optimizer'
import { umCrunchWeek, umSemesterWeek } from './umWeek'

describe('umSemesterWeek', () => {
  it('is a legal starting schedule', () => {
    expect(violations(umSemesterWeek(), DEFAULT_PARAMS)).toEqual([])
    expect(isValid(umSemesterWeek(), DEFAULT_PARAMS)).toBe(true)
  })

  it('has fixed classes the optimizer may not move', () => {
    expect(umSemesterWeek().items.some((item) => item.fixed && item.kind === 'studyBlock'))
      .toBe(true)
  })

  it('has movable assessed work with real deadlines', () => {
    const movable = umSemesterWeek().items.filter(
      (item) => !item.fixed && item.deadlineDay !== null,
    )

    expect(movable.length).toBeGreaterThan(3)
  })

  it('has errands to batch', () => {
    const errands = umSemesterWeek().items.filter(
      (item) => !item.fixed && item.type === 'errands',
    )

    expect(errands.length).toBeGreaterThan(1)
  })

  it('schedules every assessed item on or before its deadline', () => {
    for (const item of umSemesterWeek().items) {
      if (item.deadlineDay === null) continue
      expect(item.dayIndex).toBeLessThanOrEqual(item.deadlineDay)
    }
  })

  it('includes ordinary life, without which isolation drain drowns out everything else', () => {
    const social = umSemesterWeek().items.filter((item) => item.type === 'social')
    const exercise = umSemesterWeek().items.filter((item) => item.type === 'physical')

    expect(social.length).toBeGreaterThan(0)
    expect(exercise.length).toBeGreaterThan(0)
  })

  it('covers the full horizon', () => {
    const days = new Set(umSemesterWeek().items.map((item) => item.dayIndex))

    expect(days.size).toBeGreaterThan(14)
  })
})

describe('umCrunchWeek', () => {
  // An illegal fixture silently breaks the §2.5 measurement rather than failing it: with
  // pre-existing violations the neighbour generator has a smaller set to work with, and
  // the reported degrees of freedom understate the real ones.
  it('is a legal starting schedule', () => {
    expect(violations(umCrunchWeek(), DEFAULT_PARAMS)).toEqual([])
  })

  it('starts the student more depleted than the ordinary fortnight', () => {
    expect(umCrunchWeek().start.mental).toBeLessThan(umSemesterWeek().start.mental)
    expect(umCrunchWeek().start.social).toBeLessThan(umSemesterWeek().start.social)
  })

  it('adds assessed work on top of the ordinary fortnight', () => {
    expect(umCrunchWeek().items.length).toBeGreaterThan(umSemesterWeek().items.length)
  })

  it('sleeps worse than the ordinary fortnight', () => {
    expect(umCrunchWeek().sleepByDay[0]!).toBeLessThan(umSemesterWeek().sleepByDay[0]!)
  })
})
