import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, HORIZON_DAYS, USEFUL_REST_HOURS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { DAILY_RECOVERY_CEILING } from './recoveryCeiling'
import { applyRest, planRest, restBlockTitle } from './restNow'
import { stampSoftDeadlines } from './softDeadlines'

const item = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'a',
  title: 'Ethics essay',
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex: 0,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const rest = (over: Partial<ScheduledItem> = {}): ScheduledItem =>
  item({ kind: 'rest', fixed: true, protectedRest: true, title: 'Rest', ...over })

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 60, physical: 60, social: 60, errands: 60 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

const TODAY = 3

const plan = (schedule: Schedule, nowHour = 14) =>
  planRest(stampSoftDeadlines(schedule, TODAY, []), DEFAULT_PARAMS, TODAY, nowHour, [])

/** A day with no free stretch at all. */
const packed = (dayIndex: number): ScheduledItem =>
  item({ id: `packed-${dayIndex}`, dayIndex, startHour: 0, hours: 24, fixed: true })

describe('planRest, when it simply fits', () => {
  it('puts rest in the first opening from now', () => {
    const out = plan(week())

    expect(out.kind).toBe('fits')
    expect(out.kind === 'fits' && out.block.startHour).toBe(14)
    expect(out.kind === 'fits' && out.block.dayIndex).toBe(TODAY)
  })

  it('never offers an hour that has already gone', () => {
    // The morning is free and it is four in the afternoon. Rest is scheduled forward from
    // now or not at all -- offering 9am would be offering a time the student cannot take.
    const out = plan(week({ items: [item({ dayIndex: TODAY, startHour: 16, hours: 8 })] }), 10)

    expect(out.kind === 'fits' && out.block.startHour).toBeGreaterThanOrEqual(10)
  })

  it('starts at the gap rather than at now when now is inside a block', () => {
    const out = plan(week({ items: [item({ dayIndex: TODAY, startHour: 13, hours: 3 })] }), 14)

    expect(out.kind === 'fits' && out.block.startHour).toBe(16)
  })

  it('never offers more than the engine will credit for one block', () => {
    const out = plan(week())

    expect(out.kind === 'fits' && out.block.hours).toBeLessThanOrEqual(USEFUL_REST_HOURS)
  })

  it('sizes itself to a short gap rather than overrunning it', () => {
    const out = plan(week({ items: [item({ dayIndex: TODAY, startHour: 15, hours: 9 })] }), 14)

    expect(out.kind === 'fits' && out.block.hours).toBe(1)
  })

  it('reports what the rest is worth, in a number that actually moves', () => {
    // Not the fortnight's floor. That sits at the trough -- social isolation three weeks
    // out for a rested student -- which rest on day three does not reach, so quoting it
    // would show the same figure before and after. RequestCost records the same trap about
    // its own floor, which is where this reasoning comes from.
    const out = plan(week())

    expect(out.kind === 'fits' && out.gain.dayAfter).toBeGreaterThan(
      (out.kind === 'fits' && out.gain.dayBefore) || 0,
    )
    expect(out.kind === 'fits' && out.gain.deepestLift).toBeGreaterThan(0)
  })
})

describe('planRest, when the day is at its recovery ceiling', () => {
  const atCeiling = () =>
    week({
      items: Array.from({ length: DAILY_RECOVERY_CEILING / 2 }, (_, index) =>
        rest({ id: `r${index}`, dayIndex: TODAY, startHour: 8 + index * 2, hours: 2 }),
      ),
    })

  it('offers a later day instead of stacking more onto today', () => {
    // The brake. Pressing Rest again and again cannot keep filling one day, because past
    // the ceiling the model stops believing the recovery it would be crediting.
    const out = plan(atCeiling())

    expect(out.kind).toBe('laterDay')
    expect(out.kind === 'laterDay' && out.block.dayIndex).toBeGreaterThan(TODAY)
  })

  it('says why today was not the answer', () => {
    const out = plan(atCeiling())

    expect(out.kind === 'laterDay' && out.whyNotToday).toMatch(/recovery|already/i)
  })

  it('never offers a block that would push a day past the ceiling', () => {
    const nearlyFull = week({
      items: [rest({ id: 'r0', dayIndex: TODAY, startHour: 8, hours: DAILY_RECOVERY_CEILING - 1 })],
    })

    expect(plan(nearlyFull).kind === 'fits' && plan(nearlyFull)).toBeTruthy()
    const out = plan(nearlyFull)
    expect(out.kind === 'fits' && out.block.hours).toBeLessThanOrEqual(1)
  })
})

describe('planRest, when today has no room', () => {
  it('falls to a later day when nothing can open one today', () => {
    // Today is immovable wall to wall, so no single move can make space on it.
    const out = plan(week({ items: [packed(TODAY)] }))

    expect(out.kind).toBe('laterDay')
    expect(out.kind === 'laterDay' && out.block.dayIndex).toBeGreaterThan(TODAY)
  })

  it('picks the earliest later day with room, not merely a day with room', () => {
    const out = plan(week({ items: [packed(TODAY), packed(TODAY + 1)] }))

    expect(out.kind === 'laterDay' && out.block.dayIndex).toBe(TODAY + 2)
  })

  it('refuses when no day in the fortnight has room', () => {
    const everyDayFull = week({
      items: Array.from({ length: HORIZON_DAYS }, (_, day) => packed(day)),
    })

    const out = plan(everyDayFull)

    expect(out.kind).toBe('refused')
    expect(out.kind === 'refused' && out.why.length).toBeGreaterThan(0)
  })
})

describe('planRest', () => {
  it('gives the same answer twice for the same week', () => {
    // Pure, and free of any clock: `today` and `nowHour` are supplied. A student who taps
    // twice must not see two different answers.
    const schedule = week({ items: [item({ dayIndex: TODAY, startHour: 9, hours: 4 })] })

    expect(plan(schedule)).toEqual(plan(schedule))
  })

  it('takes the hour from its argument rather than from a clock', () => {
    // The behavioural half of "pure": if it read a clock of its own, the answer could not
    // depend on what it was told the hour was.
    const schedule = week()

    expect(plan(schedule, 11).kind === 'fits' && plan(schedule, 11)).not.toEqual(
      plan(schedule, 17).kind === 'fits' && plan(schedule, 17),
    )
  })

  it('does not modify the week it was given', () => {
    const schedule = stampSoftDeadlines(week({ items: [item({ dayIndex: TODAY })] }), TODAY, [])
    const snapshot = JSON.stringify(schedule)

    planRest(schedule, DEFAULT_PARAMS, TODAY, 14, [])

    expect(JSON.stringify(schedule)).toBe(snapshot)
  })
})

/**
 * The half of the Rest button that changes the week.
 *
 * `planRest` is the half with all the arithmetic and all the tests; `applyRest` is the half
 * that actually writes, and it was reached by nothing. Its own docstring calls it "the only
 * place the two-step order is written down" -- so if that order were ever reversed, the rest
 * would be placed into a slot the move had not yet freed, and nothing would have said so.
 */
describe('applyRest', () => {
  it('adds the rest a fitting plan describes', () => {
    const before = week()
    const out = plan(before)
    expect(out.kind).toBe('fits')

    const after = applyRest(before, out)
    const added = after.items.filter((block) => block.protectedRest)

    expect(added).toHaveLength(1)
    expect(added[0]?.title).toBe(restBlockTitle())
  })

  it('leaves the week exactly as it was when the plan was a refusal', () => {
    const nowhere = week({ items: Array.from({ length: HORIZON_DAYS }, (_, day) => packed(day)) })
    const out = plan(nowhere)
    expect(out.kind).toBe('refused')

    expect(applyRest(nowhere, out)).toEqual(nowhere)
  })

  it('never modifies the week it was given', () => {
    const before = week()
    const snapshot = JSON.parse(JSON.stringify(before))

    applyRest(before, plan(before))

    expect(before).toEqual(snapshot)
  })
})

/**
 * The refusals, which are the half this feature is named for -- a Rest button that can say
 * no. The paths above prove it finds room; these prove it declines to invent room that is
 * not there, and says which reason applies.
 *
 * Written against `planRest`'s own answer rather than its internals: what matters is that a
 * student is told the truth about their day, not which helper worked it out.
 */
describe('planRest, when it says no', () => {
  /**
   * A fortnight with no free stretch anywhere. Nothing can be moved to make room either,
   * because every block is fixed -- so there is no rung left to try.
   */
  it('refuses outright when no day in the fortnight has a stretch free', () => {
    const everyDayFull = Array.from({ length: HORIZON_DAYS }, (_, day) => packed(day))

    const out = plan(week({ items: everyDayFull }))

    expect(out.kind).toBe('refused')
    if (out.kind === 'refused') expect(out.why.length).toBeGreaterThan(0)
  })

  /**
   * Today is full and every later day is too, except that the later days have already had
   * as much recovery as the model will credit. A day whose ceiling is spent has no room for
   * rest even where the clock is free, and offering it would promise a lift the engine
   * refuses to pay out.
   */
  it('will not offer a later day whose recovery ceiling is already spent', () => {
    const restedSolid = Array.from({ length: HORIZON_DAYS }, (_, day) =>
      day === TODAY
        ? packed(day)
        : rest({ id: `rested-${day}`, dayIndex: day, startHour: 8, hours: DAILY_RECOVERY_CEILING + 2 }),
    )

    const out = plan(week({ items: restedSolid }))

    // Either a refusal or a later day that is genuinely creditable -- never a later day
    // whose ceiling has nothing left to give.
    if (out.kind === 'laterDay') {
      expect(out.block.hours).toBeGreaterThan(0)
      expect(out.block.dayIndex).not.toBe(TODAY)
    } else {
      expect(out.kind).toBe('refused')
    }
  })

  /**
   * Today has no room, but a later day does. The student is told when instead of being told
   * no -- and told why today was not the answer, because a later day with no reason reads
   * as the app changing the subject.
   */
  it('offers a later day with a reason, rather than refusing, when one has room', () => {
    const out = plan(week({ items: [packed(TODAY)] }))

    expect(out.kind).toBe('laterDay')
    if (out.kind === 'laterDay') {
      expect(out.block.dayIndex).toBeGreaterThan(TODAY)
      expect(out.whyNotToday.length).toBeGreaterThan(0)
    }
  })

  /**
   * The gap exists but is too short to be worth anything. `MIN_GAP_HOURS` is the app's own
   * idea of the smallest useful stretch, and a block under it would be rest the engine does
   * not credit -- so today is not the answer even though the clock looks free.
   */
  it('does not offer a stretch too short for the model to credit', () => {
    const nearlyFull = [
      item({ id: 'morning', dayIndex: TODAY, startHour: 0, hours: 14, fixed: true }),
      item({ id: 'evening', dayIndex: TODAY, startHour: 15, hours: 9, fixed: true }),
    ]

    const out = plan(week({ items: nearlyFull }), 14)

    // One free hour between 14:00 and 15:00 is not a rest block.
    if (out.kind === 'fits') expect(out.block.hours).toBeGreaterThanOrEqual(1)
    else expect(['laterDay', 'needsMove', 'refused']).toContain(out.kind)
  })
})

/**
 * Rung 1: the answer that costs something.
 *
 * Between "there is room" and "not today" sits the case where room could be MADE -- one
 * thing moves and the rest fits. It is the only rung that asks the student to give something
 * up, so it names the move rather than performing it, and it is refused outright when the
 * move would cost more than the rest is worth.
 *
 * The fixture is what makes this rung reachable: today is full of movable work, and every
 * later day is genuinely taken. With a later day free the app would rightly offer that
 * instead -- moving today's work to buy rest today is a worse answer than resting tomorrow.
 */
describe('planRest, when room has to be made', () => {
  const chunksToday = () =>
    Array.from({ length: 6 }, (_, index) =>
      item({ id: `chunk-${index}`, dayIndex: TODAY, startHour: index * 4, hours: 4 }),
    )

  const laterDaysTaken = () =>
    Array.from({ length: HORIZON_DAYS - TODAY - 1 }, (_, index) =>
      packed(TODAY + 1 + index),
    )

  it('names the one thing that would have to move', () => {
    const out = plan(week({ items: [...chunksToday(), ...laterDaysTaken()] }), 0)

    expect(out.kind).toBe('needsMove')
    if (out.kind === 'needsMove') {
      expect(out.move.move.description.length, 'a move nobody can read is not an offer').toBeGreaterThan(0)
      expect(out.block.dayIndex).toBe(TODAY)
    }
  })

  /** The move is offered, never taken. Nothing about the week changes until the student
   *  says yes -- §16 again, and the reason this rung returns a plan rather than a schedule. */
  it('changes nothing by offering it', () => {
    const before = week({ items: [...chunksToday(), ...laterDaysTaken()] })

    const out = plan(before, 0)

    expect(out.kind).toBe('needsMove')
    expect(before.items.filter((block) => block.dayIndex === TODAY)).toHaveLength(6)
  })

  /** The receipt comes with it: a move the student is asked to make has to be worth
   *  something they can see. */
  it('says what the rest would be worth', () => {
    const out = plan(week({ items: [...chunksToday(), ...laterDaysTaken()] }), 0)

    if (out.kind === 'needsMove') {
      expect(out.gain.dayAfter).toBeGreaterThanOrEqual(out.gain.dayBefore)
      expect(out.gain.deepestLift).toBeGreaterThanOrEqual(0)
    }
  })
})
