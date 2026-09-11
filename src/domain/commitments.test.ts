import { describe, expect, it } from 'vitest'
import type { ParsedItem } from '../ai'
import type { BlockRecord } from './blockLog'
import { DEFAULT_PARAMS, HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { accept, dropCommitmentFor, lapsed, REVIEW_DAYS } from './commitments'

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

const item = (over: Partial<ParsedItem> = {}): ParsedItem => ({
  id: 'r1',
  title: 'FYP presentation help',
  type: 'mental',
  kind: 'studyBlock',
  hours: 3,
  deadlineDay: 4,
  startHour: null,
  fixed: false,
  confident: true,
  repeat: null,
  ...over,
})

/** 14 straight days of real mental load -- heavy enough that, once missing-data pessimism
 *  is applied to a silent stretch, the mental reserve overtakes the natural social-isolation
 *  floor and drags the fortnight's worst point down with it. */
const dailyMentalLoad = (days: number, hours: number): ScheduledItem[] =>
  Array.from({ length: days }, (_, dayIndex) => ({
    id: `daily-${dayIndex}`,
    title: `daily ${dayIndex}`,
    type: 'mental' as const,
    kind: 'studyBlock' as const,
    hours,
    intensity: 1,
    dayIndex,
    startHour: 9,
    fixed: false,
    deadlineDay: null,
    protectedRest: false,
  }))

/** One answered block per day, so `checkedInDays` reads every day as checked in. */
const fullyCheckedInLog = (days: number): BlockRecord[] =>
  Array.from({ length: days }, (_, dayIndex) => ({
    blockId: `daily-${dayIndex}`,
    type: 'mental' as const,
    plannedHours: 6,
    dayIndex,
    answer: 'right' as const,
    answeredAt: 0,
  }))

describe('accept', () => {
  it('puts the commitment into the week', () => {
    expect(accept(week(), item(), 0).items).toHaveLength(1)
  })

  // §2.3: every acceptance carries a review date.
  it('remembers it with a review date', () => {
    const after = accept(week(), item(), 0)

    expect(after.commitments).toHaveLength(1)
    expect(after.commitments?.[0]?.reviewDay).toBe(REVIEW_DAYS)
  })

  /**
   * The day it is, not day zero.
   *
   * `accept` has always taken `today` and used it for the review date, then handed the item
   * to `addItems`, which placed everything from day zero regardless. So a student saying yes
   * on day ten got the work scheduled into days they had already lived -- and the review
   * date said day twenty-four while the block sat in the past.
   *
   * Asserted on undated work, which is where it shows. `placeItems` runs the two cases in
   * opposite directions: a deadlined item searches *backwards* from its deadline, so on an
   * empty week it lands on the deadline whatever `today` is and the bug hides. Undated work
   * looks forward from `today + DEFAULT_DAY_OFFSET`, so day zero sends it to day two --
   * eight days into the past for a student on day ten.
   *
   * `requestCost.ts` records the same bug being found and fixed once for the *pricing* half;
   * the fix never reached placement.
   */
  it('never schedules undated accepted work into a day already lived', () => {
    const after = accept(week(), item({ deadlineDay: null }), 10)
    const added = after.items[after.items.length - 1]

    expect(added?.dayIndex).toBeGreaterThanOrEqual(10)
  })

  it('names what was accepted, so a lapse can be explained rather than announced', () => {
    expect(accept(week(), item(), 0).commitments?.[0]?.title).toBe('FYP presentation help')
  })

  it('points at the item it created, so a lapse can remove the right one', () => {
    const after = accept(week(), item(), 0)

    expect(after.commitments?.[0]?.itemId).toBe(after.items[0]?.id)
  })

  it('keeps commitments already remembered', () => {
    const once = accept(week(), item(), 0)

    expect(accept(once, item({ id: 'r2' }), 0).commitments).toHaveLength(2)
  })

  it('does not modify the week it was given', () => {
    const before = week()
    const snapshot = JSON.stringify(before)

    accept(before, item(), 0)

    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

describe('lapsed', () => {
  it('finds nothing before the review date arrives', () => {
    expect(lapsed(accept(week(), item(), 0), 1, DEFAULT_PARAMS)).toEqual([])
  })

  /**
   * The direction-flip §2.3 is built on: saying no becomes the thing that happens by
   * itself, and staying in requires the act.
   */
  it('lapses a commitment the reserve can no longer hold', () => {
    const thin = week({ start: { mental: 10, physical: 10, social: 10, errands: 10 } })
    const accepted = accept(thin, item({ hours: 20 }), 0)

    expect(lapsed(accepted, REVIEW_DAYS, DEFAULT_PARAMS)).toHaveLength(1)
  })

  // The other direction, so a lapse means something when it happens.
  it('leaves one the reserve can still hold', () => {
    const accepted = accept(week(), item({ hours: 1 }), 0)

    expect(lapsed(accepted, REVIEW_DAYS, DEFAULT_PARAMS)).toEqual([])
  })

  it('finds nothing in a week with no commitments at all', () => {
    expect(lapsed(week(), 30, DEFAULT_PARAMS)).toEqual([])
  })

  /**
   * Weeks saved before this feature have no commitments field at all, and they must keep
   * loading. This is the test that makes "no migration needed" safe rather than merely
   * convenient -- a student who opened the app yesterday should not lose their week today.
   */
  it('handles a week saved before commitments existed', () => {
    const old = JSON.parse(JSON.stringify(week())) as Schedule

    expect(old.commitments).toBeUndefined()
    expect(() => lapsed(old, 30, DEFAULT_PARAMS)).not.toThrow()
    expect(lapsed(old, 30, DEFAULT_PARAMS)).toEqual([])
  })

  /**
   * §6.5/§8b: `lapsed` must judge a commitment against the same silence-aware projection
   * the room and the dial already show, not an optimistic one that has never heard the
   * student went quiet. This is the finding this test locks in: the same heavy fortnight
   * reads as affordable when the student has been answering block check-ins, and as
   * unaffordable when they have gone silent -- because a silent past correlates with a bad
   * week, and the model is supposed to get more worried, not pretend it heard from them.
   */
  it('lapses a commitment the optimistic projection alone would have let stand, once the student has gone quiet', () => {
    const busy = week({
      start: { mental: 64, physical: 64, social: 64, errands: 64 },
      items: dailyMentalLoad(14, 6),
    })
    const accepted = accept(busy, item({ hours: 3, deadlineDay: 13 }), 7)
    const today = accepted.commitments?.[0]?.reviewDay ?? -1
    expect(today).toBe(14)

    // Answering every day: the student was present the whole time, so there is nothing for
    // missing-data pessimism to react to, and the heavy-but-attended week stands.
    expect(lapsed(accepted, today, DEFAULT_PARAMS, fullyCheckedInLog(14))).toEqual([])

    // Silent the whole time (the default, unanswered log): the same fortnight now reads as
    // unaffordable, and the commitment due for review lapses.
    expect(lapsed(accepted, today, DEFAULT_PARAMS)).toHaveLength(1)
  })
})

/**
 * A commitment points at the item `accept` created for it, and §2.3's whole mechanism reads
 * that item through the projection. One left pointing at a block that has been removed by
 * hand would go on being weighed, and go on being offered for withdrawal, for something no
 * longer in the week.
 */
describe('a commitment whose block is gone', () => {
  it('goes with it', () => {
    const accepted = accept(week(), item(), 0)
    const itemId = accepted.items[accepted.items.length - 1]!.id

    expect(dropCommitmentFor(accepted, itemId).commitments).toEqual([])
  })

  it('leaves every other commitment alone', () => {
    const one = accept(week(), item({ id: 'r1', title: 'One' }), 0)
    const two = accept(one, item({ id: 'r2', title: 'Two' }), 0)
    const goneId = two.items[two.items.length - 1]!.id

    const after = dropCommitmentFor(two, goneId)

    expect(after.commitments).toHaveLength(1)
    expect(after.commitments?.[0]?.title).toBe('One')
  })

  // Identity, not just equality: a caller can then tell a real change from a no-op without
  // comparing contents.
  it('hands back the very same week when there was nothing to drop', () => {
    const before = accept(week(), item(), 0)

    expect(dropCommitmentFor(before, 'never-existed')).toBe(before)
  })

  it('is untroubled by a week that has never had a commitment', () => {
    const before = week()

    expect(dropCommitmentFor(before, 'anything')).toBe(before)
  })
})
