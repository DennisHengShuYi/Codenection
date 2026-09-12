import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import {
  addBlock,
  completeItem,
  deferItem,
  deferralOf,
  editItem,
  removeItem,
  type ItemFields,
} from './scheduleEdits'

const item = (id: string, dayIndex: number, over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id,
  title: id,
  type: 'errands',
  kind: 'errands',
  hours: 1,
  intensity: 1,
  dayIndex,
  startHour: 17,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const schedule = (items: ScheduledItem[]): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

describe('completeItem', () => {
  it('removes the item from the week', () => {
    expect(completeItem(schedule([item('a', 1), item('b', 2)]), 'a').items.map((i) => i.id)).toEqual(
      ['b'],
    )
  })

  it('leaves everything else alone', () => {
    const before = schedule([item('a', 1), item('b', 2)])
    const after = completeItem(before, 'a')

    expect(after.start).toEqual(before.start)
    expect(after.sleepByDay).toEqual(before.sleepByDay)
  })

  it('does nothing for an id that is not there', () => {
    expect(completeItem(schedule([item('a', 1)]), 'nope').items).toHaveLength(1)
  })

  it('does not mutate the week it was given', () => {
    const before = schedule([item('a', 1)])
    const snapshot = JSON.stringify(before)
    completeItem(before, 'a')

    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

describe('deferItem', () => {
  it('pushes the item later', () => {
    expect(deferItem(schedule([item('a', 1)]), 'a', DEFAULT_PARAMS).items[0]!.dayIndex).toBeGreaterThan(1)
  })

  // Otherwise deferring becomes a way to make a deadline quietly disappear.
  it('never pushes an item past its deadline', () => {
    const after = deferItem(schedule([item('a', 1, { deadlineDay: 2 })]), 'a', DEFAULT_PARAMS)

    expect(after.items[0]!.dayIndex).toBeLessThanOrEqual(2)
  })

  // An item pushed off the end vanishes from the model while still existing in the
  // student's life. On the last day there is no later day to search, so it stays put.
  it('never pushes an item off the end of the horizon', () => {
    const after = deferItem(schedule([item('a', HORIZON_DAYS - 1)]), 'a', DEFAULT_PARAMS)

    expect(after.items[0]!.dayIndex).toBeLessThan(HORIZON_DAYS)
  })

  it('does nothing for an id that is not there', () => {
    expect(deferItem(schedule([item('a', 1)]), 'nope', DEFAULT_PARAMS).items[0]!.dayIndex).toBe(1)
  })

  it('does not mutate the week it was given', () => {
    const before = schedule([item('a', 1)])
    const snapshot = JSON.stringify(before)
    deferItem(before, 'a', DEFAULT_PARAMS)

    expect(JSON.stringify(before)).toBe(snapshot)
  })

  /**
   * Later used to be pure geometry: the first day forward with a gap won, whatever that day
   * was already carrying. So it would drop four hours of study onto the worst day of the
   * fortnight without noticing, and the student had to run Rebalance to undo what Later had
   * just done.
   *
   * It now scores every day that has room the way §2.1 scores a whole week -- floor first,
   * then deficit days -- and takes the best. The bound is unchanged and is still the only
   * one: `effectiveDeadline`, so nothing can be deferred past when it is actually due.
   */
  it('passes over an earlier opening that would cost the floor more', () => {
    // Both days have room. Day 2 is already carrying a heavy fixed load, day 3 is clear --
    // so the earliest opening is the expensive one, and geometry alone would take it.
    const heavy = item('heavy', 2, { hours: 8, startHour: 8, fixed: true, type: 'mental' })
    // Mental has to be the reserve actually setting the floor, or the comparison is about
    // nothing: with four reserves level, isolation drains social past everything else and
    // `worstFloor` stops responding to where a study block sits at all.
    const week = {
      ...schedule([item('a', 1, { hours: 3, type: 'mental' }), heavy]),
      start: { mental: 40, physical: 90, social: 90, errands: 90 },
    }

    expect(deferItem(week, 'a', DEFAULT_PARAMS).items.find((i) => i.id === 'a')?.dayIndex).toBe(3)
  })

  /**
   * The other half, and the one that keeps Later meaning "later".
   *
   * With nothing to choose between the days, a search that maximises the floor could wander
   * to the end of the fortnight on rounding noise. Near-ties go to the earliest day, so an
   * empty week still moves the block one day and not eleven.
   */
  it('takes the earliest opening when no day is meaningfully kinder', () => {
    expect(deferItem(schedule([item('a', 1)]), 'a', DEFAULT_PARAMS).items[0]!.dayIndex).toBe(2)
  })
})

/**
 * Why it landed where it landed.
 *
 * "Essay moved to Thursday" answers where and leaves the student to guess at the rest -- and
 * the guess they will make is the wrong one, because the obvious reading of Later is still
 * the old behaviour: the next day with a gap. When it skips past a day that plainly had room,
 * silence about that reads as a bug rather than a decision.
 *
 * The search already knows. Every day earlier than the one it chose was passed over for
 * exactly one of two reasons, and they are different things to be told: nothing would fit, or
 * something would have fitted and it would have cost more.
 */
describe('deferralOf', () => {
  it('reports the day it came from and the day it went to', () => {
    const outcome = deferralOf(schedule([item('a', 1)]), 'a', DEFAULT_PARAMS)

    expect(outcome?.from).toBe(1)
    expect(outcome?.to).toBe(2)
  })

  it('counts nothing skipped when it took the very next day', () => {
    const outcome = deferralOf(schedule([item('a', 1)]), 'a', DEFAULT_PARAMS)

    expect(outcome?.skippedWithRoom).toBe(0)
    expect(outcome?.skippedFull).toBe(0)
  })

  /** Passed over because nothing would fit -- the old reason, and still a real one. */
  it('counts the days it passed over for having no room', () => {
    const wall = (dayIndex: number) =>
      item(`wall-${dayIndex}`, dayIndex, { hours: 16, startHour: 8, fixed: true })
    const outcome = deferralOf(schedule([item('a', 1), wall(2), wall(3)]), 'a', DEFAULT_PARAMS)

    expect(outcome?.to).toBe(4)
    expect(outcome?.skippedFull).toBe(2)
    expect(outcome?.skippedWithRoom).toBe(0)
  })

  /** The new reason, and the one that needs saying out loud. */
  it('counts a day that had room and was passed over anyway', () => {
    const heavy = item('heavy', 2, { hours: 8, startHour: 8, fixed: true, type: 'mental' })
    const week = {
      ...schedule([item('a', 1, { hours: 3, type: 'mental' }), heavy]),
      start: { mental: 40, physical: 90, social: 90, errands: 90 },
    }

    const outcome = deferralOf(week, 'a', DEFAULT_PARAMS)

    expect(outcome?.to).toBe(3)
    expect(outcome?.skippedWithRoom).toBe(1)
  })

  /** Nowhere legal at all. `to` is null rather than the day it started on, so a caller
   *  cannot mistake "stayed put" for "moved zero days". */
  it('reports no destination when nothing has room', () => {
    const wall = (dayIndex: number) =>
      item(`wall-${dayIndex}`, dayIndex, { hours: 16, startHour: 8, fixed: true })
    const walls = Array.from({ length: HORIZON_DAYS - 2 }, (_, offset) => wall(offset + 2))

    expect(deferralOf(schedule([item('a', 1), ...walls]), 'a', DEFAULT_PARAMS)?.to).toBeNull()
  })

  /**
   * The two ways Later can come back empty-handed, which the code told apart and the sentence
   * did not.
   *
   * A block whose deadline is at or before the day it sits on has no candidate day at all:
   * the search loop runs from `dayIndex + 1` to a `latest` that is already behind it, so it
   * never executes and zero days are examined. Reported as "nothing had room" that is simply
   * false -- no day was full, there was no day -- and it is the common case rather than an
   * edge one. Rhythms date from the last confirmed occurrence plus an interval, so anything
   * scheduled further out than its interval is already overdue the moment it is stamped.
   */
  it('says it is the deadline, not the days, when there is no later day at all', () => {
    const overdue = { ...item('walk', 5, { kind: 'lightExercise' }), softDeadlineDay: 2 }
    const outcome = deferralOf(schedule([overdue]), 'walk', DEFAULT_PARAMS)

    expect(outcome?.to).toBeNull()
    expect(outcome?.blocked).toBe('due')
    // Nothing was examined, so nothing may be reported as passed over.
    expect(outcome?.skippedFull).toBe(0)
  })

  it('still says it is the days when days were looked at and were full', () => {
    const wall = (dayIndex: number) =>
      item(`wall-${dayIndex}`, dayIndex, { hours: 16, startHour: 8, fixed: true })
    const walls = Array.from({ length: HORIZON_DAYS - 2 }, (_, offset) => wall(offset + 2))
    const outcome = deferralOf(schedule([item('a', 1), ...walls]), 'a', DEFAULT_PARAMS)

    expect(outcome?.to).toBeNull()
    expect(outcome?.blocked).toBe('full')
  })

  /**
   * What the move costs, in the unit the request box already prices in.
   *
   * Later chooses between candidate *days* and never compares them against leaving the block
   * alone, so the day it picks can still be worse than not moving at all -- and now that it
   * asks before acting, that is exactly the case a student needs the number for.
   *
   * Measured on the block's own load type rather than `worstFloor`, for `requestCost`'s
   * reason word for word: a mental block moving between two days does not touch the social
   * isolation that usually sets the overall floor, so on that measure every move would price
   * as free.
   */
  it('prices the move on the reserve the block actually spends', () => {
    const heavy = item('heavy', 2, { hours: 8, startHour: 8, fixed: true, type: 'mental' })
    const week = {
      ...schedule([item('a', 1, { hours: 3, type: 'mental' }), heavy]),
      start: { mental: 40, physical: 90, social: 90, errands: 90 },
    }

    const outcome = deferralOf(week, 'a', DEFAULT_PARAMS)

    expect(outcome?.floorBefore).toBeGreaterThan(0)
    expect(outcome?.floorAfter).toBeGreaterThan(outcome!.floorBefore!)
  })

  it('prices nothing when there was no move to price', () => {
    const overdue = { ...item('walk', 5, { kind: 'lightExercise' }), softDeadlineDay: 2 }
    const outcome = deferralOf(schedule([overdue]), 'walk', DEFAULT_PARAMS)

    expect(outcome?.floorBefore).toBeNull()
    expect(outcome?.floorAfter).toBeNull()
  })

  it('has nothing to report about a block that is not there', () => {
    expect(deferralOf(schedule([item('a', 1)]), 'nope', DEFAULT_PARAMS)).toBeNull()
  })
})

const fields = (over: Partial<ItemFields> = {}): ItemFields => ({
  title: 'Essay draft',
  type: 'mental',
  kind: 'studyBlock',
  paddedHours: false,
  hours: 2,
  dayIndex: 3,
  startHour: 14,
  deadlineDay: null,
  fixed: false,
  ...over,
})

describe('editing a block by hand', () => {
  it('writes the new fields onto the one block named', () => {
    const before = schedule([item('essay', 5, { startHour: 9 }), item('lab', 6)])

    const after = editItem(before, 'essay', fields({ dayIndex: 3, startHour: 14, hours: 2 }))

    expect(after.items.find((candidate) => candidate.id === 'essay')).toMatchObject({
      dayIndex: 3,
      startHour: 14,
      hours: 2,
      title: 'Essay draft',
    })
    expect(after.items.find((candidate) => candidate.id === 'lab')).toEqual(
      before.items.find((candidate) => candidate.id === 'lab'),
    )
  })

  it('never mutates the week it was handed', () => {
    const before = schedule([item('essay', 5)])

    editItem(before, 'essay', fields({ dayIndex: 1 }))

    expect(before.items[0]!.dayIndex).toBe(5)
  })

  /**
   * The test that stops the form quietly stripping protection off a nap. Everything outside
   * `ItemFields` survives.
   *
   * The deadline used to be part of that set and has deliberately left it: the form asks
   * about it now, so carrying the old value through would make the field unable to change
   * anything. What is protected here is what the form still never asks about.
   */
  it('keeps what the form never asked about', () => {
    const before = schedule([
      item('nap', 4, { protectedRest: true, intensity: 0.5, seriesId: 'series-1' }),
    ])

    expect(editItem(before, 'nap', fields({ dayIndex: 2 })).items[0]).toMatchObject({
      protectedRest: true,
      intensity: 0.5,
      seriesId: 'series-1',
      dayIndex: 2,
    })
  })

  /** The other half: a deadline the student sets reaches the week, and one they clear is
   *  cleared rather than quietly restored from what the block used to say. */
  it('writes the deadline the form was given', () => {
    const before = schedule([item('essay', 4, { deadlineDay: 4 })])

    expect(editItem(before, 'essay', fields({ deadlineDay: 6 })).items[0]?.deadlineDay).toBe(6)
    expect(editItem(before, 'essay', fields({ deadlineDay: null })).items[0]?.deadlineDay).toBeNull()
  })

  // The same stale-id case `blockSheet` already handles by closing: it happens for real.
  it('leaves the week untouched when no block has that id', () => {
    const before = schedule([item('essay', 3)])

    expect(editItem(before, 'ghost', fields())).toEqual(before)
  })
})

describe('removing a block', () => {
  it('takes it out of the week', () => {
    const before = schedule([item('essay', 3), item('lab', 4)])

    expect(removeItem(before, 'essay').items.map((candidate) => candidate.id)).toEqual(['lab'])
  })

  it('takes the acceptance that created it out too', () => {
    const before = {
      ...schedule([item('essay', 3)]),
      commitments: [{ id: 'c1', title: 'Essay', reviewDay: 7, itemId: 'essay' }],
    }

    expect(removeItem(before, 'essay').commitments).toEqual([])
  })
})

describe('adding a block by hand', () => {
  /**
   * The case that distinguishes this from `placeItems`. The student chose the day and the
   * hour on a grid they were looking at; auto-placing it elsewhere would be the app
   * overriding a decision it had just asked them to make.
   */
  it('puts it exactly where it was told, not where a solver would prefer', () => {
    const before = schedule([item('lab', 3, { startHour: 14, hours: 3 })])

    const after = addBlock(before, fields({ dayIndex: 3, startHour: 14, hours: 2 }))

    expect(after.items[after.items.length - 1]).toMatchObject({
      dayIndex: 3,
      startHour: 14,
      hours: 2,
      title: 'Essay draft',
    })
  })

  it('gives it an id nothing else in the week is using', () => {
    const ids = addBlock(schedule([item('lab', 1)]), fields()).items.map((c) => c.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  // 5.1: a student may SCHEDULE rest. Only the app's own advice may pin it as protected.
  it('never creates protected rest, whatever was typed', () => {
    const after = addBlock(schedule([]), fields({ kind: 'rest', type: 'physical' }))

    expect(after.items[0]!.protectedRest).toBe(false)
  })

  it('leaves every existing block alone', () => {
    const before = schedule([item('lab', 1)])

    expect(addBlock(before, fields()).items[0]).toEqual(before.items[0])
  })
})

/**
 * Ruling 62/Ruling 45: deferring undated work is no longer free.
 *
 * `softDeadlines`' own docstring names this function as one of the three reasons it exists
 * -- "`scheduleEdits.deferItem` clamps undated work to the horizon edge and nothing sooner"
 * -- and it was never changed when the feature landed. A walk could still be pushed two
 * weeks out in one tap, which is exactly the behaviour giving every event a deadline was
 * meant to stop.
 */
describe('deferring something with only a synthetic deadline', () => {
  const walk = {
    id: 'walk',
    title: 'Walk',
    type: 'physical' as const,
    kind: 'lightExercise' as const,
    hours: 1,
    intensity: 1,
    dayIndex: 1,
    startHour: 9,
    fixed: false,
    deadlineDay: null,
    protectedRest: false,
  }

  /**
   * Rewritten with the days in between filled, because the mechanism changed under it.
   *
   * The old defer jumped `byDays` and clamped, so a ten-day push landed exactly on the
   * deadline from anywhere. It now steps day by day looking for an opening, so reaching the
   * deadline means every day before it was full -- which is the only way the clamp was ever
   * load-bearing in the first place.
   */
  it('stops at the soft deadline rather than the end of the fortnight', () => {
    const full = (dayIndex: number) =>
      item(`wall-${dayIndex}`, dayIndex, { hours: 16, startHour: 8, fixed: true })

    const week = schedule([{ ...walk, softDeadlineDay: 3 }, full(2)])

    expect(deferItem(week, 'walk', DEFAULT_PARAMS).items[0]?.dayIndex).toBe(3)
  })

  it('never lands past the soft deadline, however full the days before it', () => {
    const full = (dayIndex: number) =>
      item(`wall-${dayIndex}`, dayIndex, { hours: 16, startHour: 8, fixed: true })

    const week = schedule([{ ...walk, softDeadlineDay: 3 }, full(2), full(3)])

    // Nowhere legal at all, so it does not move rather than moving past the wall.
    expect(deferItem(week, 'walk', DEFAULT_PARAMS).items[0]?.dayIndex).toBe(1)
  })

  /** A real deadline still wins over a derived one -- it is a fact about the world. */
  it('still stops at a real deadline when there is one', () => {
    const week = schedule([{ ...walk, deadlineDay: 2, softDeadlineDay: 6 }])

    expect(deferItem(week, 'walk', DEFAULT_PARAMS).items[0]?.dayIndex).toBeLessThanOrEqual(2)
  })

  /** Nothing stamped and nothing stated: there is no deadline to hold it to, so the horizon
   *  edge is the only limit -- and with every day before it full, that is where it lands. */
  it('falls back to the horizon when the week has never been stamped', () => {
    // Days 2 to 19 full, leaving only the last day of the horizon open.
    const walls = Array.from({ length: HORIZON_DAYS - 3 }, (_, offset) =>
      item(`wall-${offset + 2}`, offset + 2, { hours: 16, startHour: 8, fixed: true }),
    )

    expect(deferItem(schedule([walk, ...walls]), 'walk', DEFAULT_PARAMS).items[0]?.dayIndex).toBe(
      HORIZON_DAYS - 1,
    )
  })
})

/**
 * Later, as a placement rather than as arithmetic.
 *
 * It used to be `dayIndex + 2` at the same hour, clamped to the deadline. That moved a block
 * without looking at where it was moving it to: onto a day already full, on top of a fixed
 * class, at an hour the student was asleep. And when the block already sat on its deadline
 * the clamp returned the day it was on, so the sheet closed and nothing at all had happened.
 *
 * It now searches the days it is allowed to use and puts the block in a real opening, at an
 * hour that suits the kind of work -- the same `slotOn` every other placement path in the
 * app goes through.
 */
describe('deferItem, looking for somewhere to put it', () => {
  const busy = (dayIndex: number): ScheduledItem =>
    item(`wall-${dayIndex}`, dayIndex, {
      hours: 16,
      startHour: 8,
      fixed: true,
      kind: 'studyBlock',
      type: 'mental',
    })

  it('skips a day with no room and lands on one that has some', () => {
    const week = schedule([item('a', 1), busy(2), busy(3)])

    expect(deferItem(week, 'a', DEFAULT_PARAMS).items[0]!.dayIndex).toBeGreaterThan(3)
  })

  it('puts it in a real opening rather than at the hour it used to be', () => {
    const week = schedule([
      item('a', 1, { startHour: 9 }),
      item('taken', 2, { startHour: 9, hours: 4, fixed: true }),
    ])

    const moved = deferItem(week, 'a', DEFAULT_PARAMS).items[0]!

    const clash =
      moved.dayIndex === 2 && moved.startHour < 13 && moved.startHour + moved.hours > 9

    expect(clash).toBe(false)
  })

  it('still never moves anything past its deadline', () => {
    const after = deferItem(schedule([item('a', 1, { deadlineDay: 3 })]), 'a', DEFAULT_PARAMS)

    expect(after.items[0]!.dayIndex).toBeLessThanOrEqual(3)
  })

  /** The no-op that read as a broken button: a block already sitting on its own deadline
   *  had nowhere legal to go, so Later closed the sheet and changed nothing. It is still
   *  not moved -- there is nowhere to move it to -- but that is now a stated outcome rather
   *  than a silent one, and the caller can tell. */
  it('reports that it moved nothing when the deadline leaves no room', () => {
    const week = schedule([item('a', 3, { deadlineDay: 3 })])

    expect(deferItem(week, 'a', DEFAULT_PARAMS)).toBe(week)
  })

  it('reports the week back unchanged for an id that is not there', () => {
    const week = schedule([item('a', 1)])

    expect(deferItem(week, 'nope', DEFAULT_PARAMS)).toBe(week)
  })
})
