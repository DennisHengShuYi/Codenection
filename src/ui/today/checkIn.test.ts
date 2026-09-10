import { describe, expect, it } from 'vitest'
import type { BlockRecord } from '../../domain/blockLog'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import { blockToAsk, SLEEP_HOURS, withSleep } from './checkIn'

const item = (id: string, type: ScheduledItem['type'], dayIndex = 0): ScheduledItem => ({
  id,
  title: id,
  type,
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
})

const record = (blockId: string, type: ScheduledItem['type'], dayIndex = 0): BlockRecord => ({
  blockId,
  type,
  plannedHours: 2,
  dayIndex,
  answer: 'right',
  answeredAt: 0,
})

const week = (items: ScheduledItem[]): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

describe('blockToAsk', () => {
  it('asks nothing when there is nothing unconfirmed', () => {
    const blockLog = [record('a', 'mental')]

    expect(
      blockToAsk({ schedule: week([item('a', 'mental')]), today: 0, blockLog }),
    ).toBeNull()
  })

  it('never asks about a day that has not happened', () => {
    const schedule = week([item('future', 'mental', 6)])

    expect(blockToAsk({ schedule, today: 0 })).toBeNull()
  })

  it('asks about the load type it knows least about, so the threshold is reached fastest', () => {
    // Two logged confirmations for 'mental', none for 'physical': the least-sampled type
    // gets asked first.
    const blockLog = [record('past-1', 'mental', 1), record('past-2', 'mental', 1)]
    const schedule = week([item('study', 'mental', 2), item('gym', 'physical', 2)])

    expect(blockToAsk({ schedule, today: 2, blockLog })?.id).toBe('gym')
  })

  it('breaks ties by the earlier block, so the day is walked as it was lived', () => {
    const early = { ...item('early', 'mental'), startHour: 8 }
    const late = { ...item('late', 'mental'), startHour: 20 }

    expect(blockToAsk({ schedule: week([late, early]), today: 0 })?.id).toBe('early')
  })

  it('does not ask again about a block already answered via the log', () => {
    const schedule = week([item('a', 'mental')])
    const blockLog = [record('a', 'mental')]

    expect(blockToAsk({ schedule, today: 0, blockLog })).toBeNull()
  })

  it('defaults to an empty block log when none is given, so every existing caller keeps working', () => {
    const schedule = week([item('a', 'mental')])

    expect(blockToAsk({ schedule, today: 0 })).toEqual(
      blockToAsk({ schedule, today: 0, blockLog: [] }),
    )
  })
})

describe('withSleep', () => {
  it('writes the reported night into the day it was about', () => {
    const next = withSleep(week([]), 3, 'under5')

    expect(next.sleepByDay[3]).toBe(SLEEP_HOURS.under5)
  })

  it('leaves every other night alone, and does not mutate the week it was given', () => {
    const before = week([])
    const next = withSleep(before, 3, 'under5')

    expect(next.sleepByDay[4]).toBe(7)
    expect(before.sleepByDay[3]).toBe(7)
  })
})
