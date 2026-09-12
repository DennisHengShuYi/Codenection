import { describe, expect, it } from 'vitest'
import { MIN_SAMPLES_TO_SPEAK } from './evidence'
import type { SleepNight } from './sleepLog'
import { MEASURED_NIGHTS, measuredNight, sleepRealityLine } from './sleepReality'

const nights = (...hours: readonly number[]): readonly SleepNight[] =>
  hours.map((value, index) => ({
    isoDate: `2026-09-${String(index + 1).padStart(2, '0')}`,
    hours: value,
    answeredAt: index,
  }))

describe('measuredNight', () => {
  /**
   * Three, because two points make a line out of a coincidence -- `evidence.ts`'s rule,
   * imported rather than restated. The shared constant is asserted alongside the behaviour so
   * that moving the rule and forgetting this module fails here, rather than silently changing
   * when the app starts speaking about somebody.
   */
  it('says nothing below the shared sample floor', () => {
    expect(measuredNight(nights(5, 5))).toBeNull()
    expect(MIN_SAMPLES_TO_SPEAK).toBe(3)
  })

  it('averages the reported nights once it has enough', () => {
    expect(measuredNight(nights(6, 6, 6))).toBe(6)
    expect(measuredNight(nights(4.5, 6, 7.5))).toBe(6)
  })

  it('says nothing about an empty log', () => {
    expect(measuredNight([])).toBeNull()
  })
})

/**
 * A week, not a lifetime.
 *
 * The average is a claim about how the student sleeps *now*, and it is what the app reasons
 * about the nights ahead from. A term's worth of history drags that toward a student who no
 * longer exists -- a good October should not keep a bad December looking survivable, which is
 * the same argument `dial/trend` makes for judging a reserve on its most recent days rather
 * than on the whole projection.
 */
describe('measuredNight over a week', () => {
  it('reads only the most recent week of nights', () => {
    const older = Array.from({ length: MEASURED_NIGHTS }, () => 8)

    // A run of 4-hour nights before the window, which must not pull the average down.
    expect(measuredNight(nights(4, 4, 4, ...older))).toBe(8)
  })

  it('uses everything it has while it has less than a week', () => {
    expect(measuredNight(nights(6, 6, 6))).toBe(6)
  })

  it('counts a week as seven nights', () => {
    expect(MEASURED_NIGHTS).toBe(7)
  })
})

describe('sleepRealityLine', () => {
  it('says nothing before there is evidence', () => {
    expect(sleepRealityLine(nights(5, 5), 8)).toBeNull()
  })

  it('names both figures when the student sleeps short of their target', () => {
    expect(sleepRealityLine(nights(6, 6, 6), 8)).toBe('You plan 8 hours and average about 6.')
  })

  /**
   * The asymmetry copied from `realityCheck.paddingFor`, and its reason is that module's own:
   * correcting in the generous direction "would quietly make a heavy week look survivable,
   * which is the opposite of what this app is for". Sleeping better than planned must never
   * make the app optimistic.
   */
  it('says nothing when the student sleeps more than they planned', () => {
    expect(sleepRealityLine(nights(8.5, 8.5, 8.5), 7)).toBeNull()
  })

  /** Under this the difference is rounding rather than a bias worth telling somebody about --
   *  the rule `realityCheck.WORTH_SAYING` already applies to estimates. */
  it('says nothing about a gap too small to matter', () => {
    expect(sleepRealityLine(nights(7.8, 7.8, 7.8), 8)).toBeNull()
  })

  /**
   * §8.2: the product copy never scolds and never instructs. Pinned as a rule rather than
   * trusted to stay true, because this is the one line in the app that tells a student
   * something about their own habits, and so the one most likely to drift into advice.
   */
  it('states the gap without instructing the student', () => {
    const line = sleepRealityLine(nights(5, 5, 5), 8) ?? ''

    expect(line).not.toBe('')
    for (const word of ['should', 'need to', 'must', 'try to', 'only']) {
      expect(line.toLowerCase()).not.toContain(word)
    }
  })
})
