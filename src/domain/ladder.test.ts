import { describe, expect, it } from 'vitest'
import { ACTIVITY_KINDS, type ActivityKind } from '../engine/types'
import type { ScheduledItem } from '../optimizer'
import {
  advance,
  currentRung,
  isComplete,
  MAX_ACTION_LENGTH,
  MAX_RUNG_MINUTES,
  MAX_RUNGS,
  MIN_RUNGS,
  replaceCurrent,
  ruleLadder,
  type Ladder,
} from './ladder'
import { firstAction } from './microStart'

const item = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'b1',
  title: 'Ethics essay',
  type: 'mental',
  kind: 'studyBlock',
  hours: 3,
  intensity: 1,
  dayIndex: 0,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const ladder = (rungs: number, done: number): Ladder => ({
  blockId: 'b1',
  rungs: Array.from({ length: rungs }, (_, index) => ({ action: `step ${index}`, minutes: 5 })),
  done,
})

describe('the ladder algebra', () => {
  it('shows the rung at the done count', () => {
    expect(currentRung(ladder(3, 1))?.action).toBe('step 1')
  })

  it('has no current rung once every rung is done', () => {
    expect(currentRung(ladder(3, 3))).toBeNull()
  })

  it('advances without mutating the ladder it was given', () => {
    const before = ladder(3, 1)
    const after = advance(before)

    expect(after.done).toBe(2)
    expect(before.done).toBe(1)
    expect(after).not.toBe(before)
  })

  it('cannot advance past the last rung', () => {
    expect(advance(ladder(3, 3)).done).toBe(3)
  })

  it('is complete only when the done count reaches the end', () => {
    expect(isComplete(ladder(3, 2))).toBe(false)
    expect(isComplete(ladder(3, 3))).toBe(true)
  })

  // Rejecting a step is not progress through it. If `replaceCurrent` moved the count, a
  // student who disliked two suggestions in a row would be told they were two steps in.
  it('replaces the current rung without moving the count', () => {
    const next = replaceCurrent(ladder(3, 1), { action: 'something else', minutes: 4 })

    expect(next.rungs[1]?.action).toBe('something else')
    expect(next.rungs[0]?.action).toBe('step 0')
    expect(next.done).toBe(1)
  })

  it('ignores a replacement on a ladder with nothing left to replace', () => {
    const done = ladder(3, 3)
    expect(replaceCurrent(done, { action: 'x', minutes: 1 })).toEqual(done)
  })
})

describe('ruleLadder', () => {
  it.each(ACTIVITY_KINDS)('gives %s a usable chain with no network', (kind: ActivityKind) => {
    const built = ruleLadder(item({ kind }))

    expect(built.blockId).toBe('b1')
    expect(built.done).toBe(0)
    expect(built.rungs.length).toBeGreaterThanOrEqual(MIN_RUNGS)
    expect(built.rungs.length).toBeLessThanOrEqual(MAX_RUNGS)
  })

  it.each(ACTIVITY_KINDS)('keeps every %s rung inside the time box', (kind: ActivityKind) => {
    for (const rung of ruleLadder(item({ kind })).rungs) {
      expect(rung.minutes).toBeGreaterThan(0)
      expect(rung.minutes).toBeLessThanOrEqual(MAX_RUNG_MINUTES)
    }
  })

  it.each(ACTIVITY_KINDS)('keeps every %s rung to one instruction', (kind: ActivityKind) => {
    for (const rung of ruleLadder(item({ kind })).rungs) {
      expect(rung.action.trim().length).toBeGreaterThan(0)
      expect(rung.action.length).toBeLessThanOrEqual(MAX_ACTION_LENGTH)
    }
  })

  // §4.1: "you don't have to write the essay, you have to open the document". A rung that
  // is the task's own title reworded is the failure this whole feature exists to avoid.
  it('never answers a task with the task', () => {
    for (const rung of ruleLadder(item({ title: 'Write the ethics essay' })).rungs) {
      expect(rung.action.toLowerCase()).not.toContain('write the ethics essay')
    }
  })

  // §5.1: recovery is structurally protected. A ladder that says "finish resting" turns
  // the one protected thing in the week into another item to be behind on.
  it.each(['rest', 'sleep'] as const)('lowers the bar to %s rather than setting a task', (kind) => {
    const text = ruleLadder(item({ kind }))
      .rungs.map((rung) => rung.action.toLowerCase())
      .join(' ')

    expect(text).not.toContain('finish')
    expect(text).not.toContain('complete')
    expect(text).not.toContain('get it done')
  })

  it('reads protected rest as rest whatever kind it carries', () => {
    const social = ruleLadder(item({ kind: 'socialRestorative', protectedRest: true }))
    const rest = ruleLadder(item({ kind: 'rest' }))

    expect(social.rungs).toEqual(rest.rungs)
  })
})

describe('firstAction', () => {
  // The Telegram bot answers `/start <task>` with one message and cannot walk a ladder, so
  // it gets rung one -- derived from the same table rather than keeping a second one.
  it('is the first rung of the same chain the page walks', () => {
    const move = firstAction(item({ kind: 'errands' }))
    const first = ruleLadder(item({ kind: 'errands' })).rungs[0]

    expect(move.action).toBe(first?.action)
    expect(move.minutes).toBe(first?.minutes)
    expect(move.itemId).toBe('b1')
  })
})
