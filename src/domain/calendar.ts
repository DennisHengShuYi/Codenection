import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'

/**
 * The date anchor, and the only place a day index becomes a real date.
 *
 * Every function here takes the clock as a parameter rather than reading it. That keeps this
 * module pure and testable, and it is what lets the anchor exist at all without breaking the
 * engine's own rule that nothing in `src/engine` may touch a clock — the anchor lives out
 * here, and the real `Date` is supplied once, at the UI edge.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Midnight UTC for a calendar date, so arithmetic counts whole days rather than hours and
 *  never drifts by one across a daylight-saving boundary. */
const utcMidnight = (iso: string): number | null => {
  if (!ISO_DATE.test(iso)) return null

  const time = Date.parse(`${iso}T00:00:00Z`)

  return Number.isNaN(time) ? null : time
}

const isoDateOf = (moment: Date): string => (moment.toISOString().split('T')[0] ?? '')

/** Records the real date day 0 falls on. Re-anchoring moves the week rather than stacking. */
export function anchorTo(schedule: Schedule, now: Date): Schedule {
  return { ...schedule, startedOn: isoDateOf(now) }
}

export function isAnchored(schedule: Schedule): boolean {
  return schedule.startedOn !== undefined && utcMidnight(schedule.startedOn) !== null
}

/**
 * Which day index the given moment falls on, or null when that cannot be answered.
 *
 * Null is a real answer here rather than a failure, and callers must handle it: a week saved
 * before anchoring existed has no anchor at all, and somebody reopening the app a month later
 * is not on day 40 of a three-week fortnight. Assuming today in either case would put the app
 * confidently on the wrong day, which is worse than saying it does not know.
 */
export function todayIndex(schedule: Schedule, now: Date): number | null {
  const start = schedule.startedOn === undefined ? null : utcMidnight(schedule.startedOn)
  if (start === null) return null

  const today = utcMidnight(isoDateOf(now))
  if (today === null) return null

  const index = Math.round((today - start) / MS_PER_DAY)

  return index >= 0 && index < HORIZON_DAYS ? index : null
}

/** The real date a day index falls on, or null without an anchor or outside the horizon. */
export function dateFor(schedule: Schedule, dayIndex: number): string | null {
  const start = schedule.startedOn === undefined ? null : utcMidnight(schedule.startedOn)
  if (start === null) return null
  if (dayIndex < 0 || dayIndex >= HORIZON_DAYS) return null

  return isoDateOf(new Date(start + dayIndex * MS_PER_DAY))
}

/** The day index a real date falls on, or null when it is outside the week. */
export function dayIndexFor(schedule: Schedule, date: string): number | null {
  const start = schedule.startedOn === undefined ? null : utcMidnight(schedule.startedOn)
  const target = utcMidnight(date)
  if (start === null || target === null) return null

  const index = Math.round((target - start) / MS_PER_DAY)

  return index >= 0 && index < HORIZON_DAYS ? index : null
}
