import { HORIZON_DAYS } from '../engine'
import type { Calendar } from '../ai/types'
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

/**
 * §44: which real day the horizon's day 0 is, for the readers that need it.
 *
 * Both readers needed this and neither had it. The rules parser worked out a named weekday
 * from `today % 7`, which is only right if day 0 is a Sunday; the model was told
 * "deadlineDay is a day index from 0 (today)" and never told what today was, so a stated
 * "thursday" could only be guessed at. Either way "gym thursday 7pm" landed on a day chosen
 * by arithmetic rather than by the student, and §43's Day select is what finally showed it.
 *
 * `todayLabel` is absent for a week that has never been dated. There is nothing true to
 * say there, and a made-up date would send the model a confident wrong answer -- the rules
 * fall back to their old behaviour instead, which is what that week has always had.
 */
export function calendarFor(schedule: Schedule, today: number): Calendar {
  const startDate = dateFor(schedule, 0)
  const todayDate = dateFor(schedule, today)

  // UTC throughout, matching `dateFor`: read in a local timezone west of Greenwich, an ISO
  // day names the day before, and a weekday off by one is the whole bug this fixes.
  const startWeekday =
    startDate === null ? 0 : new Date(`${startDate}T00:00:00Z`).getUTCDay()

  const todayLabel =
    todayDate === null
      ? undefined
      : new Date(`${todayDate}T00:00:00Z`).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        })

  return { today, startWeekday, ...(todayLabel === undefined ? {} : { todayLabel }) }
}

