import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import { overlaps } from './constraints'
import { clearClashes } from './repair'
import type { Schedule, ScheduledItem } from './types'

/**
 * A week that arrived broken, put right before the search runs on it.
 *
 * `violations` counts a movable block sitting on a fixed one or on protected rest, but that
 * count is only ever used as a gate on candidate moves -- "no worse than you started" -- so a
 * week already carrying a clash was under no pressure to lose it. The score cannot see
 * overlap at all, so a repairing move was permitted and never preferred. Four probes
 * confirmed it: a study block on top of protected rest survived a full rebalance untouched,
 * and §5.1 calls protected rest the most important design decision in the app.
 *
 * A pass rather than a term in the objective, deliberately. Scoring overlap would put it in
 * competition with the reserves, so a clash could be "solved" by shoving work onto a day
 * that costs the student more. This only ever separates blocks that must not sit on top of
 * each other, and leaves every judgement about where work belongs to the search that follows.
 */
const item = (over: Partial<ScheduledItem>): ScheduledItem => ({
  id: 'a',
  title: 'A',
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex: 2,
  startHour: 14,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const week = (items: ScheduledItem[]): Schedule => ({
  items,
  start: { mental: 60, physical: 60, social: 60, errands: 60 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const find = (schedule: Schedule, id: string): ScheduledItem =>
  schedule.items.find((entry) => entry.id === id)!

/** Every pair on a day that is sitting on top of another, as the probe counted them. */
const clashes = (schedule: Schedule): string[] => {
  const out: string[] = []
  for (let i = 0; i < schedule.items.length; i += 1) {
    for (let j = i + 1; j < schedule.items.length; j += 1) {
      const a = schedule.items[i]!
      const b = schedule.items[j]!
      if (a.dayIndex === b.dayIndex && overlaps(a, b)) out.push(`${a.title}/${b.title}`)
    }
  }
  return out
}

/** The day a whole fortnight of tests sits on, far enough in that nothing is history. */
const DAY = 2

describe('clearClashes', () => {
  it('moves a block off a fixed commitment', () => {
    const before = week([
      item({ id: 'lecture', title: 'Lecture', fixed: true }),
      item({ id: 'reading', title: 'Reading' }),
    ])

    const after = clearClashes(before, 0).schedule

    expect(clashes(after)).toEqual([])
  })

  /** §5.1 calls protected rest the most important design decision in the app, and a study
   *  block sitting on top of it survived a full rebalance before this existed. */
  it('moves a block off protected rest', () => {
    const before = week([
      item({ id: 'rest', title: 'Rest', kind: 'rest', protectedRest: true }),
      item({ id: 'reading', title: 'Reading' }),
    ])

    expect(clashes(clearClashes(before, 0).schedule)).toEqual([])
  })

  /** The pinned block is the thing that must not move. Moving it would be the app taking
   *  away the class or the rest instead of the work that landed on it. */
  it('moves the loose block, never the pinned one', () => {
    const before = week([
      item({ id: 'lecture', title: 'Lecture', fixed: true }),
      item({ id: 'reading', title: 'Reading' }),
    ])

    const after = clearClashes(before, 0).schedule

    expect(find(after, 'lecture').startHour).toBe(14)
    expect(find(after, 'lecture').dayIndex).toBe(DAY)
  })

  /**
   * Two loose blocks are separated too, and that is a narrower statement than it looks.
   *
   * `constraints.ts` permits that state on purpose and still does: the search has to be able
   * to pass *through* a week with two movable blocks on one hour, or legal routes through the
   * neighbourhood get cut off. Passing through it is not the same as handing it back. A
   * calendar showing two things at 14:00 is wrong however the model feels about it, and the
   * student is the one who would have to be in two places.
   */
  it('separates two loose blocks as well', () => {
    const before = week([
      item({ id: 'essay', title: 'Essay' }),
      item({ id: 'reading', title: 'Reading' }),
    ])

    expect(clashes(clearClashes(before, 0).schedule)).toEqual([])
  })

  /** The one with the least room to go elsewhere keeps its hour. An earlier deadline is less
   *  slack, and a block with no deadline has the most slack of all. */
  it('makes the block with more slack give way', () => {
    const before = week([
      item({ id: 'essay', title: 'Essay', deadlineDay: DAY }),
      item({ id: 'reading', title: 'Reading' }),
    ])

    const after = clearClashes(before, 0).schedule

    expect(find(after, 'essay').startHour).toBe(14)
    expect(find(after, 'essay').dayIndex).toBe(DAY)
  })

  /**
   * Two fixed commitments at one hour are a fact about somebody's week, not something to
   * tidy. Moving either would be the app taking away a class it was told about.
   */
  it('leaves two pinned blocks on top of each other', () => {
    const before = week([
      item({ id: 'lecture', title: 'Lecture', fixed: true }),
      item({ id: 'lab', title: 'Lab', fixed: true }),
    ])

    expect(clearClashes(before, 0).schedule).toEqual(before)
    expect(clearClashes(before, 0).moves).toEqual([])
  })

  it('stays on the same day when the day has room', () => {
    const before = week([
      item({ id: 'lecture', title: 'Lecture', fixed: true }),
      item({ id: 'reading', title: 'Reading' }),
    ])

    expect(find(clearClashes(before, 0).schedule, 'reading').dayIndex).toBe(DAY)
  })

  it('takes another day when this one is full', () => {
    const before = week([
      item({ id: 'lecture', title: 'Lecture', fixed: true, startHour: 8, hours: 16 }),
      item({ id: 'reading', title: 'Reading', startHour: 9 }),
    ])

    const reading = find(clearClashes(before, 0).schedule, 'reading')

    expect(reading.dayIndex).not.toBe(DAY)
    expect(clashes(clearClashes(before, 0).schedule)).toEqual([])
  })

  /** A deadline is a fact about the world. Clearing a clash by pushing work past one trades
   *  a calendar problem for a real one. */
  it('never pushes a block past its deadline', () => {
    const before = week([
      item({ id: 'lecture', title: 'Lecture', fixed: true, startHour: 8, hours: 16 }),
      item({ id: 'essay', title: 'Essay', startHour: 9, deadlineDay: DAY }),
    ])

    expect(find(clearClashes(before, 0).schedule, 'essay').dayIndex).toBeLessThanOrEqual(DAY)
  })

  /** Days already lived are not the student's to rearrange, and the search is bounded the
   *  same way for the same reason. */
  it('leaves a clash on a day that has already happened', () => {
    const before = week([
      item({ id: 'lecture', title: 'Lecture', fixed: true, dayIndex: 1 }),
      item({ id: 'reading', title: 'Reading', dayIndex: 1 }),
    ])

    expect(clearClashes(before, 5).schedule).toEqual(before)
  })

  /** Declining beats inventing a placement: a block parked at an hour nothing checked is a
   *  worse answer than one still visibly on top of something. */
  it('leaves the block where it is when nothing anywhere fits', () => {
    const before = week([
      ...Array.from({ length: HORIZON_DAYS }, (_, day) =>
        item({ id: `wall-${day}`, title: 'Wall', fixed: true, dayIndex: day, startHour: 8, hours: 16 }),
      ),
      item({ id: 'reading', title: 'Reading', startHour: 9 }),
    ])

    expect(find(clearClashes(before, 0).schedule, 'reading').dayIndex).toBe(DAY)
    expect(find(clearClashes(before, 0).schedule, 'reading').startHour).toBe(9)
  })

  it('says what it moved, specifically enough to check', () => {
    const before = week([
      item({ id: 'lecture', title: 'Lecture', fixed: true }),
      item({ id: 'reading', title: 'Reading' }),
    ])

    const { moves } = clearClashes(before, 0)

    expect(moves).toHaveLength(1)
    expect(moves[0]?.itemId).toBe('reading')
    expect(moves[0]?.description).toMatch(/Reading/)
    expect(moves[0]?.description).toMatch(/Lecture/)
  })

  it('reports nothing when there was nothing to clear', () => {
    expect(clearClashes(week([item({ id: 'essay' })]), 0).moves).toEqual([])
  })

  it('does not touch the week it was given', () => {
    const before = week([
      item({ id: 'lecture', title: 'Lecture', fixed: true }),
      item({ id: 'reading', title: 'Reading' }),
    ])
    const snapshot = JSON.stringify(before)

    clearClashes(before, 0)

    expect(JSON.stringify(before)).toBe(snapshot)
  })

  /** One pass, several clashes: each placement has to see the ones already made, or two
   *  blocks come off the same lecture onto the same free hour. */
  it('does not land two rescued blocks on top of each other', () => {
    const before = week([
      item({ id: 'lecture', title: 'Lecture', fixed: true }),
      item({ id: 'reading', title: 'Reading' }),
      item({ id: 'essay', title: 'Essay' }),
    ])

    const after = clearClashes(before, 0).schedule

    expect(clashes(after)).toEqual([])
  })
})
