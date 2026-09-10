import type { ParsedItem } from '../ai'
import { dayIndexFor } from '../domain/calendar'
import type { Schedule } from '../optimizer'

/**
 * Google's calendar events, turned into the same chips a photo or a brain dump produces.
 *
 * The boundary, and treated like every other one in this codebase: an event that does not
 * fit the shape is dropped rather than guessed at. §1.4's warning about a wrong class time
 * silently poisoning every prediction applies with more force here than to a photo, because
 * one import can bring in fifty rows and nobody reads fifty rows carefully.
 *
 * Pure, and in `src/` so the unit suite reaches it. The fetch that produces this JSON lives
 * in `api/`, where the credential is.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * The calendar date an event actually falls on, in its own timezone.
 *
 * The bug this exists to prevent: Google returns RFC 3339 with the event's own offset, so a
 * 7am class in Malaysia is `2026-09-09T07:00:00+08:00` -- which is 23:00 UTC on 2026-09-08.
 * Reaching for `toISOString().split('T')[0]`, the obvious move, puts that Wednesday lecture
 * on Tuesday. Silently, for everybody east of Greenwich, on every early event.
 *
 * The date as written already *is* the local date, which is exactly why the offset is
 * attached to it -- so the first ten characters are the answer, and converting to UTC first
 * is the mistake.
 */
export function localDateOf(dateTime: string): string | null {
  const date = dateTime.slice(0, 10)
  if (!DATE_ONLY.test(date)) return null

  // A shape that looks right but is not a day -- 2026-02-31, say.
  return Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ? null : date
}

/** The hour a timed event begins, read from its own local time for the same reason. */
const localHourOf = (dateTime: string): number | null => {
  const hour = Number(dateTime.slice(11, 13))

  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null
}

/**
 * Recurrence is deliberately not read here, and the reason is worth writing down.
 *
 * The events endpoint asks Google for `singleEvents=true`, so a weekly class arrives as the
 * instances it actually has -- with the cancelled one already gone and the moved one already
 * moved. An RRULE parser of our own would have to reproduce all of that to be correct, and
 * would get "this Tuesday's lecture is cancelled" wrong on its first outing.
 *
 * So each instance becomes its own row, which is also what the confirm screen should show: a
 * student seeing three chips is seeing exactly what will be added. If a pattern is there,
 * s37's `suggestRepeat` spots it from the week itself and offers to make it a series -- the
 * mechanism that already exists for a timetable typed one week at a time.
 */

interface CalendarTime {
  readonly dateTime?: unknown
  readonly date?: unknown
}

const stampOf = (time: CalendarTime | undefined): { at: string; allDay: boolean } | null => {
  if (typeof time?.dateTime === 'string') return { at: time.dateTime, allDay: false }
  if (typeof time?.date === 'string') return { at: time.date, allDay: true }

  return null
}

/** What an all-day event is worth, when nothing says. The same figure a parse with no stated
 *  effort uses, and flagged as a guess so the chip shows it as one. */
const ALL_DAY_HOURS = 1

let counter = 0

export function readEvents(events: readonly unknown[], schedule: Schedule): readonly ParsedItem[] {
  const items: ParsedItem[] = []

  for (const event of events) {
    if (typeof event !== 'object' || event === null) continue

    const raw = event as Record<string, unknown>
    // A cancelled event is not a commitment, whatever it still says in the payload.
    if (raw.status === 'cancelled') continue

    const title = typeof raw.summary === 'string' ? raw.summary.trim() : ''
    if (title === '') continue

    const from = stampOf(raw.start as CalendarTime | undefined)
    const to = stampOf(raw.end as CalendarTime | undefined)
    if (from === null || to === null) continue

    const date = localDateOf(from.at)
    if (date === null) continue

    /**
     * Outside the fortnight, so there is nowhere honest to put it.
     *
     * `dayIndexFor` returns null both for "before this week" and "past the horizon", and
     * null means *undated* downstream -- `placeItems` would take a lecture from December and
     * drop it on today + 2. Left out instead, and the screen says how many were.
     */
    const deadlineDay = dayIndexFor(schedule, date)
    if (deadlineDay === null) continue

    const startedAt = Date.parse(from.at)
    const endedAt = Date.parse(to.at)
    if (Number.isNaN(startedAt) || Number.isNaN(endedAt) || endedAt <= startedAt) {
      // An all-day event legitimately has no duration to measure, and is handled below. Any
      // other event whose times do not make sense is dropped rather than repaired.
      if (!from.allDay) continue
    }

    counter += 1

    const hours = from.allDay
      ? ALL_DAY_HOURS
      : Math.round(((endedAt - startedAt) / 3_600_000) * 2) / 2

    const startHour = from.allDay ? undefined : localHourOf(from.at)

    items.push({
      id: `gcal-${counter}`,
      title,
      // Nothing in a calendar says what kind of load something is. The chip's two selects
      // are where a student corrects it, exactly as they do for a photographed timetable.
      type: 'mental',
      kind: 'studyBlock',
      hours: hours > 0 ? hours : ALL_DAY_HOURS,
      deadlineDay,
      // A timed event is a commitment at a time, which is what `fixed` means. An all-day
      // one is a date without a time, so pinning it to an hour would invent the hour.
      fixed: !from.allDay,
      ...(startHour === null || startHour === undefined ? {} : { startHour }),
      // See the note above: Google has already expanded any recurrence into instances.
      repeat: null,
      // §1.4: what was read exactly is not flagged; what was inferred is. An all-day event's
      // duration is a guess, and the student should see that it is.
      confident: !from.allDay,
      ...(typeof raw.id === 'string' ? { sourceId: raw.id } : {}),
    })
  }

  return items
}
