import type { Schedule, ScheduledItem } from '../optimizer'
import { dateFor } from '../domain/calendar'

/**
 * What the week would look like in a calendar, worked out without touching one.
 *
 * This is the whole of the push side's judgement, and it is pure on purpose: the summary
 * shown to the student before they press the button and the events the endpoint actually
 * writes both come from here, so they cannot disagree. A screen promising twelve blocks
 * and an endpoint writing fourteen is the kind of quiet mismatch that ends trust in a
 * feature that writes to somebody's real calendar.
 *
 * Times are local wall clock with no offset -- `2026-09-11T09:00:00`. The app's model has
 * no timezone in it at all; a block placed at 9 means 9 where the student is. The IANA zone
 * travels beside these to Google, supplied once at the edge, which is exactly how Google's
 * own API expects a floating local time to be sent.
 */
export interface PushEvent {
  /** The block this came from, written into the event so a second push updates rather than
   *  duplicates, and so nothing without this marker is ever touched. */
  readonly blockId: string
  readonly summary: string
  readonly startsAt: string
  readonly endsAt: string
}

/** The last minute of a day. A block placed late and running long ends here rather than
 *  spilling onto a day the student never put it on. */
const LAST_MINUTE = '23:59:00'

const twoDigits = (value: number): string => String(value).padStart(2, '0')

/** Whole hours and the fraction of one, as a wall-clock time. */
const clockOf = (hour: number): string | null => {
  if (hour >= 24) return null

  const whole = Math.floor(hour)
  const minutes = Math.round((hour - whole) * 60)

  // 9.999 rounds to 60 minutes, which is not a time.
  return minutes === 60
    ? clockOf(whole + 1)
    : `${twoDigits(whole)}:${twoDigits(minutes)}:00`
}

const eventFor = (schedule: Schedule, item: ScheduledItem): PushEvent | null => {
  const date = dateFor(schedule, item.dayIndex)
  if (date === null) return null

  const startsAt = clockOf(item.startHour)
  if (startsAt === null) return null

  const endsAt = clockOf(item.startHour + item.hours) ?? LAST_MINUTE

  return {
    blockId: item.id,
    summary: item.title,
    startsAt: `${date}T${startsAt}`,
    endsAt: `${date}T${endsAt}`,
  }
}

/**
 * The events that would be written for this week, from `fromDay` onward.
 *
 * Empty for a week with no anchor, and that is the right answer rather than a failure: the
 * app genuinely does not know what dates such a week falls on, and guessing would write a
 * fortnight of events onto the wrong days of a real calendar for somebody to delete by hand.
 *
 * Days before `fromDay` are left alone. Yesterday already happened, however it actually
 * went, and writing a plan into it now records something that was never true.
 */
export function plannedEvents(schedule: Schedule, fromDay: number): readonly PushEvent[] {
  return schedule.items
    .filter((item) => item.dayIndex >= fromDay)
    // Never back to the calendar it was read from: pushing an imported block duplicates it
    // there, the next import reads both, and the one after that reads four.
    .filter((item) => item.sourceId === undefined)
    .slice()
    .sort((a, b) => a.dayIndex - b.dayIndex || a.startHour - b.startHour)
    .map((item) => eventFor(schedule, item))
    .filter((event): event is PushEvent => event !== null)
}

/**
 * The name of the calendar this app creates and is the only thing it ever writes to.
 *
 * Not a preference. Writing only to a calendar we made ourselves means this app *cannot*
 * modify or delete an event it did not create, a shared work or family calendar is
 * untouchable, and switching the feature off is one deletion of one calendar rather than a
 * hunt through a year of entries.
 */
export const CALENDAR_NAME = 'Codenection'

/**
 * The private property every event we write carries, naming the block it came from.
 *
 * Two jobs, and both matter. It is how a second push updates rather than duplicates, and it
 * is how this app knows an event is its own -- anything in the calendar without it was put
 * there by the student, and is never touched.
 */
export const BLOCK_MARKER = 'codenectionBlockId'

/** One entry of Google's calendar list, as far as this needs to care. */
interface CalendarListEntry {
  readonly id?: unknown
  readonly summary?: unknown
  readonly primary?: unknown
}

const isEntry = (value: unknown): value is CalendarListEntry =>
  typeof value === 'object' && value !== null

/**
 * Our own calendar in the student's list, or null when there is not one yet.
 *
 * Null means "create it", never "use the primary one". The primary calendar is precisely
 * what this design exists to stay out of, so there is deliberately no fallback that could
 * quietly reach it -- including for a calendar the student happens to have named the same
 * thing themselves, which is theirs and not an invitation.
 */
export function ourCalendarId(list: unknown): string | null {
  if (!Array.isArray(list)) return null

  const found = list
    .filter(isEntry)
    .find((entry) => entry.summary === CALENDAR_NAME && entry.primary !== true)

  return typeof found?.id === 'string' ? found.id : null
}

/** The request body Google is sent for one event. */
export interface CalendarEventBody {
  readonly summary: string
  readonly start: { readonly dateTime: string; readonly timeZone: string }
  readonly end: { readonly dateTime: string; readonly timeZone: string }
  readonly extendedProperties: { readonly private: Record<string, string> }
}

/**
 * One event, in the shape Google takes.
 *
 * The time is sent as local wall clock with the zone named beside it rather than as an
 * offset. It is the difference between "9am wherever you are" and "9am at the offset your
 * laptop had in September" -- the second is wrong for half the year in any place that
 * changes its clocks, and wrong immediately for a student who travels.
 */
export function calendarEventBody(event: PushEvent, timeZone: string): CalendarEventBody {
  return {
    summary: event.summary,
    start: { dateTime: event.startsAt, timeZone },
    end: { dateTime: event.endsAt, timeZone },
    extendedProperties: { private: { [BLOCK_MARKER]: event.blockId } },
  }
}

/** An event already in our calendar, and the block it says it came from. Null for anything
 *  the student put there by hand. */
export interface ExistingEvent {
  readonly id: string
  readonly blockId: string | null
}

export interface PushPlan {
  readonly create: readonly PushEvent[]
  readonly update: readonly { readonly id: string; readonly event: PushEvent }[]
  readonly remove: readonly string[]
}

/**
 * What this push would do, worked out before any of it happens.
 *
 * The count shown on the button and the writes the endpoint makes come from this one
 * function, so "I will add 4 and update 9" cannot turn out to have been 4 and 11.
 *
 * Removal is limited to events carrying our marker. An event in our own calendar without
 * one was put there by the student, and deleting somebody's own entry because it sat in the
 * wrong calendar would be the single worst thing this feature could do.
 */
export function pushPlan(events: readonly PushEvent[], existing: readonly ExistingEvent[]): PushPlan {
  const byBlock = new Map(
    existing.filter((one) => one.blockId !== null).map((one) => [one.blockId as string, one.id]),
  )
  const wanted = new Set(events.map((event) => event.blockId))

  return {
    create: events.filter((event) => !byBlock.has(event.blockId)),
    update: events
      .filter((event) => byBlock.has(event.blockId))
      .map((event) => ({ id: byBlock.get(event.blockId) as string, event })),
    remove: existing
      .filter((one) => one.blockId !== null && !wanted.has(one.blockId))
      .map((one) => one.id),
  }
}
