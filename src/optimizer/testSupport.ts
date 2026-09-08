import { HORIZON_DAYS, type Reserves } from '../engine'
import type { Schedule, ScheduledItem } from './types'

/** Shared by every optimizer test so the fixtures cannot drift apart between files. */

export const HEALTHY: Reserves = { mental: 80, physical: 80, social: 80, errands: 80 }

export function studyItem(id: string, dayIndex: number, hours: number): ScheduledItem {
  return {
    id,
    title: id,
    type: 'mental',
    kind: 'studyBlock',
    hours,
    intensity: 1,
    dayIndex,
    startHour: 9,
    fixed: false,
    deadlineDay: null,
    protectedRest: false,
  }
}

export function errandItem(id: string, dayIndex: number, startHour: number): ScheduledItem {
  return {
    id,
    title: id,
    type: 'errands',
    kind: 'errands',
    hours: 1,
    intensity: 1,
    dayIndex,
    startHour,
    fixed: false,
    deadlineDay: null,
    protectedRest: false,
  }
}

export function restItem(id: string, dayIndex: number, startHour: number): ScheduledItem {
  return {
    id,
    title: id,
    type: 'mental',
    kind: 'rest',
    hours: 2,
    intensity: 1,
    dayIndex,
    startHour,
    fixed: true,
    deadlineDay: null,
    protectedRest: true,
  }
}

/** Seven hours is enough that sleep recovery cancels the isolation drain, which keeps
 *  most fixtures out of deficit and makes them about the thing they are testing. Pass a
 *  lower figure to build a fortnight that actually crashes. */
/**
 * Twice-weekly contact with other people.
 *
 * Most fixtures need this, and leaving it out is not neutral. Social reserve drains from
 * isolation (§1.2) and is refilled only by contact (§5.2), so a fixture describing three
 * weeks of seeing nobody makes social the binding floor in every case -- and a workload
 * test built on it then measures loneliness rather than workload.
 */
export function socialBaseline(): ScheduledItem[] {
  return Array.from({ length: HORIZON_DAYS }, (_, day) => day)
    .filter((day) => day % 7 === 2 || day % 7 === 5)
    .map((day) => ({
      id: `social-${day}`,
      title: 'Seeing people',
      type: 'social' as const,
      kind: 'socialRestorative' as const,
      hours: 2,
      intensity: 1,
      dayIndex: day,
      startHour: 19,
      fixed: false,
      deadlineDay: null,
      protectedRest: false,
    }))
}

export function makeSchedule(
  items: readonly ScheduledItem[],
  sleepHours = 7,
): Schedule {
  return {
    items,
    start: HEALTHY,
    horizonDays: HORIZON_DAYS,
    sleepByDay: Array.from({ length: HORIZON_DAYS }, () => sleepHours),
  }
}
