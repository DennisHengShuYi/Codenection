import { describe, expect, it } from 'vitest'
import { anchorLines, readCalendar } from './calendarAnchor'

/**
 * §44's anchor, shared by both readers rather than written out beside each one.
 *
 * The planner got it first: the model is told "deadlineDay is a day index from 0 (today)"
 * and was never told what today WAS, so a stated weekday could only be guessed at -- "gym
 * thursday" came back as whatever the guess produced. The photo path has the same prompt,
 * the same gap and the same fix, and a second copy of either half would be free to drift
 * from the first: a validator that accepted a longer label here than there, or a wording
 * that had been corrected against the live model in one prompt and not the other.
 */
describe('the anchor read off the wire', () => {
  const valid = { today: 0, startWeekday: 5, todayLabel: '11 September 2026' }

  it('takes a well-formed calendar', () => {
    expect(readCalendar(valid)).toEqual(valid)
  })

  it('takes one with no label, since a week may never have been dated', () => {
    expect(readCalendar({ today: 2, startWeekday: 1 })).toEqual({ today: 2, startWeekday: 1 })
  })

  it.each([undefined, null, 'friday', 42, []])('refuses %s', (raw) => {
    expect(readCalendar(raw)).toBeUndefined()
  })

  it.each([
    ['a weekday outside the week', { ...valid, startWeekday: 7 }],
    ['a negative weekday', { ...valid, startWeekday: -1 }],
    ['a fractional weekday', { ...valid, startWeekday: 1.5 }],
    ['a negative today', { ...valid, today: -1 }],
    ['a today beyond any horizon', { ...valid, today: 5000 }],
    ['a fractional today', { ...valid, today: 0.5 }],
  ])('refuses %s', (_name, raw) => {
    expect(readCalendar(raw)).toBeUndefined()
  })

  /**
   * The label is interpolated into a prompt, so its length is the thing that matters: a
   * date is short, and anything long arriving here is someone using the prompt as a
   * channel rather than a student's own week.
   */
  it('drops a label too long to be a date, keeping the rest', () => {
    const long = readCalendar({ ...valid, todayLabel: 'x'.repeat(200) })

    expect(long).toEqual({ today: 0, startWeekday: 5 })
  })

  it('drops an empty label rather than sending an empty sentence', () => {
    expect(readCalendar({ ...valid, todayLabel: '' })).toEqual({ today: 0, startWeekday: 5 })
  })
})

describe('the anchor said to a model', () => {
  it('names the real date and the weekday it falls on', () => {
    // 2026-09-11 is a Friday, and day 0 is that Friday.
    const lines = anchorLines({ today: 0, startWeekday: 5, todayLabel: '11 September 2026' })

    expect(lines).toMatch(/11 September 2026/)
    expect(lines).toMatch(/Friday/)
  })

  it('counts today forward from the start of the week', () => {
    // Day 3 of a week that began on a Friday is a Monday.
    const lines = anchorLines({ today: 3, startWeekday: 5, todayLabel: '14 September 2026' })

    expect(lines).toMatch(/Monday/)
  })

  /**
   * The wording earned by a live call, and the reason this is shared rather than copied:
   * "never backwards into the past" was the first attempt, and the real model answered it
   * by dropping the day altogether -- `deadlineDay: null` for a stated weekday, which is
   * worse than the wrong day it replaced. Both prompts get the corrected version or
   * neither should.
   */
  it('asks the model to work the date out rather than forbidding a direction', () => {
    const lines = anchorLines({ today: 0, startWeekday: 5, todayLabel: '11 September 2026' })

    expect(lines).toMatch(/next occurrence/i)
    expect(lines).not.toMatch(/never backwards/i)
  })

  it('says nothing at all for a week that has never been dated', () => {
    expect(anchorLines({ today: 0, startWeekday: 5 })).toBe('')
    expect(anchorLines(undefined)).toBe('')
  })
})
