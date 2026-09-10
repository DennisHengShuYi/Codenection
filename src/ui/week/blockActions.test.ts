import { describe, expect, it } from 'vitest'
import type { BlockRecord } from '../../domain/blockLog'
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

const sheet = (one: ScheduledItem, today = 5, blockLog: readonly BlockRecord[] = []) =>
  blockSheet({ schedule: week([one]), itemId: one.id, today, blockLog })

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
    // `move` is intentionally absent -- see blockActions.ts's doc comment: it was wired
    // once with no picker behind it, indistinguishable from "Later", and was dropped at
    // the combined 12+13 review rather than left as a silent stub.
    expect(sheet(item())?.actions).toEqual(['done', 'later', 'cantStart'])
  })

  it('offers only Done for a fixed block, because the optimizer cannot move it either', () => {
    expect(sheet(item({ fixed: true }))?.actions).toEqual(['done'])
  })

  it('asks protected rest whether it actually happened', () => {
    expect(sheet(item({ protectedRest: true, fixed: true }))?.actions).toEqual(['didRest'])
  })

  // A past, unanswered protected-rest block keeps rest's own question: "did it happen" is
  // still the right thing to ask, and it has not been answered yet.
  it('asks a past protected-rest block that has not been answered whether it happened', () => {
    expect(sheet(item({ protectedRest: true, fixed: true, dayIndex: 2 }))?.actions).toEqual([
      'didRest',
    ])
  })

  // A past protected-rest block that HAS been answered must still expose that on the only
  // axis this model has for it -- confirm/undo. Answered rest and never-touched rest cannot
  // read identically, or the student is asked "did you rest?" cold the day after they already
  // answered, with no way to undo it -- while every other block kind on the same screen does
  // offer that.
  it('offers Undo on a past protected-rest block already answered, not didRest again', () => {
    expect(
      sheet(item({ protectedRest: true, fixed: true, dayIndex: 2 }), 5, [record()])?.actions,
    ).toEqual(['undo'])
  })

  it('asks a past block that has not been confirmed how it went', () => {
    expect(sheet(item({ dayIndex: 2 }))?.actions).toEqual(['confirm'])
  })

  // §8b/Task 17: the durable log is the only record of "answered" left -- the legacy
  // `profile.confirmedItemIds` union this used to include is gone.
  it('offers Undo on a past block already answered via the log', () => {
    expect(sheet(item({ dayIndex: 2 }), 5, [record()])?.actions).toEqual(['undo'])
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

  /**
   * Ported from `roomModel.attention.test.ts`, deleted with the rows API it tested when the
   * room became display-only. The guard outlived its surface: §4.1's trigger is "three days
   * past first appearance", and a task sixteen days in the *future* has not appeared yet.
   * The age was once computed as `dayIndex - today` -- the wait ahead of a task rather than
   * the time behind it -- so every distant errand read as stuck and the room shouted. The
   * suite otherwise catches a flipped direction only side-on, via the stuck case above.
   */
  it('does not call a task scheduled a fortnight ahead stuck', () => {
    expect(sheet(item({ dayIndex: 16 }), 0)?.microStart).toBeNull()
  })

  it('returns null for an id that no longer exists', () => {
    expect(blockSheet({ schedule: week([]), itemId: 'gone', today: 0 })).toBeNull()
  })

  describe('recordedAnswer', () => {
    it('is null when there is nothing to undo', () => {
      expect(sheet(item())?.recordedAnswer).toBeNull()
    })

    it('carries what was actually said, for a block answered via the log', () => {
      const logged = record({ answer: 'longer' })

      expect(sheet(item({ dayIndex: 2 }), 5, [logged])?.recordedAnswer).toBe('longer')
    })
  })
})
