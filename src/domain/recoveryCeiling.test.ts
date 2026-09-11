import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, HORIZON_DAYS } from '../engine'
import { violations, type Schedule, type ScheduledItem } from '../optimizer'
import { editWarnings } from './editWarnings'
import { DAILY_RECOVERY_CEILING, restHoursOn, roomForRest } from './recoveryCeiling'

const rest = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'r',
  title: 'Rest',
  type: 'mental',
  kind: 'rest',
  hours: 2,
  intensity: 1,
  dayIndex: 0,
  startHour: 20,
  fixed: true,
  deadlineDay: null,
  protectedRest: true,
  ...over,
})

const week = (items: readonly ScheduledItem[] = []): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

/** Enough two-hour rest blocks to sit exactly on the ceiling, spread across the day. */
const fullDay = (dayIndex = 0): ScheduledItem[] =>
  Array.from({ length: DAILY_RECOVERY_CEILING / 2 }, (_, index) =>
    rest({ id: `r${index}`, dayIndex, startHour: 8 + index * 2 }),
  )

describe('restHoursOn', () => {
  it('is zero for a day with nothing on it', () => {
    expect(restHoursOn(week(), 0)).toBe(0)
  })

  it('adds up the rest already on the day', () => {
    expect(restHoursOn(week([rest({ hours: 2 }), rest({ id: 'b', hours: 1.5 })]), 0)).toBe(3.5)
  })

  it('counts unprotected rest too', () => {
    // The ceiling is about how much recovery one day is credited with, and recoveryForDay
    // does not ask whether the block was protected before it pays out.
    expect(restHoursOn(week([rest({ fixed: false, protectedRest: false })]), 0)).toBe(2)
  })

  it('ignores work, and ignores other days', () => {
    const schedule = week([
      rest({ id: 'elsewhere', dayIndex: 1 }),
      rest({ id: 'work', kind: 'studyBlock', hours: 5 }),
    ])

    expect(restHoursOn(schedule, 0)).toBe(0)
  })
})

describe('roomForRest', () => {
  it('offers the whole ceiling on an empty day', () => {
    expect(roomForRest(week(), 0)).toBe(DAILY_RECOVERY_CEILING)
  })

  it('offers what is left below the ceiling', () => {
    expect(roomForRest(week([rest({ hours: 2 })]), 0)).toBe(DAILY_RECOVERY_CEILING - 2)
  })

  it('offers nothing once the day is at the ceiling', () => {
    expect(roomForRest(week(fullDay()), 0)).toBe(0)
  })

  it('never goes negative on a day already over the ceiling', () => {
    // Reachable: a week restored from before the ceiling existed, or one hand-edited.
    expect(roomForRest(week([rest({ hours: DAILY_RECOVERY_CEILING + 4 })]), 0)).toBe(0)
  })
})

describe('the ceiling is not a hard constraint', () => {
  it('does not invalidate a week that is over it', () => {
    // A violations entry the solver cannot repair is a week permanently marked broken:
    // rest is fixed AND protectedRest, so no move the search can generate will ever move
    // it. Blocking creation gives the same protection with no dead end.
    expect(violations(week(fullDay()), DEFAULT_PARAMS)).toEqual([])
  })
})

describe('editWarnings', () => {
  it('warns when a hand-placed rest block would pass the ceiling', () => {
    const warnings = editWarnings({
      schedule: week(fullDay()),
      item: rest({ id: 'extra', dayIndex: 0, startHour: 21, hours: 2 }),
      params: DEFAULT_PARAMS,
    })

    expect(warnings.some((line) => line.includes('recovery'))).toBe(true)
  })

  it('says nothing about recovery for a day comfortably under the ceiling', () => {
    const warnings = editWarnings({
      schedule: week(),
      item: rest({ id: 'extra', hours: 2 }),
      params: DEFAULT_PARAMS,
    })

    expect(warnings.some((line) => line.includes('recovery'))).toBe(false)
  })

  it('does not count a block against its own former self', () => {
    // Same id as one already on the day: this is an edit, not an addition.
    const day = fullDay()
    const warnings = editWarnings({
      schedule: week(day),
      item: { ...(day[0] as ScheduledItem), startHour: 22 },
      params: DEFAULT_PARAMS,
    })

    expect(warnings.some((line) => line.includes('recovery'))).toBe(false)
  })
})
