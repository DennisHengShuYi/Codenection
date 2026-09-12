import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { overfullDay } from './overfull'

const SEED = 7

/**
 * A student who has answered nothing, which is the ordinary state of a bad fortnight.
 *
 * §8b: a past day carrying no answer is a day the student went quiet, and the model gets
 * more worried rather than pretending it heard from them. That pessimism is what takes a
 * heavy week into deficit at all -- under "everybody present" the same fortnight reads as
 * affordable, which is exactly the finding `commitments.test.ts` locks in one file over.
 */
const silent = (): readonly boolean[] => Array.from({ length: HORIZON_DAYS }, () => false)

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

const block = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'b1',
  title: 'Ethics essay',
  type: 'mental',
  kind: 'studyBlock',
  hours: 3,
  intensity: 1,
  dayIndex: 0,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

/**
 * A fortnight nothing can save.
 *
 * Every day carries more mental work than a day holds, on fixed blocks so the optimizer
 * cannot shift them apart -- which is the state this module exists to recognise: not a week
 * that is badly arranged, but one that is too big for the time it is in.
 */
const beyondRearranging = (): ScheduledItem[] =>
  Array.from({ length: HORIZON_DAYS }, (_, dayIndex) =>
    block({
      id: `heavy-${dayIndex}`,
      title: `heavy ${dayIndex}`,
      hours: 12,
      dayIndex,
      startHour: 8,
      fixed: true,
    }),
  )

/**
 * §2.2 at the surface, asked as a yes-or-no question.
 *
 * Every other answer this app gives to a bad fortnight is a rearrangement, because for
 * somebody merely badly scheduled that is the right answer. This is the case that is not:
 * the work does not fit in the days, and no amount of moving it will make it. The app cannot
 * say which of a student's commitments matters least -- it holds no importance data and
 * inventing some would be a confidently wrong answer, which this project treats as worse
 * than admitting it cannot compute one -- so all this does is name the day that fails and
 * what is standing on it. The choosing is the student's.
 */
describe('overfullDay', () => {
  it('says nothing about a week that is comfortable', () => {
    const schedule = week({ items: [block()] })

    expect(overfullDay(schedule, DEFAULT_PARAMS, SEED, 0, silent())).toBeNull()
  })

  it('says nothing at all about an empty week', () => {
    expect(overfullDay(week(), DEFAULT_PARAMS, SEED, 0, silent())).toBeNull()
  })

  /**
   * The distinction the whole module turns on.
   *
   * A week that rearranging would fix is a week with a Rebalance button, and telling that
   * student to delete something is telling them to lose work they could have kept. So the
   * rebalancer is run first, purely to be disbelieved: only when its own best attempt still
   * leaves the fortnight in deficit is there anything here to say.
   */
  it('says nothing when rearranging would fix it', () => {
    // All of it on one day, none of it fixed, and a fortnight of empty days to spread into.
    const stacked = Array.from({ length: 4 }, (_, index) =>
      block({ id: `stack-${index}`, title: `stack ${index}`, hours: 5, dayIndex: 3, startHour: 8 }),
    )

    expect(overfullDay(week({ items: stacked }), DEFAULT_PARAMS, SEED, 0, silent())).toBeNull()
  })

  it('names a day when the fortnight is past what rearranging can fix', () => {
    const found = overfullDay(week({ items: beyondRearranging() }), DEFAULT_PARAMS, SEED, 0, silent())

    expect(found).not.toBeNull()
    expect(found?.candidates.length).toBeGreaterThan(0)
  })

  /**
   * The day the student actually has, not the one they would have had.
   *
   * The rebalanced week is a hypothetical this module builds and throws away; it is only ever
   * used to answer "would moving things help". Naming its deficit day would point the student
   * at a day that does not exist on their screen.
   */
  it('names the failing day from the week the student actually has', () => {
    const items = beyondRearranging()
    const found = overfullDay(week({ items }), DEFAULT_PARAMS, SEED, 0, silent())

    // Every candidate sits on the day that was named, which can only be true if the day and
    // the blocks were read off the same schedule.
    expect(found?.candidates.every((one) => one.dayIndex === found.dayIndex)).toBe(true)
  })

  /**
   * A day already lived cannot be helped by dropping anything on it.
   *
   * `firstDeficitDay` is a property of the projection, which runs from day zero -- so a
   * student who overran last Tuesday still has that day reported long after there is
   * anything to do about it. Offering to delete yesterday's lecture would be the app failing
   * to notice which day it is.
   */
  it('says nothing when the only failing day is already behind the student', () => {
    const items = beyondRearranging().filter((one) => one.dayIndex < 3)
    const found = overfullDay(week({ items }), DEFAULT_PARAMS, SEED, HORIZON_DAYS - 1, silent())

    expect(found).toBeNull()
  })

  it('reports a failing day that is today or still ahead', () => {
    const found = overfullDay(week({ items: beyondRearranging() }), DEFAULT_PARAMS, SEED, 2, silent())

    expect(found).not.toBeNull()
    expect(found?.dayIndex).toBeGreaterThanOrEqual(2)
  })

  it('lists the day it names in the order the day happens', () => {
    const items = [
      ...beyondRearranging(),
      block({ id: 'evening', title: 'evening', hours: 1, dayIndex: 0, startHour: 20 }),
      block({ id: 'dawn', title: 'dawn', hours: 1, dayIndex: 0, startHour: 6 }),
    ]

    const found = overfullDay(week({ items }), DEFAULT_PARAMS, SEED, 0, silent())
    const hours = found?.candidates.map((one) => one.startHour) ?? []

    expect(hours).toEqual([...hours].sort((left, right) => left - right))
  })

  /**
   * §5.1: protected rest has one door, and this is not it.
   *
   * The optimizer cannot move protected rest and cannot schedule over it; a card that
   * offered to delete it would be a third way in that the spec calls the most important
   * design decision in the app.
   */
  it('never offers protected rest as something to drop', () => {
    const items = [
      ...beyondRearranging(),
      block({ id: 'rest', title: 'Rest', kind: 'rest', hours: 2, dayIndex: 0, startHour: 14, protectedRest: true }),
    ]

    const found = overfullDay(week({ items }), DEFAULT_PARAMS, SEED, 0, silent())

    expect(found?.candidates.some((one) => one.protectedRest)).toBe(false)
  })

  /**
   * A card with nothing to offer is worse than no card: it names a problem and then asks the
   * student to solve it with an empty list.
   */
  it('says nothing when the failing day holds nothing that may be dropped', () => {
    const items = beyondRearranging().map((one) =>
      one.dayIndex === 0 ? { ...one, protectedRest: true, kind: 'rest' as const } : one,
    )

    const found = overfullDay(week({ items }), DEFAULT_PARAMS, SEED, 0, silent())

    // Either it moved on to a later failing day that does have candidates, or it said
    // nothing -- what it must never do is name day zero with an empty list.
    expect(found?.dayIndex === 0).toBe(false)
  })

  /** The search takes its randomness as a parameter for §2.1's reason: a student who opens
   *  this twice must not be shown two different answers. */
  it('answers the same way twice for the same seed', () => {
    const schedule = week({ items: beyondRearranging() })

    const first = overfullDay(schedule, DEFAULT_PARAMS, SEED, 0, silent())
    const second = overfullDay(schedule, DEFAULT_PARAMS, SEED, 0, silent())

    expect(first).toEqual(second)
  })
})
