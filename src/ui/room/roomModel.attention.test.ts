import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE } from '../../domain/calibration'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import { roomModel } from './roomModel'

const item = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'laundry',
  title: 'Laundry',
  type: 'errands',
  kind: 'errands',
  hours: 1,
  intensity: 1,
  dayIndex: 2,
  startHour: 17,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

const rowsOf = (schedule: Schedule, today = 0) =>
  roomModel({ schedule, profile: DEFAULT_PROFILE, today }).rows

const rowFor = (schedule: Schedule, id: string, today = 0) =>
  rowsOf(schedule, today).find((row) => row.id === id)

/**
 * Attention has to be rare to mean anything.
 *
 * The first version of this screen marked eight rows out of sixteen, including four errands
 * scheduled a fortnight *ahead*. When most of a list is shouting, none of it is -- and the
 * student learns to ignore the one row that mattered.
 */
describe('what actually asks for attention', () => {
  /**
   * §4.1's automatic trigger is "three days past first appearance". A task sitting on day 16
   * with today at day 0 is sixteen days in the *future* -- it has not appeared yet, let alone
   * been avoided. The age was computed as `dayIndex - today`, which is the wait ahead of it
   * rather than the time behind it, so every distant errand read as stuck.
   */
  it('does not call a task scheduled a fortnight ahead stuck', () => {
    const row = rowFor(week({ items: [item({ dayIndex: 16 })] }), 'clutter-laundry')

    expect(row?.attention).toBe(false)
  })

  it('still calls a task stuck once it has genuinely been sitting', () => {
    const row = rowFor(week({ items: [item({ dayIndex: 0 })] }), 'clutter-laundry', 4)

    expect(row?.attention).toBe(true)
  })

  it('leaves a task due today alone', () => {
    const row = rowFor(week({ items: [item({ dayIndex: 3 })] }), 'clutter-laundry', 3)

    expect(row?.attention).toBe(false)
  })

  /**
   * The row said "nothing waiting -- needs you", which is a contradiction a student would
   * read as a bug in the app rather than a signal about their week. Whatever is asking has
   * to be what the reading says.
   */
  it('never says a row needs you while its reading says nothing is waiting', () => {
    const schedules = [
      week(),
      week({ start: { mental: 70, physical: 70, social: 15, errands: 70 } }),
      week({ start: { mental: 15, physical: 70, social: 70, errands: 70 } }),
      week({ items: [item({ dayIndex: 16 })] }),
    ]

    for (const schedule of schedules) {
      for (const row of rowsOf(schedule)) {
        if (row.attention) {
          expect(row.reading, `${row.id}: "${row.reading}"`).not.toMatch(
            /^nothing|^no /i,
          )
        }
      }
    }
  })

  it('says what the phone wants when a social prescription is why', () => {
    const row = rowFor(week({ start: { mental: 70, physical: 70, social: 15, errands: 70 } }), 'phone')

    expect(row?.attention).toBe(true)
    expect(row?.reading).not.toMatch(/nothing/i)
  })

  // A calm, uncalibrated week should still be quiet apart from the mirror.
  it('keeps a comfortable week quiet', () => {
    const marked = rowsOf(week({ items: [item({ dayIndex: 16 })] })).filter((row) => row.attention)

    expect(marked.map((row) => row.id)).toEqual(['mirror'])
  })
})
