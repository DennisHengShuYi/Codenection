import { describe, expect, it } from 'vitest'
import type { BlockRecord } from './blockLog'
import { HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { BUSY_ABOVE_HOURS, HEAVY_ABOVE_HOURS, scheduleView } from './scheduleView'

const item = (id: string, dayIndex: number, hours: number): ScheduledItem => ({
  id,
  title: id,
  type: 'mental',
  kind: 'studyBlock',
  hours,
  intensity: 1,
  dayIndex,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
})

const week = (items: ScheduledItem[] = [], over: Partial<Schedule> = {}): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

const view = (schedule = week(), today = 0, blockLog: readonly BlockRecord[] = []) =>
  scheduleView({ schedule, today, blockLog })

describe('scheduleView', () => {
  it('returns one cell per day of the horizon', () => {
    expect(view()).toHaveLength(HORIZON_DAYS)
  })

  it('reads light when a day is empty', () => {
    expect(view()[3]?.band).toBe('light')
  })

  it('reads busy at the threshold and light just under it', () => {
    const busy = view(week([item('a', 2, BUSY_ABOVE_HOURS)]))
    const light = view(week([item('a', 2, BUSY_ABOVE_HOURS - 0.5)]))

    expect(busy[2]?.band).toBe('busy')
    expect(light[2]?.band).toBe('light')
  })

  it('reads heavy at the threshold', () => {
    expect(view(week([item('a', 2, HEAVY_ABOVE_HOURS)]))[2]?.band).toBe('heavy')
  })

  it('sums every block on the day rather than taking the longest', () => {
    const cells = view(week([item('a', 4, 3), item('b', 4, 4)]))

    expect(cells[4]?.hours).toBe(7)
  })

  it('marks the day the student is on', () => {
    const cells = view(week(), 5)

    expect(cells.filter((cell) => cell.isToday).map((cell) => cell.dayIndex)).toEqual([5])
  })

  it('marks a day carrying a block that has not been confirmed', () => {
    // Only days at or before today can have been lived, so only those are marked.
    const cells = view(week([item('a', 1, 2)]), 3)

    expect(cells[1]?.unconfirmed).toBe(true)
  })

  it('does not mark a block answered via the block log', () => {
    const block: BlockRecord = {
      blockId: 'a',
      type: 'mental',
      plannedHours: 2,
      dayIndex: 1,
      answer: 'right',
      answeredAt: 0,
    }
    const cells = view(week([item('a', 1, 2), item('b', 9, 2)]), 3, [block])

    expect(cells[1]?.unconfirmed).toBe(false)
    expect(cells[9]?.unconfirmed).toBe(false)
  })

  it('does not mark a day still ahead even when the log has not answered its block', () => {
    const cells = view(week([item('b', 9, 2)]), 3, [])

    expect(cells[9]?.unconfirmed).toBe(false)
  })

  it('marks deficit days from the projection, not from hours', () => {
    // A fortnight that starts flat is in deficit regardless of how empty the days look.
    const flat = week([], { start: { mental: 5, physical: 5, social: 5, errands: 5 } })

    expect(view(flat).some((cell) => cell.deficit)).toBe(true)
    expect(view().some((cell) => cell.deficit)).toBe(false)
  })

  /**
   * Ruling 16: wiring §6.5's missing-data pessimism into `scheduleView` (to match
   * `roomModel.ts`, which already had it) means nothing unless it is shown to actually move
   * what the overview marks. Draining all four reserves every day makes the fourteen-day
   * silence's compounding penalty large enough to cross `DEFICIT_THRESHOLD`, rather than
   * only nudging a number that was never close to the line either way.
   *
   * `start` is a calibrated constant, not arbitrary test data, and it was re-derived when
   * §6.2/§6.6 went per-type and this view moved onto the floor instead of the mean. Both
   * changes bite here: each reserve now recovers at its own depleted efficiency instead of
   * being subsidised by the other three, and twelve hours a day spread across all four
   * types depletes all four. At 46 -- the figure tuned against the mean -- both branches
   * now sit at 0 and the test would pass for the wrong reason in one direction and fail in
   * the other. At 85 the confirmed fortnight bottoms out at 39.2 and the silent one at
   * 18.1, so the crossing is bracketed with room on both sides rather than balanced on it.
   * Re-derive the same way if the model changes again; do not relax the assertions.
   */
  it('marks a day in deficit when the fortnight has gone unanswered, but not when it was confirmed', () => {
    const drainDay = (dayIndex: number): ScheduledItem[] =>
      (['mental', 'physical', 'social', 'errands'] as const).map((type, i) => ({
        id: `${type}-${dayIndex}`,
        title: type,
        type,
        kind:
          type === 'mental'
            ? 'studyBlock'
            : type === 'physical'
              ? 'hardExercise'
              : type === 'social'
                ? 'socialDraining'
                : 'errands',
        hours: 3,
        intensity: 1,
        dayIndex,
        startHour: 8 + i * 2,
        fixed: false,
        deadlineDay: null,
        protectedRest: false,
      }))

    const days = 14
    const items = Array.from({ length: days }, (_, day) => drainDay(day)).flat()
    const schedule = week(items, {
      start: { mental: 85, physical: 85, social: 85, errands: 85 },
    })
    const today = days

    const confirmed: BlockRecord[] = items.map((entry) => ({
      blockId: entry.id,
      type: entry.type,
      plannedHours: entry.hours,
      dayIndex: entry.dayIndex,
      answer: 'right',
      answeredAt: 0,
    }))

    const confirmedCells = scheduleView({ schedule, today, blockLog: confirmed })
    const silentCells = scheduleView({ schedule, today, blockLog: [] })

    expect(confirmedCells[days - 1]?.deficit).toBe(false)
    expect(silentCells[days - 1]?.deficit).toBe(true)
  })

  it('carries the real date when the week is anchored, and null when it is not', () => {
    expect(view()[0]?.date).toBeNull()
    expect(view(week([], { startedOn: '2026-09-01' }))[0]?.date).toBe('2026-09-01')
  })

  it('defaults to an empty block log when none is given', () => {
    const schedule = week([item('a', 1, 2)])

    expect(scheduleView({ schedule, today: 3 })).toEqual(
      scheduleView({ schedule, today: 3, blockLog: [] }),
    )
  })
})

/**
 * Where each day leaves you, on the day itself.
 *
 * The grid said how heavy a day is and warned when it crosses, and the reserves behind both
 * were computed for every day and shown for none. A chart under the grid tried to carry that
 * and asked the reader to map a line back onto a date; the number belongs in the cell the
 * date is already in.
 *
 * The mean of the four, which is the same figure the dial's headline quotes. Worth knowing
 * what that means beside a warning: the deficit mark is computed from the *floor*, so a day
 * can read 67 and still be marked -- one reserve empty while the others are fine is exactly
 * the case the floor exists to catch and the mean exists to hide.
 */
describe('the reserve on each cell', () => {
  it('carries a figure for every day of the horizon', () => {
    const cells = scheduleView({ schedule: week([]), today: 0 })

    for (const cell of cells) {
      expect(cell.reserve).toBeGreaterThanOrEqual(0)
      expect(cell.reserve).toBeLessThanOrEqual(100)
    }
  })

  it('falls across a fortnight that spends more than it gets back', () => {
    const heavy = Array.from({ length: HORIZON_DAYS }, (_, dayIndex) =>
      item(`study-${dayIndex}`, dayIndex, 9),
    )

    const cells = scheduleView({
      schedule: { ...week(heavy), sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 6) },
      today: 0,
    })

    expect(cells.at(-1)?.reserve).toBeLessThan(cells[0]?.reserve ?? 0)
  })

  /** The same projection the deficit mark is read from, so the two cannot disagree about
   *  which fortnight they are describing. */
  it('reads the day it is on, not the day the fortnight started', () => {
    const heavy = Array.from({ length: HORIZON_DAYS }, (_, dayIndex) =>
      item(`study-${dayIndex}`, dayIndex, 9),
    )

    const cells = scheduleView({
      schedule: { ...week(heavy), sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 6) },
      today: 0,
    })

    const figures = new Set(cells.map((cell) => Math.round(cell.reserve)))
    expect(figures.size).toBeGreaterThan(1)
  })

  /**
   * The week grid and the room must not run two different models over one fortnight, which
   * is the reason `blockLog` and `predictions` are threaded here at all. `domain/sleepEnough`
   * adds a third learned figure, and leaving it out would reopen exactly that gap: the grid
   * lit by population coefficients while the room is lit by learned ones.
   */
  it('runs the learned ceiling on sleep, not the population one', () => {
    const nights = []
    const predictions = []

    // A fortnight saying every night above six bought this student nothing.
    for (let index = 0; index < 8; index += 1) {
      const long = index % 2 === 0
      const isoDate = `2026-09-0${index + 1}`
      nights.push({ isoDate, hours: long ? 8 : 5, answeredAt: index })
      predictions.push({ forDate: isoDate, predicted: 60, reported: long ? 48 : 60 })
    }

    // Ten-hour nights, so a lowered ceiling changes what the projection credits. Seven-hour
    // nights would sit under any believable ceiling and prove nothing.
    const schedule = week([], { sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 10) })
    const input = { schedule, today: 0, blockLog: [], predictions }

    const population = scheduleView(input)
    const learned = scheduleView({ ...input, nights })

    expect(learned[1]?.reserve).toBeLessThan(population[1]?.reserve ?? 0)
  })
})
