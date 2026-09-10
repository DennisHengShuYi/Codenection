import type { ParsedItem } from '../ai'
import { HORIZON_DAYS } from '../engine'
import type { EngineParams } from '../engine'
import { smallestFixes, type Fix, type Schedule, type ScheduledItem } from '../optimizer'
import { dateFor } from './calendar'
import { expandRecurring } from './recurrence'
import { gapsOn, slotOn } from './slotFinder'

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
 * Whether a specific window on a day is genuinely open.
 *
 * Asked only of an item that arrived with an hour already on it -- which today means a
 * calendar import, since nothing else knows. `slotOn` answers "where would this fit", which
 * is a different question: it would happily report a gap at 14:00 for something that said
 * 09:00.
 */
function windowIsFree(schedule: Schedule, dayIndex: number, startHour: number, hours: number): boolean {
  return gapsOn(schedule, dayIndex).some(
    (gap) => startHour >= gap.startHour && startHour + hours <= gap.startHour + gap.hours,
  )
}

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

  // §38: recurrence is expanded here and nowhere later, so a weekly class becomes the three
  // real blocks it actually is before anything downstream sees it. Nothing past this point
  // knows recurrence exists -- the engine takes a flat list by design.
  const expanded = items.flatMap((item) => expandRecurring(item, schedule, today))

  // Folded rather than mapped, so each item sees the ones placed before it. Computing every
  // placement against the original week would send them all to the same first opening,
  // which is the pile-up this exists to end.
  const placed = expanded.reduce((current, item, index) => {
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

    /**
     * An hour something outside the app already knew.
     *
     * Only a calendar sets this. A photo and a brain dump say nothing about when a thing
     * starts, and for those `slotOn` finding a real gap is the better answer -- but a
     * lecture happens at nine whether or not the week is convenient, and placing it at 19:00
     * would discard the only fact the calendar was authoritative about.
     *
     * A pinned block keeps its hour unconditionally: it is not ours to move, and
     * movable-movable overlap is legal anyway (`constraints.ts` says so deliberately). An
     * unpinned one takes its stated hour when the day has room there and yields otherwise,
     * because something knowing the hour is weaker than something insisting on it.
     */
    const stated = item.startHour

    const startHour =
      stated === undefined
        ? (slot?.startHour ?? FALLBACK_START_HOUR)
        : item.fixed || windowIsFree(current, dayIndex, stated, item.hours)
          ? stated
          : (slot?.startHour ?? FALLBACK_START_HOUR)

    const added: ScheduledItem = {
      id: `added-${stamp}-${index}-${item.id}`,
      title: item.title,
      type: item.type,
      kind: item.kind,
      hours: item.hours,
      intensity: 1,
      dayIndex: slot === null ? start : dayIndex,
      startHour,
      // §5.1 unchanged: what the student ticked may pin a time, and nothing here may ever
      // create protected rest.
      fixed: item.fixed,
      deadlineDay: item.deadlineDay,
      protectedRest: false,
      // §39: carried through when the item came from a series, absent when it did not.
      ...(item.seriesId === undefined ? {} : { seriesId: item.seriesId }),
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

/** How many of the ranked fixes to look through for one that actually helps. Cheap: the
 *  search has already evaluated every neighbour, and this only filters what it returned. */
const FIXES_TO_CONSIDER = 8

/**
 * The one move worth offering when something could not go where it wanted.
 *
 * §15's second question -- "could it fit if something moved?" -- answered without building
 * the second scheduler §16 forbids. `rebalance` and `smallestFixes` already do displacement,
 * with chained moves and full 21-day scoring; this adds no search of its own. It filters
 * what `smallestFixes` already returned down to a move that actually opens room on the day
 * in question.
 *
 * The filter is the point. `smallestFixes` ranks by deficit days and floor, which is a
 * different question from "does this make space on Tuesday" -- so its top move was often
 * true, useful, and completely unrelated to the thing the student had just been told did not
 * fit. Offering that reads as the app changing the subject.
 *
 * Null when nothing on the list helps, which is an honest answer: the day is full of things
 * that cannot move, and saying so beats offering a move that will not work.
 */
export function fixThatMakesRoom(
  schedule: Schedule,
  item: ParsedItem,
  dayIndex: number,
  params: EngineParams,
): Fix | null {
  const need = { hours: item.hours, type: item.type, kind: item.kind }

  return (
    smallestFixes(schedule, params, FIXES_TO_CONSIDER).find(
      (fix) => slotOn(fix.move.apply(schedule), dayIndex, need) !== null,
    ) ?? null
  )
}
