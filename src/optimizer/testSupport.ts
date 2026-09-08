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
