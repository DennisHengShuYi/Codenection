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
  withHours,
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
  deadlineDay: null,
  paddedHours: false,
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
      // Now part of what the form can change, so it is part of what the form reads back.
      deadlineDay: null,
      paddedHours: false,
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
   *
   * `deadlineDay` used to be in that carried-over set and has deliberately left it: the form
   * can set a deadline now, so taking it from the block being edited would make the new
   * field unable to change anything. The rewrite is the point of the change, not a
   * concession to it -- what stays carried is what the draft still cannot say.
   */
  it('builds a candidate that keeps what the draft never carried', () => {
    const existing = item('essay', { intensity: 0.5, protectedRest: true })

    expect(candidate(draft({ dayIndex: 1 }), existing)).toMatchObject({
      id: 'essay',
      intensity: 0.5,
      protectedRest: true,
      dayIndex: 1,
    })
  })

  it('takes the deadline from the draft, not from the block being edited', () => {
    const existing = item('essay', { deadlineDay: 4 })

    expect(candidate(draft({ deadlineDay: 6 }), existing).deadlineDay).toBe(6)
  })

  it('builds a candidate that matches no real block when the block is new', () => {
    expect(candidate(draft(), null).id).toBe(NEW_ITEM_ID)
  })
})

/**
 * The deadline, which this form could not set.
 *
 * `candidate` carried `existing?.deadlineDay ?? null` and `toFields` never mentioned it, so
 * a block added or edited by hand had no real deadline and fell back to the synthetic one
 * its kind gets -- five days for study, seven for errands. The model-driven paths could set
 * a real deadline and the human path could not, which left "every event has a deadline"
 * true only by fallback on the one surface a student types into directly.
 */
describe('the deadline a student sets by hand', () => {
  it('starts empty on a new block, so nothing is invented', () => {
    expect(blankDraft(week(), 3).deadlineDay).toBeNull()
  })

  it('opens on the deadline the block already had', () => {
    expect(draftFrom(item('essay', { deadlineDay: 6 })).deadlineDay).toBe(6)
  })

  it('saves what was set', () => {
    expect(toFields({ ...blankDraft(week(), 3), title: 'Essay', deadlineDay: 6 }).deadlineDay).toBe(6)
  })

  it('saves a cleared deadline as none, rather than leaving the old one', () => {
    expect(toFields({ ...draftFrom(item('essay', { deadlineDay: 6 })), deadlineDay: null }).deadlineDay).toBeNull()
  })

  /** A day after its own deadline is a contradiction, and honouring either half silently
   *  would be worse than saying so. Unlike a clash, this cannot be reconciled later. */
  it('refuses a day that falls after the deadline', () => {
    const errors = validate({ ...blankDraft(week(), 5), title: 'Essay', deadlineDay: 3 })

    expect(errors.deadlineDay).toMatch(/before|after|due/i)
  })

  it('allows a block that lands exactly on its deadline', () => {
    const errors = validate({ ...blankDraft(week(), 3), title: 'Essay', deadlineDay: 3 })

    expect(errors.deadlineDay).toBeUndefined()
  })

  it('allows no deadline at all, which is the ordinary case', () => {
    const errors = validate({ ...blankDraft(week(), 3), title: 'Walk', deadlineDay: null })

    expect(errors.deadlineDay).toBeUndefined()
  })
})

/**
 * The hours a student agreed to after being shown the correction.
 *
 * §2.4 padded silently. The form offers the padded figure instead -- "your essays usually
 * run 1.9x, plan 3.8h?" -- and accepting writes the bigger number into the block. The flag
 * travels with it so the model charges that figure once rather than padding it again; see
 * `domain/estimateBias`.
 */
describe('agreeing to the padded hours', () => {
  it('starts as nobody having agreed to anything', () => {
    expect(blankDraft(week(), 3).paddedHours).toBe(false)
  })

  it('remembers a block whose hours were agreed before', () => {
    expect(draftFrom(item('essay', { paddedHours: true })).paddedHours).toBe(true)
  })

  it('saves the decision with the block', () => {
    expect(toFields({ ...blankDraft(week(), 3), title: 'Essay', paddedHours: true }).paddedHours).toBe(
      true,
    )
  })

  /** Changing the hours by hand is a new estimate, and a new estimate has not been corrected
   *  -- leaving the flag set would exempt a figure the student typed themselves. */
  it('is given up the moment the hours are typed over', () => {
    const agreed = { ...blankDraft(week(), 3), title: 'Essay', hours: 3.8, paddedHours: true }

    expect(withHours(agreed, 2).paddedHours).toBe(false)
  })

  it('leaves the rest of the draft alone when the hours change', () => {
    const agreed = { ...blankDraft(week(), 3), title: 'Essay', hours: 3.8, paddedHours: true }

    expect(withHours(agreed, 2)).toMatchObject({ title: 'Essay', hours: 2 })
  })
})
