import { describe, expect, it } from 'vitest'
import type { ParsedItem } from '../ai'
import { HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { DEFAULT_PARAMS } from '../engine'
import { describePlacement, fixThatMakesRoom, placeItems } from './placement'
import { slotOn } from './slotFinder'

const empty = (): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const parsed = (over: Partial<ParsedItem> = {}): ParsedItem => ({
  id: 'a',
  title: 'Essay',
  type: 'mental',
  kind: 'studyBlock',
  hours: 3,
  deadlineDay: null,
  startHour: null,
  fixed: false,
  confident: true,
  repeat: null,
  ...over,
})

/** A day with no room left in it at all. */
const fullDay = (dayIndex: number): ScheduledItem => ({
  id: `wall-${dayIndex}`,
  title: 'Solid',
  type: 'mental',
  kind: 'studyBlock',
  hours: 16,
  intensity: 1,
  dayIndex,
  startHour: 8,
  fixed: true,
  deadlineDay: null,
  protectedRest: false,
})

describe('placeItems', () => {
  it('puts an item where it asked to go when there is room', () => {
    const { schedule, notes } = placeItems(empty(), [parsed({ deadlineDay: 4 })], 0)

    expect(schedule.items[0]?.dayIndex).toBe(4)
    expect(notes[0]?.movedFrom).toBeNull()
  })

  /**
   * The step the old code never took. A day with no room used to get the item anyway,
   * stacked on top of whatever was there -- so the week said something that was not true.
   *
   * Earlier, not later: a deadline is a latest bound, so a full due-day sends work
   * backwards toward today. Pushing it past the day it is due would be the one
   * rearrangement that costs a student marks.
   */
  it('moves earlier when the day it is due is full', () => {
    const { schedule, notes } = placeItems(
      { ...empty(), items: [fullDay(6)] },
      [parsed({ deadlineDay: 6 })],
      0,
    )

    expect(schedule.items[1]?.dayIndex).toBe(5)
    expect(notes[0]?.movedFrom).toBe(6)
  })

  /** Undated work has no wall to back away from, so it looks forward instead. */
  it('moves later when undated work has nowhere to sit', () => {
    const { schedule, notes } = placeItems({ ...empty(), items: [fullDay(2)] }, [parsed()], 0)

    expect(schedule.items[1]?.dayIndex).toBe(3)
    expect(notes[0]?.movedFrom).toBe(2)
  })

  /**
   * A deadline is a wall, not a preference. Moving something past the day it is due to
   * make the week look tidier is the one rearrangement that costs the student marks.
   */
  it('never moves an item past its deadline to find room', () => {
    const walled = { ...empty(), items: [fullDay(2), fullDay(3)] }

    const { schedule } = placeItems(walled, [parsed({ deadlineDay: 3, hours: 4 })], 0)

    expect(schedule.items.at(-1)?.dayIndex).toBeLessThanOrEqual(3)
  })

  it('still adds an item that fits nowhere before its deadline', () => {
    // Every day it could legally use is solid, so there is genuinely nowhere for it.
    const walled = { ...empty(), items: [fullDay(0), fullDay(1), fullDay(2), fullDay(3)] }

    const { schedule, notes } = placeItems(walled, [parsed({ deadlineDay: 3, hours: 4 })], 0)

    expect(schedule.items).toHaveLength(5)
    expect(notes[0]?.fitted).toBe(false)
  })

  it('never searches earlier than today', () => {
    const { schedule } = placeItems(empty(), [parsed({ deadlineDay: 1 })], 5)

    expect(schedule.items[0]?.dayIndex).toBeGreaterThanOrEqual(5)
  })

  /**
   * §16: never silently reshuffle. Inaction produces the healthy outcome and the student
   * stays in charge of their own week -- so placing something new may read the schedule but
   * must never write to any part of it that was already there.
   */
  it('never moves anything already in the week', () => {
    const before = { ...empty(), items: [fullDay(4)] }
    const settled = before.items.map(({ id, dayIndex, startHour }) => ({ id, dayIndex, startHour }))

    const { schedule } = placeItems(before, [parsed({ deadlineDay: 6 })], 0)

    expect(
      schedule.items
        .filter((item) => item.id.startsWith('wall-'))
        .map(({ id, dayIndex, startHour }) => ({ id, dayIndex, startHour })),
    ).toEqual(settled)
  })

  it('places several items without stacking them', () => {
    const dump = Array.from({ length: 4 }, (_, index) =>
      parsed({ id: `x${index}`, hours: 3, deadlineDay: 3 }),
    )

    const { schedule } = placeItems(empty(), dump, 0)
    const onDayThree = schedule.items.filter((item) => item.dayIndex === 3)

    for (const [i, a] of onDayThree.entries()) {
      for (const b of onDayThree.slice(i + 1)) {
        expect(a.startHour < b.startHour + b.hours && b.startHour < a.startHour + a.hours).toBe(false)
      }
    }
  })

  it('reports one note per item accepted', () => {
    const { notes } = placeItems(empty(), [parsed({ id: 'a' }), parsed({ id: 'b' })], 0)

    expect(notes).toHaveLength(2)
  })

  it('does not modify the week it was given', () => {
    const before = { ...empty(), items: [fullDay(4)] }
    const snapshot = JSON.stringify(before)

    placeItems(before, [parsed({ deadlineDay: 6 })], 0)

    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

/**
 * §16: say what was done. Silent displacement breaks a student's mental model of their own
 * week -- they look at Tuesday, remember putting something there, and it is gone.
 */
describe('describePlacement', () => {
  const note = (over: Partial<Parameters<typeof describePlacement>[0]> = {}) => ({
    itemId: 'a',
    title: 'Essay draft',
    dayIndex: 4,
    movedFrom: null,
    fitted: true,
    ...over,
  })

  it('says nothing beyond the plain fact when nothing had to move', () => {
    expect(describePlacement(note(), null)).toBe('Added.')
  })

  it('names both days when it had to go somewhere else', () => {
    const line = describePlacement(note({ movedFrom: 2, dayIndex: 4 }), null)

    expect(line).toContain('day 2')
    expect(line).toContain('day 4')
  })

  it('uses the real weekday when the week knows what day it is', () => {
    const anchored = { ...empty(), startedOn: '2026-09-07' }

    expect(describePlacement(note({ movedFrom: 1, dayIndex: 3 }), anchored)).toMatch(
      /Tuesday|Thursday/,
    )
  })

  /** Honest about the case it could not solve, rather than claiming a placement it did not
   *  make. The student can see the day is overfull; pretending otherwise loses their trust
   *  in every other thing the app says. */
  it('says so when it could not find room at all', () => {
    expect(describePlacement(note({ fitted: false }), null)).toMatch(/no room|does not fit|full/i)
  })
})

/**
 * §15's second question -- "could it fit if something moved?" -- answered without building
 * the second scheduler §16 forbids.
 *
 * `smallestFixes` ranks by deficit days and floor, which is not the same question as "does
 * this open a gap on the day my essay wanted". Taking its top move meant the app often
 * offered something true but unrelated: a real improvement to the fortnight that did
 * nothing about the thing the student had just been told did not fit.
 */
describe('fixThatMakesRoom', () => {
  const parsedNeed = (over: Partial<ParsedItem> = {}) => parsed({ hours: 4, ...over })

  it('has nothing to offer when the week has nothing movable', () => {
    const walled = { ...empty(), items: [fullDay(3)] }

    expect(fixThatMakesRoom(walled, parsedNeed({ deadlineDay: 3 }), 3, DEFAULT_PARAMS)).toBeNull()
  })

  /**
   * The property that matters: whatever is offered, applying it has to actually open room
   * on the day that was wanted. Anything else is a non-sequitur dressed as help.
   */
  it('only offers a move that actually makes room where it was wanted', () => {
    const crowded = {
      ...empty(),
      items: [
        ...Array.from({ length: 5 }, (_, index) => ({
          ...fullDay(3),
          id: `soft-${index}`,
          hours: 3,
          startHour: 8 + index * 3,
          fixed: false,
          deadlineDay: 12,
        })),
      ],
    }

    const fix = fixThatMakesRoom(crowded, parsedNeed({ deadlineDay: 3 }), 3, DEFAULT_PARAMS)

    if (fix !== null) {
      expect(slotOn(fix.move.apply(crowded), 3, { hours: 4, type: 'mental', kind: 'studyBlock' })).not.toBeNull()
    }
  })

  it('does not modify the week it was given', () => {
    const crowded = { ...empty(), items: [{ ...fullDay(3), fixed: false, deadlineDay: 12 }] }
    const snapshot = JSON.stringify(crowded)

    fixThatMakesRoom(crowded, parsedNeed({ deadlineDay: 3 }), 3, DEFAULT_PARAMS)

    expect(JSON.stringify(crowded)).toBe(snapshot)
  })
})

/**
 * §43: a stated hour is the student's, not a suggestion.
 *
 * Placement used to choose every hour -- the first free slot on the day, or
 * `FALLBACK_START_HOUR` when the day was full. That was the only possible behaviour while
 * `ParsedItem` carried no time; now that a student can say "lecture Tuesday 9am", the app
 * choosing 10am instead would be overruling them about their own timetable.
 */
describe('an item that states its own hour', () => {
  it('lands on the hour the student stated', () => {
    const { schedule } = placeItems(empty(), [parsed({ startHour: 9, deadlineDay: 2 })], 0)

    expect(schedule.items[0]?.startHour).toBe(9)
    expect(schedule.items[0]?.dayIndex).toBe(2)
  })

  /**
   * The other half of "pinned": the optimizer may not move it. Without this the hour would
   * be honoured at the moment of adding and quietly rearranged by the next rebalance,
   * which is worse than never having honoured it -- the student would have watched it
   * land correctly.
   */
  it('is fixed, so a rebalance may not move it', () => {
    const { schedule } = placeItems(empty(), [parsed({ startHour: 9, deadlineDay: 2 })], 0)

    expect(schedule.items[0]?.fixed).toBe(true)
  })

  it('leaves the hour to placement when the student stated none', () => {
    const { schedule } = placeItems(empty(), [parsed({ startHour: null, deadlineDay: 2 })], 0)

    expect(schedule.items[0]?.fixed).toBe(false)
    expect(schedule.items[0]?.startHour).toEqual(expect.any(Number))
  })

  /**
   * A stated hour on a day with nothing free is still the student's answer. The app says
   * what it did in the placement note rather than moving the lecture somewhere emptier --
   * two things at once is a real week, and §16 is about never reshuffling silently.
   */
  it('keeps the stated hour even where the day is already busy', () => {
    const busy = {
      ...empty(),
      items: [
        {
          id: 'existing',
          title: 'Lab',
          type: 'mental' as const,
          kind: 'studyBlock' as const,
          hours: 3,
          intensity: 1,
          dayIndex: 2,
          startHour: 9,
          fixed: true,
          deadlineDay: null,
          protectedRest: false,
        },
      ],
    }

    const { schedule } = placeItems(busy, [parsed({ startHour: 9, deadlineDay: 2 })], 0)
    const added = schedule.items.find((item) => item.id !== 'existing')

    expect(added?.startHour).toBe(9)
    expect(added?.dayIndex).toBe(2)
  })
})
