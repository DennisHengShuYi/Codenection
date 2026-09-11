import { describe, expect, it } from 'vitest'
import type { BlockRecord } from '../../domain/blockLog'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import { panelRowsFor } from './todayRows'

/**
 * Ruling 46: what each object in the room means, and what is behind it today.
 *
 * Ruling 45 made the room a picture of today -- study stacks books, exercise puts a dumbbell out
 * -- and nothing anywhere says so. This is the vocabulary, written down, and it doubles as
 * today's list because every row names a real thing on the day.
 *
 * It reads the same groupings `roomState` binds the furniture from, so the panel and the
 * drawing cannot come to disagree about what a dumbbell means.
 */
const block = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'a',
  title: 'Essay',
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

const week = (items: ScheduledItem[] = [], sleepHours = 7): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => sleepHours),
})

const answered = (blockId: string): BlockRecord => ({
  blockId,
  type: 'mental',
  plannedHours: 2,
  dayIndex: 0,
  answer: 'right',
  answeredAt: 0,
})

const rowFor = (schedule: Schedule, id: string, today = 0, log: BlockRecord[] = []) =>
  panelRowsFor(schedule, today, log).find((row) => row.id === id)

describe('the rows, as a legend', () => {
  it('says what each object means, whether or not today has any of it', () => {
    const rows = panelRowsFor(week(), 0, [])

    expect(rows.map((row) => row.id)).toEqual([
      'books',
      'dumbbell',
      'people',
      'boxes',
      'bed',
      'rest',
    ])
    for (const row of rows) {
      expect(row.meaning.length, `${row.id} explains nothing`).toBeGreaterThan(0)
    }
  })

  /**
   * The legend is only useful if it matches the drawing. These are the groupings Ruling 45 bound
   * the furniture from, and the panel reading them differently would teach a student a
   * vocabulary the room does not speak.
   */
  it('groups both exercise kinds under the one object that draws them', () => {
    const schedule = week([
      block({ id: 'gym', kind: 'hardExercise', type: 'physical', hours: 1 }),
      block({ id: 'walk', kind: 'lightExercise', type: 'physical', hours: 0.5 }),
    ])

    expect(rowFor(schedule, 'dumbbell')?.hours).toBe(1.5)
  })

  it('groups both kinds of company under the people in the room', () => {
    const schedule = week([
      block({ id: 'team', kind: 'socialDraining', type: 'social', hours: 2 }),
      block({ id: 'friend', kind: 'socialRestorative', type: 'social', hours: 1 }),
    ])

    expect(rowFor(schedule, 'people')?.hours).toBe(3)
  })
})

describe('the rows, as today', () => {
  it('carries the blocks behind each object, with their times', () => {
    const schedule = week([
      block({ id: 'lecture', title: 'WIA3001 lecture', startHour: 9, hours: 2 }),
      block({ id: 'revision', title: 'Revision', startHour: 14, hours: 2 }),
    ])

    const books = rowFor(schedule, 'books')

    expect(books?.hours).toBe(4)
    expect(books?.blocks.map((entry) => entry.title)).toEqual(['WIA3001 lecture', 'Revision'])
    expect(books?.blocks[0]?.startHour).toBe(9)
  })

  /** In the order they happen, because a list of a day that is not in time order is a list
   *  a student has to sort themselves. */
  it('puts them in the order they happen', () => {
    const schedule = week([
      block({ id: 'evening', title: 'Evening', startHour: 20 }),
      block({ id: 'morning', title: 'Morning', startHour: 8 }),
    ])

    expect(rowFor(schedule, 'books')?.blocks.map((entry) => entry.title)).toEqual([
      'Morning',
      'Evening',
    ])
  })

  it('says which of them are already answered', () => {
    const schedule = week([
      block({ id: 'done', title: 'Done', startHour: 9 }),
      block({ id: 'ahead', title: 'Ahead', startHour: 14 }),
    ])

    const books = rowFor(schedule, 'books', 0, [answered('done')])

    expect(books?.blocks.find((entry) => entry.title === 'Done')?.done).toBe(true)
    expect(books?.blocks.find((entry) => entry.title === 'Ahead')?.done).toBe(false)
  })

  it('ignores every other day', () => {
    const schedule = week([block({ id: 'tomorrow', dayIndex: 1, hours: 8 })])

    expect(rowFor(schedule, 'books')?.hours).toBe(0)
    expect(rowFor(schedule, 'books')?.blocks).toHaveLength(0)
  })

  it('counts errands rather than measuring them, because a box is one thing', () => {
    const schedule = week([
      block({ id: 'laundry', title: 'Laundry', kind: 'errands', type: 'errands', hours: 0.5 }),
      block({ id: 'post', title: 'Post office', kind: 'errands', type: 'errands', hours: 0.5 }),
    ])

    expect(rowFor(schedule, 'boxes')?.count).toBe(2)
  })
})

describe('the two rows that are not ordinary objects', () => {
  /**
   * Ruling 45 gave rest no furniture deliberately -- it is the one thing on a day that is not a
   * duty. But a panel that is also today's list would be lying by omission if a rest block
   * on today appeared nowhere, so it earns a row that says it has no object.
   */
  it('lists rest, and says it has no object in the room', () => {
    const schedule = week([block({ id: 'nap', title: 'Nap', kind: 'rest', hours: 1 })])

    const rest = rowFor(schedule, 'rest')

    expect(rest?.hours).toBe(1)
    expect(rest?.blocks.map((entry) => entry.title)).toEqual(['Nap'])
    expect(rest?.drawn, 'rest is deliberately not drawn').toBe(false)
  })

  it('draws every other row', () => {
    const drawn = panelRowsFor(week(), 0, []).filter((row) => row.id !== 'rest')

    for (const row of drawn) {
      expect(row.drawn, `${row.id} is drawn in the room`).toBe(true)
    }
  })

  /**
   * The bed reads the week's own sleep figure. It cannot say more than that: `sleepByDay`
   * defaults to 7 for a night nobody has answered and nothing records whether it was
   * answered, so this is the number the week holds rather than a claim about the student's
   * night -- see the wording in `TodayPanel`.
   */
  it('reads sleep off the day the panel is showing', () => {
    expect(rowFor(week([], 6), 'bed')?.hours).toBe(6)
  })

  it('follows the day, so yesterday and today can differ', () => {
    const schedule = { ...week(), sleepByDay: week().sleepByDay.map((_, day) => (day === 3 ? 5 : 9)) }

    expect(rowFor(schedule, 'bed', 3)?.hours).toBe(5)
    expect(rowFor(schedule, 'bed', 4)?.hours).toBe(9)
  })
})

/**
 * Loadline's SEE bullet wants load, contributing factors AND trends per object. The number is
 * the load, the blocks behind an opened row are the factors, and this is the third.
 */
describe('the trend on a row', () => {
  it('says the load is picking up when the next days are heavier', () => {
    const schedule = week([
      block({ id: 'a', dayIndex: 0, hours: 1 }),
      block({ id: 'b', dayIndex: 1, hours: 2 }),
      block({ id: 'c', dayIndex: 2, hours: 4 }),
    ])

    expect(rowFor(schedule, 'books')?.trend).toBe('picking up')
  })

  it('says nothing at all on an even run of days', () => {
    const schedule = week([
      block({ id: 'a', dayIndex: 0, hours: 2 }),
      block({ id: 'b', dayIndex: 1, hours: 2 }),
      block({ id: 'c', dayIndex: 2, hours: 2 }),
    ])

    expect(rowFor(schedule, 'books')?.trend).toBeNull()
  })

  it('says nothing on a row with nothing on it', () => {
    expect(rowFor(week(), 'dumbbell')?.trend).toBeNull()
  })

  /** Boxes count things rather than hours, so its words are about a pile rather than time. */
  it('speaks in things on the counted row', () => {
    const errand = (id: string, dayIndex: number) =>
      block({ id, dayIndex, hours: 1, type: 'errands', kind: 'errands' })
    const schedule = week([errand('a', 2), errand('b', 2)])

    expect(rowFor(schedule, 'boxes')?.trend).toBe('piling up')
  })

  /**
   * The bed carries none, ever, and this is where that is recorded.
   *
   * Its figure is the week's own sleep number: `sleepByDay` defaults to 7 for a night nobody
   * answered and nothing records whether it WAS answered, so the row already cannot tell
   * "slept seven hours" from "nobody has asked yet". A direction drawn from that series would
   * be a claim about data the app does not have.
   */
  it('leaves the bed without a trend, because nothing measured it', () => {
    expect(rowFor(week(), 'bed')?.trend).toBeNull()
  })
})

/**
 * The bed, once nights have actually been answered.
 *
 * This row carried `trend: null` unconditionally, for one stated reason: it could not tell
 * "slept eight hours" from "nobody has asked yet", so a direction drawn from `sleepByDay`
 * would have been a claim about data the app did not have. `domain/sleepLog` removes exactly
 * that reason -- and only that one, which is why the silence still holds without it.
 */
describe('the bed row and reported nights', () => {
  it('says nothing when no night has been answered', () => {
    expect(panelRowsFor(week(), 0, [], []).find((row) => row.id === 'bed')?.trend).toBeNull()
  })

  /** The shared evidence floor, same as everywhere else the app speaks about a student: two
   *  points make a line out of a coincidence. */
  it('says nothing on fewer nights than the app speaks on', () => {
    expect(
      panelRowsFor(week(), 0, [], [8, 5]).find((row) => row.id === 'bed')?.trend,
    ).toBeNull()
  })

  /**
   * Rising is GOOD news here, which is why the bed has its own wording rather than the hours
   * vocabulary the study and exercise rows use. "Easing off" on a row about sleep would read
   * as reassurance about the thing going wrong.
   */
  it('says nights are getting longer when they are', () => {
    expect(panelRowsFor(week(), 0, [], [5, 6.5, 8]).find((row) => row.id === 'bed')?.trend).toBe(
      'getting longer',
    )
  })

  it('says nights are getting shorter when they are', () => {
    expect(panelRowsFor(week(), 0, [], [8, 6.5, 5]).find((row) => row.id === 'bed')?.trend).toBe(
      'getting shorter',
    )
  })

  it('says nothing when reported nights are steady', () => {
    expect(
      panelRowsFor(week(), 0, [], [7, 7, 7]).find((row) => row.id === 'bed')?.trend,
    ).toBeNull()
  })
})
