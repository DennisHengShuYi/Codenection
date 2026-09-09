import { describe, expect, it } from 'vitest'
import type { BlockRecord } from '../../domain/blockLog'
import { DEFAULT_PROFILE } from '../../domain/calibration'
import { STUCK_AFTER_DAYS } from '../../domain/microStart'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import { blockSheet } from './blockActions'

const item = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'essay',
  title: 'Essay draft',
  type: 'mental',
  kind: 'studyBlock',
  hours: 3,
  intensity: 1,
  dayIndex: 5,
  startHour: 20,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const week = (items: ScheduledItem[]): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const sheet = (
  one: ScheduledItem,
  profile = DEFAULT_PROFILE,
  today = 5,
  blockLog: readonly BlockRecord[] = [],
) => blockSheet({ schedule: week([one]), profile, itemId: one.id, today, blockLog })

const record = (over: Partial<BlockRecord> = {}): BlockRecord => ({
  blockId: 'essay',
  type: 'mental',
  plannedHours: 3,
  dayIndex: 2,
  answer: 'right',
  answeredAt: 0,
  ...over,
})

describe('blockSheet', () => {
  it('offers the full set for a movable block today or later', () => {
    expect(sheet(item())?.actions).toEqual(['done', 'later', 'move', 'cantStart'])
  })

  it('offers only Done for a fixed block, because the optimizer cannot move it either', () => {
    expect(sheet(item({ fixed: true }))?.actions).toEqual(['done'])
  })

  it('asks protected rest whether it actually happened', () => {
    expect(sheet(item({ protectedRest: true, fixed: true }))?.actions).toEqual(['didRest'])
  })

  it('asks a past block that has not been confirmed how it went', () => {
    expect(sheet(item({ dayIndex: 2 }))?.actions).toEqual(['confirm'])
  })

  it('offers Undo on a past block already answered via the profile', () => {
    const profile = { ...DEFAULT_PROFILE, confirmedItemIds: ['essay'] }

    expect(sheet(item({ dayIndex: 2 }), profile)?.actions).toEqual(['undo'])
  })

  // Ruling 3: the union of block log and legacy profile decides "answered", matching
  // roomModel.ts and scheduleView.ts. Nothing writes a BlockRecord in the running app yet,
  // but the check must already honour one when it does.
  it('offers Undo on a past block already answered via the log, not just the profile', () => {
    expect(sheet(item({ dayIndex: 2 }), DEFAULT_PROFILE, 5, [record()])?.actions).toEqual([
      'undo',
    ])
  })

  it('opens the micro-start unasked once a task has sat three days', () => {
    const stuck = item({ dayIndex: 5 - STUCK_AFTER_DAYS })

    // Past, so it would normally be a confirm -- but a stuck task is the case §4.1 cares
    // about and the micro-start rides along regardless of which actions are offered.
    expect(sheet(stuck)?.microStart).not.toBeNull()
  })

  it('does not offer a micro-start for something that is not stuck', () => {
    expect(sheet(item())?.microStart).toBeNull()
  })

  it('returns null for an id that no longer exists', () => {
    expect(
      blockSheet({ schedule: week([]), profile: DEFAULT_PROFILE, itemId: 'gone', today: 0 }),
    ).toBeNull()
  })
})
