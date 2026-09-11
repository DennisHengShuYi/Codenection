import { describe, expect, it } from 'vitest'
import type { ParsedItem } from '../ai'
import { HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { DEFAULT_PARAMS } from '../engine'
import { describeDeferral, describePlacement, fixThatMakesRoom, placeItems } from './placement'
import { slotOn, type SlotNeed } from './slotFinder'

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
   * Ruling 16: never silently reshuffle. Inaction produces the healthy outcome and the student
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
 * Ruling 16: say what was done. Silent displacement breaks a student's mental model of their own
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
    expect(describePlacement(note(), null, 0)).toBe('Added.')
  })

  it('names both days when it had to go somewhere else', () => {
    const line = describePlacement(note({ movedFrom: 2, dayIndex: 4 }), null, 0)

    expect(line).toContain('day 2')
    expect(line).toContain('day 4')
  })

  it('uses the real date when the week knows what day it is', () => {
    const anchored = { ...empty(), startedOn: '2026-09-07' }

    // Dated now, not merely named: a fortnight holds three Tuesdays, and the grid the
    // student is looking at is labelled by date.
    expect(describePlacement(note({ movedFrom: 1, dayIndex: 3 }), anchored, 0)).toMatch(
      /\d+ \w{3}/,
    )
  })

  /** Honest about the case it could not solve, rather than claiming a placement it did not
   *  make. The student can see the day is overfull; pretending otherwise loses their trust
   *  in every other thing the app says. */
  it('says so when it could not find room at all', () => {
    expect(describePlacement(note({ fitted: false }), null, 0)).toMatch(/no room|does not fit|full/i)
  })
})

/**
 * Ruling 15's second question -- "could it fit if something moved?" -- answered without building
 * the second scheduler Ruling 16 forbids.
 *
 * `smallestFixes` ranks by deficit days and floor, which is not the same question as "does
 * this open a gap on the day my essay wanted". Taking its top move meant the app often
 * offered something true but unrelated: a real improvement to the fortnight that did
 * nothing about the thing the student had just been told did not fit.
 */
describe('fixThatMakesRoom', () => {
  /**
   * The three fields this function was ever reading, said directly.
   *
   * It used to take a whole `ParsedItem` and use `hours`, `type` and `kind` from it, so
   * every caller had to have a parse in hand -- or fake one -- to ask a question about
   * three numbers. `deadlineDay` in particular was never read here at all.
   */
  const need = (over: Partial<SlotNeed> = {}): SlotNeed => ({
    hours: 4,
    type: 'mental',
    kind: 'studyBlock',
    ...over,
  })

  it('has nothing to offer when the week has nothing movable', () => {
    const walled = { ...empty(), items: [fullDay(3)] }

    expect(fixThatMakesRoom(walled, need(), 3, DEFAULT_PARAMS, 0)).toBeNull()
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

    const fix = fixThatMakesRoom(crowded, need(), 3, DEFAULT_PARAMS, 0)

    if (fix !== null) {
      expect(slotOn(fix.move.apply(crowded), 3, { hours: 4, type: 'mental', kind: 'studyBlock' })).not.toBeNull()
    }
  })

  it('does not modify the week it was given', () => {
    const crowded = { ...empty(), items: [{ ...fullDay(3), fixed: false, deadlineDay: 12 }] }
    const snapshot = JSON.stringify(crowded)

    fixThatMakesRoom(crowded, need(), 3, DEFAULT_PARAMS, 0)

    expect(JSON.stringify(crowded)).toBe(snapshot)
  })
})

/**
 * Ruling 43: a stated hour is the student's, not a suggestion.
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
   * two things at once is a real week, and Ruling 16 is about never reshuffling silently.
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

/**
 * Where an item came from, kept on the block it becomes.
 *
 * The push side is the reason. A block imported from Google that gets pushed back is
 * duplicated in the calendar it came from, and the next import reads both -- so the push
 * has to be able to tell, and by then the `ParsedItem` is long gone. One field, carried,
 * absent when there was no source.
 */
describe('placeItems and where an item came from', () => {
  it('keeps the source of an item that came from outside the app', () => {
    const { schedule } = placeItems(empty(), [parsed({ sourceId: 'gcal-evt-1' })], 0)

    expect(schedule.items[0]?.sourceId).toBe('gcal-evt-1')
  })

  it('leaves an item typed by hand without one', () => {
    const { schedule } = placeItems(empty(), [parsed()], 0)

    expect(schedule.items[0]?.sourceId).toBeUndefined()
  })
})

/**
 * Ruling 16 again, pointed at Later.
 *
 * `deferItem` was made honest -- it searches forward for a day with room and returns the
 * week *unchanged* when there is none, so a caller can tell nothing happened. Nothing was
 * reading that: `RoomShell` set the new schedule and closed the sheet either way, so a
 * student who pressed Later on a block with nowhere to go watched the sheet close on a
 * button that had done nothing. Silence about a move that did not happen is the same defect
 * as silence about one that did.
 */
describe('describeDeferral', () => {
  const week = (): Schedule => ({ ...empty(), startedOn: '2026-09-07' })

  const deferral = (
    over: Partial<Parameters<typeof describeDeferral>[0]> = {},
  ): Parameters<typeof describeDeferral>[0] => ({
    schedule: week(),
    title: 'Essay',
    from: 1,
    to: 2,
    skippedFull: 0,
    skippedWithRoom: 0,
    blocked: null as 'full' | 'due' | null,
    today: 0,
    floorBefore: null as number | null,
    floorAfter: null as number | null,
    reserveLabel: 'Study & thinking',
    ...over,
    // Pinned after the spread: `Partial` makes every field optional, and `undefined` is not
    // the same answer as "no time to name" -- it would print ", undefined" into the sentence.
    whenLabel: over.whenLabel ?? null,
  })

  /** Nothing was passed over, so there is nothing to explain. The next day with room is what
   *  a student already expects Later to do. */
  it('names the day and stops, when it simply took the next one', () => {
    expect(describeDeferral(deferral(), 'done')).toBe('Essay moved to Wed 9 Sept.')
  })

  /** The old reason, and still a real one. */
  it('says the days in between had no room', () => {
    expect(describeDeferral(deferral({ to: 4, skippedFull: 2 }), 'done')).toBe(
      'Essay moved to Fri 11 Sept. The two days before it had no room.',
    )
  })

  /**
   * The reason that earns the sentence. A student watching Later skip a visibly empty
   * Wednesday cannot tell a decision from a bug, and the obvious reading of the button is
   * still the old behaviour -- the next day with a gap.
   */
  it('says an earlier day had room but would have cost more', () => {
    expect(describeDeferral(deferral({ to: 3, skippedWithRoom: 1 }), 'done')).toBe(
      'Essay moved to Thu 10 Sept. Wed 9 Sept had room, but Thu 10 Sept costs you less.',
    )
  })

  /** Both kinds passed over. The one worth saying is the surprising one -- a full day
   *  explains itself, a skipped opening does not. */
  it('leads with the opening it passed over when it passed over both kinds', () => {
    const said = describeDeferral(deferral({ to: 5, skippedFull: 2, skippedWithRoom: 1 }), 'done')

    expect(said).toMatch(/had room, but/)
  })

  it('says it could not move, and where it stayed', () => {
    expect(describeDeferral(deferral({ to: null, blocked: 'full' }), 'done')).toBe(
      'There was no room for Essay on any day it could move to, so it stayed on Tomorrow.',
    )
  })

  /**
   * The same facts, before the move rather than after it.
   *
   * Later asks before it acts now, so the sentence has to exist in both tenses: a proposal a
   * student is being asked to approve, and a record of what was done once they have. One
   * function rather than two, because the branching -- which reason is worth giving, and
   * when none is -- is the part with judgement in it, and two copies of that would drift.
   */
  it('proposes the move rather than reporting it', () => {
    expect(describeDeferral(deferral(), 'planned')).toBe('This would move to Wed 9 Sept.')
  })

  it('gives the same reason in the present tense', () => {
    expect(describeDeferral(deferral({ to: 3, skippedWithRoom: 1 }), 'planned')).toBe(
      'This would move to Thu 10 Sept. Wed 9 Sept has room, but Thu 10 Sept costs you less.',
    )
  })

  it('proposes nothing when there is nowhere to go', () => {
    expect(describeDeferral(deferral({ to: null, blocked: 'full' }), 'planned')).toBe(
      'There is no room for Essay on any day it could move to.',
    )
  })

  /**
   * The other way Later comes back empty-handed, and the one a student meets most.
   *
   * A block whose deadline is at or before the day it sits on has no candidate day to
   * examine at all. Saying "no room" there is false twice over -- no day was full, and no day
   * was looked at -- and it sends the student to check a calendar that will not explain it.
   * The deadline is what explains it.
   */
  it('blames the deadline, not the days, when there was no later day to try', () => {
    expect(describeDeferral(deferral({ to: null, blocked: 'due' }), 'planned')).toBe(
      'Essay is already due, so there is no later day to move it to.',
    )
  })

  it('says the same after the fact, since nothing moved either way', () => {
    expect(describeDeferral(deferral({ to: null, blocked: 'due' }), 'done')).toBe(
      'Essay is already due, so there is no later day to move it to.',
    )
  })

  /**
   * The price, in the unit the request box already speaks -- and naming which reserve it is
   * about, which is what separates it from Rebalance's figure.
   *
   * Rebalance says "your worst day goes from 41 to 44" and means the floor across all four
   * reserves at once. This is one reserve: the one the block actually spends. Same shape,
   * different measurement, so the same words for both would invite a student to compare two
   * numbers that are not comparable.
   *
   * Later never compares its candidate days against leaving the block alone, so the day it
   * picks can be worse than not moving -- and since it asks before acting, that is precisely
   * when a student needs the number.
   */
  it('says what the move does to the lowest point', () => {
    expect(
      describeDeferral(deferral({ floorBefore: 41.2, floorAfter: 44.8 }), 'planned'),
    ).toBe('This would move to Wed 9 Sept. Study & thinking bottoms out at 45 instead of 41.')
  })

  it('says so plainly when the move costs rather than helps', () => {
    expect(
      describeDeferral(deferral({ floorBefore: 44, floorAfter: 41 }), 'planned'),
    ).toBe('This would move to Wed 9 Sept. Study & thinking bottoms out at 41 instead of 44.')
  })

  /** Below a whole point the two days are the same week, and a figure that does not move is
   *  a sentence a student reads once and stops trusting. */
  it('says nothing about a price that rounds to no change', () => {
    expect(describeDeferral(deferral({ floorBefore: 41.2, floorAfter: 41.4 }), 'planned')).toBe(
      'This would move to Wed 9 Sept.',
    )
  })
})

/**
 * A card that proposes a move has to say which day, and a weekday alone does not.
 *
 * "Moved to Thursday" is ambiguous the moment the fortnight is longer than a week -- there
 * are three Thursdays in a 21-day horizon -- and it gives a student nothing to match against
 * the dated grid they are looking at. `domain/calendar.dayLabel` is the app's one place a day
 * index becomes a name, and it carries the date; `placement` had a private weekday table of
 * its own, which is the fourth copy `WEEKDAY_NAMES` was consolidated to end.
 */
describe('the day a card names', () => {
  const note = {
    schedule: { ...empty(), startedOn: '2026-09-07' },
    title: 'Essay',
    from: 1,
    to: 4,
    skippedFull: 0,
    skippedWithRoom: 0,
    blocked: null,
    floorBefore: null,
    floorAfter: null,
    reserveLabel: 'Study & thinking',
    whenLabel: null,
    today: 0,
  }

  it('carries the date, not only the weekday', () => {
    expect(describeDeferral(note, 'planned')).toMatch(/\d+ \w{3}/)
  })

  /** "Tomorrow" beats a date for the day everybody names that way -- `dayLabel`'s own rule,
   *  and the reason this goes through it rather than formatting a date here. */
  it('says Tomorrow when that is what the day is', () => {
    expect(describeDeferral({ ...note, to: 1, today: 0 }, 'planned')).toMatch(/Tomorrow/)
  })
})

/**
 * The hours as well as the day.
 *
 * A card that says "moved to Wed 23 Sept" and stops has told a student the half of the answer
 * they can already see on the grid. Where in the day it lands is the half that decides whether
 * the move is any use -- `slotOn` chooses that hour, not the student, so it is the part they
 * have not been consulted about and the part they are being asked to approve.
 *
 * Formatted by the caller rather than here. The two-digit clock lives in `ui/kit/labels`
 * beside the four reserve words, and the dependency order is one-way: a second copy of it in
 * the domain is exactly what `kit/labels` own docstring forbids.
 */
describe('the time a card names', () => {
  const note = {
    schedule: { ...empty(), startedOn: '2026-09-07' },
    title: 'Essay',
    from: 1,
    to: 4,
    skippedFull: 0,
    skippedWithRoom: 0,
    blocked: null,
    floorBefore: null,
    floorAfter: null,
    reserveLabel: 'Study & thinking',
    whenLabel: '09:00-11:00',
    today: 0,
  }

  it('names the hours it would land at, beside the day', () => {
    expect(describeDeferral(note, 'planned')).toBe('This would move to Fri 11 Sept, 09:00-11:00.')
  })

  it('names them after the fact too', () => {
    expect(describeDeferral(note, 'done')).toBe('Essay moved to Fri 11 Sept, 09:00-11:00.')
  })

  /** Nothing moved, so there is no hour to name -- and the day it stayed on it already had. */
  it('names no time when nothing moved', () => {
    expect(describeDeferral({ ...note, to: null, blocked: 'full' }, 'planned')).not.toMatch(/\d\d:\d\d/)
  })

  /** A caller with no clock to offer still gets a sentence rather than a gap. */
  it('falls back to the day alone when no time was supplied', () => {
    expect(describeDeferral({ ...note, whenLabel: null }, 'planned')).toBe(
      'This would move to Fri 11 Sept.',
    )
  })
})
