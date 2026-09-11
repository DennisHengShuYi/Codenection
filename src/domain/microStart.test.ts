import { describe, expect, it } from 'vitest'
import type { ScheduledItem } from '../optimizer'
import { MAX_RUNG_MINUTES } from './ladder'
import { firstAction, isStuck } from './microStart'

const item = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'essay',
  title: 'WIA3001 essay',
  type: 'mental',
  kind: 'studyBlock',
  hours: 6,
  intensity: 1,
  dayIndex: 0,
  startHour: 10,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

describe('firstAction', () => {
  /**
   * §4.1: permission at task level. "You don't have to write the essay. You have to open the
   * document and write the title." The action is the smallest visible move -- not a smaller
   * version of the whole task, because "outline the essay" is still the essay.
   */
  it('offers a first move rather than a smaller version of the task', () => {
    const action = firstAction(item()).action

    expect(action).not.toMatch(/^write the essay|^do the essay/i)
    expect(action).toMatch(/open|write the title|find|put/i)
  })

  it('gives every kind of work something to start with', () => {
    for (const kind of ['studyBlock', 'errands', 'lightExercise', 'socialDraining'] as const) {
      expect(firstAction(item({ kind })).action.length, kind).toBeGreaterThan(5)
    }
  })

  // §4.1: a time box under ten minutes -- short enough that a stuck person believes it.
  // The constant moved to `ladder.ts` with the table it belongs to: one first move is now
  // rung one of a chain, and the box is the chain's box.
  it('boxes it under ten minutes', () => {
    expect(firstAction(item()).minutes).toBeLessThanOrEqual(MAX_RUNG_MINUTES)
    expect(MAX_RUNG_MINUTES).toBeLessThanOrEqual(10)
  })

  // One action, never a list. Same reason as §5.2: a stuck person cannot choose.
  it('offers exactly one action, never a list', () => {
    const action = firstAction(item()).action

    expect(Array.isArray(action)).toBe(false)
    expect(action).not.toMatch(/\bor\b.*\bor\b/i)
  })

  it('points at the task it came from', () => {
    expect(firstAction(item({ id: 'lab-report' })).itemId).toBe('lab-report')
  })

  it('is short enough to read while stuck', () => {
    expect(firstAction(item()).action.length).toBeLessThan(90)
  })
})

/**
 * §4.1's automatic trigger, rewritten: the card fires when a block's own slot is the hour
 * you are in.
 *
 * It used to fire three days after a block first appeared. That put "stuck on this one?"
 * in front of a student at any hour of any day, about something they had not been near
 * since Tuesday -- and a block three days old sits on a past day, so the one moment its
 * prompt is actually actionable had already gone.
 *
 * The moment paralysis is worth interrupting is the moment you are supposed to be doing the
 * thing. That is the only condition now, alongside the one that never changed: rest is not
 * a task somebody is failing to start.
 */
describe('isStuck', () => {
  const inSlot = { today: 2, nowHour: 10 }

  it('fires while the block is running', () => {
    expect(isStuck(item({ dayIndex: 2, startHour: 9, hours: 2 }), inSlot)).toBe(true)
  })

  it('does not fire before it starts', () => {
    expect(isStuck(item({ dayIndex: 2, startHour: 14, hours: 2 }), inSlot)).toBe(false)
  })

  it('does not fire once it is over', () => {
    expect(isStuck(item({ dayIndex: 2, startHour: 7, hours: 2 }), inSlot)).toBe(false)
  })

  it('does not fire on another day at the same hour', () => {
    expect(isStuck(item({ dayIndex: 5, startHour: 9, hours: 2 }), inSlot)).toBe(false)
  })

  /** Unchanged, and the reason is unchanged: offering a micro-start for rest turns recovery
   *  into another thing to be behind on. */
  it('never fires on protected rest, however exactly the hour matches', () => {
    expect(
      isStuck(item({ protectedRest: true, dayIndex: 2, startHour: 9, hours: 2 }), inSlot),
    ).toBe(false)
  })

  it('never fires on rest or sleep', () => {
    expect(isStuck(item({ kind: 'rest', dayIndex: 2, startHour: 9, hours: 2 }), inSlot)).toBe(false)
    expect(isStuck(item({ kind: 'sleep', dayIndex: 2, startHour: 9, hours: 2 }), inSlot)).toBe(
      false,
    )
  })
})
