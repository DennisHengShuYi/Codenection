import type { ParsedItem } from '../ai'
import type { Schedule } from '../optimizer'
import { dateFor } from './calendar'

/**
 * How often a thing comes round, in the only terms this app supports.
 *
 * §40: weekday or weekdays, and an end date for semester break. Nothing monthly, nothing
 * fortnightly, no custom rules. Recurring items are almost entirely the fixed set --
 * classes, labs, shifts -- which meet weekly or not at all, and a rule language rich enough
 * to express anything else would be a setup burden this design has cut everywhere.
 */
export interface Repeat {
  /** Days of the week, 0 = Sunday, matching `Date.getUTCDay`. */
  readonly weekdays: readonly number[]
  /** Last day of the series, as a horizon index. Null runs to the end of the horizon. */
  readonly untilDay: number | null
}

/** The weekday a horizon day falls on, or null without an anchor to count from. */
function weekdayOf(schedule: Schedule, dayIndex: number): number | null {
  const date = dateFor(schedule, dayIndex)

  return date === null ? null : new Date(`${date}T00:00:00Z`).getUTCDay()
}

const sameTitle = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * A weekly series this item looks like another instance of, or null.
 *
 * §37: the same class, noticed rather than declared. A student adding something whose title
 * matches a block already sitting on the same weekday is entering a series one instance at a
 * time, and spotting it costs no new screen and no new input path. It is also the only
 * answer available for part-time shifts, which arrive as photos in group chats and change
 * week to week, so they never carry the word "every" for a parser to find.
 *
 * The hour plays no part, and the reason is worth stating: a parsed item has no start hour
 * until placement chooses one, so matching on it is not a question this can ask. An earlier
 * version took an hour parameter, which is exactly why it fitted no call site and sat wired
 * to nothing. Title and weekday together are what remain -- still a conjunction, because
 * title alone matches two unrelated essays and a weekday alone matches half the timetable.
 *
 * A suggestion, never an application. §41 puts it on the chip as a question the student
 * confirms or dismisses in one tap, and `expandRecurring` still only ever runs on a repeat
 * they kept. It runs to the end of the horizon rather than inventing an end date nobody gave.
 */
export function suggestRepeat(item: ParsedItem, schedule: Schedule): Repeat | null {
  // Already declared as repeating: there is nothing left to offer.
  if (item.repeat !== null || item.deadlineDay === null) return null

  const weekday = weekdayOf(schedule, item.deadlineDay)
  if (weekday === null) return null

  const matches = schedule.items.some(
    (existing) =>
      sameTitle(existing.title, item.title) && weekdayOf(schedule, existing.dayIndex) === weekday,
  )

  return matches ? { weekdays: [weekday], untilDay: null } : null
}

let series = 0

const nextSeriesId = (): string => {
  series += 1
  return `series-${Date.now()}-${series}`
}

/**
 * Turns one repeating item into the instances it actually produces.
 *
 * §38: expanded at entry, never stored as a rule. One weekly class becomes three items
 * across the 21-day horizon -- exactly the shape `umWeek` already hand-writes -- and no
 * consumer downstream ever learns that recurrence exists. The engine takes a flat list by
 * design, and a fortnight is short enough that recurrence never compounds into anything
 * needing its own machinery.
 *
 * §39: every instance carries a shared `seriesId`. One field, and it buys the three
 * operations expansion would otherwise make painful -- cancel just this Tuesday, this class
 * has ended, it moved to Thursday. Without it, dropping a module means deleting three items
 * one at a time.
 *
 * Returns the item unchanged when there is nothing to expand, including when the week has
 * no anchor: without a real start date there is no way to know which horizon day "Tuesday"
 * is, and guessing would put a whole semester of classes on the wrong days silently. That
 * is the failure §1.4 exists to prevent, at the scale of a timetable.
 */
export function expandRecurring(
  item: ParsedItem,
  schedule: Schedule,
  today: number,
): readonly ParsedItem[] {
  const repeat = item.repeat
  if (repeat === null || repeat.weekdays.length === 0) return [item]

  const wanted = new Set(repeat.weekdays)
  const last = repeat.untilDay ?? schedule.horizonDays - 1
  const seriesId = nextSeriesId()
  const instances: ParsedItem[] = []

  for (let day = Math.max(0, today); day <= Math.min(last, schedule.horizonDays - 1); day += 1) {
    const date = dateFor(schedule, day)
    // No anchor means no weekdays. Bail rather than guess -- see the note above.
    if (date === null) return [item]

    if (!wanted.has(new Date(`${date}T00:00:00Z`).getUTCDay())) continue

    instances.push({
      ...item,
      id: `${item.id}-${day}`,
      deadlineDay: day,
      repeat: null,
      seriesId,
    })
  }

  // A series whose every instance falls outside the horizon is not a series worth
  // inventing. The student still gets the thing they typed.
  return instances.length === 0 ? [item] : instances
}
