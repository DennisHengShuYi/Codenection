import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { prescribe } from './prescribe'
import { attemptsIn, recordAttempt } from './recoveryLog'

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

const socialLow = () => week({ start: { mental: 70, physical: 70, social: 15, errands: 70 } })

describe('recordAttempt', () => {
  it('puts the attempt in the week', () => {
    expect(attemptsIn(recordAttempt(week(), 'rest', false))).toHaveLength(1)
  })

  /**
   * Both outcomes, not just failures. A log that only remembers what did not work would
   * quietly become a blocklist, and the app would forget what it should be repeating.
   */
  it('records that something helped as well as that it did not', () => {
    expect(attemptsIn(recordAttempt(week(), 'rest', true))[0]?.helped).toBe(true)
    expect(attemptsIn(recordAttempt(week(), 'rest', false))[0]?.helped).toBe(false)
  })

  it('keeps attempts already recorded', () => {
    const once = recordAttempt(week(), 'rest', false)

    expect(attemptsIn(recordAttempt(once, 'lightExercise', true))).toHaveLength(2)
  })

  it('does not modify the week it was given', () => {
    const before = week()
    const snapshot = JSON.stringify(before)

    recordAttempt(before, 'rest', false)

    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

describe('attemptsIn', () => {
  it('reads a week with no log as empty rather than throwing', () => {
    expect(attemptsIn(week())).toEqual([])
  })

  /**
   * Weeks saved before this feature have no such field, and they must keep loading. This is
   * what makes "no migration needed" safe rather than merely convenient -- a student who
   * opened the app yesterday should not lose their week today.
   */
  it('handles a week saved before the log existed', () => {
    const old = JSON.parse(JSON.stringify(week())) as Schedule

    expect(old.recoveryLog).toBeUndefined()
    expect(() => attemptsIn(old)).not.toThrow()
    expect(attemptsIn(old)).toEqual([])
  })
})

/**
 * §5.2's last line, asserted through the real entry point rather than by inspecting the log.
 * What matters is that the *suggestion* changes -- not that a row was written.
 */
describe('what did not work stops being suggested', () => {
  it('stops offering a prescription that was marked unhelpful', () => {
    const before = prescribe(socialLow())
    expect(before?.kind).toBe('socialRestorative')

    const after = recordAttempt(socialLow(), 'socialRestorative', false)

    expect(prescribe(after, attemptsIn(after))).toBeNull()
  })

  it('keeps offering one that helped', () => {
    const after = recordAttempt(socialLow(), 'socialRestorative', true)

    expect(prescribe(after, attemptsIn(after))?.kind).toBe('socialRestorative')
  })

  it('does not silence an unrelated prescription', () => {
    const after = recordAttempt(socialLow(), 'rest', false)

    expect(prescribe(after, attemptsIn(after))?.kind).toBe('socialRestorative')
  })
})
