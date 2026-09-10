import { describe, expect, it } from 'vitest'
import type { BlockRecord } from '../../domain/blockLog'
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
    expect(sheet(item())?.actions).toEqual(['done', 'later', 'microStart', 'edit', 'remove'])
  })

  it('offers only Done for a fixed block, because the optimizer cannot move it either', () => {
    expect(sheet(item({ fixed: true }))?.actions).toEqual(['done', 'microStart', 'edit', 'remove'])
  })

  it('asks protected rest whether it actually happened', () => {
    expect(sheet(item({ protectedRest: true, fixed: true }))?.actions).toEqual(['didRest', 'microStart', 'edit', 'remove'])
  })

  // A past, unanswered protected-rest block keeps rest's own question: "did it happen" is
  // still the right thing to ask, and it has not been answered yet.
  it('asks a past protected-rest block that has not been answered whether it happened', () => {
    expect(sheet(item({ protectedRest: true, fixed: true, dayIndex: 2 }))?.actions).toEqual([
      'didRest',
      'microStart',
      'edit',
      'remove',
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
    ).toEqual(['undo', 'microStart', 'edit', 'remove'])
  })

  it('asks a past block that has not been confirmed how it went', () => {
    expect(sheet(item({ dayIndex: 2 }))?.actions).toEqual(['confirm', 'microStart', 'edit', 'remove'])
  })

  // §8b/Task 17: the durable log is the only record of "answered" left -- the legacy
  // `profile.confirmedItemIds` union this used to include is gone.
  it('offers Undo on a past block already answered via the log', () => {
    expect(sheet(item({ dayIndex: 2 }), 5, [record()])?.actions).toEqual(['undo', 'microStart', 'edit', 'remove'])
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

/**
 * Deliberately unconditional, where every other action in this model is conditional.
 *
 * The rest of `blockSheet` answers "what can be said ABOUT this block", and that genuinely
 * depends on whether it has happened yet. These two change what the block IS -- and a
 * student correcting their own week (a cancelled class, a tutorial that turned out to be two
 * hours) is right to be able to do that on a fixed block, on protected rest, and on last
 * Tuesday. The form says what each of those costs; it does not refuse.
 */
describe('editing and removing, which every block allows', () => {
  const cases: readonly {
    readonly name: string
    readonly over: Partial<ScheduledItem>
    readonly today: number
  }[] = [
    { name: 'a loose block ahead of today', over: {}, today: 0 },
    { name: 'a fixed class', over: { fixed: true }, today: 0 },
    { name: 'protected rest', over: { protectedRest: true }, today: 0 },
    { name: 'a block already in the past', over: {}, today: 9 },
  ]

  for (const { name, over, today } of cases) {
    it(`offers both on ${name}`, () => {
      const model = sheet(item(over), today)

      expect(model?.actions).toContain('edit')
      expect(model?.actions).toContain('remove')
    })
  }

  // Proof that adding the trio changed nothing about the answers a block already offered.
  it('leaves the answers a block already offered exactly as they were', () => {
    const model = sheet(item(), 0)

    expect(
      model?.actions.filter(
        (action) => action !== 'edit' && action !== 'remove' && action !== 'microStart',
      ),
    ).toEqual(['done', 'later'])
  })

  describe('the micro-start button', () => {
    // Unconditional, beside edit and remove. "Every block, no exceptions": what used to make
    // this safe was hiding it, and what makes it safe now is what the rest and sleep chains
    // say (see `ruleLadder`).
    it.each([
      ['an ordinary block', {}, 5],
      ['a fixed class', { fixed: true }, 5],
      ['protected rest', { protectedRest: true }, 5],
      ['a block already in the past', {}, 9],
      ['a past block already answered', {}, 9],
    ])('is offered on %s', (_label, over, today) => {
      expect(sheet(item(over), today)?.actions).toContain('microStart')
    })

    // One micro-start path, not two that can disagree about a block's first move.
    it('no longer carries a micro-start in the model', () => {
      const model = sheet(item({ dayIndex: 0 }), 9)

      expect(model).not.toHaveProperty('microStart')
      expect(model?.actions).not.toContain('cantStart')
    })
  })
})
