import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import {
  blankDraft,
  candidate,
  draftFrom,
  isComplete,
  NEW_ITEM_ID,
  toFields,
  validate,
  type EventDraft,
} from './eventDraft'

const item = (id: string, over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id,
  title: id,
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex: 3,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const week = (items: ScheduledItem[] = []): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const draft = (over: Partial<EventDraft> = {}): EventDraft => ({
  title: 'Essay draft',
  type: 'mental',
  kind: 'studyBlock',
  dayIndex: 3,
  startHour: 14,
  hours: 2,
  fixed: false,
  ...over,
})

describe('the draft a new block starts from', () => {
  it('starts on the day it was opened from', () => {
    expect(blankDraft(week(), 5).dayIndex).toBe(5)
  })

  // "Put something in this afternoon" should open already pointing somewhere sensible
  // rather than at midnight, or on top of the class that is already there.
  it('starts at the first hour the day has free', () => {
    const busy = week([item('lab', { dayIndex: 5, startHour: 8, hours: 3 })])

    expect(blankDraft(busy, 5).startHour).toBe(11)
  })

  it('starts unnamed, so nothing is saved by an accidental tap', () => {
    const blank = blankDraft(week(), 5)

    expect(blank.title).toBe('')
    expect(isComplete(validate(blank))).toBe(false)
  })
})

describe('the draft an existing block starts from', () => {
  it('reads back exactly what the block is', () => {
    const existing = item('essay', {
      title: 'Essay',
      dayIndex: 4,
      startHour: 13,
      hours: 3,
      fixed: true,
    })

    expect(draftFrom(existing)).toEqual({
      title: 'Essay',
      type: 'mental',
      kind: 'studyBlock',
      dayIndex: 4,
      startHour: 13,
      hours: 3,
      fixed: true,
    })
  })
})

/**
 * Only the impossible. This set is deliberately much smaller than the set of things that
 * might be a bad idea -- everything that is merely a clash goes through `editWarnings` and
 * never blocks a save.
 */
describe('what the form refuses to save', () => {
  it('refuses a block with no name', () => {
    expect(validate(draft({ title: '   ' })).title).toBeTruthy()
  })

  it('refuses a block with no length', () => {
    expect(validate(draft({ hours: 0 })).hours).toBeTruthy()
  })

  it('refuses a block longer than a day', () => {
    expect(validate(draft({ hours: 25 })).hours).toBeTruthy()
  })

  it('refuses a start time that is not an hour of the day', () => {
    expect(validate(draft({ startHour: 24 })).startHour).toBeTruthy()
    expect(validate(draft({ startHour: -1 })).startHour).toBeTruthy()
  })

  it('refuses a day outside the fortnight', () => {
    expect(validate(draft({ dayIndex: HORIZON_DAYS })).dayIndex).toBeTruthy()
  })

  it('accepts an ordinary block', () => {
    expect(isComplete(validate(draft()))).toBe(true)
  })
})

describe('turning a draft into something the week can hold', () => {
  it('trims the name so a stray space is not part of the title', () => {
    expect(toFields(draft({ title: '  Essay  ' })).title).toBe('Essay')
  })

  /**
   * Without this the form would warn about a block that had quietly stopped being
   * protected: the draft carries no `protectedRest` of its own, so it has to come from the
   * block being edited.
   */
  it('builds a candidate that keeps what the draft never carried', () => {
    const existing = item('essay', { intensity: 0.5, deadlineDay: 4, protectedRest: true })

    expect(candidate(draft({ dayIndex: 1 }), existing)).toMatchObject({
      id: 'essay',
      intensity: 0.5,
      deadlineDay: 4,
      protectedRest: true,
      dayIndex: 1,
    })
  })

  it('builds a candidate that matches no real block when the block is new', () => {
    expect(candidate(draft(), null).id).toBe(NEW_ITEM_ID)
  })
})
