import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { scheduleRecovery } from './scheduleRecovery'

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

const recovery = {
  title: 'Get outside and walk',
  type: 'physical' as const,
  kind: 'lightExercise' as const,
  hours: 1,
  dayIndex: 0,
  startHour: 16,
}

/**
 * §5.1 calls structurally protected recovery the most important design decision in the app,
 * and `scheduleRecovery` is the only path in the whole codebase allowed to set it. This is
 * that guarantee, pinned down directly rather than only inferred from `RoomShell`'s own
 * integration test -- a change here would otherwise be invisible until the screen test
 * happened to notice.
 */
describe('scheduleRecovery', () => {
  it('inserts the recovery item into the week', () => {
    expect(scheduleRecovery(week(), recovery).items).toHaveLength(1)
  })

  it('marks the inserted item fixed, so the optimizer cannot move it', () => {
    expect(scheduleRecovery(week(), recovery).items[0]?.fixed).toBe(true)
  })

  it('marks the inserted item as protected rest, so nothing may be scheduled over it either', () => {
    expect(scheduleRecovery(week(), recovery).items[0]?.protectedRest).toBe(true)
  })

  // Both flags together, not either alone -- `fixed` without `protectedRest` still lets
  // something be scheduled on top of it, which is exactly what §5.1 says must never happen.
  it('sets both fixed and protectedRest together, never only one', () => {
    const item = scheduleRecovery(week(), recovery).items[0]

    expect(item?.fixed).toBe(true)
    expect(item?.protectedRest).toBe(true)
  })

  it('does not modify the week it was given', () => {
    const before = week()
    const snapshot = JSON.stringify(before)

    scheduleRecovery(before, recovery)

    expect(JSON.stringify(before)).toBe(snapshot)
  })

  /**
   * Two genuinely different bookings, because the same one twice is now a no-op.
   *
   * This booked `recovery` twice and compared `items[0]` with `items[1]`. Once booking the
   * same day and hour twice became idempotent, `items[1]` was `undefined` and the assertion
   * compared a string against nothing -- so it passed while testing nothing at all.
   */
  it('gives every inserted item its own id', () => {
    const first = scheduleRecovery(week(), recovery)
    const second = scheduleRecovery(first, { ...recovery, startHour: 19 })

    expect(second.items).toHaveLength(2)
    expect(second.items[0]?.id).not.toBe(second.items[1]?.id)
  })

  /**
   * Telegram delivers a callback at least once, and the chat's Rest button had no guard
   * where its three sibling callbacks each have one -- so a retried tap booked a second
   * identical rest block. Protected rest already at that day and hour means the tap has
   * been honoured.
   */
  it('books nothing a second time when protected rest already sits at that day and hour', () => {
    const once = scheduleRecovery(week(), recovery)
    const twice = scheduleRecovery(once, recovery)

    expect(once.items).toHaveLength(1)
    expect(twice.items).toHaveLength(1)
    expect(twice).toBe(once)
  })

  /** Rest at a different hour of the same day is a different booking, not a retry. */
  it('still books rest elsewhere on a day that already has some', () => {
    const once = scheduleRecovery(week(), recovery)

    expect(scheduleRecovery(once, { ...recovery, startHour: 20 }).items).toHaveLength(2)
  })

  /**
   * The stamp is what lets `telegram/handle` -- a pure function that takes its clock as an
   * argument -- use this at all. It read `Date.now()`, so the chat hand-built its own copy
   * of this item instead and `restNow.ts`'s "only door to protected rest" was untrue.
   */
  it('takes the stamp for its id rather than reading a clock', () => {
    const item = scheduleRecovery(week(), recovery, 1700000000000).items[0]

    expect(item?.id).toContain('1700000000000')
  })

  it('carries the title, type, kind, hours, day and start hour through unchanged', () => {
    const item = scheduleRecovery(week(), recovery).items[0]

    expect(item?.title).toBe(recovery.title)
    expect(item?.type).toBe(recovery.type)
    expect(item?.kind).toBe(recovery.kind)
    expect(item?.hours).toBe(recovery.hours)
    expect(item?.dayIndex).toBe(recovery.dayIndex)
    expect(item?.startHour).toBe(recovery.startHour)
  })
})
