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

  it('gives every inserted item its own id', () => {
    const first = scheduleRecovery(week(), recovery)
    const second = scheduleRecovery(first, recovery)

    expect(second.items[0]?.id).not.toBe(second.items[1]?.id)
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
