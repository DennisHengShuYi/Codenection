import { describe, expect, it } from 'vitest'
import type { ScheduledItem } from '../optimizer'
import { firstAction, isStuck, MICRO_START_MINUTES, STUCK_AFTER_MISSES } from './microStart'

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
  it('boxes it under ten minutes', () => {
    expect(firstAction(item()).minutes).toBeLessThan(10)
    expect(MICRO_START_MINUTES).toBeLessThan(10)
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

describe('isStuck', () => {
  /**
   * §4.1's automatic trigger: two scheduled slots missed, or three days past first
   * appearance. A block that repeatedly returns "no" is a stuck task, which fires
   * Micro-Start without the student having to admit they are stuck.
   */
  it('reads a task missed twice as stuck', () => {
    expect(isStuck(item(), STUCK_AFTER_MISSES, 0)).toBe(true)
  })

  it('does not call one miss stuck', () => {
    expect(isStuck(item(), 1, 0)).toBe(false)
  })

  it('reads a task three days past its first appearance as stuck', () => {
    expect(isStuck(item(), 0, 3)).toBe(true)
  })

  it('leaves a fresh task alone', () => {
    expect(isStuck(item(), 0, 0)).toBe(false)
  })

  // Protected rest is not a task somebody is failing to start.
  it('never calls protected rest stuck', () => {
    expect(isStuck(item({ protectedRest: true }), 5, 10)).toBe(false)
  })

  it('never calls a rest block stuck', () => {
    expect(isStuck(item({ kind: 'rest' }), 5, 10)).toBe(false)
  })
})
