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

/**
 * The days of the week, in `Date.getUTCDay()`'s order.
 *
 * Sunday first because that is the order the platform counts in, and `expandRecurring`
 * matches a repeat against exactly that index -- so a prettier Monday-first list here would
 * silently shift every recurring item by a day.
 *
 * One list. There were four, all correct and all separately maintained: `ai/calendarAnchor`
 * built a prompt from one, `domain/placement` named a day from another, `ui/planner/ItemChip`
 * offered a third to the student, and `ai/fallbackParser` matched text against a lowercase
 * fourth. Kept here because this module is where the `getUTCDay` reading the order belongs to
 * already lives.
 */
export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Midnight UTC for a calendar date, so arithmetic counts whole days rather than hours and
 *  never drifts by one across a daylight-saving boundary. */
const utcMidnight = (iso: string): number | null => {
  if (!ISO_DATE.test(iso)) return null

  const time = Date.parse(`${iso}T00:00:00Z`)

  return Number.isNaN(time) ? null : time
}

/**
 * Which calendar date a moment falls on, for the student reading a clock on their wall.
 *
 * Not `toISOString()`, which renders the UTC instant. §9 puts this app in Malaysia, and at
 * UTC+8 every local time from 00:00 to 07:59 belongs to the previous UTC date -- so a
 * "today" taken from the UTC string named yesterday for the first eight hours of every
 * single day, and `anchorTo` stamped a week begun after midnight with the day before it
 * started. Nothing caught it because every test in `calendar.test.ts` sampled 09:00Z,
 * which is five in the afternoon in Kuala Lumpur, where the two dates agree.
 *
 * `timeZone` is a parameter for the same reason the clock is: this module stays pure and
 * the behaviour stays pinnable on a machine in any zone. Left undefined, `Intl` uses the
 * device's own zone, which is the right default for a PWA a student opens on their phone --
 * a hardcoded `Asia/Kuala_Lumpur` would be wrong for the same student on exchange.
 *
 * Assembled from parts rather than formatted, so the result is `YYYY-MM-DD` regardless of
 * what order a locale would have chosen to print.
 */
const isoDateOf = (moment: Date, timeZone?: string): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(moment)

  const value = (type: 'year' | 'month' | 'day'): string =>
    parts.find((part) => part.type === type)?.value ?? ''

  return `${value('year')}-${value('month')}-${value('day')}`
}

/** Records the real date day 0 falls on. Re-anchoring moves the week rather than stacking. */
export function anchorTo(schedule: Schedule, now: Date, timeZone?: string): Schedule {
  return { ...schedule, startedOn: isoDateOf(now, timeZone) }
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
 *
 * `timeZone` reaches `isoDateOf`, which is where the local-versus-UTC question is decided
 * and answered. The arithmetic below stays on UTC midnight deliberately: once both ends are
 * calendar dates, counting whole days between them is exactly what must not drift across a
 * daylight-saving boundary.
 */
export function todayIndex(schedule: Schedule, now: Date, timeZone?: string): number | null {
  const start = schedule.startedOn === undefined ? null : utcMidnight(schedule.startedOn)
  if (start === null) return null

  const today = utcMidnight(isoDateOf(now, timeZone))
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

  // UTC throughout, matching `dateFor`, and deliberately the opposite of what `isoDateOf`
  // does -- the two directions want opposite answers. Going from an *instant* to a calendar
  // date needs the student's own zone, or a phone at 02:00 reports yesterday. Reading an
  // ISO date *string* back needs UTC, because the string is already a calendar date with no
  // time in it: parse it locally and a zone behind Greenwich names the day before, so the
  // weekday comes out off by one.
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

