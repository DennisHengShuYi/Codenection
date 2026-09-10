import type { ParsedItem } from '../ai'
import { HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { dateFor } from './calendar'
import { slotOn } from './slotFinder'

/**
 * Where an undated item goes when nothing says otherwise, counted from today.
 *
 * Not day zero. Piling undated work onto today is the shape the optimizer then has to spend
 * its whole budget undoing, and it makes the one day a student can actually see look worse
 * than their week really is.
 */
const DEFAULT_DAY_OFFSET = 2

/** The evening. Used only when nothing fits anywhere and the item is placed regardless. */
const FALLBACK_START_HOUR = 19

/** What happened to one accepted item, in terms the UI can turn into a sentence. */
export interface PlacementNote {
  readonly itemId: string
  readonly title: string
  /** Where it ended up. */
  readonly dayIndex: number
  /** The day it wanted, when that is not where it went. Null when nothing had to move. */
  readonly movedFrom: number | null
  /** False when no day in range had room and it was placed anyway. */
  readonly fitted: boolean
}

const clampDay = (day: number): number => Math.min(Math.max(day, 0), HORIZON_DAYS - 1)

/**
 * Adds accepted items, finding each one a day with room, and reports what it did.
 *
 * Three questions in order, and only the first two are ever acted on: does it fit the day
 * it wants, does it fit a later day before its deadline, and -- when neither -- it is
 * placed anyway and said so. The third question §15 poses, "could it fit if something
 * moved", is deliberately not answered here. `rebalance` already does displacement, better,
 * with chained moves and full 21-day scoring, and two systems making scheduling decisions
 * with different logic will disagree. The caller offers `smallestFixes` as one optional
 * move instead.
 *
 * Nothing already in the week is ever touched. §16: silent displacement breaks a student's
 * mental model of their own week, and it contradicts the principle underneath provisional
 * yes -- inaction produces the healthy outcome and the student stays in charge.
 */
export function placeItems(
  schedule: Schedule,
  items: readonly ParsedItem[],
  today: number,
): { readonly schedule: Schedule; readonly notes: readonly PlacementNote[] } {
  const stamp = Date.now()
  const notes: PlacementNote[] = []

  // Folded rather than mapped, so each item sees the ones placed before it. Computing every
  // placement against the original week would send them all to the same first opening,
  // which is the pile-up this exists to end.
  const placed = items.reduce((current, item, index) => {
    const floor = clampDay(today)
    const need = { hours: item.hours, type: item.type, kind: item.kind }

    /**
     * Which days this item may occupy, in the order it would prefer them.
     *
     * The two cases run in opposite directions, and that is the whole point. A deadline is
     * a *latest* bound: an essay due Friday is one of the most movable things in the week,
     * free to sit anywhere before Friday but never after it -- so a full Friday sends it
     * backwards, toward today. Undated work has no wall to back away from, so it looks
     * forward instead, from a couple of days out to the end of the horizon.
     *
     * Searching forward from a deadline would push work past the day it is due to make the
     * week look tidier, which is the one rearrangement that costs a student marks.
     */
    const wanted = item.deadlineDay === null ? clampDay(today + DEFAULT_DAY_OFFSET) : clampDay(item.deadlineDay)
    const start = Math.max(wanted, floor)
    const candidates =
      item.deadlineDay === null
        ? Array.from({ length: HORIZON_DAYS - start }, (_, offset) => start + offset)
        : Array.from({ length: start - floor + 1 }, (_, offset) => start - offset)

    let dayIndex = start
    let slot: ReturnType<typeof slotOn> = null

    for (const day of candidates) {
      slot = slotOn(current, day, need)
      if (slot !== null) {
        dayIndex = day
        break
      }
    }

    const added: ScheduledItem = {
      id: `added-${stamp}-${index}-${item.id}`,
      title: item.title,
      type: item.type,
      kind: item.kind,
      hours: item.hours,
      intensity: 1,
      dayIndex: slot === null ? start : dayIndex,
      startHour: slot?.startHour ?? FALLBACK_START_HOUR,
      // §5.1 unchanged: what the student ticked may pin a time, and nothing here may ever
      // create protected rest.
      fixed: item.fixed,
      deadlineDay: item.deadlineDay,
      protectedRest: false,
    }

    notes.push({
      itemId: added.id,
      title: added.title,
      dayIndex: added.dayIndex,
      movedFrom: added.dayIndex === start ? null : start,
      fitted: slot !== null,
    })

    return { ...current, items: [...current.items, added] }
  }, schedule)

  return { schedule: placed, notes }
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * What to call a day, in the student's terms where possible.
 *
 * A week saved before anchoring existed has no real dates, so it degrades to the index
 * rather than inventing a weekday -- naming the wrong day is worse than naming none.
 */
function dayName(schedule: Schedule | null, dayIndex: number): string {
  const date = schedule === null ? null : dateFor(schedule, dayIndex)
  if (date === null) return `day ${dayIndex}`

  const weekday = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]
  return weekday ?? `day ${dayIndex}`
}

/**
 * One sentence about what happened to one item.
 *
 * §16: say what you did. A student who put something on Tuesday and finds it on Thursday
 * with no explanation has lost their grip on their own week, which costs more trust than
 * the tidier schedule was ever worth.
 */
export function describePlacement(note: PlacementNote, schedule: Schedule | null): string {
  if (!note.fitted) {
    return `Added, but ${dayName(schedule, note.dayIndex)} has no room for ${note.title} — it is on top of something.`
  }

  if (note.movedFrom === null) return 'Added.'

  return `Added. ${dayName(schedule, note.movedFrom)} has no room for ${note.title}, so it went to ${dayName(schedule, note.dayIndex)}.`
}
