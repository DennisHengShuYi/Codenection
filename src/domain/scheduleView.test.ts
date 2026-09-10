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
      start: { mental: 46, physical: 46, social: 46, errands: 46 },
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
